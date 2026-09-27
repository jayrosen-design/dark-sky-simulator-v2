// Module B site selection (PRD 3 Module B, seed 6.6): normalize open-data criteria, weighted linear
// combination with editable weights, cluster the best cells into sites (>= 4 contiguous cells), and
// always score RHO and CAV as reference rows (B-06).
import type { EngineData, GridMeta } from "./types";

export const CRITERIA = ["sky", "sprawl", "clarity", "urban", "land", "elevation", "access", "land_cost"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Weights = Record<Criterion, number>;

export interface McdaData {
  grid: GridMeta;
  // sky, sprawl, clarity, urban, land, elevation, horizon, access, mag_2034, plus parcel layers from pipeline/land.py
  raw: Record<string, Float32Array>;
  county: Int8Array;
  countyFips: string[];
}

const clip01 = (x: number) => Math.min(1, Math.max(0, x));

export function defaultWeights(e: EngineData): Weights {
  const w = e.seed.mcda.weights;
  // A criterion missing from an older data package defaults to weight 0 instead of breaking the panel.
  return Object.fromEntries(CRITERIA.map((k) => [k, w[k]?.value ?? 0])) as Weights;
}

/** Normalized 0..1 score for each criterion at cell i (NaN for invalid cells). */
export function normalizeAll(e: EngineData, d: McdaData): Record<Criterion, Float32Array> {
  const A = e.seed.mcda.anchors as Record<string, Record<string, number>>;
  const n = d.raw.sky.length;
  const out = Object.fromEntries(CRITERIA.map((k) => [k, new Float32Array(n)])) as Record<Criterion, Float32Array>;
  let emin = Infinity, emax = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = d.raw.elevation[i];
    if (Number.isFinite(v)) { emin = Math.min(emin, v); emax = Math.max(emax, v); }
  }
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(d.raw.sky[i])) {
      for (const k of CRITERIA) out[k][i] = NaN;
      continue;
    }
    out.sky[i] = clip01((d.raw.sky[i] - A.sky_mag.worst) / (A.sky_mag.best - A.sky_mag.worst));
    out.sprawl[i] = 1 - clip01((d.raw.sprawl[i] - A.sprawl_growth_pct.best) / (A.sprawl_growth_pct.worst - A.sprawl_growth_pct.best));
    out.clarity[i] = clip01((d.raw.clarity[i] - A.photometric_nights.worst) / (A.photometric_nights.best - A.photometric_nights.worst));
    out.urban[i] = 1 / (1 + Math.exp(-(d.raw.urban[i] - A.urban_distance_km.midpoint) / A.urban_distance_km.scale));
    // raw.land is already the area-weighted PRD 6.6 class score (public 1.0, agricultural 0.6, residential 0.1).
    out.land[i] = clip01(d.raw.land[i]);
    out.land_cost[i] = landCostScore(A.land_cost_usd_acre, d, i);
    const elev = emax > emin ? (d.raw.elevation[i] - emin) / (emax - emin) : 0;
    const hor = 1 - clip01((d.raw.horizon[i] - A.horizon_deg.best) / (A.horizon_deg.worst - A.horizon_deg.best));
    out.elevation[i] = 0.5 * clip01(elev) + 0.5 * hor;
    out.access[i] = clip01((A.access_km.zero - d.raw.access[i]) / (A.access_km.zero - A.access_km.full));
  }
  return out;
}

export function wlc(norm: Record<Criterion, Float32Array>, w: Weights) {
  const total = CRITERIA.reduce((a, k) => a + w[k], 0) || 1;
  const n = norm.sky.length;
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const k of CRITERIA) v += norm[k][i] * (w[k] / total);
    s[i] = v;
  }
  return s;
}

export interface ScoreLine { criterion: Criterion | "horizon"; raw: number; norm: number; weight: number; contrib: number }
const rawOf = (d: McdaData, k: Criterion, i: number) => (k === "land_cost" ? d.raw.sale_usd_acre?.[i] ?? NaN : d.raw[k][i]);

