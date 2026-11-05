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

// Live inboxes still refresh while viewed. Hidden tabs stop all timers and
// returning focus refreshes immediately; a slow request never starts a second.
export function watchVisiblePolling(refresh: () => void | Promise<void>, interval: number) {
  let timer: number | undefined, running=false, stopped=false;
  const clear=()=>{window.clearTimeout(timer);timer=undefined;};
  const run=()=>{
    clear();
    if(stopped || running || document.visibilityState === "hidden")return;
    running=true;
    void Promise.resolve().then(()=>{if(!stopped && document.visibilityState !== "hidden")return refresh();}).catch(()=>undefined).finally(()=>{
      running=false;
      if(!stopped && document.visibilityState !== "hidden")timer=window.setTimeout(run,interval);
    });
  };
  const visibility=()=>{if(document.visibilityState === "hidden")clear();};
  const stop=watchSharedUpdates(run);
  document.addEventListener("visibilitychange",visibility);
  run();
  return ()=>{stopped=true;clear();stop();document.removeEventListener("visibilitychange",visibility);};
}
