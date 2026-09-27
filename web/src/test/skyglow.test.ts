import { describe, expect, it } from "vitest";
import { domesFor, glowCurve, glowModel, glowUniforms, luminanceAt, magOf, mcdOf, rel } from "../engine/skyglow";

const domes = domesFor([{ name: "Gainesville", lat: 29.65, lon: -82.32, population: 145000 }, { name: "Ocala", lat: 29.19, lon: -82.14, population: 65000 }], 29.4, -82.59);
const night = { alt: -40, az: 0 }, moonDown = { alt: -20, az: 90 };

describe("directional sky glow", () => {
  it("returns exactly the modeled zenith brightness at the zenith", () => {
    const g = glowModel(21.66, 21.9, Infinity, domes, night, moonDown);
    expect(magOf(luminanceAt(g, 90, 0))).toBeCloseTo(21.66, 6);
    const lit = glowModel(21.66, 19.0, 18.2, domes, { alt: -10, az: 270 }, { alt: 40, az: 120 });
    const expected = magOf(rel(21.66) + (rel(19.0) - rel(21.9)) + rel(18.2));
    expect(magOf(luminanceAt(lit, 90, 0))).toBeCloseTo(expected, 6);
  });

  it("brightens toward the horizon and most toward the nearest big town", () => {
    const g = glowModel(21.66, 21.9, Infinity, domes, night, moonDown);
    const gnv = domes.find((d) => d.name === "Gainesville")!;
    const toward = luminanceAt(g, 10, gnv.az), away = luminanceAt(g, 10, (gnv.az + 180) % 360);
    expect(toward).toBeGreaterThan(away);
    expect(luminanceAt(g, 10, (gnv.az + 180) % 360)).toBeGreaterThan(luminanceAt(g, 60, (gnv.az + 180) % 360));
    const curve = glowCurve(g, 10, 2);
    const brightest = curve.reduce((a, b) => (b.mag < a.mag ? b : a));
    expect(Math.abs(((brightest.az - gnv.az + 540) % 360) - 180)).toBeLessThan(20);
  });

  it("puts the Moon's scattered light around the Moon, only when it is up", () => {
    const up = glowModel(21.66, 21.9, 18.5, [], night, { alt: 40, az: 120 });
    expect(luminanceAt(up, 42, 120)).toBeGreaterThan(luminanceAt(up, 42, 300));
    const down = glowModel(21.66, 21.9, 18.5, [], night, { alt: -5, az: 120 });
    expect(glowUniforms(down).uMoonL).toBe(0);
  });

  it("converts mag/arcsec² to luminance: 22 mag is about 0.17 mcd/m²", () => {
    expect(mcdOf(22)).toBeCloseTo(0.171, 2);
    expect(mcdOf(17)).toBeCloseTo(17.1, 0);
  });
});
