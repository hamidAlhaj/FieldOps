import { announceIdentityChange } from "./session-events";
import { z } from "zod";
import { DataService, jobSchema, userSchema } from "./contracts";
import {
  accessSchema,
  ApiError,
  http,
  refreshSession,
  setAccessToken,
} from "./http";
async function me() {
  return http("/auth/me", userSchema);
}
export const apiService: DataService = {
  async restore() {
    try {
      await refreshSession();
      return await me();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  async login(data) {
    const result = await http("/auth/login", accessSchema, {
      method: "POST",
      body: JSON.stringify(data),
    });
    setAccessToken(result.accessToken);
    announceIdentityChange();
    return me();
  },
  async register(data) {
    const result = await http("/auth/register", accessSchema, {
      method: "POST",
      body: JSON.stringify(data),
    });
    setAccessToken(result.accessToken);
    announceIdentityChange();
    return me();
  },
  async logout() {
    await http("/auth/logout", z.undefined(), { method: "POST" });
    setAccessToken(null);
    announceIdentityChange();
  },
  async jobs(organizationId, role, signal) {
    const data = await http(
      `/organizations/${encodeURIComponent(organizationId)}/${role === "CUSTOMER" ? "requests" : "work-orders"}`,
      z.array(jobSchema),
      { signal },
    );
    return data.map((row) => ({
      ...row,
      reference: `${role === "CUSTOMER" ? "MR" : "WO"}-${row.id.slice(0, 8).toUpperCase()}`,
      priority: row.priority ?? null,
      address: row.address ?? "Location available in the maintenance request",
      scheduledAt: row.scheduledAt ?? null,
    }));
  },
};