/** Public land scores 1 (transfer or lease); private land scores log-linearly on the nearby market $/acre. */
function landCostScore(a: Record<string, number>, d: McdaData, i: number) {
  const parcel = d.raw.parcel_acres?.[i] ?? 0;
  const pub = parcel > 0 ? Math.min(1, (d.raw.public_acres?.[i] ?? 0) / parcel) : 0;
  const usd = d.raw.sale_usd_acre?.[i];
  const priv = usd && Number.isFinite(usd)
    ? clip01((Math.log(a.worst) - Math.log(usd)) / (Math.log(a.worst) - Math.log(a.best))) : 0.5;
  return pub + (1 - pub) * priv;
}

export interface Candidate {
  rank: number;
  cells: number;
  score: number;      // mean score of the site's cells
  best: number;       // index of best cell
  lon: number;
  lat: number;
  county: string;
  mag2024: number;
  mag2034: number;
  scorecard: ScoreLine[];
  cellList: number[];
}

export function cellLonLat(g: GridMeta, i: number): [number, number] {
  const x = i % g.nx, y = Math.floor(i / g.nx);
  return [g.west + (x + 0.5) * g.res_deg, g.north - (y + 0.5) * g.res_deg];
}

export function scorecard(d: McdaData, norm: Record<Criterion, Float32Array>, w: Weights, i: number): ScoreLine[] {
  const total = CRITERIA.reduce((a, k) => a + w[k], 0) || 1;
  return CRITERIA.map((k) => ({ criterion: k, raw: rawOf(d, k, i), norm: norm[k][i], weight: w[k] / total, contrib: norm[k][i] * (w[k] / total) }));
}

/** B-01: cluster the top cells into sites of >= minCells contiguous cells, relaxing the cut until `top` sites exist. */
export function rankSites(e: EngineData, d: McdaData, norm: Record<Criterion, Float32Array>, score: Float32Array, w: Weights): Candidate[] {
  const g = d.grid;
  const minCells = e.seed.mcda.site_min_cells.value;
  const top = e.seed.mcda.top_sites.value;
  const valid: number[] = [];
  for (let i = 0; i < score.length; i++) if (Number.isFinite(score[i])) valid.push(i);
  const sorted = valid.sort((a, b) => score[b] - score[a]);
  let sites: number[][] = [];
  for (const frac of [0.01, 0.02, 0.04, 0.08, 0.16]) {
    const keep = new Uint8Array(score.length);
    const cut = Math.max(minCells, Math.floor(sorted.length * frac));
    for (let j = 0; j < cut; j++) keep[sorted[j]] = 1;
    const seen = new Uint8Array(score.length);
    sites = [];
    for (let j = 0; j < cut; j++) {
      const s = sorted[j];
      if (seen[s]) continue;
      const comp: number[] = [];
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        const x = c % g.nx, y = Math.floor(c / g.nx);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.nx || ny >= g.ny) continue;
          const k = ny * g.nx + nx;
          if (keep[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      if (comp.length >= minCells) sites.push(comp);
    }
    if (sites.length >= top) break;
  }
  const scored = sites.map((cells) => {
    const mean = cells.reduce((a, c) => a + score[c], 0) / cells.length;
    const best = cells.reduce((a, c) => (score[c] > score[a] ? c : a), cells[0]);
    return { cells, mean, best };
  }).sort((a, b) => b.mean - a.mean).slice(0, top);
  return scored.map((s, k) => {
    const [lon, lat] = cellLonLat(g, s.best);
    return {
      rank: k + 1, cells: s.cells.length, score: s.mean, best: s.best, lon, lat,
      county: d.countyFips[d.county[s.best]] ?? "",
      mag2024: d.raw.sky[s.best], mag2034: d.raw.mag_2034[s.best],
      scorecard: scorecard(d, norm, w, s.best), cellList: s.cells,
    };
  });
}

export function cellAt(g: GridMeta, lon: number, lat: number) {
  const x = Math.floor((lon - g.west) / g.res_deg);
  const y = Math.floor((g.north - lat) / g.res_deg);
  if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) return -1;
  return y * g.nx + x;
}

