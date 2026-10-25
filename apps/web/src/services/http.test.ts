import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
it("coalesces concurrent unauthorized requests into one refresh and retries with the new bearer", async () => {
  let refreshes = 0;
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path.endsWith("/refresh")) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 10));
      return new Response(JSON.stringify({ accessToken: "renewed" }));
    }
    if (
      (options.headers as Record<string, string>).Authorization ===
      "Bearer renewed"
    )
      return new Response(JSON.stringify({ ok: true }));
    return new Response("{}", { status: 401 });
  });
  vi.stubGlobal("fetch", fetch);
  const { http } = await import("./http");
  const schema = z.object({ ok: z.boolean() });
  expect(
    await Promise.all([http("/orders", schema), http("/orders", schema)]),
  ).toEqual([{ ok: true }, { ok: true }]);
  expect(refreshes).toBe(1);
});
it("signals session expiration when refresh is revoked", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  const expired = vi.fn();
  window.addEventListener("fieldops:expired", expired);
  const { http } = await import("./http");
  await expect(http("/orders", z.array(z.unknown()))).rejects.toThrow(
    "session has ended",
  );
  expect(expired).toHaveBeenCalledOnce();
  window.removeEventListener("fieldops:expired", expired);
});
it("rejects malformed successful contracts rather than displaying unvalidated data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"ok":"not a boolean"}')),
  );
  const { http } = await import("./http");
  await expect(
    http("/orders", z.object({ ok: z.boolean() })),
  ).rejects.toThrow();
});
it("does not refresh failed credential requests", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response('{"message":"Invalid credentials"}', { status: 401 }),
    );
  vi.stubGlobal("fetch", fetch);
  const { http } = await import("./http");
  await expect(
    http("/auth/login", z.unknown(), { method: "POST" }),
  ).rejects.toThrow("Invalid credentials");
  expect(fetch).toHaveBeenCalledTimes(1);
});
