import { lazy, Suspense } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, Clock3, MapPin, RefreshCw, Radio, ShieldCheck, WifiOff } from "lucide-react";
import { Button } from "../../components/ui";
import { isDemo } from "../../services";
import { useMembership } from "../../state/store";
import { useTrackingLocations, hasReportedPosition, isStaleLocation } from "./useTrackingLocations";
import type { VisibleFix } from "./TrackingMap";

const MapView = lazy(() =>
  import("./TrackingMap").then((module) => ({ default: module.TrackingMap })),
);

export function TrackingPage() {
  const membership = useMembership();
  const staff = ["ADMIN", "DISPATCHER"].includes(membership?.role.name ?? "");
  const { connected = false } = useOutletContext<{ connected: boolean }>() ?? {};
  const tracking = useTrackingLocations(staff && !isDemo);
  if (isDemo || !staff) {
    return (
      <section className="workflow-card" role="alert">
        <h1>Tracking is not available</h1>
        <p>Only authorized dispatchers and administrators can view consented technician locations.</p>
      </section>
    );
  }

  const elapsedMs = tracking.dataUpdatedAt ? Math.max(0, tracking.now - tracking.dataUpdatedAt) : 0;
  const serverClock = tracking.data ? Date.parse(tracking.data.serverTime) : NaN;
  // Never display a session after its server-issued lease expires, even while
  // the tab is hidden and polling is paused.
  const all = Number.isFinite(serverClock)
    ? tracking.sessions.filter((s) => Date.parse(s.expiresAt) > serverClock + elapsedMs)
    : [];
  const displayed: VisibleFix[] = all.filter(hasReportedPosition).map((s) => ({
    ...s,
    displayStale: isStaleLocation(s, tracking.data!.serverTime, elapsedMs),
  }));
  const waiting = all.filter((s) => !hasReportedPosition(s));

  return (
    <div className="tracking-page">
      <header className="page-heading tracking-page-heading">
        <div>
          <p className="eyebrow"><MapPin size={13} aria-hidden="true" /> FIELD OPERATIONS</p>
          <h1>Live tracking</h1>
          <p>Latest opt-in positions from technicians on active assignments. Locations are never simulated.</p>
        </div>
        <Button
          variant="secondary"
          disabled={!tracking.online}
          busy={tracking.isFetching}
          onClick={() => void tracking.refetch()}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh locations
        </Button>
      </header>

      <div className="tracking-metrics" aria-label="Tracking overview">
        <div className="workflow-card tracking-metric">
          <span><Radio size={17} aria-hidden="true" /> Sharing sessions</span>
          <strong>{all.length}</strong>
          <small>Explicitly approved by technicians</small>
        </div>
        <div className="workflow-card tracking-metric">
          <span><MapPin size={17} aria-hidden="true" /> Located</span>
          <strong>{displayed.length}</strong>
          <small>Position available on map</small>
        </div>
        <div className="workflow-card tracking-metric">
          <span><Clock3 size={17} aria-hidden="true" /> Needs attention</span>
          <strong>{displayed.filter((s) => s.displayStale).length + waiting.length}</strong>
          <small>Stale or awaiting first GPS fix</small>
        </div>
      </div>

      <section className="tracking-status" role="status" aria-live="polite">
        <span className={tracking.online && connected ? "tracking-signal-online" : "tracking-signal-muted"} />
        {!tracking.online ? (
          <><WifiOff size={16} aria-hidden="true" /> Offline — locations hidden until connection returns.</>
        ) : tracking.isError ? (
          <><AlertTriangle size={16} aria-hidden="true" /> Could not verify live locations. No cached coordinates are being shown.</>
        ) : tracking.isPending || tracking.awaitingVerification ? (
          "Verifying authorized tracking data…"
        ) : connected ? (
          "Realtime notifications connected · GPS verified by authenticated API every 15 seconds."
        ) : (
          "Realtime notifications disconnected · authenticated polling every 15 seconds remains active."
        )}
        {tracking.dataUpdatedAt > 0 && (
          <time dateTime={new Date(tracking.dataUpdatedAt).toISOString()}>
            Last checked {new Date(tracking.dataUpdatedAt).toLocaleTimeString()}
          </time>
        )}
      </section>

      {tracking.isError && (
        <div className="workflow-card tracking-error" role="alert">
          <h2>Tracking data unavailable</h2>
          <p>Verify your network connection and permissions, then try again.</p>
          <Button variant="secondary" onClick={() => void tracking.refetch()}>Retry tracking request</Button>
        </div>
      )}

      {tracking.isPending || tracking.awaitingVerification ? (
        <section className="workflow-card" role="status">Loading map and active sessions…</section>
      ) : !tracking.online || tracking.isError ? null : (
        <div className="tracking-layout">
          <section className="workflow-card tracking-map-panel" aria-label="Technician location map">
            <div className="tracking-panel-header">
              <h2>Map overview</h2>
              <span className="tracking-chip"><ShieldCheck size={13} aria-hidden="true" /> Authorized access</span>
            </div>
            {displayed.length ? (
              <Suspense fallback={<p role="status" className="tracking-map-empty">Loading map…</p>}>
                <MapView sessions={displayed} />
              </Suspense>
            ) : (
              <div className="tracking-map-empty" role="status">
                <MapPin size={28} aria-hidden="true" />
                <strong>No shared locations yet</strong>
                <p>The map appears only after a technician explicitly consents and shares a GPS fix.</p>
              </div>
            )}
            <p className="tracking-privacy">
              Map tiles come from OpenStreetMap. Viewing the map contacts its tile servers; technician
              coordinates remain on FieldOps authenticated APIs.
            </p>
          </section>
          <section className="workflow-card tracking-list-panel" aria-label="Tracked technicians">
            <div className="tracking-panel-header">
              <h2>Technician activity</h2>
              <span className="muted">{all.length} sharing</span>
            </div>
            {!all.length && <p className="muted" role="status">No technician has an active sharing session.</p>}
            <ul className="tracking-people">
              {all.map((item) => {
                const located = hasReportedPosition(item);
                const stale = !located || isStaleLocation(item, tracking.data!.serverTime, elapsedMs);
                return (
                  <li key={item.id} className="tracking-person">
                    <div className="tracking-person-heading">
                      <span className="tracking-person-avatar" aria-hidden="true">
                        {item.technicianName.trim().slice(0, 1).toUpperCase() || "T"}
                      </span>
                      <div>
                        <strong>{item.technicianName}</strong>
                        <p>{item.workOrderTitle}</p>
                      </div>
                      <span className={stale ? "tracking-fix-stale" : "tracking-fix-fresh"}>
                        {located ? stale ? "Stale" : "Recent" : "Waiting for GPS"}
                      </span>
                    </div>
                    <dl className="tracking-person-details">
                      <div><dt>Assignment</dt><dd>In progress</dd></div>
                      <div>
                        <dt>Last update</dt>
                        <dd>{item.receivedAt ? <time dateTime={item.receivedAt}>{new Date(item.receivedAt).toLocaleString()}</time> : "Not yet received"}</dd>
                      </div>
                      <div><dt>Accuracy</dt><dd>{item.accuracyMeters === null ? "Unknown" : `±${Math.round(item.accuracyMeters)} m`}</dd></div>
                    </dl>
                    {stale && (
                      <p className="tracking-stale-warning">
                        <AlertTriangle size={14} aria-hidden="true" /> {located ? "Location is older than 30 seconds." : "Awaiting a fresh location from this technician."}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
