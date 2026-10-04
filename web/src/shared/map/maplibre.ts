// Shared mapping core for the apps (Dark Sky, WildSight, Public Art): one MapLibre setup (worker, CSS),
// the dark OpenFreeMap basemap, and helpers for meter-sized map symbols.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);
export { maplibregl };

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

/** Circle radius in pixels for a radius in meters (feature property `prop`) at any zoom (MapLibre 512-px tiles). */
export function metersToPx(prop: string, latDeg = 29.5) {
  const k = 78271.517 * Math.cos((latDeg * Math.PI) / 180);
  return ["interpolate", ["exponential", 2], ["zoom"], 0, ["/", ["get", prop], k], 24, ["/", ["*", ["get", prop], 2 ** 24], k]];
}