/** Percentile rank (0-100) of a score among valid cells, for the reference rows. */
export function percentile(score: Float32Array, v: number) {
  let below = 0, n = 0;
  for (let i = 0; i < score.length; i++) {
    if (!Number.isFinite(score[i])) continue;
    n++;
    if (score[i] < v) below++;
  }
  return n ? (100 * below) / n : 0;
}

// ------------------------------------------------------------------ land and facility estimates

export interface LandParcel {
  parcel_id: string; county: string; acres: number; cat: number; owner: string | null; dor_uc: string;
  just_value: number; land_value: number; improvement_value: number;
}

export interface LandEstimate {
  targetAcres: number;
  parcelAcres: number;          // parcels >= 5 acres in the site's cells
  publicShare: number;          // of that area
  publicCat: number;            // dominant public owner category (0 = none)
  marketUsdAcre: number | null; // median of nearby qualified vacant sales
  marketP25: number | null;
  marketP75: number | null;
  comps: number;                // 0 = county median fallback
  assessedUsdAcre: number | null;
  saleToJustValue: number | null;
  marketCost: number | null;
  marketCostLow: number | null;
  marketCostHigh: number | null;
  assessedCost: number | null;
  largest: LandParcel | null;
  largestFits: boolean;
}

/** Land cost for `targetAcres` at a site (cells = the site's grid cells; best = its best cell). */
export function landEstimate(e: EngineData, d: McdaData, cells: number[], best: number, targetAcres: number,
  parcels: LandParcel[] | null): LandEstimate {
  const r = d.raw;
  let parcelAcres = 0, publicAcres = 0, privVal = 0, privAcres = 0, largestAcres = 0, largestRef = -1;
  const catAcres = new Map<number, number>();
  for (const i of cells) {
    const pa = r.parcel_acres?.[i] ?? 0;
    const pu = r.public_acres?.[i] ?? 0;
    if (!(pa > 0)) continue;
    parcelAcres += pa;
    publicAcres += pu;
    const cat = Math.round(r.public_cat?.[i] ?? 0);
    if (cat > 0) catAcres.set(cat, (catAcres.get(cat) ?? 0) + pu);
    const av = r.assessed_usd_acre?.[i];
    if (av !== undefined && Number.isFinite(av) && pa - pu > 0) { privVal += av * (pa - pu); privAcres += pa - pu; }
    const la = r.largest_acres?.[i] ?? 0;
    if (la > largestAcres && (r.largest_ref?.[i] ?? -1) >= 0) { largestAcres = la; largestRef = Math.round(r.largest_ref[i]); }
  }
  const fips = d.countyFips[d.county[best]] ?? "";
  const county = e.land?.county[fips];
  const num = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : null);
  const market = num(r.sale_usd_acre?.[best]);
  const p25 = num(r.sale_p25?.[best]);
  const p75 = num(r.sale_p75?.[best]);
  const assessed = privAcres > 0 ? privVal / privAcres : null;
  const ratio = county?.sale_to_just_value ?? null;
  const publicCat = [...catAcres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const largest = parcels && largestRef >= 0 ? parcels[largestRef] ?? null : null;
  return {
    // Public and total acres are separately quantized layers, so clamp the ratio.
    targetAcres, parcelAcres, publicShare: parcelAcres > 0 ? Math.min(1, publicAcres / parcelAcres) : 0, publicCat,
    marketUsdAcre: market, marketP25: p25, marketP75: p75, comps: Math.round(r.sale_n?.[best] ?? 0),
    assessedUsdAcre: assessed, saleToJustValue: ratio,
    marketCost: market !== null ? market * targetAcres : null,
    marketCostLow: p25 !== null ? p25 * targetAcres : null,
    marketCostHigh: p75 !== null ? p75 * targetAcres : null,
    assessedCost: assessed !== null ? assessed * targetAcres * (ratio ?? 1) : null,
    largest, largestFits: (largest?.acres ?? 0) >= targetAcres,
  };
}
