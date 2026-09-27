// Stargaze mode: rank places for everyday observing uses from the Module B layers (modeled sky, 2034 sky,
// terrain horizon, road distance, parcel ownership and sale prices) plus tonight's cloud forecast.
import type { EngineData } from "./types";
import { cellAt, cellLonLat, type McdaData } from "./mcda";
import { cloudAt, type WxGrid } from "./weather";

export type UseCase = "grabgo" | "camping" | "imaging" | "property";
type Factor = "dark" | "darkFuture" | "clear" | "access" | "publicLand" | "open" | "price";

export const USE_CASES: Record<UseCase, { label: string; blurb: string; weights: Partial<Record<Factor, number>>; accessKm: [number, number]; needsPrivate?: boolean }> = {
  grabgo: { label: "Grab & go", blurb: "Tripod or small scope tonight: dark, clear, and a short walk from the car.",
    weights: { dark: 0.4, clear: 0.35, access: 0.25 }, accessKm: [1, 10] },
  camping: { label: "Camp / star party", blurb: "Overnight on public land (state forests, water-management and state lands): dark, clear, open views.",
    weights: { dark: 0.35, clear: 0.3, publicLand: 0.25, open: 0.1 }, accessKm: [3, 20] },
  imaging: { label: "Deep-sky imaging", blurb: "Long exposures: darkest sky, clear hours, low horizons.",
    weights: { dark: 0.5, clear: 0.35, open: 0.15 }, accessKm: [3, 20] },
  property: { label: "Buy property", blurb: "Land with dark skies that should stay dark, open views, and a sane price. Weather is not used.",
    weights: { dark: 0.35, darkFuture: 0.2, price: 0.3, open: 0.15 }, accessKm: [3, 20], needsPrivate: true },
};

const clip = (v: number) => Math.min(1, Math.max(0, v));
const isWater = (d: McdaData, i: number) => !Number.isFinite(d.raw.elevation?.[i]);

/** Share of 16 directions with open water within 3 km (lakeshore or coast = low, unobstructed horizon). */
export function waterViewLayer(d: McdaData) {
  const g = d.grid, out = new Float32Array(g.nx * g.ny);
  const dirs = Array.from({ length: 16 }, (_, k) => (k / 16) * 2 * Math.PI);
  for (let y = 0; y < g.ny; y++) for (let x = 0; x < g.nx; x++) {
    const i = y * g.nx + x;
    if (isWater(d, i)) { out[i] = NaN; continue; }
    let n = 0;
    for (const a of dirs) {
      for (const km of [1, 2, 3]) {
        const xx = Math.round(x + (Math.sin(a) * km) / g.dx_km), yy = Math.round(y - (Math.cos(a) * km) / g.dy_km);
        if (xx < 0 || yy < 0 || xx >= g.nx || yy >= g.ny) continue;
        if (isWater(d, yy * g.nx + xx)) { n++; break; }
      }
    }
    out[i] = n / 16;
  }
  return out;
}

/** Mean cloud cover (%) per Module B cell over a set of forecast hours. */
export function meanCloudLayer(d: McdaData, wx: WxGrid, hours: number[]) {
  const g = d.grid, out = new Float32Array(g.nx * g.ny);
  if (!hours.length) return out.fill(NaN);
  for (let i = 0; i < out.length; i++) {
    const [lon, lat] = cellLonLat(g, i);
    let s = 0;
    for (const h of hours) s += cloudAt(wx, h, lat, lon);
    out[i] = s / hours.length;
  }
  return out;
}

export interface Factors { dark: number; darkFuture: number; clear: number; access: number; publicLand: number; open: number; price: number; privateAcres: number }

