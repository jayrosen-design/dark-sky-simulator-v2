// The browser's step test (AI tab pixel inspector) must agree with the pipeline's detector (ml/trends.py).
import { describe, expect, it } from "vitest";
import { cellAt, fitStep } from "../engine/changes";
import type { StepsMeta } from "../engine/types";
import { engine, viirsLayers } from "./fixtures";

const YEARS = Array.from({ length: 13 }, (_, i) => 2012 + i);
const META: StepsMeta = {
  alpha: 0.001, critical_f: 36.3, min_step_pct: 20, lit_nw: 1, floor_nw: 0.05, n_lit: 0, n_flagged: 0, expected_false: 0,
  first_year: 2015, last_year: 2022, common_log: null, common_mode_pct: null, noise_pct: { p25: 0, median: 0, p75: 0 },
  detection_at_median_noise: {}, events: { rises: 0, drops: 0 },
};

describe("pixel step test", () => {
  it("finds a clean step and its year, and reads a steady trend as a line", () => {
    const step = YEARS.map((y, k) => 10 * 1.02 ** k * (y >= 2019 ? 0.6 : 1) * (1 + 0.01 * Math.sin(k * 2.3)));
    const s = fitStep(step, YEARS, META);
    expect(s.flagged).toBe(true);
    expect(s.year).toBe(2019);
    expect(s.stepPct).toBeCloseTo(-40, 0);
    const trend = YEARS.map((_, k) => 10 * 1.06 ** k * (1 + 0.02 * Math.sin(k * 2.3)));
    expect(fitStep(trend, YEARS, META).flagged).toBe(false);
    expect(fitStep(YEARS.map(() => 0.3), YEARS, META).lit).toBe(false);
  });

  it("maps a point to its a15 cell", () => {
    const g = engine.grids.a15;
    expect(cellAt(g, g.west + 1e-6, g.north - 1e-6)).toBe(0);
    expect(cellAt(g, g.east - 1e-6, g.south + 1e-6)).toBe(g.nx * g.ny - 1);
    expect(cellAt(g, g.west - 0.1, g.north)).toBeNull();
  });

  const v = viirsLayers();
  it.skipIf(!v || !engine.viirs)("agrees with the pipeline on every lit pixel of the real package", () => {
    const m = engine.viirs!.steps;
    const years = engine.viirs!.years;
    const [, stepYear, stepPct] = v!.trend;
    const n = v!.years[0].length;
    let lit = 0, agree = 0, borderline = 0;
    for (let i = 0; i < n; i++) {
      const series = v!.years.map((l) => l[i]);
      const s = fitStep(series, years, m);
      if (!s.lit) continue;
      lit++;
      const py = Math.round(stepYear[i]) > 0;
      // 16-bit storage moves values slightly: pixels within 5% of the F cutoff or 1 point of the size rule may flip.
      const near = Math.abs(s.f / m.critical_f - 1) < 0.05 || Math.abs(Math.abs(s.stepPct) - m.min_step_pct) < 1;
      if (py === s.flagged && (!py || (s.year === Math.round(stepYear[i]) && Math.abs(s.stepPct - stepPct[i]) < Math.max(2, 0.01 * Math.abs(stepPct[i]))))) agree++;
      else if (near) borderline++;
    }
    expect(lit).toBeGreaterThan(0.95 * m.n_lit);
    expect(agree + borderline).toBe(lit);
    expect(borderline).toBeLessThan(0.002 * lit);
    for (const ev of engine.viirs!.events) {          // each event opens a flagged cell that stepped in the event's year
      const s = fitStep(v!.years.map((l) => l[ev.cell]), years, m);
      expect(s.flagged && s.year === ev.year).toBe(true);
    }
  });
});
