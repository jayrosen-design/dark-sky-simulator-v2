import { describe, expect, it } from "vitest";
import { altAz, dirFromAltAz, eqUnit, equatorialToScene, lstDeg, moonlightMag, moonPosition, skyNow, skyState, sunPosition, twilightMag, utcToZoned, zonedToUtc } from "../shared/sky";

const RHO = { lat: 29.4, lon: -82.59 };
const sep = (ra1: number, d1: number, ra2: number, d2: number) => {
  const a = eqUnit(ra1, d1), b = eqUnit(ra2, d2);
  return (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;
};

describe("all-sky astronomy", () => {
  it("puts Polaris at the site latitude at any time", () => {
    for (const t of [Date.UTC(2026, 0, 1, 3), Date.UTC(2026, 6, 1, 8), Date.UTC(2026, 9, 15, 23)]) {
      expect(Math.abs(altAz(37.95, 89.26, lstDeg(t, RHO.lon), RHO.lat).alt - RHO.lat)).toBeLessThan(0.8);
    }
  });

  it("puts the Sun on the celestial equator at the March 2025 equinox (09:01 UTC)", () => {
    expect(Math.abs(sunPosition(Date.UTC(2025, 2, 20, 9, 1)).dec)).toBeLessThan(0.05);
  });

  it("peaks the June-solstice Sun at 90° − latitude + 23.44°", () => {
    let best = -90;
    for (let m = 0; m < 1440; m += 2) {
      const t = Date.UTC(2026, 5, 21, 0, m);
      const s = sunPosition(t);
      best = Math.max(best, altAz(s.ra, s.dec, lstDeg(t, RHO.lon), RHO.lat).alt);
    }
    expect(best).toBeCloseTo(90 - RHO.lat + 23.44, 0);
  });

  it("aligns Sun and Moon at the 2024-04-08 total solar eclipse (18:18 UTC)", () => {
    const t = Date.UTC(2024, 3, 8, 18, 18);
    const s = sunPosition(t), m = moonPosition(t);
    expect(sep(s.ra, s.dec, m.ra, m.dec)).toBeLessThan(1.5);
    expect(skyState(t, RHO.lat, RHO.lon).moon.illum).toBeLessThan(0.01);
  });

  it("fully lights the Moon at the 2024-01-25 full moon (17:54 UTC)", () => {
    const st = skyState(Date.UTC(2024, 0, 25, 17, 54), RHO.lat, RHO.lon);
    expect(st.moon.illum).toBeGreaterThan(0.99);
    expect(st.moon.name).toBe("Full Moon");
  });

  it("scene matrix matches altAz for a star", () => {
    const t = Date.UTC(2026, 10, 3, 6), lst = lstDeg(t, RHO.lon);
    const R = equatorialToScene(lst, RHO.lat), q = eqUnit(78.63, -8.2);
    const v = [0, 1, 2].map((r) => R[3 * r] * q[0] + R[3 * r + 1] * q[1] + R[3 * r + 2] * q[2]);
    const h = altAz(78.63, -8.2, lst, RHO.lat), w = dirFromAltAz(h.alt, h.az);
    v.forEach((c, i) => expect(c).toBeCloseTo(w[i], 6));
  });

  it("converts the Florida wall clock across daylight saving time", () => {
    expect(zonedToUtc(2026, 7, 1, 90)).toBe(Date.UTC(2026, 6, 1, 5, 30));   // 01:30 EDT
    expect(zonedToUtc(2026, 1, 15, 90)).toBe(Date.UTC(2026, 0, 15, 6, 30)); // 01:30 EST
    expect(utcToZoned(Date.UTC(2026, 6, 1, 5, 30))).toMatchObject({ y: 2026, mo: 7, d: 1, h: 1, mi: 30 });
  });

  it("brightens the sky with a high full moon to about 18 mag/arcsec² and leaves night alone", () => {
    const full = moonlightMag(0, 60);
    expect(full).toBeGreaterThan(17.3);
    expect(full).toBeLessThan(18.5);
    expect(moonlightMag(0, -5)).toBe(Infinity);
    expect(twilightMag(-25)).toBe(Infinity);
    const dark = { lst: 0, sun: { alt: -40, az: 0 }, moon: { alt: -10, az: 0, illum: 0, phaseAngle: 180, waxing: true, name: "" }, twilight: "Night" };
    expect(skyNow(21.6, dark).mag).toBeCloseTo(21.6, 6);
  });
});
