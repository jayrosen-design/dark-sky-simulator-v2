import { describe, expect, it } from "vitest";
import { glowCurve, glowModel, glowUniforms, luminanceAt, magOf, mcdOf, rel } from "../engine/skyglow";
import { domeTable } from "../engine/horizon";
import type { GridMeta } from "../engine/types";

// Light domes from a small lit grid: a bright town 30 km NE of the observer and a fainter one 45 km SE.
const grid: GridMeta = { west: -83.0, south: 29.0, east: -82.0, north: 30.0, res_deg: 0.01, nx: 100, ny: 100, dx_km: 0.97, dy_km: 1.11 };
const em = new Float32Array(grid.nx * grid.ny);
const lit = (lat: number, lon: number, e: number) => { em[Math.floor((grid.north - lat) / 0.01) * grid.nx + Math.floor((lon - grid.west) / 0.01)] += e; };
lit(29.69, -82.28, 145);   // ~30 km at 45°
lit(29.21, -82.15, 65);    // ~48 km at 133°
const dome = domeTable(grid, em, 29.5, -82.5);
const night = { alt: -40, az: 0 }, moonDown = { alt: -20, az: 90 };

describe("directional sky glow", () => {
  it("returns exactly the modeled zenith brightness at the zenith", () => {
    const g = glowModel(21.66, 21.9, Infinity, dome, night, moonDown);
    expect(magOf(luminanceAt(g, 90, 0))).toBeCloseTo(21.66, 6);
    const lit = glowModel(21.66, 19.0, 18.2, dome, { alt: -10, az: 270 }, { alt: 40, az: 120 });
    const expected = magOf(rel(21.66) + (rel(19.0) - rel(21.9)) + rel(18.2));
    expect(magOf(luminanceAt(lit, 90, 0))).toBeCloseTo(expected, 6);
  });

  it("brightens toward the horizon and most toward the bright town", () => {
    const g = glowModel(21.66, 21.9, Infinity, dome, night, moonDown);
    const toward = luminanceAt(g, 10, 45), away = luminanceAt(g, 10, 225);
    expect(toward).toBeGreaterThan(away);
    expect(luminanceAt(g, 10, 225)).toBeGreaterThan(luminanceAt(g, 60, 225));
    const curve = glowCurve(g, 10, 2);
    const brightest = curve.reduce((a, b) => (b.mag < a.mag ? b : a));
    expect(Math.abs(((brightest.az - 45 + 540) % 360) - 180)).toBeLessThan(10);
  });

  it("puts the Moon's scattered light around the Moon, only when it is up", () => {
    const up = glowModel(21.66, 21.9, 18.5, null, night, { alt: 40, az: 120 });
    expect(luminanceAt(up, 42, 120)).toBeGreaterThan(luminanceAt(up, 42, 300));
    const down = glowModel(21.66, 21.9, 18.5, null, night, { alt: -5, az: 120 });
    expect(glowUniforms(down).uMoonL).toBe(0);
  });

  it("converts mag/arcsec² to luminance: 22 mag is about 0.17 mcd/m²", () => {
    expect(mcdOf(22)).toBeCloseTo(0.171, 2);
    expect(mcdOf(17)).toBeCloseTo(17.1, 0);
  });
});
