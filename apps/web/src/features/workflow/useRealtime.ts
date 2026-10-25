import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { isDemo } from "../../services";
import { getAccessToken, refreshSession } from "../../services/http";
import { useSession } from "../../state/store";
export function useRealtime() {
  const organizationId = useSession((s) => s.organizationId);
  const query = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (isDemo || !organizationId) return;
    let active = true;
    let recovery: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    const sync = () => {
      void query.invalidateQueries();
    };
    const socket = io("/operations", {
      path: "/api/socket.io",
      transports: ["websocket"],
      auth: (cb) => cb({ token: getAccessToken(), organizationId }),
      reconnectionDelayMax: 10000,
    });
    const recover = () => {
      setConnected(false);
      if (recovery) return;
      recovery = setTimeout(async () => {
        recovery = undefined;
        try {
          await refreshSession();
          if (active) socket.connect();
        } catch {
          if (active) window.dispatchEvent(new Event("fieldops:expired"));
        }
      }, 5000);
    };
    socket.on("connect", () => {
      setConnected(true);
      sync();
    });
    socket.on("sync.required", sync);
    socket.on("operations.changed", (event: { id: string }) => {
      if (!event || typeof event.id !== "string" || seen.has(event.id)) return;
      seen.add(event.id);
      if (seen.size > 500) seen.clear();
      sync();
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      if (reason === "io server disconnect") recover();
    });
    socket.on("connect_error", (error) => {
      if (error.message === "AUTH_REQUIRED") recover();
    });
    const timer = setInterval(sync, 30000);
    window.addEventListener("online", sync);
    return () => {
      active = false;
      clearTimeout(recovery);
      clearInterval(timer);
      window.removeEventListener("online", sync);
      socket.disconnect();
    };
  }, [organizationId, query]);
  return connected;
}