export function factorsAt(d: McdaData, water: Float32Array, cloud: Float32Array | null, i: number, use: UseCase): Factors | null {
  const r = d.raw;
  const sky = r.sky?.[i];
  if (!Number.isFinite(sky) || isWater(d, i) || !(d.county[i] >= 0)) return null;
  const [full, zero] = USE_CASES[use].accessKm;
  const road = r.access?.[i] ?? NaN;
  const pa = r.parcel_acres?.[i] ?? 0, pu = r.public_acres?.[i] ?? 0;
  const usd = r.sale_usd_acre?.[i];
  return {
    dark: clip((sky - 20) / 2),
    darkFuture: clip(((r.mag_2034?.[i] ?? sky) - 20) / 2),
    clear: cloud ? clip(1 - cloud[i] / 100) : 0.5,
    access: Number.isFinite(road) ? clip(1 - (road - full) / (zero - full)) : 0,
    publicLand: Math.max(pa > 0 ? clip(pu / pa) : 0, (r.land?.[i] ?? 0) >= 0.99 ? 1 : 0),
    open: 0.5 * clip(1 - (r.horizon?.[i] ?? 0) / 5) + 0.5 * clip((water[i] || 0) / 0.5),
    price: usd && Number.isFinite(usd) && usd > 0 ? clip(Math.log(40000 / usd) / Math.log(40000 / 2000)) : 0,
    privateAcres: Math.max(0, pa - pu),
  };
}

export function scoreOf(f: Factors, use: UseCase) {
  const w = USE_CASES[use].weights;
  let s = 0, tw = 0;
  for (const [k, v] of Object.entries(w) as [Factor, number][]) { s += f[k] * v; tw += v; }
  return s / (tw || 1);
}

export interface Spot { rank: number; cell: number; lat: number; lon: number; score: number; county: string; f: Factors }

/** Best cells for a use, at least `minKm` apart (greedy). */
export function topSpots(d: McdaData, water: Float32Array, cloud: Float32Array | null, use: UseCase, n = 8, minKm = 10): Spot[] {
  const g = d.grid, cand: { i: number; s: number; f: Factors }[] = [];
  for (let i = 0; i < g.nx * g.ny; i++) {
    const f = factorsAt(d, water, cloud, i, use);
    if (!f) continue;
    if (USE_CASES[use].needsPrivate && f.privateAcres < 10) continue;
    cand.push({ i, s: scoreOf(f, use), f });
  }
  cand.sort((a, b) => b.s - a.s);
  const out: Spot[] = [];
  for (const c of cand) {
    const [lon, lat] = cellLonLat(g, c.i);
    if (out.some((o) => kmBetween(o.lat, o.lon, lat, lon) < minKm)) continue;
    out.push({ rank: out.length + 1, cell: c.i, lat, lon, score: c.s, county: d.countyFips[d.county[c.i]] ?? "", f: c.f });
    if (out.length >= n) break;
  }
  return out;
}

export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dx = (lon2 - lon1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)), dy = (lat2 - lat1) * 111.32;
  return Math.hypot(dx, dy);
}

const COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass16 = (az: number) => COMPASS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

/** Static facts about a place (independent of weather). */
export function placeFacts(e: EngineData, d: McdaData, water: Float32Array, lat: number, lon: number) {
  const i = cellAt(d.grid, lon, lat);
  if (i < 0) return null;
  const r = d.raw;
  const pa = r.parcel_acres?.[i] ?? 0, pu = r.public_acres?.[i] ?? 0;
  const domes = e.light_domes.map((dm) => {
    const km = kmBetween(lat, lon, dm.lat, dm.lon);
    const az = (Math.atan2((dm.lon - lon) * Math.cos((lat * Math.PI) / 180), dm.lat - lat) * 180) / Math.PI;
    return { name: dm.name, km, dir: compass16(az), strength: (dm.population / 150000) * (20 / Math.max(km, 5)) ** 2.5 };
  }).sort((a, b) => b.strength - a.strength).slice(0, 3);
  return {
    cell: i, water: isWater(d, i),
    sky: r.sky?.[i] ?? NaN, sky2034: r.mag_2034?.[i] ?? NaN,
    horizonDeg: r.horizon?.[i] ?? NaN, waterView: water[i],
    roadKm: r.access?.[i] ?? NaN,
    parcelAcres: pa, publicShare: pa > 0 ? Math.min(1, pu / pa) : 0,
    publicCat: Math.round(r.public_cat?.[i] ?? 0), conservation: (r.land?.[i] ?? 0) >= 0.99,
    usdAcre: r.sale_usd_acre?.[i] ?? NaN, usdP25: r.sale_p25?.[i] ?? NaN, usdP75: r.sale_p75?.[i] ?? NaN,
    county: d.countyFips[d.county[i]] ?? "", domes,
  };
}
export type PlaceFacts = NonNullable<ReturnType<typeof placeFacts>>;
