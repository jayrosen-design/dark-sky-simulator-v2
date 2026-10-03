// Shared data access: every app reads its own package from data/ next to its page (Dark Sky: /data/,
// WildSight: /wildsight/data/). A page-relative path resolves the same way in dev, in the build and under any
// sub-path, and keeps the apps' data separate.
export const DATA_BASE = "data/";

export async function fetchJson<T>(name: string): Promise<T> {
  const r = await fetch(DATA_BASE + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  // Dev servers answer a missing file with the app's HTML page (200): report that as missing, not as a JSON error.
  if ((r.headers.get("content-type") ?? "").includes("text/html")) throw new Error(`${name} was not found (the server returned a web page). Reload the page; if it persists, rebuild the data package.`);
  return r.json() as Promise<T>;
}
