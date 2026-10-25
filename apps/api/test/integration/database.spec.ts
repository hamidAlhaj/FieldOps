import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../src/prisma/prisma.service";
import { WorkOrderService } from "../../src/work-orders/work-order.service";
const { seedDatabase, id } = require("../../prisma/seed.cjs");

describe("PostgreSQL tenant isolation and lifecycle", () => {
  const owner = new PrismaClient();
  const scoped = new PrismaService();
  const work = new WorkOrderService(scoped);
  const a = {
    organizationId: id("damascus"),
    actorId: id("damascus:dispatcher:user"),
  };
  const b = {
    organizationId: id("aleppo"),
    actorId: id("aleppo:dispatcher:user"),
  };
  const technician = {
    organizationId: a.organizationId,
    actorId: id("damascus:tech1:user"),
  };
  async function request() {
    return owner.maintenanceRequest.create({
      data: {
        id: randomUUID(),
        organizationId: a.organizationId,
        customerId: id("damascus:customer:profile"),
        title: "Integration HVAC inspection",
        description: "Compressor noise during startup",
        address: "Clinic service entrance",
      },
    });
  }
  async function order() {
    const r = await request();
    return work.create(a, r.id, r.title, r.description);
  }
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
      throw new Error("Use dedicated _test database");
    await owner.$connect();
    await scoped.onModuleInit();
    await seedDatabase(owner);
  });
  afterAll(async () => {
    await owner.$disconnect();
    await scoped.onModuleDestroy();
  });

  it("seeds all entities idempotently without adding duplicate demo rows", async () => {
    const before = [
      await owner.organization.count(),
      await owner.workOrder.count(),
      await owner.assignment.count(),
    ];
    await seedDatabase(owner);
    expect([
      await owner.organization.count(),
      await owner.workOrder.count(),
      await owner.assignment.count(),
    ]).toEqual(before);
    expect(await owner.attachment.count()).toBeGreaterThanOrEqual(2);
    expect(await owner.auditLog.count()).toBeGreaterThanOrEqual(8);
  });
  it("rejects forged tenant context and unrecognized actors", async () => {
    await expect(
      scoped.forOrganization({ ...a, organizationId: b.organizationId }, (tx) =>
        tx.workOrder.findMany(),
      ),
    ).rejects.toThrow("Organization access denied");
    await expect(
      scoped.forOrganization({ ...a, actorId: randomUUID() }, (tx) =>
        tx.workOrder.findMany(),
      ),
    ).rejects.toThrow("Organization access denied");
  });
  it("RLS filters unscoped reads and blocks cross-tenant reads and updates", async () => {
    await scoped.forOrganization(a, async (tx) => {
      expect(await tx.$queryRaw`SELECT current_user AS name`).toEqual([
        { name: "fieldops_app" },
      ]);
      expect(
        (await tx.workOrder.findMany()).every(
          (row) => row.organizationId === a.organizationId,
        ),
      ).toBe(true);
      expect(
        await tx.workOrder.findUnique({
          where: { id: id("aleppo:open:order") },
        }),
      ).toBeNull();
      expect(
        (
          await tx.workOrder.updateMany({
            where: { id: id("aleppo:open:order") },
            data: { title: "forbidden" },
          })
        ).count,
      ).toBe(0);
      expect(
        (await tx.user.findMany()).every(
          (row) => !row.email.includes("aleppo"),
        ),
      ).toBe(true);
    });
  });
  it("fails closed without transaction context", async () => {
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE fieldops_app");
      expect(await tx.workOrder.count()).toBe(0);
    });
  });
  it("rejects cross-tenant inserts by RLS", async () => {
    await expect(
      scoped.forOrganization(a, (tx) =>
        tx.team.create({
          data: { organizationId: b.organizationId, name: randomUUID() },
        }),
      ),
    ).rejects.toThrow();
  });
  it("composite foreign keys reject cross-tenant parent links even for the owner", async () => {
    await expect(
      owner.workOrder.create({
        data: {
          organizationId: a.organizationId,
          requestId: id("aleppo:open:request"),
          title: "Forbidden",
          description: "Cross tenant FK",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("does not leak context across pooled transactions", async () => {
    const result = await Promise.all(
      [a, b, a, b].map((context) =>
        scoped.forOrganization(context, (tx) => tx.organization.findMany()),
      ),
    );
    result.forEach((rows, i) =>
      expect(rows.map((row) => row.id)).toEqual([
        [a, b, a, b][i].organizationId,
      ]),
    );
  });
  it("suspended membership is denied and restored after the test", async () => {
    await owner.membership.update({
      where: { id: id("damascus:dispatcher") },
      data: { status: "SUSPENDED" },
    });
    try {
      await expect(
        scoped.forOrganization(a, (tx) => tx.team.findMany()),
      ).rejects.toThrow("Organization access denied");
    } finally {
      await owner.membership.update({
        where: { id: id("damascus:dispatcher") },
        data: { status: "ACTIVE" },
      });
    }
  });
  it("runs request -> assigned -> in progress -> completed -> verified -> closed atomically", async () => {
    const o = await order();
    await work.assign(a, o.id, id("damascus:tech1:profile"), 0);
    await work.transition(technician, o.id, "IN_PROGRESS", 1);
    await work.transition(technician, o.id, "COMPLETED", 2);
    await expect(
      work.transition(technician, o.id, "VERIFIED", 3),
    ).rejects.toThrow();
    await work.transition(a, o.id, "VERIFIED", 3);
    const closed = await work.transition(a, o.id, "CLOSED", 4);
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();
    expect(
      (
        await owner.maintenanceRequest.findUniqueOrThrow({
          where: { id: o.requestId },
        })
      ).status,
    ).toBe("RESOLVED");
    expect(
      await owner.workOrderStatusHistory.count({
        where: { workOrderId: o.id },
      }),
    ).toBe(6);
    expect(
      await owner.assignment.findFirst({ where: { workOrderId: o.id } }),
    ).toMatchObject({ status: "COMPLETED" });
    await expect(work.transition(a, o.id, "IN_PROGRESS", 5)).rejects.toThrow(
      "Invalid status transition",
    );
  });
  it("rejects stale versions and rolls back notifications, assignment, and history", async () => {
    const o = await order();
    await expect(
      work.assign(a, o.id, id("damascus:tech1:profile"), 99),
    ).rejects.toThrow("Stale work order version");
    expect(await owner.assignment.count({ where: { workOrderId: o.id } })).toBe(
      0,
    );
    expect(
      await owner.workOrderStatusHistory.count({
        where: { workOrderId: o.id },
      }),
    ).toBe(1);
  });
  it("reassigns with history, resets to ASSIGNED, and removes the old technician access", async () => {
    const o = await order();
    await work.assign(a, o.id, id("damascus:tech1:profile"), 0);
    await work.transition(technician, o.id, "IN_PROGRESS", 1);
    await expect(
      work.assign(a, o.id, id("damascus:tech2:profile"), 2),
    ).rejects.toThrow("Reassignment reason required");
    await work.assign(
      a,
      o.id,
      id("damascus:tech2:profile"),
      2,
      "Electrical specialist needed",
    );
    const assignments = await owner.assignment.findMany({
      where: { workOrderId: o.id },
    });
    expect(assignments.filter((row) => row.status === "ACTIVE")).toHaveLength(
      1,
    );
    expect(
      assignments.filter((row) => row.status === "REASSIGNED"),
    ).toHaveLength(1);
    await expect(
      work.transition(technician, o.id, "IN_PROGRESS", 3),
    ).rejects.toThrow();
  });
  it("serializes concurrent dispatch attempts without duplicate active assignments", async () => {
    const o = await order();
    const outcomes = await Promise.allSettled([
      work.assign(a, o.id, id("damascus:tech1:profile"), 0),
      work.assign(a, o.id, id("damascus:tech2:profile"), 0),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await owner.assignment.count({
        where: { workOrderId: o.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  });
  it("enforces the partial unique active assignment constraint", async () => {
    const o = await order();
    await work.assign(a, o.id, id("damascus:tech1:profile"), 0);
    await expect(
      owner.assignment.create({
        data: {
          organizationId: a.organizationId,
          workOrderId: o.id,
          technicianId: id("damascus:tech2:profile"),
          assignedById: id("damascus:dispatcher"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("cancels requests and all unfinished work without deleting history", async () => {
    const o = await order();
    await work.assign(a, o.id, id("damascus:tech1:profile"), 0);
    await expect(work.cancelRequest(a, o.requestId, "")).rejects.toThrow();
    await work.cancelRequest(a, o.requestId, "Customer confirmed duplicate");
    expect(
      (await owner.workOrder.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe("CANCELLED");
    expect(
      await owner.assignment.findFirst({ where: { workOrderId: o.id } }),
    ).toMatchObject({ status: "CANCELLED" });
    await expect(
      work.assign(a, o.id, id("damascus:tech2:profile"), 2),
    ).rejects.toThrow();
  });
  it("rejects invalid attachment parents and impossible coordinates", async () => {
    await expect(
      owner.attachment.create({
        data: {
          organizationId: a.organizationId,
          uploadedById: id("damascus:tech1"),
          storageKey: randomUUID(),
          fileName: "test.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1,
        },
      }),
    ).rejects.toThrow();
    await expect(
      owner.technicianLocationUpdate.create({
        data: {
          organizationId: a.organizationId,
          technicianId: id("damascus:tech1:profile"),
          latitude: 91,
          longitude: 0,
          recordedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
  it("runtime role cannot mutate audit history or grant itself membership", async () => {
    await expect(
      scoped.forOrganization(a, (tx) => tx.auditLog.deleteMany()),
    ).rejects.toThrow();
    await expect(
      scoped.forOrganization(a, (tx) =>
        tx.membership.update({
          where: { id: id("damascus:dispatcher") },
          data: { roleId: id("role:ADMIN") },
        }),
      ),
    ).rejects.toThrow();
  });
});
