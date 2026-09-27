// Luminance <-> magnitude and Bortle banding (PRD 2.1). Magnitude first; Bortle is a label on it (A-07).
import type { EngineData } from "./types";

export const MAG_ZERO_POINT = 12.6;

export const luminanceFromMag = (mag: number) => 10 ** ((MAG_ZERO_POINT - mag) / 2.5);
export const magFromLuminance = (lum: number) => MAG_ZERO_POINT - 2.5 * Math.log10(lum);

export function totalMag(artificial: number, naturalLum: number) {
  return magFromLuminance(Math.max(artificial, 0) + naturalLum);
}

export type BortleTable = { bortle: number; min: number | null; label: string }[];

export function bortleTable(e: EngineData): BortleTable {
  return e.seed.bortle.map((r) => ({ bortle: Number(r.bortle), min: r.min_mag ? Number(r.min_mag) : null, label: r.label }));
}

export function bortleClass(mag: number, table: BortleTable): number {
  for (const row of table) if (row.min === null || mag >= row.min) return row.bortle;
  return table[table.length - 1].bortle;
}

/** "8-9" for the merged bottom class of the Clear Dark Sky table. */
export function bortleLabel(b: number, table: BortleTable) {
  return b === table[table.length - 1].bortle ? `${b}-9` : `${b}`;
}

/** A-07: a Bortle class is never shown without its magnitude. */
export function formatSky(mag: number, table: BortleTable) {
  return `${mag.toFixed(2)} mag/arcsec² (Bortle ${bortleLabel(bortleClass(mag, table), table)})`;
}

/** Naked-eye limiting magnitude from zenith sky brightness (common SQM -> NELM approximation). */
export function nelmFromSqm(sqm: number) {
  return 7.93 - 5 * Math.log10(10 ** (4.316 - sqm / 5) + 1);
}
