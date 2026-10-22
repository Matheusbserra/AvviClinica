const channelName = "avvi-shared-data-saved-v1";
const localEvent = "avvi-shared-data-saved";
export const sharedRefreshInterval = 3000;
function openChannel() {
  try { return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : undefined; } catch { return undefined; }
}

// Signals contain no records or credentials. Each tab fetches only the data
// permitted by its own authenticated session; other devices use the same poll.
export function notifySharedSave() {
  window.dispatchEvent(new Event(localEvent));
  const channel = openChannel();
  let notified = false;
  try { if (channel) { channel.postMessage("saved"); notified = true; } } catch { /* Browser isolation can disable cross-tab messaging. */ }
  finally { channel?.close(); }
  if (!notified) {
    try { window.localStorage.setItem(channelName, `${Date.now()}-${Math.random()}`); } catch { /* Polling still works if browser storage is blocked. */ }
  }
}

export function watchSharedUpdates(refresh: () => void) {
  const channel = openChannel();
  if (channel) channel.onmessage = event => { if (event.data === "saved") refresh(); };
  const storage = (event: StorageEvent) => { if (event.key === channelName) refresh(); };
  const timer = window.setInterval(refresh, sharedRefreshInterval);
  for (const event of ["focus", "online", localEvent]) window.addEventListener(event, refresh);
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.clearInterval(timer);
    channel?.close();
    for (const event of ["focus", "online", localEvent]) window.removeEventListener(event, refresh);
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", refresh);
  };
}
