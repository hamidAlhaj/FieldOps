import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";
import { LocationDto, StartTrackingDto } from "./tracking.dto";
import { leaseExpiry, validateLocationTime } from "./tracking.policy";

export interface TrackingContext extends OrganizationContext {
  // Derived exclusively from a verified JWT principal, never from the body.
  authSessionId: string;
}

const erased = {
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  recordedAt: null,
  receivedAt: null,
} as const;

type SessionSummary = {
  id: string;
  workOrderId: string;
  expiresAt: Date;
  recordedAt: Date | null;
  receivedAt: Date | null;
};

@Injectable()
export class TrackingService implements OnModuleInit, OnModuleDestroy {
  private readonly cleanupDb = new PrismaClient();
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // The lease is enforced in every request, even when this timer is unavailable.
    this.timer = setInterval(() => void this.sweep(), 15_000);
    this.timer.unref?.();
  }

  private async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const now = new Date();
      // Privileged background cleanup only. Never use this client in an HTTP handler.
      await this.cleanupDb.trackingSession.updateMany({
        where: {
          endedAt: null,
          OR: [
            { expiresAt: { lte: now } },
            { authSessionId: null },
            { authSession: { is: { revokedAt: { not: null } } } },
            { authSession: { is: { expiresAt: { lte: now } } } },
          ],
        },
        data: { endedAt: now, ...erased },
      });
    } catch {
      // No coordinates, query arguments, or personal identifiers in logs.
    } finally {
      this.sweeping = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.cleanupDb.$disconnect();
  }

  private async authorize(tx: Prisma.TransactionClient, c: TrackingContext): Promise<void> {
    // SECURITY DEFINER checks session validity without granting fieldops_app
    // direct access to credentials. FOR SHARE serializes against logout.
    const rows = await tx.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT public.fieldops_tracking_session_authorized(
        ${c.authSessionId}::uuid, ${c.actorId}::uuid
      ) AS allowed
    `;
    if (!rows[0]?.allowed) throw new UnauthorizedException("Authentication session expired");
  }

  private async technician(tx: Prisma.TransactionClient, c: TrackingContext) {
    // Prevent a concurrent role/status mutation from racing with a new opt-in.
    await tx.$queryRaw`
      SELECT id FROM "Membership"
      WHERE "organizationId"=${c.organizationId}::uuid
        AND "userId"=${c.actorId}::uuid
      FOR SHARE
    `;
    const member = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: c.organizationId,
          userId: c.actorId,
        },
      },
      include: {
        role: true,
        technician: true,
        user: { select: { isActive: true } },
      },
    });
    if (
      !member ||
      member.status !== "ACTIVE" ||
      !member.user.isActive ||
      member.role.name !== "TECHNICIAN" ||
      !member.technician
    ) throw new ForbiddenException("Technician membership required");
    return member.technician;
  }

  private async lockWorkOrder(tx: Prisma.TransactionClient, c: TrackingContext, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "WorkOrder"
      WHERE id=${id}::uuid AND "organizationId"=${c.organizationId}::uuid
      FOR UPDATE
    `;
    if (!rows.length) throw new ForbiddenException("Work order unavailable");
  }

  private async lockAssignment(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`
      SELECT id FROM "Assignment" WHERE id=${id}::uuid FOR UPDATE
    `;
  }

  private async assigned(
    tx: Prisma.TransactionClient,
    c: TrackingContext,
    technicianId: string,
    workOrderId: string,
  ) {
    const assignment = await tx.assignment.findFirst({
      where: {
        organizationId: c.organizationId,
        workOrderId,
        technicianId,
        status: "ACTIVE",
        acceptedAt: { not: null },
        workOrder: { status: "IN_PROGRESS" },
      },
    });
    if (!assignment) throw new ForbiddenException("Active started assignment required");
    return assignment;
  }

  private summary(s: SessionSummary) {
    return {
      id: s.id,
      workOrderId: s.workOrderId,
      expiresAt: s.expiresAt.toISOString(),
      recordedAt: s.recordedAt?.toISOString() ?? null,
      receivedAt: s.receivedAt?.toISOString() ?? null,
    };
  }

  async start(c: TrackingContext, dto: StartTrackingDto) {
    if (dto.consent !== true) throw new ForbiddenException("Explicit consent required");
    return this.prisma.forOrganization(c, async (tx) => {
      await this.authorize(tx, c);
      const tech = await this.technician(tx, c);
      // The work order is locked first, matching WorkOrderService transitions.
      await this.lockWorkOrder(tx, c, dto.workOrderId);
      // Serializes concurrent Start across different assignments of this technician.
      await tx.$queryRaw`
        SELECT id FROM "TechnicianProfile"
        WHERE id=${tech.id}::uuid AND "organizationId"=${c.organizationId}::uuid
        FOR UPDATE
      `;
      const assignment = await this.assigned(tx, c, tech.id, dto.workOrderId);
      await this.lockAssignment(tx, assignment.id);
      const now = new Date();
      // A new explicit Start supersedes prior leases; no hidden resume.
      await tx.trackingSession.updateMany({
        where: { organizationId: c.organizationId, technicianId: tech.id, endedAt: null },
        data: { endedAt: now, ...erased },
      });
      const session = await tx.trackingSession.create({
        data: {
          organizationId: c.organizationId,
          technicianId: tech.id,
          workOrderId: assignment.workOrderId,
          assignmentId: assignment.id,
          authSessionId: c.authSessionId,
          consentedAt: now,
          expiresAt: leaseExpiry(now),
        },
      });
      return this.summary(session);
    });
  }

  async stop(c: TrackingContext, id: string): Promise<void> {
    await this.prisma.forOrganization(c, async (tx) => {
      await this.authorize(tx, c);
      const tech = await this.technician(tx, c);
      // Stop is idempotent. All fields are cleared atomically in one statement.
      await tx.trackingSession.updateMany({
        where: {
          id,
          organizationId: c.organizationId,
          technicianId: tech.id,
          endedAt: null,
        },
        data: { endedAt: new Date(), ...erased },
      });
    });
  }

  async sample(c: TrackingContext, id: string, dto: LocationDto) {
    const result = await this.prisma.forOrganization(c, async (tx) => {
      await this.authorize(tx, c);
      const tech = await this.technician(tx, c);
      const initial = await tx.trackingSession.findFirst({
        where: {
          id,
          organizationId: c.organizationId,
          technicianId: tech.id,
          authSessionId: c.authSessionId,
          endedAt: null,
        },
        select: { assignmentId: true, workOrderId: true },
      });
      if (!initial) throw new NotFoundException("Tracking session unavailable");

      // Same lock order as assignment lifecycle: WorkOrder -> Assignment ->
      // TrackingSession. Serializable conflicts fail closed (409 via PrismaService).
      await this.lockWorkOrder(tx, c, initial.workOrderId);
      await this.lockAssignment(tx, initial.assignmentId);
      await tx.$queryRaw`SELECT id FROM "TrackingSession" WHERE id=${id}::uuid FOR UPDATE`;
      const session = await tx.trackingSession.findFirst({
        where: {
          id,
          organizationId: c.organizationId,
          technicianId: tech.id,
          authSessionId: c.authSessionId,
          endedAt: null,
        },
      });
      if (!session) throw new NotFoundException("Tracking session stopped");
      const assignment = await this.assigned(tx, c, tech.id, session.workOrderId);
      if (assignment.id !== session.assignmentId) {
        throw new ForbiddenException("Assignment changed");
      }

      const now = new Date();
      if (session.expiresAt <= now) {
        await tx.trackingSession.update({
          where: { id },
          data: { endedAt: now, ...erased },
        });
        return { expired: true as const };
      }
      const recordedAt = validateLocationTime(
        dto.recordedAt, now, session.recordedAt, session.receivedAt,
      );
      const updated = await tx.trackingSession.updateMany({
        where: {
          id,
          organizationId: c.organizationId,
          technicianId: tech.id,
          authSessionId: c.authSessionId,
          endedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMeters: dto.accuracyMeters,
          recordedAt,
          receivedAt: now,
          expiresAt: leaseExpiry(now),
        },
      });
      if (updated.count !== 1) throw new ConflictException("Tracking lease unavailable");
      return {
        expired: false as const,
        session: this.summary(
          await tx.trackingSession.findUniqueOrThrow({ where: { id } }),
        ),
      };
    });
    // Throw only after a successful commit so expiry redaction cannot roll back.
    if (result.expired) throw new ConflictException("Tracking session expired");
    return result.session;
  }

  async mine(c: TrackingContext) {
    return this.prisma.forOrganization(c, async (tx) => {
      await this.authorize(tx, c);
      const tech = await this.technician(tx, c);
      const now = new Date();
      const session = await tx.trackingSession.findFirst({
        where: {
          organizationId: c.organizationId,
          technicianId: tech.id,
          authSessionId: c.authSessionId,
          endedAt: null,
          expiresAt: { gt: now },
          assignment: {
            status: "ACTIVE",
            acceptedAt: { not: null },
            workOrder: { status: "IN_PROGRESS" },
          },
        },
        orderBy: { consentedAt: "desc" },
      });
      return { session: session ? this.summary(session) : null, serverTime: now.toISOString() };
    });
  }

  async locations(c: TrackingContext) {
    return this.prisma.forOrganization(c, async (tx) => {
      await this.authorize(tx, c);
      const member = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: c.organizationId,
            userId: c.actorId,
          },
        },
        include: { role: true, user: { select: { isActive: true } } },
      });
      if (
        !member || member.status !== "ACTIVE" || !member.user.isActive ||
        !["ADMIN", "DISPATCHER"].includes(member.role.name)
      ) throw new ForbiddenException();

      const now = new Date();
      const sessions = await tx.trackingSession.findMany({
        where: {
          organizationId: c.organizationId,
          endedAt: null,
          expiresAt: { gt: now },
          authSessionId: { not: null },
          authSession: {
            is: {
              revokedAt: null,
              expiresAt: { gt: now },
              user: { isActive: true },
            },
          },
          assignment: {
            status: "ACTIVE",
            acceptedAt: { not: null },
            workOrder: { status: "IN_PROGRESS" },
          },
          technician: {
            membership: {
              status: "ACTIVE",
              role: { name: "TECHNICIAN" },
              user: { isActive: true },
            },
          },
        },
        include: {
          technician: {
            include: { membership: { include: { user: { select: { displayName: true } } } } },
          },
          workOrder: { select: { title: true } },
        },
        orderBy: { consentedAt: "desc" },
        take: 100,
      });
      return {
        serverTime: now.toISOString(),
        sessions: sessions.map((s) => ({
          id: s.id,
          workOrderId: s.workOrderId,
          technicianId: s.technicianId,
          technicianName: s.technician.membership.user.displayName,
          workOrderTitle: s.workOrder.title,
          latitude: s.latitude,
          longitude: s.longitude,
          accuracyMeters: s.accuracyMeters,
          recordedAt: s.recordedAt?.toISOString() ?? null,
          receivedAt: s.receivedAt?.toISOString() ?? null,
          expiresAt: s.expiresAt.toISOString(),
          stale: !s.receivedAt || now.getTime() - s.receivedAt.getTime() > 30_000,
        })),
      };
    });
  }
}
