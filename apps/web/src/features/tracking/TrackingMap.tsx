import { Fragment, useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TrackedLocation } from "./tracking.api";
import { hasReportedPosition } from "./useTrackingLocations";

export type VisibleFix = TrackedLocation & {
  latitude: number;
  longitude: number;
  displayStale: boolean;
};

function Viewport({ points }: { points: VisibleFix[] }) {
  const map = useMap();
  const coordinatesKey = points.map((s) => `${s.latitude},${s.longitude}`).join("|");
  const bounds = useMemo(
    () => points.map((s): LatLngTuple => [s.latitude, s.longitude]),
    // Only reframe the map when geographic coordinates actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinatesKey],
  );
  useEffect(() => {
    if (bounds.length === 0) return;
    // React Leaflet draws on actual GPS samples. Never re-center on guessed data.
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
  }, [bounds, map]);
  return null;
}

export function TrackingMap({ sessions }: { sessions: VisibleFix[] }) {
  const available = sessions.filter(hasReportedPosition);
  if (available.length === 0) {
    return (
      <div className="tracking-map-empty" role="status">
        <strong>No active location fixes</strong>
        <p>The map becomes available when an assigned technician explicitly shares a location.</p>
      </div>
    );
  }
  return (
    <div className="tracking-map-frame">
      <MapContainer
        center={[available[0].latitude, available[0].longitude]}
        zoom={12}
        scrollWheelZoom={false}
        className="tracking-leaflet"
        aria-label="Latest consented technician locations"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
          maxZoom={19}
        />
        <Viewport points={available} />
        {available.map((tech) => (
          <Fragment key={tech.id}>
          <CircleMarker
            center={[tech.latitude, tech.longitude]}
            radius={10}
            pathOptions={{
              color: tech.displayStale ? "#a77432" : "#187758",
              fillColor: tech.displayStale ? "#e7ad52" : "#21dda2",
              fillOpacity: 0.85,
              weight: 3,
            }}
          >
            {tech.accuracyMeters !== null && tech.accuracyMeters > 0 && (
              <Circle
                center={[tech.latitude, tech.longitude]}
                radius={tech.accuracyMeters}
                pathOptions={{
                  color: tech.displayStale ? "#a77432" : "#187758",
                  fillOpacity: 0.08,
                  weight: 1,
                }}
              />
            )}
            <Popup>
              <strong>{tech.technicianName}</strong>
              <span className="tracking-popup-line">{tech.workOrderTitle}</span>
              <span className="tracking-popup-line">{tech.displayStale ? "Stale fix" : "Recent fix"}</span>
              <span className="tracking-popup-line">
                Received: {tech.receivedAt ? new Date(tech.receivedAt).toLocaleString() : "Not yet"}
              </span>
              <span className="tracking-popup-line">
                Accuracy: {tech.accuracyMeters === null ? "Unknown" : `±${Math.round(tech.accuracyMeters)} m`}
              </span>
            </Popup>
          </CircleMarker>
          </Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
