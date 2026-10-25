import { z } from "zod";
let token: string | null = null;
let refreshing: Promise<void> | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function setAccessToken(value: string | null) {
  token = value;
}
const tokenSchema = z.object({ accessToken: z.string() });
export async function refreshSession() {
  if (!refreshing) {
    const run = async () => {
      const result = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!result.ok) {
        token = null;
        throw new ApiError(
          "Your session has ended. Please sign in again.",
          result.status,
        );
      }
      token = tokenSchema.parse(await result.json()).accessToken;
    };
    // Serialize cookie rotation across tabs when Web Locks is supported.
    refreshing = (
      navigator.locks
        ? navigator.locks.request("fieldops-refresh", run).then(() => {})
        : run()
    ).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}
export async function http<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      await refreshSession();
    } catch (error) {
      window.dispatchEvent(new Event("fieldops:expired"));
      throw error;
    }
    return http(path, schema, options, false);
  }
  if (!response.ok) {
    let message =
      response.status === 429
        ? "Too many attempts. Please wait a minute and try again."
        : response.status >= 500
          ? "The service is unavailable. Please try again."
          : "This request could not be completed.";
    try {
      const body = await response.json();
      if (response.status < 500 && typeof body.message === "string")
        message = body.message;
    } catch {
      /* non-JSON gateway error */
    }
    throw new ApiError(message, response.status);
  }
  return schema.parse(
    response.status === 204 ? undefined : await response.json(),
  );
}
export const accessSchema = tokenSchema;
