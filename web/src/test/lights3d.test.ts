import { describe, expect, it } from "vitest";
import { buildLamps, lampLayers, type LightInputs, type SlotLook } from "../map/lights3d";
import { metersBetween, placeAlong, square } from "../shared/map/geo";
import type { EngineData, GridMeta } from "../engine/types";

const grid: GridMeta = { west: -82.4, south: 29.6, east: -82.39, north: 29.61, res_deg: 0.005, nx: 2, ny: 2, dx_km: 0.48, dy_km: 0.56 };
const look = (card = false, pct = 0): SlotLook => ({ base: { spd: "HPS", u: 2 }, card: card ? { spd: "LED2700", u: 0 } : null, pct });
const looks = { street: look(), commercial: look(), residential: look(), sports: look() };
const cell0 = [-82.3975, 29.6075] as const; // centre of cell 0 (north-west)
const base: LightInputs = {
  e: {} as EngineData, looks, selected: new Set(["12001"]), surveyed: null, venues: null, sportsOn: false,
  grid, cat: [Float32Array.from([4, 0, 0, 0]), Float32Array.from([0, 0, 0, 0]), Float32Array.from([0, 0, 0, 0]), Float32Array.from([0, 0, 0, 0])],
  catNames: ["street", "commercial", "residential", "sports"], county: Int8Array.from([0, 0, 0, 0]), countyValues: ["12001"],
  roads: [[[cell0[0] - 0.002, cell0[1]], [cell0[0] + 0.002, cell0[1]]]], focus: [cell0[0], cell0[1]], bbox: [-82.41, 29.59, -82.38, 29.62],
};

describe("3D light placement", () => {
  it("spaces lamps evenly along a road, half a spacing in from each end", () => {
    const a: [number, number] = [-82.4, 29.6], b: [number, number] = [-82.39, 29.6];
    const pts = placeAlong([[a, b]], 4);
    const L = metersBetween(a, b);
    expect(metersBetween(a, pts[0])).toBeCloseTo(L / 8, 0);
    expect(metersBetween(pts[0], pts[1])).toBeCloseTo(L / 4, 0);
    expect(placeAlong([], 3)).toEqual([]);
  });

  it("builds square footprints of the requested size", () => {
    const ring = square(-82.4, 29.6, 5).coordinates[0];
    expect(metersBetween(ring[0] as [number, number], ring[1] as [number, number])).toBeCloseTo(10, 1);
  });

  it("places a cell's modeled streetlights on its roads, minus the surveyed ones already mapped there", () => {
    expect(buildLamps(base).filter((l) => l.modeled)).toHaveLength(4);
    const surveyed = { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: { spd_class: "LED4000" }, geometry: { type: "Point" as const, coordinates: [cell0[0], cell0[1]] } }] };
    const lamps = buildLamps({ ...base, surveyed });
    expect(lamps.filter((l) => l.modeled)).toHaveLength(3);
    expect(lamps.find((l) => !l.modeled)?.spd).toBe("LED4000");
    expect(lamps.every((l) => Math.abs(l.lat - cell0[1]) < 1e-9 || !l.modeled)).toBe(true);
  });

  it("sets porch and business lights back from the road and keeps the nearest cells when the budget runs out", () => {
    const cat = [Float32Array.from([2, 2, 0, 0]), Float32Array.from([1, 0, 0, 0]), Float32Array.from([3, 0, 0, 0]), Float32Array.from([0, 0, 0, 0])];
    const cell1 = [-82.3925, 29.6075] as const; // east neighbour of cell 0
    const roads: [number, number][][] = [[[cell0[0] - 0.002, cell0[1]], [cell0[0] + 0.002, cell0[1]]], [[cell1[0] - 0.002, cell1[1]], [cell1[0] + 0.002, cell1[1]]]];
    const lamps = buildLamps({ ...base, cat, roads });
    const res = lamps.filter((l) => l.slot === "residential");
    expect(res).toHaveLength(3);
    for (const l of res) expect(Math.abs(metersBetween([l.lon, l.lat], [l.lon, cell0[1]]))).toBeGreaterThan(10);
    const near1 = buildLamps({ ...base, cat, roads, focus: [cell1[0], cell1[1]], maxLamps: 2 });
    expect(near1.every((l) => l.lon > -82.395)).toBe(true);
  });

  it("recolors the equipped share only in selected counties", () => {
    const all = buildLamps({ ...base, looks: { ...looks, street: look(true, 100) } });
    expect(all.every((l) => l.spd === "LED2700" && l.u === 0)).toBe(true);
    const none = buildLamps({ ...base, looks: { ...looks, street: look(true, 100) }, selected: new Set() });
    expect(none.every((l) => l.spd === "HPS")).toBe(true);
  });

  it("puts four towers on each sports field, dark when sports lighting is off, and drops lamps outside the box", () => {
    const venues = { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: { county: "12001", kind: "field" }, geometry: { type: "Point" as const, coordinates: [cell0[0], cell0[1]] } }] };
    const off = buildLamps({ ...base, venues, cat: null });
    expect(off.filter((l) => l.slot === "sports")).toHaveLength(4);
    expect(lampLayers(off).pools.features).toHaveLength(0);
    expect(lampLayers(buildLamps({ ...base, venues, cat: null, sportsOn: true })).pools.features).toHaveLength(4);
    expect(buildLamps({ ...base, venues, bbox: [0, 0, 1, 1] })).toHaveLength(0);
  });
});
