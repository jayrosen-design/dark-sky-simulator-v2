// After a new deploy, a tab opened on the previous build still asks for the old build's chunk file names, which the
// host no longer serves. Reload once (keeping the current tab) to pick up the new build; the guard stops a reload loop
// if a chunk is genuinely missing.
import { useStore } from "./state/store";

const KEY = "dss.chunkReload";
const WINDOW_MS = 30000;

/** Chrome, Firefox and Safari wordings for a failed dynamic import. */
export const isChunkLoadError = (err: unknown) =>
  /dynamically imported module|Importing a module script failed/i.test(String((err as Error)?.message ?? err));

/** Reload into the new build unless we already did in the last 30 s. Returns whether a reload was started. */
export function reloadForNewBuild() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage unavailable: reload anyway */ }
  const q = new URLSearchParams(location.hash.replace(/^#/, ""));
  q.set("t", useStore.getState().tab);
  history.replaceState(null, "", `#${q.toString()}`);
  location.reload();
  return true;
}
