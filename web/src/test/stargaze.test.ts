import { describe, expect, it } from "vitest";
import { cloudAt, darknessFactor, dewRisk, goScore, gridPoints, parseGrid, parsePoint, seeingProxy, simCloud, simGrid, transparencyProxy, WX_BBOX } from "../engine/weather";
import { factorsAt, kmBetween, topSpots, waterViewLayer } from "../engine/spots";
import { nightSummary, skyState } from "../shared/sky";
import type { McdaData } from "../engine/mcda";

const RHO = { lat: 29.4, lon: -82.59 };

describe("weather parsing and sampling", () => {
  it("parses Open-Meteo's multi-location array in request order and rejects a short response", () => {
    const { nx, ny } = gridPoints();
    const arr = Array.from({ length: nx * ny }, (_, k) => ({ hourly: { time: [1790539200, 1790542800], cloud_cover: [k % 101, 50] } }));
    const g = parseGrid(arr);
    expect(g.times).toEqual([1790539200000, 1790542800000]);
    expect(g.cloud[0][nx + 2]).toBe((nx + 2) % 101);
    expect(() => parseGrid(arr.slice(1))).toThrow();
  });

  it("matches grid nodes exactly and interpolates between them", () => {
    const g = simGrid(Date.UTC(2026, 9, 1), 2);
    const s = WX_BBOX.step;
    expect(cloudAt(g, 0, WX_BBOX.south + s, WX_BBOX.west + 2 * s)).toBeCloseTo(g.cloud[0][g.nx + 2], 4);
    const mid = cloudAt(g, 0, WX_BBOX.south + s, WX_BBOX.west + 2.5 * s);
    expect(mid).toBeCloseTo((g.cloud[0][g.nx + 2] + g.cloud[0][g.nx + 3]) / 2, 4);
  });

  it("keeps simulated clouds deterministic and within 0-100%", () => {
    const t = Date.UTC(2026, 9, 1, 3);
    expect(simCloud(29.5, -82.5, t)).toBe(simCloud(29.5, -82.5, t));
    for (let k = 0; k < 200; k++) {
      const v = simCloud(29 + k * 0.01, -83 + k * 0.01, t + k * 3600000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("aligns air-quality aerosol hours to forecast hours and keeps missing hours null", () => {
    const fc = { hourly: Object.fromEntries([["time", [100, 200]], ...["cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "relative_humidity_2m",
      "temperature_2m", "dew_point_2m", "wind_speed_10m", "wind_gusts_10m", "visibility", "wind_speed_250hPa"].map((k) => [k, [1, null]])]) };
    const p = parsePoint(fc as never, { hourly: { time: [200], aerosol_optical_depth: [0.12] } } as never);
    expect(p.aod).toEqual([null, 0.12]);
    expect(Number.isNaN(p.cloud[1])).toBe(true);
  });
});

describe("observing indices", () => {
  it("rates seeing worse under a stronger jet stream and gusts", () => {
    expect(seeingProxy(8, 2)).toBe(5);
    expect(seeingProxy(25, 2)).toBe(3);
    expect(seeingProxy(60, 2)).toBe(1);
    expect(seeingProxy(8, 12)).toBe(4);
  });

  it("rates transparency worse with aerosols, humidity and cirrus", () => {
    expect(transparencyProxy(0.04, 50, 0, 50000)).toBe(5);
    expect(transparencyProxy(0.04, 90, 50, 50000)).toBe(3);
    expect(transparencyProxy(0.5, 50, 0, 50000)).toBe(1);
    expect(transparencyProxy(null, 50, 0, 10000)).toBe(2);
  });

  it("flags dew when temperature nears the dew point and scores darkness by Sun and Moon", () => {
    expect(dewRisk(15, 14)).toBe("high");
    expect(dewRisk(15, 12)).toBe("moderate");
    expect(dewRisk(15, 5)).toBe("low");
    expect(darknessFactor(10, -5, 0)).toBe(0);
    expect(darknessFactor(-30, -5, 1)).toBe(1);
    expect(darknessFactor(-30, 40, 1)).toBeCloseTo(0.3);
    expect(goScore(50, 1)).toBe(50);
  });
});

describe("night summary", () => {
  it("finds astronomical dusk before dawn with the Sun at -18°, and shorter dark in June than December", () => {
    const jun = nightSummary(2026, 6, 21, RHO.lat, RHO.lon), dec = nightSummary(2026, 12, 21, RHO.lat, RHO.lon);
    expect(jun.dusk).not.toBeNull();
    expect(jun.dawn! > jun.dusk!).toBe(true);
    expect(Math.abs(skyState(jun.dusk!, RHO.lat, RHO.lon).sun.alt + 18)).toBeLessThan(0.7);
    expect((jun.dawn! - jun.dusk!) < (dec.dawn! - dec.dusk!)).toBe(true);
  });
});

describe("spot ranking", () => {
  // 20 x 20 synthetic grid (~0.8 km cells): darkness rises to the east, a lake in the north-west corner.
  const nx = 20, ny = 20, n = nx * ny;
  const layer = (f: (x: number, y: number) => number) => Float32Array.from({ length: n }, (_, i) => f(i % nx, Math.floor(i / nx)));
  const d: McdaData = {
    grid: { west: -83, south: 29, east: -83 + nx * 0.008333, north: 29 + ny * 0.008333, res_deg: 0.008333, nx, ny, dx_km: 0.8, dy_km: 0.93 },
    raw: {
      sky: layer((x) => 20 + x * 0.1), mag_2034: layer((x) => 20 + x * 0.1), horizon: layer(() => 0),
      elevation: layer((x, y) => (x < 3 && y < 3 ? NaN : 10)), access: layer((x) => x * 0.5),
      parcel_acres: layer(() => 100), public_acres: layer((x) => (x > 15 ? 100 : 0)), land: layer(() => 0.6),
      sale_usd_acre: layer(() => 5000),
    },
    county: Int8Array.from({ length: n }, () => 0), countyFips: ["12075"],
  };
  const water = waterViewLayer(d);

  it("sees open water from the lakeshore and none from far inland", () => {
    expect(water[3 * nx + 3]).toBeGreaterThan(0);
    expect(water[15 * nx + 15]).toBe(0);
    expect(Number.isNaN(water[0])).toBe(true);
  });

  it("keeps spots apart, never on water, and skips public land for property buyers", () => {
    const spots = topSpots(d, water, null, "imaging", 5, 3);
    expect(spots.length).toBeGreaterThan(1);
    for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++)
      expect(kmBetween(spots[a].lat, spots[a].lon, spots[b].lat, spots[b].lon)).toBeGreaterThanOrEqual(3);
    expect(spots[0].cell % nx).toBeGreaterThan(15); // darkest (east) wins for imaging
    const prop = topSpots(d, water, null, "property", 5, 3);
    expect(prop.every((s) => s.cell % nx <= 15)).toBe(true);
    expect(factorsAt(d, water, null, 0, "imaging")).toBeNull();
  });
});
