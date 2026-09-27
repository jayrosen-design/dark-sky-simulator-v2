// Observing weather for Stargaze mode. Live data: Open-Meteo forecast and air-quality APIs (free, no key,
// CC BY 4.0, attribution required). Simulated data: a deterministic synthetic field for offline demos, always
// labeled as not a forecast. Seeing and transparency are proxies derived from standard variables, not the
// numerical seeing models that dedicated astronomy services run.

export type WxSource = "live" | "sim";

export interface WxGrid {
  source: WxSource;
  west: number; south: number; step: number; nx: number; ny: number;
  times: number[];           // UTC ms, hourly
  cloud: Float32Array[];     // per hour, ny*nx (row 0 = south), percent
  fetched: number;
}

export interface WxPoint {
  source: WxSource;
  times: number[];
  cloud: number[]; low: number[]; mid: number[]; high: number[];
  rh: number[]; temp: number[]; dew: number[]; wind: number[]; gust: number[]; jet: number[];
  visibility: number[]; aod: (number | null)[];
}

export const WX_BBOX = { west: -83.9, south: 28.8, east: -81.3, north: 30.8, step: 0.2 };
const OM = "https://api.open-meteo.com/v1/forecast";
const OM_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";
export const WX_ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";

export function gridPoints(b = WX_BBOX) {
  const nx = Math.round((b.east - b.west) / b.step) + 1, ny = Math.round((b.north - b.south) / b.step) + 1;
  const lats: number[] = [], lons: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { lats.push(+(b.south + j * b.step).toFixed(3)); lons.push(+(b.west + i * b.step).toFixed(3)); }
  return { nx, ny, lats, lons };
}

export function gridUrl(b = WX_BBOX, days = 3) {
  const { lats, lons } = gridPoints(b);
  return `${OM}?latitude=${lats.join(",")}&longitude=${lons.join(",")}&hourly=cloud_cover&forecast_days=${days}&timezone=GMT&timeformat=unixtime`;
}

type OmHourly = { time: number[] } & Record<string, (number | null)[]>;

/** Parse Open-Meteo's multi-location response (an array, one entry per requested point, same order). */
export function parseGrid(json: unknown, b = WX_BBOX): WxGrid {
  const arr = (Array.isArray(json) ? json : [json]) as { hourly: OmHourly }[];
  const { nx, ny } = gridPoints(b);
  if (arr.length !== nx * ny) throw new Error(`expected ${nx * ny} forecast points, got ${arr.length}`);
  const times = arr[0].hourly.time.map((s) => s * 1000);
  const cloud = times.map((_, h) => {
    const g = new Float32Array(nx * ny);
    arr.forEach((p, k) => { g[k] = p.hourly.cloud_cover[h] ?? NaN; });
    return g;
  });
  return { source: "live", west: b.west, south: b.south, step: b.step, nx, ny, times, cloud, fetched: Date.now() };
}

const POINT_VARS = ["cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "relative_humidity_2m", "temperature_2m",
  "dew_point_2m", "wind_speed_10m", "wind_gusts_10m", "visibility", "wind_speed_250hPa"];

