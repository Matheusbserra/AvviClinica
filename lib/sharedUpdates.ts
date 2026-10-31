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
  let focusTimer: number | undefined;
  const requestedRefresh = () => {
    window.clearTimeout(focusTimer); focusTimer = undefined;
    if (document.visibilityState !== "hidden") refresh();
  };
  const activeRefresh = () => {
    if (document.visibilityState === "hidden") return;
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(requestedRefresh, 200);
  };
  const channel = openChannel();
  if (channel) channel.onmessage = event => { if (event.data === "saved") requestedRefresh(); };
  const storage = (event: StorageEvent) => { if (event.key === channelName) requestedRefresh(); };
  window.addEventListener("focus", activeRefresh);
  for (const event of ["online", localEvent]) window.addEventListener(event, requestedRefresh);
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", activeRefresh);
  return () => {
    window.clearTimeout(focusTimer);
    channel?.close();
    window.removeEventListener("focus", activeRefresh);
    for (const event of ["online", localEvent]) window.removeEventListener(event, requestedRefresh);
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", activeRefresh);
  };
}
