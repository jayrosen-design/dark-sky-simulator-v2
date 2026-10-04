// Small geometry helpers shared by the apps' map code: deterministic hashing, distances, spacing points along
// lines, square footprints for extrusions, basemap road polylines and empty feature collections.
import type { FeatureCollection, Point, Polygon } from "geojson";
import type { Map as MlMap } from "maplibre-gl";

export const M_PER_DEG = 111320;

/** Deterministic 0-1 hash (stable choices as the map moves). */
export function hash01(a: number, b = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const stochasticRound = (v: number, key: number) => Math.floor(v) + (hash01(key, 7) < v - Math.floor(v) ? 1 : 0);

export function metersBetween(a: [number, number], b: [number, number]) {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((b[0] - a[0]) * M_PER_DEG * k, (b[1] - a[1]) * M_PER_DEG);
}

/** n points evenly spaced along a chain of segments (half a spacing in from each end). */
export function placeAlong(segs: [number, number][][], n: number): [number, number][] {
  if (n <= 0 || !segs.length) return [];
  const lens = segs.map(([a, b]) => metersBetween(a, b)), total = lens.reduce((x, y) => x + y, 0);
  if (!(total > 0)) return [];
  const out: [number, number][] = [];
  let si = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) / n) * total;
    while (si < segs.length - 1 && acc + lens[si] < target) { acc += lens[si]; si++; }
    const f = lens[si] > 0 ? Math.min(1, (target - acc) / lens[si]) : 0, [a, b] = segs[si];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Square footprint (half-size in meters) as a polygon, for pole and lamp-head extrusions. */
export function square(lon: number, lat: number, half: number): Polygon {
  const dLat = half / M_PER_DEG, dLon = half / (M_PER_DEG * Math.cos(lat * (Math.PI / 180)));
  return { type: "Polygon", coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] };
}

const ROAD_SKIP = new Set(["path", "track", "rail", "transit", "ferry", "pier", "bridge", "busway", "aerialway"]);

/** Road polylines from the basemap vector tiles currently loaded. */
export function basemapRoads(map: MlMap) {
  const roads: [number, number][][] = [];
  try {
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
      if (ROAD_SKIP.has(String(f.properties?.class))) continue;
      const g = f.geometry;
      if (g.type === "LineString") roads.push(g.coordinates as [number, number][]);
      else if (g.type === "MultiLineString") for (const l of g.coordinates) roads.push(l as [number, number][]);
    }
  } catch { /* source not ready */ }
  return roads;
}

export function emptyFC<T extends Polygon | Point>(): FeatureCollection<T> { return { type: "FeatureCollection", features: [] }; }
