import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trackingApi, type TrackedLocation } from "./tracking.api";
import { useSession } from "../../state/store";
import { isDemo } from "../../services";

// A valid, actually reported fix. No mock positions or default map pins.
export function hasReportedPosition(
  value: TrackedLocation,
): value is TrackedLocation & { latitude: number; longitude: number } {
  return (
    value.latitude !== null &&
    value.longitude !== null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180 &&
    value.recordedAt !== null &&
    value.receivedAt !== null
  );
}

export function isStaleLocation(
  item: Pick<TrackedLocation, "stale" | "receivedAt" | "expiresAt">,
  serverTime: string,
  now: number,
): boolean {
  // The server already marks stale fixes. Compare against the returned server
  // clock to tolerate a skewed device clock and the passage of time afterward.
  const serverAt = Date.parse(serverTime);
  const received = item.receivedAt ? Date.parse(item.receivedAt) : NaN;
  const expires = Date.parse(item.expiresAt);
  const elapsed = Number.isFinite(serverAt) ? Math.max(0, now - serverAt) : 0;
  return (
    item.stale ||
    !Number.isFinite(received) ||
    !Number.isFinite(expires) ||
    (Number.isFinite(serverAt) && (serverAt - received + elapsed > 30_000 || serverAt + elapsed >= expires))
  );
}

export function useTrackingLocations(enabled: boolean) {
  const org = useSession((s) => s.organizationId);
  const userId = useSession((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const changed = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void queryClient.invalidateQueries({ queryKey: ["tracking-locations", org, userId] });
    };
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, [org, queryClient, userId]);

  const query = useQuery({
    queryKey: ["tracking-locations", org, userId],
    enabled: enabled && !isDemo && Boolean(org) && online,
    queryFn: ({ signal }) => trackingApi(org).locations(signal),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    staleTime: 0,
    // On revocation, do not show sensitive previously cached positions.
    placeholderData: undefined,
  });
  const sessions = online && query.isSuccess ? query.data.sessions : [];
  return { ...query, sessions, online, now };
}
