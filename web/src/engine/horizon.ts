// Light domes from the mapped light (all-sky view): how artificial sky glow is spread over the sky at one place.
// Every lit cell of an upward-radiance grid (VIIRS 2024, times the scenario's change in that cell's sky) is treated
// as a source; a single-scattering estimate in an exponential atmosphere of scale height H gives its brightness at
// the zenith and toward it at altitude h. For a source at distance d (km):
//   zenith        B_z(d)        = ∫ e^(-z/H) / (d² + z²) dz            ≈ 1 / (d²/H + 2d/π)
//   toward it     B_h(d, h, Δφ) ≈ π e^(-d cosΔφ tan h / H) / (d √(sin²Δφ + cos²Δφ tan²h))   (|Δφ| < 90°)
// (the line of sight passes over the source at height d tan h, missing it sideways by d sin Δφ), both times e^(-d/L)
// for extinction. So a near town makes a tall, wide dome (height ≈ atan(H/d)) and a far city a low, narrow one,
// and a dome's width at altitude h is about h. The table holds Σ E·B_h / Σ E·B_z: horizon glow relative to the zenith
// artificial glow at the same place, so the modeled zenith value is never changed. A single-scattering sketch to
// place and size the domes, not a calibrated all-sky model (ADR 0015).
import type { GridMeta } from "./types";

const RAD = Math.PI / 180;
const KM_DEG = 111.32;
/** Effective scattering scale height (km): between the haze layer (~1.5 km) and the molecular atmosphere (~8 km). */
export const H_KM = 3;
/** Extinction length (km) shared by both paths; with B_z ~ d⁻² it gives Walker's d^-2.5 over 10-50 km. */
export const L_KM = 40;
/** Lowest altitude the line-of-sight term is evaluated at (keeps 1/tan h finite on the horizon). */
const H_MIN = 1.5 * RAD;
/** Sources closer than this are treated as at this distance (a cell is 0.4 km). */
const D_MIN = 0.5;

export interface DomeTable { nAz: number; nAlt: number; rel: Float32Array } // rel[k * nAz + j]
/** Table size used by the all-sky view (its shader texture has the same shape). */
export const DOME_NAZ = 120, DOME_NALT = 16;
/** Column j covers azimuth (j + 0.5)·360/nAz (degrees from north); row k altitude 90·((k + 0.5)/nAlt)². */
export const azOf = (j: number, nAz: number) => ((j + 0.5) * 360) / nAz;
export const altOf = (k: number, nAlt: number) => 90 * ((k + 0.5) / nAlt) ** 2;

export interface PointSource { lat: number; lon: number; e: number }

/**
 * Cities outside the emission grid (engine.json light_domes beyond its edges, e.g. Jacksonville, Tampa) as point
 * sources, at the upward light per resident measured within 10 km of the first listed town inside the grid.
 */
export function farSources(towns: { name: string; lat: number; lon: number; population: number }[], grid: GridMeta,
  emission: ArrayLike<number>): PointSource[] {
  const inside = (t: { lat: number; lon: number }) => t.lon > grid.west && t.lon < grid.east && t.lat > grid.south && t.lat < grid.north;
  const ref = towns.find(inside);
  if (!ref) return [];
  const cosLat = Math.cos(ref.lat * RAD);
  let sum = 0;
  for (let y = 0; y < grid.ny; y++) {
    const lat = grid.north - (y + 0.5) * grid.res_deg;
    for (let x = 0; x < grid.nx; x++) {
      const lon = grid.west + (x + 0.5) * grid.res_deg;
      if (Math.hypot((lon - ref.lon) * cosLat * KM_DEG, (lat - ref.lat) * KM_DEG) < 10) sum += emission[y * grid.nx + x] || 0;
    }
  }
  const perResident = sum / ref.population;
  return towns.filter((t) => !inside(t)).map((t) => ({ lat: t.lat, lon: t.lon, e: t.population * perResident }));
}

const bz = (d: number) => 1 / ((d * d) / H_KM + (2 * d) / Math.PI);

/**
 * Dome table at (lat, lon) from a cell-centered emission grid (any linear unit) plus optional point sources outside it.
 * Sources are first gathered into 1° × log-distance bins, so the cost does not grow with the grid size.
 */
