const channelName = "avvi-shared-data-saved-v1";
const localEvent = "avvi-shared-data-saved";
function openChannel() {
  try { return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : undefined; } catch { return undefined; }
}

// Signals contain no records or credentials. Each tab fetches only the data
// permitted by its own authenticated session. Other devices refresh on return
// or explicit request, without continuously downloading cloud metadata.
export function requestSharedRefresh() { window.dispatchEvent(new Event(localEvent)); }
export function notifySharedSave() {
  requestSharedRefresh();
  const channel = openChannel();
  let notified = false;
  try { if (channel) { channel.postMessage("saved"); notified = true; } } catch { /* Browser isolation can disable cross-tab messaging. */ }
  finally { channel?.close(); }
  if (!notified) {
    try { window.localStorage.setItem(channelName, `${Date.now()}-${Math.random()}`); } catch { /* Polling still works if browser storage is blocked. */ }
  }
}

export function watchSharedUpdates(refresh: () => void) {
  const activeRefresh = () => { if (document.visibilityState !== "hidden") refresh(); };
  const channel = openChannel();
  if (channel) channel.onmessage = event => { if (event.data === "saved") activeRefresh(); };
  const storage = (event: StorageEvent) => { if (event.key === channelName) activeRefresh(); };
  for (const event of ["focus", "online", localEvent]) window.addEventListener(event, activeRefresh);
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", activeRefresh);
  return () => {
    channel?.close();
    for (const event of ["focus", "online", localEvent]) window.removeEventListener(event, activeRefresh);
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", activeRefresh);
  };
}
