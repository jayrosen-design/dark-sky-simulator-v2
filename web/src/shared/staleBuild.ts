// After a new deploy, a tab opened on the previous build still asks for the old build's chunk file names, which the
// host no longer serves. Reload once (keeping the app's view state in the URL hash) to pick up the new build; the
// guard stops a reload loop if a chunk is genuinely missing.
const KEY = "dss.chunkReload";
const WINDOW_MS = 30000;
let hashState: () => Record<string, string> = () => ({});

/** Let an app add view state (e.g. its open tab) to the URL hash before a reload. */
export function setReloadState(fn: () => Record<string, string>) { hashState = fn; }

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
  for (const [k, v] of Object.entries(hashState())) q.set(k, v);
  history.replaceState(null, "", `#${q.toString()}`);
  location.reload();
  return true;
}
