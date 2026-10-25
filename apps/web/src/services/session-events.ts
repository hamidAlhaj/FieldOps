import { setAccessToken } from "./http";
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("fieldops-session")
    : null;
function invalidate() {
  setAccessToken(null);
  window.dispatchEvent(new Event("fieldops:expired"));
}
if (channel)
  channel.onmessage = (event) => {
    if (event.data === "identity-changed") invalidate();
  };
window.addEventListener("storage", (event) => {
  if (!channel && event.key === "fieldops-session-event") invalidate();
});
export function announceIdentityChange() {
  if (channel) channel.postMessage("identity-changed");
  else {
    try {
      localStorage.setItem("fieldops-session-event", String(Date.now()));
    } catch {
      /* Storage can be unavailable in restricted browser contexts. */
    }
  }
}
