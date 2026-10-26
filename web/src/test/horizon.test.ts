import { describe, expect, it } from "vitest";
import { altOf, azOf, domeAt, domeTable, farSources, H_KM } from "../engine/horizon";
import type { GridMeta } from "../engine/types";

// A 0.01° grid (~1 km) around an observer at 29.5 N, -82.5 W.
const grid: GridMeta = { west: -83.0, south: 29.0, east: -82.0, north: 30.0, res_deg: 0.01, nx: 100, ny: 100, dx_km: 0.97, dy_km: 1.11 };
const OBS = { lat: 29.5, lon: -82.5 };
const cellOf = (lat: number, lon: number) => Math.floor((grid.north - lat) / grid.res_deg) * grid.nx + Math.floor((lon - grid.west) / grid.res_deg);
/** A lit 3 × 3-cell town at a bearing and distance from the observer. */
function town(em: Float32Array, bearing: number, km: number, e = 100) {
  const lat = OBS.lat + (km * Math.cos((bearing * Math.PI) / 180)) / 111.32;
  const lon = OBS.lon + (km * Math.sin((bearing * Math.PI) / 180)) / (111.32 * Math.cos((OBS.lat * Math.PI) / 180));
  const c = cellOf(lat, lon);
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) em[c + dy * grid.nx + dx] += e / 9;
  return em;
}
const peakAz = (t: ReturnType<typeof domeTable>, alt: number) => {
  let best = 0, az = 0;
  for (let a = 0; a < 360; a += 1) { const v = domeAt(t, alt, a); if (v > best) { best = v; az = a; } }
  return az;
};
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("light domes from the mapped light", () => {
  it("puts the dome toward the town, brightest near the horizon", () => {
    const t = domeTable(grid, town(new Float32Array(grid.nx * grid.ny), 60, 20), OBS.lat, OBS.lon);
    expect(angDiff(peakAz(t, 5), 60)).toBeLessThan(4);
    expect(domeAt(t, 5, 60)).toBeGreaterThan(domeAt(t, 30, 60));
    expect(domeAt(t, 5, 60)).toBeGreaterThan(20 * domeAt(t, 5, 240));   // little glow from behind
  });

  it("makes a near town's dome taller and a far one's lower", () => {
    const near = domeTable(grid, town(new Float32Array(grid.nx * grid.ny), 0, 5), OBS.lat, OBS.lon);
    const far = domeTable(grid, town(new Float32Array(grid.nx * grid.ny), 0, 45), OBS.lat, OBS.lon);
    const tall = (t: ReturnType<typeof domeTable>) => domeAt(t, 25, 0) / domeAt(t, 3, 0);
    expect(tall(near)).toBeGreaterThan(5 * tall(far));
    // Dome height ≈ atan(H/d): at 45 km the glow at 3.8° is down to about e^-1 of its horizon value.
    const h = (Math.atan(H_KM / 45) * 180) / Math.PI;
    expect(domeAt(far, h, 0) / domeAt(far, 0, 0)).toBeLessThan(0.6);
  });

  it("is relative to the zenith glow: scaling all light changes nothing, dimming one town shrinks its dome", () => {
    const em = town(town(new Float32Array(grid.nx * grid.ny), 90, 15), 270, 15);
    const a = domeTable(grid, em, OBS.lat, OBS.lon);
    const b = domeTable(grid, em.map((v) => v * 7), OBS.lat, OBS.lon);
    expect(Array.from(b.rel)).toEqual(Array.from(a.rel).map((v) => expect.closeTo(v, 4)));
    const dimEast = town(town(new Float32Array(grid.nx * grid.ny), 90, 15, 30), 270, 15);
    const c = domeTable(grid, dimEast, OBS.lat, OBS.lon);
    expect(domeAt(c, 5, 90)).toBeLessThan(domeAt(a, 5, 90));
    expect(domeAt(c, 5, 270)).toBeGreaterThan(domeAt(a, 5, 270));   // the other town is now a larger share of the zenith
  });

  it("returns zeros when nothing is lit, and samples like the shader texture", () => {
    expect(Array.from(domeTable(grid, new Float32Array(grid.nx * grid.ny), OBS.lat, OBS.lon).rel).every((v) => v === 0)).toBe(true);
    const t = domeTable(grid, town(new Float32Array(grid.nx * grid.ny), 0, 20), OBS.lat, OBS.lon);
    expect(domeAt(t, altOf(3, t.nAlt), azOf(7, t.nAz))).toBeCloseTo(t.rel[3 * t.nAz + 7], 5);
    expect(domeAt(t, 10, 359.9)).toBeCloseTo(domeAt(t, 10, -0.1), 6);   // azimuth wraps
  });

  it("adds cities beyond the grid at the light per resident of the first town inside it", () => {
    const em = town(new Float32Array(grid.nx * grid.ny), 0, 0, 900);
    const pts = farSources([{ name: "Here", lat: OBS.lat, lon: OBS.lon, population: 1000 }, { name: "Far", lat: 31.0, lon: -82.5, population: 5000 }], grid, em);
    expect(pts).toHaveLength(1);
    expect(pts[0].e).toBeCloseTo(4500, 3);
    const t = domeTable(grid, new Float32Array(grid.nx * grid.ny), OBS.lat, OBS.lon, pts);
    expect(angDiff(peakAz(t, 2), 0)).toBeLessThan(4);
  });
});
