import { z } from "zod";
import { http } from "../../services/http";
import { orgPath } from "../../services/workflow";
export const sharingSession = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid(),
  expiresAt: z.string(),
  recordedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
});
export type SharingSession = z.infer<typeof sharingSession>;
export const mineSchema = z.object({
  session: sharingSession.nullable(),
  serverTime: z.string(),
});
export const locationSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid(),
  technicianId: z.string().uuid(),
  technicianName: z.string(),
  workOrderTitle: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  accuracyMeters: z.number().nullable(),
  recordedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  expiresAt: z.string(),
  stale: z.boolean(),
});
export type TrackedLocation = z.infer<typeof locationSchema>;
export const locationsSchema = z.object({
  serverTime: z.string(),
  sessions: z.array(locationSchema),
});
export type LocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAt: string;
};
export function trackingApi(org: string) {
  const path = `${orgPath(org)}/tracking`;
  return {
    start: (workOrderId: string) =>
      http(`${path}/sessions`, sharingSession, {
        method: "POST",
        body: JSON.stringify({ workOrderId, consent: true }),
      }),
    stop: (id: string) =>
      http(`${path}/sessions/${id}`, z.void(), { method: "DELETE" }),
    sample: (id: string, sample: LocationSample, signal: AbortSignal) =>
      http(`${path}/sessions/${id}/location`, sharingSession, {
        method: "POST",
        signal,
        body: JSON.stringify(sample),
      }),
    mine: (signal?: AbortSignal) =>
      http(`${path}/mine`, mineSchema, { signal }),
    locations: (signal?: AbortSignal) =>
      http(`${path}/locations`, locationsSchema, { signal }),
  };
}
