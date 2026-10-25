import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, PrismaClient, RoleName } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { LoginDto, RegisterDto, MemberDto } from "./auth.dto";
import { Principal } from "./auth.types";
import { OrganizationContext } from "../prisma/prisma.service";
const ttl = 14 * 24 * 3600 * 1000;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const publicUser = { id: true, email: true, displayName: true } as const;
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  // Privileged identity store; never exported, used only by bounded auth/admin operations.
  private readonly db = new PrismaClient();
  private dummyHash!: string;
  constructor(private readonly jwt: JwtService) {}
  async onModuleInit() {
    await this.db.$connect();
    this.dummyHash = await this.hash(randomBytes(32).toString("hex"));
  }
  async onModuleDestroy() {
    await this.db.$disconnect();
  }
  private hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }
  private async issue(tx: Prisma.TransactionClient, userId: string) {
    const session = await tx.authSession.create({
      data: { userId, expiresAt: new Date(Date.now() + ttl) },
    });
    const refresh = randomBytes(48).toString("base64url");
    await tx.refreshToken.create({
      data: { sessionId: session.id, tokenHash: digest(refresh) },
    });
    return {
      refresh,
      accessToken: await this.jwt.signAsync({ sub: userId, sid: session.id }),
      expiresIn: 900,
    };
  }
  async register(dto: RegisterDto) {
    const passwordHash = await this.hash(dto.password);
    try {
      return await this.db.$transaction(async (tx) => {
        const role = await tx.role.upsert({
          where: { name: "ADMIN" },
          create: { name: "ADMIN" },
          update: {},
        });
        const user = await tx.user.create({
          data: {
            email: dto.email,
            displayName: dto.displayName,
            passwordHash,
          },
          select: publicUser,
        });
        const org = await tx.organization.create({
          data: { name: dto.organizationName },
        });
        await tx.membership.create({
          data: { organizationId: org.id, userId: user.id, roleId: role.id },
        });
        return {
          user,
          organizationId: org.id,
          ...(await this.issue(tx, user.id)),
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Registration unavailable");
      throw error;
    }
  }
  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = await argon2.verify(
      user?.passwordHash ?? this.dummyHash,
      dto.password,
    );
    if (!valid || !user?.isActive || !user.passwordHash)
      throw new UnauthorizedException("Invalid credentials");
    return this.db.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id: user.id, isActive: true },
        select: publicUser,
      });
      if (!current) throw new UnauthorizedException("Invalid credentials");
      return { user: current, ...(await this.issue(tx, current.id)) };
    });
  }
  async refresh(value?: string) {
    if (!value || !/^[A-Za-z0-9_-]{64}$/.test(value))
      throw new UnauthorizedException();
    const tokenHash = digest(value);
    const found = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessionId: true },
    });
    if (!found) throw new UnauthorizedException();
    const result = await this.db.$transaction(async (tx) => {
      // Serialize refresh and logout for the entire session family.
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${found.sessionId}::uuid FOR UPDATE`;
      const token = await tx.refreshToken.findUniqueOrThrow({
        where: { tokenHash },
        include: { session: { include: { user: true } } },
      });
      if (token.consumedAt) {
        await tx.authSession.update({
          where: { id: token.sessionId },
          data: { revokedAt: new Date() },
        });
        return null; // Commit revocation before returning 401.
      }
      if (
        token.session.revokedAt ||
        token.session.expiresAt <= new Date() ||
        !token.session.user.isActive
      )
        return null;
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      });
      const refresh = randomBytes(48).toString("base64url");
      await tx.refreshToken.create({
        data: { sessionId: token.sessionId, tokenHash: digest(refresh) },
      });
      return {
        refresh,
        accessToken: await this.jwt.signAsync({
          sub: token.session.userId,
          sid: token.sessionId,
        }),
        expiresIn: 900,
      };
    });
    if (!result) throw new UnauthorizedException("Refresh unavailable");
    return result;
  }
  async logout(value?: string) {
    if (!value || value.length > 128) return;
    const token = await this.db.refreshToken.findUnique({
      where: { tokenHash: digest(value) },
    });
    if (!token) return;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id = ${token.sessionId}::uuid FOR UPDATE`;
      await tx.authSession.update({
        where: { id: token.sessionId },
        data: { revokedAt: new Date() },
      });
    });
  }
  async validateSession(userId: string, sessionId: string): Promise<Principal> {
    const session = await this.db.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
      },
      include: { user: { select: publicUser } },
    });
    if (!session) throw new UnauthorizedException();
    return { ...session.user, sessionId };
  }
  async current(userId: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ...publicUser,
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            organizationId: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  }
  // A narrowly scoped privileged operation, since fieldops_app cannot mutate Membership.
  async manageMember(
    context: OrganizationContext,
    dto: MemberDto,
    target: { id: string } | { email: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${context.organizationId}::uuid FOR UPDATE`;
      const actor = await tx.membership.findFirst({
        where: {
          organizationId: context.organizationId,
          userId: context.actorId,
          status: "ACTIVE",
          user: { isActive: true },
          role: { name: "ADMIN" },
        },
      });
      if (!actor) throw new ForbiddenException();
      const existing =
        "id" in target
          ? await tx.membership.findFirst({
              where: { organizationId: context.organizationId, id: target.id },
              include: { role: true, technician: true, customer: true },
            })
          : null;
      if ("id" in target && !existing)
        throw new BadRequestException("Member unavailable");
      if (
        existing?.role.name === "ADMIN" &&
        (dto.role !== "ADMIN" || dto.status !== "ACTIVE")
      ) {
        const count = await tx.membership.count({
          where: {
            organizationId: context.organizationId,
            status: "ACTIVE",
            role: { name: "ADMIN" },
            user: { isActive: true },
          },
        });
        if (count <= 1)
          throw new ConflictException(
            "Cannot remove the last active administrator",
          );
      }
      if (
        (existing?.technician && dto.role !== "TECHNICIAN") ||
        (existing?.customer && dto.role !== "CUSTOMER")
      )
        throw new ConflictException(
          "Profile role change requires explicit migration",
        );
      const role = await tx.role.upsert({
        where: { name: dto.role },
        create: { name: dto.role },
        update: {},
      });
      let member;
      if (existing)
        member = await tx.membership.update({
          where: { id: existing.id },
          data: { roleId: role.id, status: dto.status },
        });
      else {
        const user =
          "email" in target &&
          (await tx.user.findUnique({
            where: { email: target.email },
            select: { id: true },
          }));
        if (!user) throw new BadRequestException("User unavailable");
        const duplicate = await tx.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: context.organizationId,
              userId: user.id,
            },
          },
        });
        if (duplicate) throw new ConflictException("Membership already exists");
        member = await tx.membership.create({
          data: {
            organizationId: context.organizationId,
            userId: user.id,
            roleId: role.id,
            status: dto.status,
          },
        });
      }
      if (dto.role === "TECHNICIAN")
        await tx.technicianProfile.upsert({
          where: { membershipId: member.id },
          create: {
            organizationId: context.organizationId,
            membershipId: member.id,
            employeeCode: member.id,
          },
          update: {},
        });
      if (dto.role === "CUSTOMER")
        await tx.customerProfile.upsert({
          where: { membershipId: member.id },
          create: {
            organizationId: context.organizationId,
            membershipId: member.id,
          },
          update: {},
        });
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorId: actor.id,
          entityType: "Membership",
          entityId: member.id,
          action: "MEMBERSHIP_MANAGED",
          metadata: { role: dto.role, status: dto.status },
        },
      });
      return member;
    });
  }
}
