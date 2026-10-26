import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TrackedLocation } from "./tracking.api";
import { TrackingPage } from "./TrackingPage";
import { isStaleLocation, hasReportedPosition } from "./useTrackingLocations";

const state = vi.hoisted(() => ({
  role: "DISPATCHER",
  tracking: {} as Record<string, unknown>,
}));
vi.mock("react-router-dom", () => ({ useOutletContext: () => ({ connected: true }) }));
vi.mock("../../services", () => ({ isDemo: false }));
vi.mock("../../state/store", () => ({
  useMembership: () => ({ role: { name: state.role } }),
}));
vi.mock("./useTrackingLocations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useTrackingLocations")>()),
  useTrackingLocations: () => state.tracking,
}));
vi.mock("./TrackingMap", () => ({
  TrackingMap: ({ sessions }: { sessions: TrackedLocation[] }) => (
    <div role="img" aria-label="GPS map">{sessions.map((s) => s.technicianName).join(", ")}</div>
  ),
}));

const timestamp = new Date().toISOString();
const fix: TrackedLocation = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  workOrderId: "550e8400-e29b-41d4-a716-446655440001",
  technicianId: "550e8400-e29b-41d4-a716-446655440002",
  technicianName: "Omar Field",
  workOrderTitle: "Clinic cooling repair",
  latitude: 35.111,
  longitude: 36.222,
  accuracyMeters: 14,
  recordedAt: timestamp,
  receivedAt: timestamp,
  expiresAt: new Date(Date.now() + 90_000).toISOString(),
  stale: false,
};
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.role = "DISPATCHER";
  state.tracking = {
    sessions: [],
    data: { sessions: [], serverTime: new Date().toISOString() },
    isSuccess: true,
    isError: false,
    isPending: false,
    isFetching: false,
    online: true,
    now: Date.now(),
    dataUpdatedAt: Date.now(),
    refetch: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render() {
  await act(async () => { root.render(<TrackingPage />); });
  await act(async () => { await Promise.resolve(); });
}
it("rejects an unauthorized technician without mounting the map", async () => {
  state.role = "TECHNICIAN";
  await render();
  expect(host.textContent).toContain("Only authorized dispatchers");
  expect(host.querySelector('[aria-label="GPS map"]')).toBeNull();
});
it("shows a truthful empty state without invented GPS coordinates", async () => {
  await render();
  expect(host.textContent).toContain("No shared locations yet");
  expect(host.querySelector('[aria-label="GPS map"]')).toBeNull();
});
it("renders staff-only authentic coordinates, accuracy and assignment", async () => {
  state.tracking = {
    ...state.tracking,
    sessions: [fix],
    data: { sessions: [fix], serverTime: new Date().toISOString() },
  };
  await render();
  expect(host.textContent).toContain("Omar Field");
  expect(host.textContent).toContain("Clinic cooling repair");
  expect(host.textContent).toContain("±14 m");
  expect(host.querySelector('[aria-label="GPS map"]')).not.toBeNull();
});
it("hides previously cached coordinates on network loss", async () => {
  state.tracking = { ...state.tracking, online: false, sessions: [fix] };
  await render();
  expect(host.textContent).toContain("Offline");
  expect(host.querySelector('[aria-label="GPS map"]')).toBeNull();
});
it("hides cached coordinates when permission is denied by the API", async () => {
  state.tracking = { ...state.tracking, isError: true, isSuccess: false, sessions: [fix] };
  await render();
  expect(host.textContent).toContain("Tracking data unavailable");
  expect(host.querySelector('[aria-label="GPS map"]')).toBeNull();
});
it("does not map sessions without a real location fix", async () => {
  const waiting = { ...fix, latitude: null, longitude: null, recordedAt: null, receivedAt: null };
  state.tracking = { ...state.tracking, sessions: [waiting], data: { sessions: [waiting], serverTime: timestamp } };
  await render();
  expect(host.textContent).toContain("Waiting for GPS");
  expect(host.querySelector('[aria-label="GPS map"]')).toBeNull();
});
it("classifies stale fixes with the server clock and rejects invalid coordinate values", () => {
  expect(isStaleLocation({ ...fix, receivedAt: new Date(Date.now() - 31_000).toISOString() }, new Date().toISOString(), 0)).toBe(true);
  expect(isStaleLocation({ ...fix, stale: true }, timestamp, 0)).toBe(true);
  expect(isStaleLocation(fix, timestamp, 500)).toBe(false);
  expect(hasReportedPosition({ ...fix, latitude: 999 })).toBe(false);
  expect(hasReportedPosition({ ...fix, longitude: null })).toBe(false);
  expect(hasReportedPosition(fix)).toBe(true);
});
