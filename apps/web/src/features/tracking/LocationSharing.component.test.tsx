import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { LocationSharing } from "./LocationSharing";

const api = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  sample: vi.fn(),
  mine: vi.fn(),
}));
vi.mock("./tracking.api", () => ({ trackingApi: () => api }));
vi.mock("../../services", () => ({ isDemo: false }));
vi.mock("../../state/store", () => ({
  useSession: (selector: (s: { organizationId: string }) => unknown) =>
    selector({ organizationId: "550e8400-e29b-41d4-a716-446655440000" }),
}));

let host: HTMLDivElement;
let root: Root;
let watchSuccess: PositionCallback = () => {};
let watchError: PositionErrorCallback = () => {};
let geolocation: { watchPosition: ReturnType<typeof vi.fn>; clearWatch: ReturnType<typeof vi.fn> };
const session = () => ({
  id: "550e8400-e29b-41d4-a716-446655440010",
  workOrderId: "550e8400-e29b-41d4-a716-446655440020",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
  receivedAt: null,
  recordedAt: null,
});

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  api.start.mockReset().mockImplementation(async () => session());
  api.stop.mockReset().mockResolvedValue(undefined);
  api.sample.mockReset().mockImplementation(async () => session());
  api.mine.mockReset().mockResolvedValue({ session: null, serverTime: new Date().toISOString() });
  geolocation = {
    watchPosition: vi.fn((onSuccess: PositionCallback, onError: PositionErrorCallback) => {
      watchSuccess = onSuccess;
      watchError = onError;
      return 22;
    }),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});

async function mount() {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={query}>
        <LocationSharing workOrderId="550e8400-e29b-41d4-a716-446655440020" />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  // Flush query completion before interacting with the consent checkbox.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
function button(text: string) {
  const element = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
}
it("does not request browser location until explicit opt-in and Start", async () => {
  await mount();
  expect(button("Start sharing location").disabled).toBe(true);
  expect(geolocation.watchPosition).not.toHaveBeenCalled();
  expect(api.start).not.toHaveBeenCalled();
  const consent = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await act(async () => { consent.click(); });
  expect(button("Start sharing location").disabled).toBe(false);
  await act(async () => {
    button("Start sharing location").click();
    await Promise.resolve();
  });
  expect(api.start).toHaveBeenCalledOnce();
  expect(geolocation.watchPosition).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Sharing on");
  await act(async () => { button("Stop sharing location").click(); await Promise.resolve(); });
  expect(geolocation.clearWatch).toHaveBeenCalledWith(22);
  expect(api.stop).toHaveBeenCalledWith(session().id);
  expect(host.textContent).toContain("Sharing off");
});
it("stops the watcher and server session when geolocation permission is denied", async () => {
  await mount();
  await act(async () => { (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click(); });
  await act(async () => { button("Start sharing location").click(); await Promise.resolve(); });
  await act(async () => {
    watchError({ code: 1 } as GeolocationPositionError);
    await Promise.resolve();
  });
  expect(geolocation.clearWatch).toHaveBeenCalledWith(22);
  expect(api.stop).toHaveBeenCalled();
  expect(host.textContent).toContain("permission denied");
});
it("never displays an old session as active or resumes GPS on mount", async () => {
  api.mine.mockResolvedValueOnce({ session: session(), serverTime: new Date().toISOString() });
  await mount();
  expect(host.textContent).toContain("A previous sharing session exists");
  expect(button("Start sharing location").disabled).toBe(true);
  expect(geolocation.watchPosition).not.toHaveBeenCalled();
});
