// Loads the real data package from web/public/dark-sky/data for tests (no network, no DOM).
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { decodeLin16, decodeLog16 } from "../data/load";
import type { EngineData, Lin16Meta, Log16Meta } from "../engine/types";
import type { DataPackage } from "../state/model";
import type { LandParcel, McdaData } from "../engine/mcda";

const DIR = fileURLToPath(new URL("../../public/dark-sky/data/", import.meta.url));
// Same unpacking as data/load.ts unpackU16 (gunzip + per-row cumulative sum), done synchronously for tests.
const u16 = (f: string, nx: number) => {
  const b = gunzipSync(readFileSync(DIR + f));
  const u = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  for (let i = 0; i < u.length; i += nx) for (let x = 1; x < nx; x++) u[i + x] = u[i + x] + u[i + x - 1];
  return u;
};

export const engine: EngineData = JSON.parse(readFileSync(DIR + "engine.json", "utf8"));

function log16(m: Log16Meta) {
  const all = decodeLog16(u16(m.file, m.shape[1]), m.lo, m.hi);
  const n = m.shape[0] * m.shape[1];
  return Array.from({ length: m.count }, (_, i) => all.subarray(i * n, (i + 1) * n));
}
function lin16(m: Lin16Meta) {
  const c = u16(m.file, m.shape[1]);
  const n = m.shape[0] * m.shape[1];
  return m.layers.map((l, i) => decodeLin16(c.subarray(i * n, (i + 1) * n), l.lo, l.hi));
}

export function dataPackage(): DataPackage {
  return {
    e: engine,
    base15: log16(engine.files.baseline_a15)[0],
    basis: log16(engine.files.basis_a30),
    growth30: lin16(engine.files.growth_a30)[0],
    fixCat15: lin16(engine.files.fixtures_cat_a15),
    county15: (() => { const b = readFileSync(DIR + engine.files.county_a15.file); return new Int8Array(b.buffer, b.byteOffset, b.byteLength); })(),
  };
}

export const landParcels = (): LandParcel[] | null =>
  engine.land ? JSON.parse(readFileSync(DIR + engine.land.parcels_file, "utf8")) : null;

export function mcdaData(): McdaData {
  const layers = lin16(engine.files.mcda_b);
  const names = engine.files.mcda_b.names ?? [];
  const b = readFileSync(DIR + engine.files.mcda_b_county.file);
  return {
    grid: engine.grids.b,
    raw: Object.fromEntries(names.map((n, i) => [n, layers[i]])),
    county: new Int8Array(b.buffer, b.byteOffset, b.byteLength),
    countyFips: engine.files.mcda_b_county.values,
  };
}
