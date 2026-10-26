import { afterEach, expect, it, vi } from "vitest";
import { SharingController } from "./sharing.controller";
const session = () => ({
  id: "session",
  workOrderId: "job",
  expiresAt: new Date(Date.now() + 120000).toISOString(),
  recordedAt: null,
  receivedAt: null,
});
function setup() {
  let success: PositionCallback = () => {};
  let failure: PositionErrorCallback = () => {};
  const geo = {
    watchPosition: vi.fn((s: PositionCallback, e: PositionErrorCallback) => {
      success = s;
      failure = e;
      return 1;
    }),
    clearWatch: vi.fn(),
  };
  const api = {
    start: vi.fn().mockResolvedValue(session()),
    stop: vi.fn().mockResolvedValue(undefined),
    sample: vi.fn().mockResolvedValue(session()),
  };
  const manager = new SharingController(
    api,
    geo as unknown as Geolocation,
    vi.fn(),
  );
  return {
    manager,
    api,
    geo,
    position: () =>
      success({
        coords: { latitude: 33.5, longitude: 36.2, accuracy: 10 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    denied: () => failure({ code: 1 } as GeolocationPositionError),
  };
}
afterEach(() => vi.useRealTimers());
it("never accesses geolocation or creates a session without explicit consent", async () => {
  const s = setup();
  await s.manager.start("job", false);
  expect(s.api.start).not.toHaveBeenCalled();
  expect(s.geo.watchPosition).not.toHaveBeenCalled();
  s.manager.dispose();
});
it("starts only after server approval and stops the browser watch immediately", async () => {
  const s = setup();
  await s.manager.start("job", true);
  expect(s.geo.watchPosition).toHaveBeenCalledOnce();
  await s.manager.stop();
  expect(s.geo.clearWatch).toHaveBeenCalledWith(1);
  expect(s.api.stop).toHaveBeenCalledWith("session");
});
it("closes a session whose response arrives after the component is disposed", async () => {
  const s = setup();
  let resolve!: (value: ReturnType<typeof session>) => void;
  s.api.start.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = s.manager.start("job", true);
  s.manager.dispose();
  resolve(session());
  await pending;
  expect(s.geo.watchPosition).not.toHaveBeenCalled();
  expect(s.api.stop).toHaveBeenCalledWith("session");
});
it("permission denial ends the session without retrying geolocation", async () => {
  const s = setup();
  await s.manager.start("job", true);
  s.denied();
  expect(s.geo.clearWatch).toHaveBeenCalledWith(1);
  expect(s.api.stop).toHaveBeenCalledOnce();
  expect(s.manager.currentSession).toBeNull();
});
it("bounds sampling frequency and aborts an in-flight upload when stopped", async () => {
  const s = setup();
  await s.manager.start("job", true);
  s.api.sample.mockImplementation(() => new Promise(() => {}));
  s.position();
  s.position();
  expect(s.api.sample).toHaveBeenCalledOnce();
  const signal = s.api.sample.mock.calls[0][2] as AbortSignal;
  await s.manager.stop();
  expect(signal.aborted).toBe(true);
});
it("expires the local lease and ignores callbacks from the stopped watcher", async () => {
  vi.useFakeTimers();
  const s = setup();
  await s.manager.start("job", true);
  await vi.advanceTimersByTimeAsync(120001);
  expect(s.geo.clearWatch).toHaveBeenCalledWith(1);
  s.position();
  expect(s.api.sample).not.toHaveBeenCalled();
});
