import { Prisma, RoleName } from "@prisma/client";
export function orderVisibility(member: {
  id: string;
  role: { name: RoleName };
}): Prisma.WorkOrderWhereInput {
  if (member.role.name === "TECHNICIAN")
    return {
      assignments: {
        some: {
          status: { in: ["ACTIVE", "COMPLETED", "CANCELLED"] },
          technician: { membershipId: member.id },
        },
      },
    };
  if (member.role.name === "CUSTOMER")
    return { request: { customer: { membershipId: member.id } } };
  return {};
}
export const person = {
  select: { user: { select: { displayName: true } } },
} as const;
export const orderDetail = {
  request: { select: { id: true, address: true } },
  assignments: {
    orderBy: { createdAt: "desc" as const },
    include: { technician: { include: { membership: person } } },
  },
  attachments: { orderBy: { createdAt: "asc" as const } },
  progressUpdates: {
    orderBy: { createdAt: "asc" as const },
    include: { author: person },
  },
  statusHistory: {
    orderBy: { createdAt: "asc" as const },
    include: { changedBy: person },
  },
} satisfies Prisma.WorkOrderInclude;
