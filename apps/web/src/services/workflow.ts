import { statuses } from "./contracts";
import { z } from "zod";
import { http } from "./http";
const person = z.object({ user: z.object({ displayName: z.string() }) });
export const recordSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  status: z.enum(statuses),
  version: z.number(),
  createdAt: z.string(),
});
export const requestSchema = recordSchema.extend({
  address: z.string(),
  reviewNotes: z.string().nullable(),
  workOrders: z.array(recordSchema),
});
export const orderSchema = recordSchema.extend({
  progress: z.number(),
  completionNotes: z.string().nullable(),
  request: z.object({ id: z.string(), address: z.string() }),
  assignments: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      acceptedAt: z.string().nullable(),
      technician: z.object({ membershipId: z.string(), membership: person }),
    }),
  ),
  attachments: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["BEFORE", "AFTER"]).nullable(),
      assignmentId: z.string().nullable(),
    }),
  ),
  activity: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      createdAt: z.string(),
      actor: person,
      metadata: z.record(z.unknown()).nullable(),
    }),
  ),
  progressUpdates: z.array(
    z.object({
      id: z.string(),
      percent: z.number(),
      note: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export const techniciansSchema = z.array(
  z.object({ id: z.string(), employeeCode: z.string(), membership: person }),
);
export const notificationsSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  }),
);
export const orgPath = (org: string) => `/organizations/${org}`;
export function command(
  org: string,
  path: string,
  data: object | FormData,
  method = "POST",
) {
  return http(`${orgPath(org)}${path}`, z.object({ id: z.string() }), {
    method,
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
}
