import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui";
import { useSession } from "../../state/store";
import { isDemo } from "../../services";
import { trackingApi } from "./tracking.api";
import { SharingController, type SharingState } from "./sharing.controller";
export function LocationSharing({ workOrderId }: { workOrderId: string }) {
  const organizationId = useSession((s) => s.organizationId);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<SharingState>({
    phase: "idle",
    session: null,
    message: "Location sharing is off.",
  });
  const [stopPending, setStopPending] = useState(false);
  const controller = useRef<SharingController | null>(null);
  const query = useQueryClient();
  const mine = useQuery({
    queryKey: ["tracking-mine", organizationId],
    enabled: !isDemo,
    queryFn: async ({ signal }) => {
      const sessionId = controller.current?.currentSession?.id;
      try {
        const result = await trackingApi(organizationId).mine(signal);
        if (
          !signal.aborted &&
          sessionId &&
          controller.current?.currentSession?.id === sessionId &&
          result.session?.id !== sessionId
        ) {
          void controller.current.stop(
            "The work session or sharing permission ended. Location sharing stopped.",
          );
          void query.invalidateQueries({
            queryKey: ["order", organizationId, workOrderId],
          });
        }
        return result;
      } catch (error) {
        if (
          !signal.aborted &&
          sessionId &&
          controller.current?.currentSession?.id === sessionId
        )
          void controller.current.stop(
            "Sharing stopped because its session could not be verified.",
          );
        throw error;
      }
    },
    refetchInterval: 10000,
    retry: false,
  });
  useEffect(() => {
    if (isDemo || !navigator.geolocation) return;
    const api = trackingApi(organizationId);
    const manager = new SharingController(
      api,
      navigator.geolocation,
      (next) => {
        setState(next);
        if (next.phase === "idle") setConsent(false);
      },
    );
    controller.current = manager;
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        setConsent(false);
        void manager.stop("Sharing stopped because this page is hidden.");
      }
    };
    const offline = () => {
      setConsent(false);
      void manager.stop("Sharing stopped because you are offline.");
    };
    const leaving = () => manager.dispose();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", leaving);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", leaving);
      manager.dispose();
      controller.current = null;
    };
  }, [organizationId, workOrderId]);
  if (isDemo) return null;
  const previous =
    !state.session && state.phase === "idle" ? mine.data?.session : null;
  const available = !!navigator.geolocation && window.isSecureContext;
  return (
    <section
      className="workflow-card location-sharing"
      aria-labelledby="location-sharing-title"
    >
      <div className="sharing-heading">
        <h2 id="location-sharing-title">Location sharing</h2>
        <span
          className={`sharing-pill ${state.phase === "sharing" ? "sharing-on" : ""}`}
        >
          {state.phase === "sharing" ? "Sharing on" : "Sharing off"}
        </span>
      </div>
      <p className="muted">
        Optional: let your organization’s dispatchers see your latest location
        while this job is in progress. Leaving this page, hiding this tab, or
        ending the job stops sharing. It never restarts automatically.
      </p>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
      {state.session?.receivedAt && (
        <p className="muted">
          Last sent:{" "}
          <time dateTime={state.session.receivedAt}>
            {new Date(state.session.receivedAt).toLocaleTimeString()}
          </time>
        </p>
      )}
      {previous && (
        <div className="tracking-notice">
          <p>
            A previous sharing session exists. This page is not collecting your
            location. Stop the previous session before starting a new one.
          </p>
          <Button
            variant="secondary"
            busy={stopPending}
            onClick={async () => {
              setStopPending(true);
              try {
                await trackingApi(organizationId).stop(previous.id);
                await mine.refetch();
              } catch {
                setState((s) => ({
                  ...s,
                  message:
                    "Could not reach the server. The previous session expires within two minutes without new updates.",
                }));
              } finally {
                setStopPending(false);
              }
            }}
          >
            Stop previous sharing session
          </Button>
        </div>
      )}
      {!available && (
        <p className="tracking-notice">
          Location sharing needs a supported browser and a secure HTTPS
          connection.
        </p>
      )}
      {state.phase === "idle" && (
        <>
          <label className="sharing-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={
                !available || !!previous || mine.isPending || mine.isError
              }
            />
            I agree to share my location during this work session
          </label>
          <Button
            disabled={
              !available ||
              !consent ||
              !!previous ||
              mine.isPending ||
              mine.isError
            }
            onClick={() => {
              if (document.visibilityState !== "visible" || !navigator.onLine) {
                setState((s) => ({
                  ...s,
                  message:
                    "Keep this page visible and connect to the internet before starting.",
                }));
                return;
              }
              void controller.current?.start(workOrderId, consent);
            }}
          >
            Start sharing location
          </Button>
        </>
      )}
      {state.phase !== "idle" && (
        <Button
          variant="secondary"
          onClick={() => {
            setConsent(false);
            void controller.current?.stop().then(() => mine.refetch());
          }}
        >
          Stop sharing location
        </Button>
      )}
      {mine.isError && (
        <p className="tracking-notice">
          Sharing status could not be checked.{" "}
          <button className="text-link" onClick={() => void mine.refetch()}>
            Try again
          </button>
        </p>
      )}
      <p className="tracking-footnote">
        Only the latest position is kept for this sharing session. If connection
        is lost, server access expires within two minutes.
      </p>
    </section>
  );
}
