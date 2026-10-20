// The VIIRS step test for one pixel, the same math as ml/trends.py step_change, so the AI tab can show any clicked
// cell's series, its fitted line (plus step), and why it was or was not flagged.
import type { StepsMeta } from "./types";

export interface StepFit {
  lit: boolean;
  flagged: boolean;
  f: number;            // F statistic of the best step (0 when not lit)
  year: number;         // first year of the new level for the best split
  stepPct: number;      // size of that step relative to the line, %
  adjusted: number[];   // radiance with the region's shared movement removed (nW)
  fitted: number[];     // flagged: line + step; otherwise the line alone (nW)
}

/** Least squares for a few columns (normal equations; n = 13, so conditioning is not a concern). */
function lstsq(cols: number[][], y: number[]): { beta: number[]; rss: number } {
  const p = cols.length, n = y.length;
  const A = cols.map((ci) => cols.map((cj) => ci.reduce((s, v, k) => s + v * cj[k], 0)));
  const b = cols.map((c) => c.reduce((s, v, k) => s + v * y[k], 0));
  for (let i = 0; i < p; i++) {               // Gauss-Jordan
    const piv = A[i][i];
    for (let j = i; j < p; j++) A[i][j] /= piv;
    b[i] /= piv;
    for (let r = 0; r < p; r++) if (r !== i) { const f = A[r][i]; for (let j = i; j < p; j++) A[r][j] -= f * A[i][j]; b[r] -= f * b[i]; }
  }
  let rss = 0;
  for (let k = 0; k < n; k++) { const fit = cols.reduce((s, c, j) => s + c[k] * b[j], 0); rss += (y[k] - fit) ** 2; }
  return { beta: b, rss };
}

export function fitStep(series: ArrayLike<number>, years: number[], m: StepsMeta): StepFit {
  const n = years.length;
  const common = m.common_log ?? new Array(n).fill(0);
  const y = Array.from({ length: n }, (_, k) => Math.log(Math.max(series[k], m.floor_nw)) - common[k]);
  const mean = (a: number, b: number) => { let s = 0; for (let k = a; k < b; k++) s += series[k]; return s / (b - a); };
  const lit = Math.max(mean(0, 3), mean(n - 3, n)) > m.lit_nw;
  const one = new Array(n).fill(1), t = years.map((_, k) => k - (n - 1) / 2);
  const line = lstsq([one, t], y);
  const minSeg = m.first_year - years[0];
  let best = { f: -Infinity, k: minSeg, beta: [0, 0, 0] };
  for (let k = minSeg; k <= n - minSeg; k++) {
    const s = years.map((_, j) => (j >= k ? 1 : 0));
    const fit = lstsq([one, t, s], y);
    const f = (line.rss - fit.rss) / Math.max(fit.rss / (n - 3), 1e-12);
    if (f > best.f) best = { f, k, beta: fit.beta };
  }
  const stepPct = (Math.exp(best.beta[2]) - 1) * 100;
  const flagged = lit && best.f >= m.critical_f && Math.abs(stepPct) >= m.min_step_pct;
  const fitted = years.map((_, j) => Math.exp(flagged
    ? best.beta[0] + best.beta[1] * t[j] + (j >= best.k ? best.beta[2] : 0)
    : line.beta[0] + line.beta[1] * t[j]));
  return { lit, flagged, f: lit ? best.f : 0, year: years[best.k], stepPct, adjusted: y.map(Math.exp), fitted };
}

/** a15 cell index under a map point, or null outside the grid. */
export function cellAt(g: { west: number; east: number; south: number; north: number; nx: number; ny: number }, lon: number, lat: number) {
  const c = Math.floor(((lon - g.west) / (g.east - g.west)) * g.nx), r = Math.floor(((g.north - lat) / (g.north - g.south)) * g.ny);
  return c >= 0 && c < g.nx && r >= 0 && r < g.ny ? r * g.nx + c : null;
}
