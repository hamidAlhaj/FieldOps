import { z } from "zod";
export const roles = ["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"] as const;
export type Role = (typeof roles)[number];
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  memberships: z.array(
    z.object({
      id: z.string(),
      organizationId: z.string(),
      role: z.object({ name: z.enum(roles) }),
    }),
  ),
});
export type User = z.infer<typeof userSchema>;
export const statuses = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "VERIFIED",
  "CLOSED",
  "CANCELLED",
  "SUBMITTED",
  "ACCEPTED",
  "RESOLVED",
] as const;
export type Status = (typeof statuses)[number];
export type Job = {
  id: string;
  reference: string;
  title: string;
  description: string;
  address: string;
  status: Status;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
  scheduledAt: string | null;
  createdAt: string;
  technician?: string;
  customerId?: string;
};
export type Credentials = { email: string; password: string };
export type Registration = Credentials & {
  displayName: string;
  organizationName: string;
};
export interface DataService {
  restore(): Promise<User | null>;
  login(data: Credentials): Promise<User>;
  register(data: Registration): Promise<User>;
  logout(): Promise<void>;
  jobs(
    organizationId: string,
    role: Role,
    signal?: AbortSignal,
  ): Promise<Job[]>;
}
export const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(statuses),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  scheduledAt: z.string().nullable().optional(),
  createdAt: z.string(),
  address: z.string().optional(),
});
export const roleLabels: Record<Role, string> = {
  ADMIN: "Administrator",
  DISPATCHER: "Dispatcher",
  TECHNICIAN: "Technician",
  CUSTOMER: "Customer",
};
export const statusLabels: Record<Status, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  RESOLVED: "Resolved",
};
