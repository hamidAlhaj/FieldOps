import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleName, WorkOrderStatus } from "@prisma/client";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";

const next: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ["CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};
@Injectable()
export class WorkOrderService {
  constructor(private readonly prisma: PrismaService) {}
  private async actor(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
  ) {
    const actor = await tx.membership.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: context.organizationId,
          userId: context.actorId,
        },
      },
      include: { role: true },
    });
    return actor;
  }
  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
    actorId: string,
    fromStatus: WorkOrderStatus | null,
    toStatus: WorkOrderStatus,
    action: string,
    reason?: string,
  ) {
    await tx.workOrderStatusHistory.create({
      data: {
        organizationId,
        workOrderId,
        changedById: actorId,
        fromStatus,
        toStatus,
        reason,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        entityType: "WorkOrder",
        entityId: workOrderId,
        action,
        metadata: { fromStatus, toStatus, reason: reason ?? null },
      },
    });
  }
  async create(
    context: OrganizationContext,
    requestId: string,
    title: string,
    description: string,
  ) {
    if (!title.trim() || !description.trim())
      throw new BadRequestException("Title and description required");
    return this.prisma.forOrganization(context, async (tx) => {
      const actor = await this.actor(tx, context);
      if (!(["ADMIN", "DISPATCHER"] as RoleName[]).includes(actor.role.name))
        throw new ForbiddenException();
      const request = await tx.maintenanceRequest.findUnique({
        where: {
          organizationId_id: {
            organizationId: context.organizationId,
            id: requestId,
          },
        },
      });
      if (!request) throw new NotFoundException("Request not found");
      if (["CANCELLED", "RESOLVED"].includes(request.status))
        throw new ConflictException("Request is terminal");
      const order = await tx.workOrder.create({
        data: {
          organizationId: context.organizationId,
          requestId,
          title,
          description,
        },
      });
      await tx.maintenanceRequest.update({
        where: { id: requestId },
        data: { status: "ACCEPTED" },
      });
      await this.record(
        tx,
        context.organizationId,
        order.id,
        actor.id,
        null,
        "OPEN",
        "WORK_ORDER_CREATED",
      );
      return order;
    });
  }
  async assign(
    context: OrganizationContext,
    orderId: string,
    technicianId: string,
    expectedVersion: number,
    reason?: string,
  ) {
    return this.prisma.forOrganization(context, async (tx) => {
      const actor = await this.actor(tx, context);
      if (!(["ADMIN", "DISPATCHER"] as RoleName[]).includes(actor.role.name))
        throw new ForbiddenException();
      const order = await tx.workOrder.findUnique({
        where: {
          organizationId_id: {
            organizationId: context.organizationId,
            id: orderId,
          },
        },
      });
      if (!order) throw new NotFoundException();
      if (!["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(order.status))
        throw new ConflictException("Cannot assign terminal or completed work");
      const technician = await tx.technicianProfile.findUnique({
        where: {
          organizationId_id: {
            organizationId: context.organizationId,
            id: technicianId,
          },
        },
        include: { membership: { include: { role: true, user: true } } },
      });
      if (
        !technician ||
        technician.membership.role.name !== "TECHNICIAN" ||
        technician.membership.status !== "ACTIVE" ||
        !technician.membership.user.isActive
      )
        throw new BadRequestException("Active technician required");
      const active = await tx.assignment.findFirst({
        where: { workOrderId: orderId, status: "ACTIVE" },
      });
      if (active && !reason?.trim())
        throw new BadRequestException("Reassignment reason required");
      if (active?.technicianId === technicianId)
        throw new ConflictException("Technician already assigned");
      const updated = await tx.workOrder.updateMany({
        where: { id: orderId, version: expectedVersion },
        data: { status: "ASSIGNED", version: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException("Stale work order version");
      await tx.assignment.updateMany({
        where: { workOrderId: orderId, status: "ACTIVE" },
        data: { status: "REASSIGNED", endedAt: new Date(), reason },
      });
      const assignment = await tx.assignment.create({
        data: {
          organizationId: context.organizationId,
          workOrderId: orderId,
          technicianId,
          assignedById: actor.id,
          reason,
        },
      });
      await this.record(
        tx,
        context.organizationId,
        orderId,
        actor.id,
        order.status,
        "ASSIGNED",
        active ? "WORK_ORDER_REASSIGNED" : "WORK_ORDER_ASSIGNED",
        reason,
      );
      await tx.notification.create({
        data: {
          organizationId: context.organizationId,
          recipientId: technician.membershipId,
          type: "ASSIGNMENT",
          title: "New assignment",
          body: order.title,
        },
      });
      return assignment;
    });
  }
  async transition(
    context: OrganizationContext,
    orderId: string,
    status: WorkOrderStatus,
    expectedVersion: number,
    reason?: string,
  ) {
    return this.prisma.forOrganization(context, async (tx) => {
      const actor = await this.actor(tx, context);
      const order = await tx.workOrder.findUnique({
        where: {
          organizationId_id: {
            organizationId: context.organizationId,
            id: orderId,
          },
        },
      });
      if (!order) throw new NotFoundException();
      const staff = (["ADMIN", "DISPATCHER"] as RoleName[]).includes(
        actor.role.name,
      );
      if (!staff) {
        const assigned =
          actor.role.name === "TECHNICIAN" &&
          ["IN_PROGRESS", "COMPLETED"].includes(status) &&
          (await tx.assignment.findFirst({
            where: {
              workOrderId: orderId,
              status: "ACTIVE",
              technician: { membershipId: actor.id },
            },
          }));
        if (!assigned) throw new ForbiddenException();
      }
      if (!next[order.status].includes(status))
        throw new ConflictException("Invalid status transition");
      if (status === "CANCELLED" && !reason?.trim())
        throw new BadRequestException("Cancellation reason required");
      const now = new Date();
      const result = await tx.workOrder.updateMany({
        where: { id: orderId, version: expectedVersion },
        data: {
          status,
          version: { increment: 1 },
          ...(status === "COMPLETED" ? { completedAt: now } : {}),
          ...(status === "VERIFIED" ? { verifiedAt: now } : {}),
          ...(status === "CLOSED" ? { closedAt: now } : {}),
          ...(status === "CANCELLED" ? { cancellationReason: reason } : {}),
        },
      });
      if (result.count !== 1)
        throw new ConflictException("Stale work order version");
      if (status === "COMPLETED" || status === "CANCELLED")
        await tx.assignment.updateMany({
          where: { workOrderId: orderId, status: "ACTIVE" },
          data: {
            status: status === "COMPLETED" ? "COMPLETED" : "CANCELLED",
            endedAt: now,
            reason,
          },
        });
      await this.record(
        tx,
        context.organizationId,
        orderId,
        actor.id,
        order.status,
        status,
        "WORK_ORDER_STATUS_CHANGED",
        reason,
      );
      if (status === "CLOSED") {
        const remaining = await tx.workOrder.count({
          where: {
            requestId: order.requestId,
            status: { notIn: ["CLOSED", "CANCELLED"] },
          },
        });
        if (remaining === 0)
          await tx.maintenanceRequest.update({
            where: { id: order.requestId },
            data: { status: "RESOLVED" },
          });
      }
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
  }
  async cancelRequest(
    context: OrganizationContext,
    requestId: string,
    reason: string,
  ) {
    if (!reason.trim())
      throw new BadRequestException("Cancellation reason required");
    return this.prisma.forOrganization(context, async (tx) => {
      const actor = await this.actor(tx, context);
      const request = await tx.maintenanceRequest.findUnique({
        where: {
          organizationId_id: {
            organizationId: context.organizationId,
            id: requestId,
          },
        },
        include: { customer: true },
      });
      if (!request) throw new NotFoundException();
      const staff = (["ADMIN", "DISPATCHER"] as RoleName[]).includes(
        actor.role.name,
      );
      if (
        !staff &&
        !(
          actor.role.name === "CUSTOMER" &&
          request.customer.membershipId === actor.id &&
          request.status === "SUBMITTED"
        )
      )
        throw new ForbiddenException();
      if (["RESOLVED", "CANCELLED"].includes(request.status))
        throw new ConflictException("Request is terminal");
      const orders = await tx.workOrder.findMany({ where: { requestId } });
      if (
        orders.some((o) =>
          ["COMPLETED", "VERIFIED", "CLOSED"].includes(o.status),
        )
      )
        throw new ConflictException(
          "Completed work requires review, not cancellation",
        );
      for (const order of orders.filter((o) => o.status !== "CANCELLED")) {
        await tx.workOrder.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            cancellationReason: reason,
            version: { increment: 1 },
          },
        });
        await tx.assignment.updateMany({
          where: { workOrderId: order.id, status: "ACTIVE" },
          data: { status: "CANCELLED", endedAt: new Date(), reason },
        });
        await this.record(
          tx,
          context.organizationId,
          order.id,
          actor.id,
          order.status,
          "CANCELLED",
          "REQUEST_CANCELLED",
          reason,
        );
      }
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorId: actor.id,
          entityType: "MaintenanceRequest",
          entityId: requestId,
          action: "REQUEST_CANCELLED",
          metadata: { reason },
        },
      });
      return tx.maintenanceRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED", cancellationReason: reason },
      });
    });
  }
}
