// Client-side basis-layer combiner (PRD 0A.2): scenario luminance = alpha * sum_c sum_k S_ck * layer_ck.
import type { EngineData, GridMeta } from "./types";
import { TERMS, type ComponentResult } from "./scenario";

export function combine(e: EngineData, basis: Float32Array[], results: ComponentResult[], which: "flux" | "baseFlux") {
  const n = basis[0].length;
  const out = new Float32Array(n);
  const a = e.anchor.alpha;
  for (const r of results) {
    for (const t of TERMS) {
      const w = a * r[which][t];
      if (w === 0) continue;
      const layer = basis[r.comp.layers[t]];
      for (let i = 0; i < n; i++) out[i] += w * layer[i];
    }
  }
  return out;
}

export function applyGrowth(field: Float32Array, growth: Float32Array, years: number) {
  const out = new Float32Array(field.length);
  const k = years / 10;
  for (let i = 0; i < field.length; i++) out[i] = field[i] * growth[i] ** k;
  return out;
}

/** Bilinear sample of a cell-centered grid at a lon/lat. */
export function sampleGrid(g: GridMeta, data: ArrayLike<number>, lon: number, lat: number) {
  const fx = (lon - g.west) / g.res_deg - 0.5;
  const fy = (g.north - lat) / g.res_deg - 0.5;
  const x0 = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(g.ny - 2, Math.floor(fy)));
  const tx = Math.min(1, Math.max(0, fx - x0));
  const ty = Math.min(1, Math.max(0, fy - y0));
  const v = (x: number, y: number) => data[y * g.nx + x];
  return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
}

/** Upsample a 30" window field to the 15" grid (factor 2, bilinear on cell centers). */
export function upsample2(src: Float32Array, g30: GridMeta, g15: GridMeta) {
  const out = new Float32Array(g15.nx * g15.ny);
  for (let y = 0; y < g15.ny; y++) {
    const lat = g15.north - (y + 0.5) * g15.res_deg;
    for (let x = 0; x < g15.nx; x++) {
      const lon = g15.west + (x + 0.5) * g15.res_deg;
      out[y * g15.nx + x] = sampleGrid(g30, src, lon, lat);
    }
  }
  return out;
}

export interface SkyFields {
  baseMag15: Float32Array;   // today's zenith magnitude, 15"
  scnMag15: Float32Array;    // scenario (optionally grown) magnitude, 15"
  deltaMag15: Float32Array;  // scenario - baseline (positive = darker)
  relChange15: Float32Array; // scenario/baseline artificial luminance - 1 (any mode)
}

/**
 * V mode: magnitudes use the 15" baseline plus the 30" scenario/baseline ratio.
 * Other modes (scotopic, bands): only the relative change is meaningful; magnitudes stay V.
 */
export function skyFields(e: EngineData, base15: Float32Array, scn30: Float32Array, bas30: Float32Array, growth30: Float32Array | null,
  years: number, vScn30?: Float32Array, vBas30?: Float32Array, lateBas30?: Float32Array | null): SkyFields {
  const g15 = e.grids.a15, g30 = e.grids.a30;
  const Ln = e.physics.L_nat;
  const n30 = scn30.length;
  const ratio30 = new Float32Array(n30);
  const vRatio30 = new Float32Array(n30);
  const baseScale30 = new Float32Array(n30);
  for (let i = 0; i < n30; i++) {
    const gr = growth30 ? growth30[i] ** (years / 10) : 1;
    ratio30[i] = bas30[i] > 0 ? (scn30[i] * gr) / bas30[i] : 1;
    const vs = vScn30 ?? scn30, vb = vBas30 ?? bas30;
    vRatio30[i] = vb[i] > 0 ? (vs[i] * gr) / vb[i] : 1;
    baseScale30[i] = lateBas30 && lateBas30[i] > 0 ? vb[i] / lateBas30[i] : 1;
  }
  const r15 = upsample2(ratio30, g30, g15);
  const v15 = upsample2(vRatio30, g30, g15);
  const b15 = lateBas30 ? upsample2(baseScale30, g30, g15) : null;
  const n = base15.length;
  const baseMag = new Float32Array(n), scnMag = new Float32Array(n), dMag = new Float32Array(n), rel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const L = base15[i] * (b15 ? b15[i] : 1);
    baseMag[i] = 12.6 - 2.5 * Math.log10(L + Ln);
    scnMag[i] = 12.6 - 2.5 * Math.log10(L * v15[i] + Ln);
    dMag[i] = scnMag[i] - baseMag[i];
    rel[i] = r15[i] - 1;
  }
  return { baseMag15: baseMag, scnMag15: scnMag, deltaMag15: dMag, relChange15: rel };
}
