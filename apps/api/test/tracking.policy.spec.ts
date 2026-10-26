import { ConflictException } from "@nestjs/common";
import {
  leaseExpiry,
  LOCATION_INTERVAL_MS,
  MAX_FUTURE_SKEW_MS,
  MAX_LOCATION_AGE_MS,
  TRACKING_LEASE_MS,
  validateLocationTime,
} from "../src/tracking/tracking.policy";

describe("Tracking lease and location policy", () => {
  const now = new Date("2026-10-26T12:00:00.000Z");

  it("creates a 120-second server lease without mutating the clock", () => {
    expect(leaseExpiry(now).getTime() - now.getTime()).toBe(TRACKING_LEASE_MS);
    expect(now.toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });

  it("accepts a fresh location sample within the permitted clock drift", () => {
    expect(validateLocationTime(now.toISOString(), now, null, null)).toEqual(now);
    const edge = new Date(now.getTime() - MAX_LOCATION_AGE_MS);
    expect(validateLocationTime(edge.toISOString(), now, null, null)).toEqual(edge);
    const future = new Date(now.getTime() + MAX_FUTURE_SKEW_MS);
    expect(validateLocationTime(future.toISOString(), now, null, null)).toEqual(future);
  });

  it("rejects malformed, stale and future timestamps", () => {
    for (const date of [
      "not-a-date",
      new Date(now.getTime() - MAX_LOCATION_AGE_MS - 1).toISOString(),
      new Date(now.getTime() + MAX_FUTURE_SKEW_MS + 1).toISOString(),
    ]) {
      expect(() => validateLocationTime(date, now, null, null)).toThrow(
        ConflictException,
      );
    }
  });

  it("rejects duplicate and non-monotonic recordedAt values", () => {
    expect(() => validateLocationTime(now.toISOString(), now, now, null)).toThrow(
      ConflictException,
    );
    const earlier = new Date(now.getTime() - 100);
    expect(() => validateLocationTime(earlier.toISOString(), now, now, null)).toThrow(
      ConflictException,
    );
  });

  it("enforces 15-second minimum between accepted submissions", () => {
    const tooRecent = new Date(now.getTime() - LOCATION_INTERVAL_MS + 1);
    expect(() => validateLocationTime(now.toISOString(), now, null, tooRecent))
      .toThrow(ConflictException);
    const boundary = new Date(now.getTime() - LOCATION_INTERVAL_MS);
    expect(validateLocationTime(now.toISOString(), now, null, boundary)).toEqual(now);
  });
});
