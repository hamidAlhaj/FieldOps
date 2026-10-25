import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Membership, Role, RoleName } from "@prisma/client";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";
import { RequestDto, TeamDto } from "../auth/auth.dto";
@Injectable()
export class ResourceService {
  constructor(private readonly prisma: PrismaService) {}
  private async scoped<T>(
    context: OrganizationContext,
    roles: RoleName[],
    operation: (
      tx: Prisma.TransactionClient,
      member: Membership & { role: Role },
    ) => Promise<T>,
  ) {
    return this.prisma.forOrganization(context, async (tx) => {
      const member = await tx.membership.findFirstOrThrow({
        where: { userId: context.actorId },
        include: { role: true },
      });
      if (!roles.includes(member.role.name)) throw new ForbiddenException();
      return operation(tx, member);
    });
  }
  members(context: OrganizationContext) {
    return this.scoped(context, ["ADMIN"], (tx) =>
      tx.membership.findMany({
        select: {
          id: true,
          status: true,
          role: { select: { name: true } },
          user: { select: { id: true, email: true, displayName: true } },
        },
        take: 100,
      }),
    );
  }
  teams(context: OrganizationContext) {
    return this.scoped(context, ["ADMIN"], (tx) =>
      tx.team.findMany({ take: 100 }),
    );
  }
  createTeam(context: OrganizationContext, dto: TeamDto) {
    return this.scoped(context, ["ADMIN"], (tx) =>
      tx.team.create({
        data: { organizationId: context.organizationId, name: dto.name },
      }),
    );
  }
  updateTeam(context: OrganizationContext, id: string, dto: TeamDto) {
    return this.scoped(context, ["ADMIN"], async (tx) => {
      const result = await tx.team.updateMany({
        where: { id },
        data: { name: dto.name },
      });
      if (!result.count) throw new NotFoundException();
      return tx.team.findUnique({ where: { id } });
    });
  }
  deleteTeam(context: OrganizationContext, id: string) {
    return this.scoped(context, ["ADMIN"], async (tx) => {
      const result = await tx.team.deleteMany({ where: { id } });
      if (!result.count) throw new NotFoundException();
    });
  }
  requests(context: OrganizationContext, id?: string) {
    return this.scoped(
      context,
      ["ADMIN", "DISPATCHER", "CUSTOMER"],
      async (tx, member) => {
        const where = {
          ...(id ? { id } : {}),
          ...(member.role.name === "CUSTOMER"
            ? { customer: { membershipId: member.id } }
            : {}),
        };
        if (!id) return tx.maintenanceRequest.findMany({ where, take: 100 });
        const result = await tx.maintenanceRequest.findFirst({ where });
        if (!result) throw new NotFoundException();
        return result;
      },
    );
  }
  createRequest(context: OrganizationContext, dto: RequestDto) {
    return this.scoped(context, ["CUSTOMER"], async (tx, member) => {
      const profile = await tx.customerProfile.findUnique({
        where: { membershipId: member.id },
      });
      if (!profile) throw new ForbiddenException();
      return tx.maintenanceRequest.create({
        data: {
          ...dto,
          organizationId: context.organizationId,
          customerId: profile.id,
        },
      });
    });
  }
  orders(context: OrganizationContext, id?: string) {
    return this.scoped(
      context,
      ["ADMIN", "DISPATCHER", "TECHNICIAN"],
      async (tx, member) => {
        const where: Prisma.WorkOrderWhereInput = {
          ...(id ? { id } : {}),
          ...(member.role.name === "TECHNICIAN"
            ? {
                assignments: {
                  some: {
                    status: "ACTIVE",
                    technician: { membershipId: member.id },
                  },
                },
              }
            : {}),
        };
        if (!id) return tx.workOrder.findMany({ where, take: 100 });
        const result = await tx.workOrder.findFirst({ where });
        if (!result) throw new NotFoundException();
        return result;
      },
    );
  }
}
