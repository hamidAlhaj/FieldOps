import { Logger, OnModuleDestroy } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import { OutboxEvent, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { Principal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { orderVisibility } from "../resources/visibility";
import { readEnvironment } from "../config/environment";
interface Identity {
  principal: Principal;
  organizationId: string;
  expiresAt: number;
}
@WebSocketGateway({
  namespace: "/operations",
  path: "/api/socket.io",
  transports: ["websocket"],
  maxHttpBufferSize: 1024,
  cors: { origin: false },
})
export class OperationsGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() server!: Namespace;
  // Privileged outbox worker, never used for request data or arbitrary client queries.
  private readonly publisher = new PrismaClient();
  private timer?: NodeJS.Timeout;
  private checking?: NodeJS.Timeout;
  private running?: Promise<void>;
  private readonly logger = new Logger(OperationsGateway.name);
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}
  afterInit(server: Namespace) {
    server.use(async (socket, next) => {
      try {
        if (socket.handshake.headers.origin !== readEnvironment().WEB_ORIGIN)
          throw new Error();
        const input = z
          .object({
            token: z.string().max(4096),
            organizationId: z.string().uuid(),
          })
          .parse(socket.handshake.auth);
        const identity: Identity = {
          ...(await this.auth.verifyAccessToken(input.token)),
          organizationId: input.organizationId,
        };
        try {
          await this.check(identity);
        } catch {
          next(new Error("ORGANIZATION_FORBIDDEN"));
          return;
        }
        socket.data.identity = identity;
        next();
      } catch {
        next(new Error("AUTH_REQUIRED"));
      }
    });
    server.on("connection", (socket) => {
      socket.join(`org:${socket.data.identity.organizationId}`);
      socket.emit("sync.required");
    });
    this.timer = setInterval(() => {
      if (!this.running)
        this.running = this.publish()
          .catch(() => this.logger.warn("Outbox delivery will retry"))
          .finally(() => {
            this.running = undefined;
          });
    }, 500);
    this.checking = setInterval(() => {
      for (const socket of server.sockets.values())
        void this.check(socket.data.identity).catch(() =>
          socket.disconnect(true),
        );
    }, 15000);
  }
  private async check(identity: Identity) {
    if (identity.expiresAt <= Date.now()) throw new Error("Expired");
    await this.auth.validateSession(
      identity.principal.id,
      identity.principal.sessionId,
    );
    return this.prisma.forOrganization(
      {
        organizationId: identity.organizationId,
        actorId: identity.principal.id,
      },
      (tx) =>
        tx.membership.findFirstOrThrow({
          where: { userId: identity.principal.id },
          include: { role: true },
        }),
    );
  }
  private async visible(socket: Socket, event: OutboxEvent) {
    const identity: Identity = socket.data.identity;
    const member = await this.check(identity);
    return this.prisma.forOrganization(
      {
        organizationId: identity.organizationId,
        actorId: identity.principal.id,
      },
      async (tx) => {
        if (event.aggregateType === "Notification")
          return !!(await tx.notification.findFirst({
            where: { id: event.aggregateId, recipientId: member.id },
            select: { id: true },
          }));
        if (event.aggregateType === "WorkOrder")
          return !!(await tx.workOrder.findFirst({
            where: { id: event.aggregateId, ...orderVisibility(member) },
            select: { id: true },
          }));
        if (event.aggregateType === "MaintenanceRequest")
          return (
            member.role.name !== "TECHNICIAN" &&
            !!(await tx.maintenanceRequest.findFirst({
              where: {
                id: event.aggregateId,
                ...(member.role.name === "CUSTOMER"
                  ? { customer: { membershipId: member.id } }
                  : {}),
              },
              select: { id: true },
            }))
          );
        return false;
      },
    );
  }
  private async publish() {
    await this.publisher.$transaction(
      async (tx) => {
        const events = await tx.$queryRaw<
          OutboxEvent[]
        >`SELECT * FROM "OutboxEvent" WHERE "publishedAt" IS NULL ORDER BY "createdAt" LIMIT 20 FOR UPDATE SKIP LOCKED`;
        for (const event of events) {
          const ids =
            this.server.adapter.rooms.get(`org:${event.organizationId}`) ??
            new Set<string>();
          for (const id of ids) {
            const socket = this.server.sockets.get(id);
            if (!socket) continue;
            try {
              if (await this.visible(socket, event))
                socket.emit("operations.changed", {
                  id: event.id,
                  aggregateType: event.aggregateType,
                  aggregateId: event.aggregateId,
                  eventType: event.eventType,
                  version: event.version,
                });
            } catch {
              socket.disconnect(true);
            }
          }
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          });
        }
      },
      { timeout: 20000 },
    );
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    clearInterval(this.checking);
    await this.running;
    await this.publisher.$disconnect();
  }
}