export function pointUrls(lat: number, lon: number, days = 3) {
  const q = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&forecast_days=${days}&timezone=GMT&timeformat=unixtime`;
  return { forecast: `${OM}?${q}&hourly=${POINT_VARS.join(",")}&wind_speed_unit=ms`, air: `${OM_AQ}?${q}&hourly=aerosol_optical_depth` };
}

export function parsePoint(fc: { hourly: OmHourly }, aq: { hourly: OmHourly } | null): WxPoint {
  const h = fc.hourly;
  const n = (k: string) => h[k].map((v) => (v === null ? NaN : v));
  const times = h.time.map((s) => s * 1000);
  const aodBy = new Map<number, number | null>();
  if (aq) aq.hourly.time.forEach((t, i) => aodBy.set(t * 1000, aq.hourly.aerosol_optical_depth[i]));
  return {
    source: "live", times,
    cloud: n("cloud_cover"), low: n("cloud_cover_low"), mid: n("cloud_cover_mid"), high: n("cloud_cover_high"),
    rh: n("relative_humidity_2m"), temp: n("temperature_2m"), dew: n("dew_point_2m"),
    wind: n("wind_speed_10m"), gust: n("wind_gusts_10m"), jet: n("wind_speed_250hPa"), visibility: n("visibility"),
    aod: times.map((t) => aodBy.get(t) ?? null),
  };
}

// ---------------------------------------------------------------- simulated weather (demo, not a forecast)

const hourStart = (ms: number) => Math.floor(ms / 3600000) * 3600000;

/** Deterministic synthetic cloud cover (%): two drifting frontal bands plus patchy convection-like cells. */
export function simCloud(lat: number, lon: number, t: number) {
  const hrs = t / 3600000;
  const band1 = Math.sin((lon * 1.7 + lat * 0.6) * 2.2 - hrs * 0.11);
  const band2 = Math.sin((lat * 2.3 - lon * 0.9) * 1.6 + hrs * 0.07 + 1.3);
  const cells = Math.sin(lat * 9.1 + hrs * 0.3) * Math.sin(lon * 8.3 - hrs * 0.23);
  const v = 0.45 + 0.35 * band1 * band2 + 0.25 * cells - 0.15 * Math.cos((hrs / 24) * 2 * Math.PI); // afternoon build-up
  return Math.round(Math.min(1, Math.max(0, v)) * 100);
}

export function simGrid(start: number, hours = 72, b = WX_BBOX): WxGrid {
  const { nx, ny, lats, lons } = gridPoints(b);
  const t0 = hourStart(start);
  const times = Array.from({ length: hours }, (_, h) => t0 + h * 3600000);
  const cloud = times.map((t) => Float32Array.from(lats.map((la, k) => simCloud(la, lons[k], t))));
  return { source: "sim", west: b.west, south: b.south, step: b.step, nx, ny, times, cloud, fetched: Date.now() };
}

export function simPoint(lat: number, lon: number, start: number, hours = 72): WxPoint {
  const t0 = hourStart(start);
  const times = Array.from({ length: hours }, (_, h) => t0 + h * 3600000);
  const f = (a: number, p: number) => times.map((t) => a * Math.sin(t / 3600000 / p + lat + lon));
  const cloud = times.map((t) => simCloud(lat, lon, t));
  const diurnal = times.map((t) => Math.cos(((t / 3600000 - 20) / 24) * 2 * Math.PI)); // warmest ~15:00 local
  const temp = diurnal.map((d) => 22 + 6 * d);
  const dew = diurnal.map((d, i) => 17 + 2 * d + f(1.5, 9)[i]);
  return {
    source: "sim", times, cloud,
    low: cloud.map((c) => Math.round(c * 0.4)), mid: cloud.map((c) => Math.round(c * 0.3)), high: cloud.map((c) => Math.round(c * 0.5)),
    temp, dew, rh: temp.map((T, i) => Math.min(100, Math.round(100 * Math.exp((17.62 * dew[i]) / (243.12 + dew[i]) - (17.62 * T) / (243.12 + T))))),
    wind: f(2, 7).map((v) => 3 + v), gust: f(3, 7).map((v) => 5 + v), jet: f(15, 30).map((v) => 30 + v),
    visibility: times.map(() => 24000), aod: f(0.05, 40).map((v) => +(0.12 + v).toFixed(2)),
  };
}

// ---------------------------------------------------------------- derived observing indices

/** Bilinear cloud cover (%) from the grid at a point and hour index. */
export function cloudAt(g: WxGrid, h: number, lat: number, lon: number) {
  const x = Math.min(g.nx - 1.000001, Math.max(0, (lon - g.west) / g.step));
  const y = Math.min(g.ny - 1.000001, Math.max(0, (lat - g.south) / g.step));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const c = g.cloud[Math.min(g.cloud.length - 1, Math.max(0, h))];
  const v = (ii: number, jj: number) => c[jj * g.nx + ii];
  return (v(i, j) * (1 - fx) + v(i + 1, j) * fx) * (1 - fy) + (v(i, j + 1) * (1 - fx) + v(i + 1, j + 1) * fx) * fy;
}

export const hourIndex = (times: number[], t: number) => {
  let best = 0;
  for (let k = 1; k < times.length; k++) if (Math.abs(times[k] - t) < Math.abs(times[best] - t)) best = k;
  return best;
};

/** Seeing proxy, 1 (poor) to 5 (excellent): jet-stream wind at 250 hPa, one step worse in gusty surface wind. */
export function seeingProxy(jetMs: number, gustMs: number) {
  if (!Number.isFinite(jetMs)) return NaN;
  const s = jetMs <= 10 ? 5 : jetMs <= 20 ? 4 : jetMs <= 30 ? 3 : jetMs <= 45 ? 2 : 1;
  return Math.max(1, s - (gustMs > 8 ? 1 : 0));
}

/** Transparency proxy, 1 (poor) to 5 (excellent): aerosol optical depth, humidity haze and thin high cloud. */
export function transparencyProxy(aod: number | null, rh: number, highCloud: number, visibilityM: number) {
  let s = aod === null || !Number.isFinite(aod)
    ? (visibilityM >= 30000 ? 4 : visibilityM >= 15000 ? 3 : 2)
    : aod <= 0.05 ? 5 : aod <= 0.1 ? 4 : aod <= 0.2 ? 3 : aod <= 0.35 ? 2 : 1;
  if (rh > 85) s -= 1;
  if (highCloud > 30) s -= 1;
  return Math.max(1, s);
}

export function dewRisk(tempC: number, dewC: number): "high" | "moderate" | "low" {
  const spread = tempC - dewC;
  return spread <= 2 ? "high" : spread <= 4 ? "moderate" : "low";
}

/** Share of a dark sky left usable (0-1) given Sun and Moon: 1 when astronomically dark and moonless. */
export function darknessFactor(sunAlt: number, moonAlt: number, moonIllum: number) {
  if (sunAlt > -0.83) return 0;
  if (sunAlt > -12) return 0.15;
  if (sunAlt > -18) return 0.5;
  return moonAlt > 0 ? 1 - 0.7 * moonIllum : 1;
}

/** Hourly "go" score 0-100: clear sky x usable darkness. */
export const goScore = (cloudPct: number, darkness: number) => Math.round(Math.max(0, 1 - cloudPct / 100) * darkness * 100);
