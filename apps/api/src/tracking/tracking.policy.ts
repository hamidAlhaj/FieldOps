import { ConflictException } from "@nestjs/common";

export const TRACKING_LEASE_MS = 120_000;
export const LOCATION_INTERVAL_MS = 15_000;
export const MAX_LOCATION_AGE_MS = 30_000;
export const MAX_FUTURE_SKEW_MS = 5_000;

export function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + TRACKING_LEASE_MS);
}

export function validateLocationTime(
  recordedAt: string,
  now: Date,
  previousRecordedAt: Date | null,
  previousReceivedAt: Date | null,
): Date {
  const timestamp = new Date(recordedAt);
  const ms = timestamp.getTime();
  if (
    !Number.isFinite(ms) ||
    ms > now.getTime() + MAX_FUTURE_SKEW_MS ||
    now.getTime() - ms > MAX_LOCATION_AGE_MS
  ) {
    throw new ConflictException("Location timestamp is stale or invalid");
  }
  if (previousRecordedAt && ms <= previousRecordedAt.getTime()) {
    throw new ConflictException("Location timestamp must increase");
  }
  if (
    previousReceivedAt &&
    now.getTime() - previousReceivedAt.getTime() < LOCATION_INTERVAL_MS
  ) {
    throw new ConflictException("Location submissions are too frequent");
  }
  return timestamp;
}
