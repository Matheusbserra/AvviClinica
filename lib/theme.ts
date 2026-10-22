export type Theme = "light" | "dark";
export const themeStorageKey = "avvi.ui.theme.v1";
const themeEvent = "avvi-theme-changed";
export const themeBootScript = `try{document.documentElement.dataset.theme=localStorage.getItem("${themeStorageKey}")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}`;

export function getTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { window.localStorage.setItem(themeStorageKey, theme); } catch { /* The toggle still works when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(themeEvent));
}
export function subscribeTheme(changed: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    changed();
  };
  window.addEventListener(themeEvent, changed);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(themeEvent, changed); window.removeEventListener("storage", storage); };
}
