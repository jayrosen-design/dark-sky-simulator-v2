// Test fixtures: the seed as built into the data package, and small synthetic inputs.
import { readFileSync } from "node:fs";
import type { Artwork, Cells, CipProject, Meta, RoadPiece, Seed } from "../types";

export const meta = JSON.parse(readFileSync(new URL("../../../public/public-art/data/meta.json", import.meta.url), "utf-8")) as Meta;
export const seed: Seed = meta.seed;
export const cpi = (JSON.parse(readFileSync(new URL("../../../public/public-art/data/cpi.json", import.meta.url), "utf-8")) as { monthly: [string, number][] }).monthly;

export const project = (id: string, fy: number, budget: number, extra: Partial<CipProject> = {}): CipProject => ({
  id, name: id, fy, budget_usd: budget, category: "building_new", public_use: true, funding: "general", restricted: false, visibility: "high", ...extra,
});

export const art = (id: string, extra: Partial<Artwork> = {}): Artwork => ({
  id, title: id, artist: null, year: 2020, status: "existing", type: "sculpture", material: "painted_steel", height: 4, width: 3, bearing: 180,
  lit: false, provenance: "municipal", scale: "medium", lon: -82.3250, lat: 29.6520, ...extra,
});

/** A 3 x 3 km grid of 100 m cells around downtown with uniform walking flow, and one east-west street through the middle. */
export function tinyWorld(aadt = 10000, ped = 200) {
  const nx = 30, ny = 30, kx = 96800, ky = 110574, west = -82.34, south = 29.64;
  const fill = (v: number) => Array(nx * ny).fill(v);
  const cells: Cells = {
    grid: { west, south, nx, ny, res_m: 100, kx, ky }, zone_codes: [], flags: {},
    cols: { ped: fill(ped), veh_ref: fill(0), ped_ref: fill(0), mix_commute: fill(34), mix_midday: fill(33), mix_night: fill(33), zone: fill(-1), flags: fill(1), pop: fill(0), walk_m: fill(100) },
  };
  const roads: RoadPiece[] = [{ cls: 2, name: "Main", mph: 30, aadt, fdot: true, coords: [[west, 29.6535], [west + 3000 / kx, 29.6535]] }];
  return { cells, roads, frame: { west, south, kx, ky } };
}