export function domeTable(grid: GridMeta, emission: ArrayLike<number>, lat: number, lon: number,
  points: PointSource[] = [], nAz = DOME_NAZ, nAlt = DOME_NALT): DomeTable {
  const NB_AZ = 360, NB_D = 40, D0 = D_MIN, D1 = 400, lr = Math.log(D1 / D0);
  const wE = new Float64Array(NB_AZ * NB_D), wD = new Float64Array(NB_AZ * NB_D);
  const cosLat = Math.cos(lat * RAD);
  let zen = 0;
  const add = (e: number, slat: number, slon: number) => {
    if (!(e > 0)) return;
    const dx = (slon - lon) * cosLat * KM_DEG, dy = (slat - lat) * KM_DEG;
    const d = Math.max(D0, Math.hypot(dx, dy));
    if (d >= D1) return;
    const w = e * Math.exp(-d / L_KM);
    zen += w * bz(d);
    const ia = Math.floor((((Math.atan2(dx, dy) / RAD) + 360) % 360) * NB_AZ / 360) % NB_AZ;
    const id = Math.min(NB_D - 1, Math.floor((Math.log(d / D0) / lr) * NB_D));
    wE[ia * NB_D + id] += w;
    wD[ia * NB_D + id] += w * d;
  };
  for (let y = 0; y < grid.ny; y++) {
    const slat = grid.north - (y + 0.5) * grid.res_deg;
    for (let x = 0; x < grid.nx; x++) {
      const e = emission[y * grid.nx + x];
      if (e > 0) add(e, slat, grid.west + (x + 0.5) * grid.res_deg);
    }
  }
  for (const p of points) add(p.e, p.lat, p.lon);

  const rel = new Float32Array(nAz * nAlt);
  if (!(zen > 0)) return { nAz, nAlt, rel };
  // Per azimuth bin, the occupied distance bins as (π w / d, d / H).
  const amp: Float64Array[] = [], dh: Float64Array[] = [];
  for (let i = 0; i < NB_AZ; i++) {
    const a: number[] = [], b: number[] = [];
    for (let id = 0; id < NB_D; id++) {
      const w = wE[i * NB_D + id];
      if (w > 0) { const d = wD[i * NB_D + id] / w; a.push((Math.PI * w) / d); b.push(d / H_KM); }
    }
    amp.push(Float64Array.from(a)); dh.push(Float64Array.from(b));
  }
  for (let k = 0; k < nAlt; k++) {
    const t = Math.tan(Math.max(H_MIN, altOf(k, nAlt) * RAD));
    for (let j = 0; j < nAz; j++) {
      const az = azOf(j, nAz);
      let s = 0;
      for (let i = 0; i < NB_AZ; i++) {
        const a = amp[i];
        if (!a.length) continue;
        const dphi = ((((i + 0.5 - az) % 360) + 540) % 360 - 180) * RAD;
        const c = Math.cos(dphi);
        if (c <= 0) continue;
        const sn = Math.sin(dphi), ct = c * t, inv = 1 / Math.sqrt(sn * sn + ct * ct), b = dh[i];
        let sub = 0;
        for (let q = 0; q < a.length; q++) sub += a[q] * Math.exp(-b[q] * ct);
        s += sub * inv;
      }
      rel[k * nAz + j] = s / zen;
    }
  }
  return { nAz, nAlt, rel };
}

/** Bilinear lookup in a dome table (azimuth wraps, altitude clamps), matching the shader's texture sampling. */
export function domeAt(t: DomeTable, alt: number, az: number) {
  const u = ((((az % 360) + 360) % 360) / 360) * t.nAz - 0.5;
  const v = Math.sqrt(Math.min(90, Math.max(0, alt)) / 90) * t.nAlt - 0.5;
  const j0 = Math.floor(u), k0 = Math.max(0, Math.min(t.nAlt - 1, Math.floor(v)));
  const k1 = Math.min(t.nAlt - 1, k0 + 1), fu = u - j0, fv = Math.max(0, Math.min(1, v - k0));
  const col = (j: number) => ((j % t.nAz) + t.nAz) % t.nAz;
  const at = (k: number, j: number) => t.rel[k * t.nAz + col(j)];
  return (at(k0, j0) * (1 - fu) + at(k0, j0 + 1) * fu) * (1 - fv) + (at(k1, j0) * (1 - fu) + at(k1, j0 + 1) * fu) * fv;
}
