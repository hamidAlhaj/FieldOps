import { Prisma } from "@prisma/client";
export async function event(
  tx: Prisma.TransactionClient,
  organizationId: string,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  version?: number,
) {
  return tx.outboxEvent.create({
    data: { organizationId, aggregateType, aggregateId, eventType, version },
  });
}
export async function notify(
  tx: Prisma.TransactionClient,
  organizationId: string,
  recipientId: string,
  title: string,
  body: string,
) {
  const notification = await tx.notification.create({
    data: { organizationId, recipientId, type: "ASSIGNMENT", title, body },
  });
  await event(
    tx,
    organizationId,
    "Notification",
    notification.id,
    "notification.created",
  );
}
