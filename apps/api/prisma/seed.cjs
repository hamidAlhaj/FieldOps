const { PrismaClient } = require("@prisma/client");
const { createHash } = require("node:crypto");
require("dotenv/config");
const id = (label) => {
  const h = createHash("sha256").update(`fieldops-demo:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const when = new Date("2026-10-20T09:00:00Z");
const at = (hours) => new Date(when.getTime() + hours * 3600000);
async function seedDatabase(db) {
  for (const name of ["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"]) {
    await db.role.upsert({
      where: { name },
      create: { id: id(`role:${name}`), name },
      update: {},
    });
  }
  for (const [key, name, city, lat, lng] of [
    ["damascus", "Damascus Facilities", "Damascus", 33.5138, 36.2765],
    ["aleppo", "Aleppo Maintenance", "Aleppo", 36.2021, 37.1343],
  ]) {
    await db.$transaction(async (tx) => {
      const organizationId = id(key);
      await tx.organization.upsert({
        where: { id: organizationId },
        create: { id: organizationId, name },
        update: {},
      });
      const people = [
        ["admin", "ADMIN", "Organization Manager"],
        ["dispatcher", "DISPATCHER", "Dispatch Coordinator"],
        ["tech1", "TECHNICIAN", "Omar HVAC"],
        ["tech2", "TECHNICIAN", "Lina Electrical"],
        ["customer", "CUSTOMER", "Community Clinic"],
      ];
      for (const [person, roleName, displayName] of people) {
        const userId = id(`${key}:${person}:user`);
        const role = await tx.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await tx.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email: `${person}.${key}@example.test`,
            displayName,
          },
          update: {},
        });
        await tx.membership.upsert({
          where: { id: id(`${key}:${person}`) },
          create: {
            id: id(`${key}:${person}`),
            organizationId,
            userId,
            roleId: role.id,
          },
          update: {},
        });
      }
      for (const [person, employeeCode] of [
        ["tech1", "HVAC-001"],
        ["tech2", "ELEC-002"],
      ])
        await tx.technicianProfile.upsert({
          where: { id: id(`${key}:${person}:profile`) },
          create: {
            id: id(`${key}:${person}:profile`),
            organizationId,
            membershipId: id(`${key}:${person}`),
            employeeCode,
          },
          update: {},
        });
      await tx.customerProfile.upsert({
        where: { id: id(`${key}:customer:profile`) },
        create: {
          id: id(`${key}:customer:profile`),
          organizationId,
          membershipId: id(`${key}:customer`),
        },
        update: {},
      });
      await tx.team.upsert({
        where: { id: id(`${key}:team`) },
        create: {
          id: id(`${key}:team`),
          organizationId,
          name: "Facilities Response",
        },
        update: {},
      });
      for (const person of ["dispatcher", "tech1", "tech2"])
        await tx.teamMember.upsert({
          where: { id: id(`${key}:team:${person}`) },
          create: {
            id: id(`${key}:team:${person}`),
            organizationId,
            teamId: id(`${key}:team`),
            membershipId: id(`${key}:${person}`),
          },
          update: {},
        });
      for (const [scenario, title, status, priority] of [
        ["closed", "Clinic cooling system repair", "CLOSED", "HIGH"],
        ["reassigned", "Intermittent power failure", "IN_PROGRESS", "URGENT"],
        ["cancelled", "Duplicate water pump request", "CANCELLED", "LOW"],
        ["open", "Quarterly ventilation inspection", "OPEN", "MEDIUM"],
      ]) {
        const requestId = id(`${key}:${scenario}:request`),
          workOrderId = id(`${key}:${scenario}:order`);
        await tx.maintenanceRequest.upsert({
          where: { id: requestId },
          create: {
            id: requestId,
            organizationId,
            customerId: id(`${key}:customer:profile`),
            title,
            description: `Maintenance at ${city} community clinic. Contact reception on arrival.`,
            address: `${city}, Community Clinic, service entrance`,
            latitude: lat,
            longitude: lng,
            status:
              status === "CLOSED"
                ? "RESOLVED"
                : status === "CANCELLED"
                  ? "CANCELLED"
                  : "ACCEPTED",
            cancellationReason:
              status === "CANCELLED"
                ? "Duplicate request confirmed by customer"
                : null,
            createdAt: at(-1),
            updatedAt: at(5),
          },
          update: {},
        });
        await tx.workOrder.upsert({
          where: { id: workOrderId },
          create: {
            id: workOrderId,
            organizationId,
            requestId,
            teamId: id(`${key}:team`),
            title,
            description:
              "Inspect equipment, document findings, and complete safety checks.",
            priority,
            status,
            scheduledAt: when,
            completedAt: status === "CLOSED" ? at(3) : null,
            verifiedAt: status === "CLOSED" ? at(4) : null,
            closedAt: status === "CLOSED" ? at(5) : null,
            cancellationReason:
              status === "CANCELLED"
                ? "Duplicate request confirmed by customer"
                : null,
            createdAt: when,
            updatedAt: at(5),
            version:
              status === "CLOSED"
                ? 5
                : status === "IN_PROGRESS"
                  ? 4
                  : status === "CANCELLED"
                    ? 2
                    : 0,
          },
          update: {},
        });
        const sequence =
          status === "CLOSED"
            ? [
                "OPEN",
                "ASSIGNED",
                "IN_PROGRESS",
                "COMPLETED",
                "VERIFIED",
                "CLOSED",
              ]
            : status === "IN_PROGRESS"
              ? ["OPEN", "ASSIGNED", "IN_PROGRESS", "ASSIGNED", "IN_PROGRESS"]
              : status === "CANCELLED"
                ? ["OPEN", "ASSIGNED", "CANCELLED"]
                : ["OPEN"];
        for (let i = 0; i < sequence.length; i++)
          await tx.workOrderStatusHistory.upsert({
            where: { id: id(`${key}:${scenario}:history:${i}`) },
            create: {
              id: id(`${key}:${scenario}:history:${i}`),
              organizationId,
              workOrderId,
              changedById: id(`${key}:dispatcher`),
              fromStatus: sequence[i - 1] ?? null,
              toStatus: sequence[i],
              reason:
                scenario === "reassigned" && i === 3
                  ? "Electrical specialist required after inspection"
                  : "Demo workflow event",
              createdAt: new Date(when.getTime() + i * 3600000),
            },
            update: {},
          });
        if (status !== "OPEN") {
          const assignmentStatus =
            status === "CLOSED"
              ? "COMPLETED"
              : status === "CANCELLED"
                ? "CANCELLED"
                : "REASSIGNED";
          await tx.assignment.upsert({
            where: { id: id(`${key}:${scenario}:assignment:1`) },
            create: {
              id: id(`${key}:${scenario}:assignment:1`),
              organizationId,
              workOrderId,
              technicianId: id(`${key}:tech1:profile`),
              assignedById: id(`${key}:dispatcher`),
              status: assignmentStatus,
              createdAt: at(1),
              updatedAt: at(3),
              endedAt: status === "CANCELLED" ? at(2) : at(3),
              reason: "Demo lifecycle",
            },
            update: {},
          });
        }
        if (scenario === "reassigned")
          await tx.assignment.upsert({
            where: { id: id(`${key}:${scenario}:assignment:2`) },
            create: {
              id: id(`${key}:${scenario}:assignment:2`),
              organizationId,
              workOrderId,
              technicianId: id(`${key}:tech2:profile`),
              assignedById: id(`${key}:dispatcher`),
              reason: "Electrical specialist required",
              createdAt: at(3),
              updatedAt: at(3),
            },
            update: {},
          });
        await tx.auditLog.upsert({
          where: { id: id(`${key}:${scenario}:audit`) },
          create: {
            id: id(`${key}:${scenario}:audit`),
            organizationId,
            actorId: id(`${key}:dispatcher`),
            action: "DEMO_WORKFLOW_IMPORTED",
            entityType: "WorkOrder",
            entityId: workOrderId,
            metadata: { demo: true, status },
          },
          update: {},
        });
      }
      await tx.technicianLocationUpdate.upsert({
        where: { id: id(`${key}:location`) },
        create: {
          id: id(`${key}:location`),
          organizationId,
          technicianId: id(`${key}:tech2:profile`),
          latitude: lat,
          longitude: lng,
          accuracyMeters: 12,
          recordedAt: when,
        },
        update: {},
      });
      await tx.attachment.upsert({
        where: { id: id(`${key}:attachment`) },
        create: {
          id: id(`${key}:attachment`),
          organizationId,
          workOrderId: id(`${key}:closed:order`),
          uploadedById: id(`${key}:tech1`),
          storageKey: `demo/${key}/repair-photo.jpg`,
          fileName: "repair-photo.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 240000,
        },
        update: {},
      });
      await tx.notification.upsert({
        where: { id: id(`${key}:notification`) },
        create: {
          id: id(`${key}:notification`),
          organizationId,
          recipientId: id(`${key}:tech2`),
          type: "ASSIGNMENT",
          title: "Electrical inspection assigned",
          body: "Visit the community clinic and inspect the electrical panel.",
          createdAt: at(3),
          updatedAt: at(3),
        },
        update: {},
      });
    });
  }
}
module.exports = { seedDatabase, id };
if (require.main === module) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DEMO_SEED !== "true"
  )
    throw new Error(
      "Demo seed requires ALLOW_DEMO_SEED=true and non-production NODE_ENV",
    );
  const db = new PrismaClient();
  seedDatabase(db)
    .then(() =>
      console.log("Demo data seeded (2 organizations; no login credentials)."),
    )
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
