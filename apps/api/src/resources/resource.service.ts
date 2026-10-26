import { event } from "../realtime/events";
import { orderVisibility, orderDetail } from "./visibility";
import {
  ForbiddenException,
  ConflictException,
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
      tx.team.findMany({
        take: 100,
        include: {
          members: {
            select: {
              membershipId: true,
              membership: {
                select: { user: { select: { displayName: true } } },
              },
            },
          },
        },
      }),
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
      if (await tx.workOrder.count({ where: { teamId: id } }))
        throw new ConflictException("Team has work orders; keep its history");
      await tx.teamMember.deleteMany({ where: { teamId: id } });
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
        if (!id)
          return tx.maintenanceRequest.findMany({
            where,
            take: 100,
            orderBy: { createdAt: "desc" },
          });
        const result = await tx.maintenanceRequest.findFirst({
          where,
          include: { workOrders: { orderBy: { createdAt: "desc" } } },
        });
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
      const request = await tx.maintenanceRequest.create({
        data: {
          ...dto,
          organizationId: context.organizationId,
          customerId: profile.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorId: member.id,
          entityType: "MaintenanceRequest",
          entityId: request.id,
          action: "REQUEST_CREATED",
        },
      });
      await event(
        tx,
        context.organizationId,
        "MaintenanceRequest",
        request.id,
        "request.created",
        0,
      );
      return request;
    });
  }
  orders(context: OrganizationContext, id?: string) {
    return this.scoped(
      context,
      ["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"],
      async (tx, member) => {
        const where: Prisma.WorkOrderWhereInput = {
          ...(id ? { id } : {}),
          ...orderVisibility(member),
        };
        if (!id)
          return tx.workOrder.findMany({
            where,
            take: 100,
            orderBy: { createdAt: "desc" },
          });
        const result = await tx.workOrder.findFirst({
          where,
          include: orderDetail,
        });
        if (!result) throw new NotFoundException();
        const activity = await tx.auditLog.findMany({
          where: { entityType: "WorkOrder", entityId: id },
          orderBy: { createdAt: "asc" },
          include: {
            actor: { select: { user: { select: { displayName: true } } } },
          },
        });
        return { ...result, activity };
      },
    );
  }
  technicians(context: OrganizationContext) {
    return this.scoped(context, ["ADMIN", "DISPATCHER"], (tx) =>
      tx.technicianProfile.findMany({
        where: {
          membership: {
            status: "ACTIVE",
            role: { name: "TECHNICIAN" },
            user: { isActive: true },
          },
        },
        select: {
          id: true,
          employeeCode: true,
          membership: { select: { user: { select: { displayName: true } } } },
        },
        take: 100,
      }),
    );
  }
  notifications(context: OrganizationContext) {
    return this.scoped(
      context,
      ["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"],
      (tx, member) =>
        tx.notification.findMany({
          where: { recipientId: member.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
    );
  }
  readNotification(context: OrganizationContext, id: string) {
    return this.scoped(
      context,
      ["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"],
      async (tx, member) => {
        const result = await tx.notification.updateMany({
          where: { id, recipientId: member.id },
          data: { readAt: new Date() },
        });
        if (!result.count) throw new NotFoundException();
        await event(
          tx,
          context.organizationId,
          "Notification",
          id,
          "notification.read",
        );
        return { id };
      },
    );
  }
}
