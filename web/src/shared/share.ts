// Shareable app state in the URL hash (#s=<base64url JSON>&f=<field>&t=<tab>), shared by the apps: any view can be
// shared, and a PDF figure can link back to the exact field it came from.
export function encodeState(v: unknown) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(v)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState<T>(s: string): T | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))) as T;
  } catch {
    return null;
  }
}

/** The hash fields: encoded state, linked field, tab. */
export function readHash() {
  const h = new URLSearchParams(typeof location === "undefined" ? "" : location.hash.replace(/^#/, ""));
  return { s: h.get("s"), field: h.get("f"), tab: h.get("t") };
}

export function shareHref(encoded: string, field?: string, tab?: string) {
  const base = location.href.split("#")[0];
  const q = new URLSearchParams({ s: encoded });
  if (field) q.set("f", field);
  if (tab) q.set("t", tab);
  return `${base}#${q.toString()}`;
}
