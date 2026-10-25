import { DataService, Role } from "../contracts";
import { demoJobs, demoUser } from "./data";
export function enterDemo(role: Role) {
  return demoUser(role);
}
export const mockService: DataService = {
  async restore() {
    return null;
  },
  async login() {
    throw new Error("Demo mode does not accept credentials.");
  },
  async register() {
    throw new Error("Demo mode does not create accounts.");
  },
  async logout() {},
  async jobs(_organizationId, role, signal) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 450);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
    return demoJobs
      .filter((job) =>
        role === "TECHNICIAN"
          ? job.technician === "Lina Haddad" &&
            ["ASSIGNED", "IN_PROGRESS"].includes(job.status)
          : role === "CUSTOMER"
            ? job.customerId === "clinic"
            : true,
      )
      .map((job) =>
        role === "CUSTOMER"
          ? {
              ...job,
              reference: job.reference.replace("WO", "MR"),
              status:
                job.status === "CANCELLED"
                  ? "CANCELLED"
                  : job.status === "OPEN"
                    ? "SUBMITTED"
                    : ["COMPLETED", "VERIFIED", "CLOSED"].includes(job.status)
                      ? "RESOLVED"
                      : "ACCEPTED",
            }
          : job,
      );
  },
};
