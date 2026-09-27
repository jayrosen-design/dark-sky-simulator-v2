// Acceptance tests named after the v2.0 requirement IDs (PRD 0A.2 / Section 3; definition of done in 0B).
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { dataPackage, engine, landParcels, mcdaData } from "./fixtures";
import { computeModel, DataContext } from "../state/model";
import { useStore } from "../state/store";
import {
  DEFAULT_PARAMS, TERMS, applyFixtureRules, baselineState, evaluateComponents, overlapHours, stockFlux, type ScenarioParams,
} from "../engine/scenario";
import { bortleClass, bortleTable, formatSky } from "../engine/bortle";
import { A08_SENTENCE, briefFigures, buildBrief } from "../engine/brief";
import { CRITERIA, defaultWeights, landEstimate, normalizeAll, rankSites, scorecard, wlc, cellAt } from "../engine/mcda";
import { useMcda } from "../state/mcda";
import SitesPanel from "../components/SitesPanel";
import EconomicsPanel from "../components/EconomicsPanel";
import ScenarioPanel from "../components/ScenarioPanel";
import { Defensibility } from "../components/BriefPanel";

const d = dataPackage();
const P = (patch: Partial<ScenarioParams>): ScenarioParams => ({ ...DEFAULT_PARAMS, ...patch });
// Zustand serves getInitialState() during server rendering; point it at the live state for these tests.
(useStore as unknown as { getInitialState: () => unknown }).getInitialState = useStore.getState;
const render = (C: () => JSX.Element | null, params: ScenarioParams = DEFAULT_PARAMS) => {
  useStore.setState({ params, mode: "V", highlightField: null });
  return renderToString(createElement(DataContext.Provider, { value: d }, createElement(C)));
};
const strip = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("parity with the Python pipeline", () => {
  it("baseline V-mode flux per component matches engine/flux.py", () => {
    for (const r of evaluateComponents(engine, DEFAULT_PARAMS, "V")) {
      for (const t of TERMS) {
        const py = r.comp.baseline_flux_V[t];
        expect(Math.abs(r.baseFlux[t] - py)).toBeLessThanOrEqual(1e-9 * Math.max(1, py));
      }
    }
  });
  it("model site magnitudes reproduce the pipeline's baseline site values", () => {
    const m = computeModel(d, DEFAULT_PARAMS, "V");
    for (const s of m.sites) {
      const py = engine.sites.find((x) => x.id === s.id)!.model_mag;
      expect(Math.abs(s.baseMag - py)).toBeLessThan(0.005);
    }
  });
});

describe("A-01 controls apply to a fixture selection, never to the whole map implicitly", () => {
  it("test_A_01_empty_selection_changes_nothing", () => {
    const p = P({ selection: { groups: [], counties: [] }, shielding: { pct_converted: 100, target_u: 0 }, cct_cap: "PCA590",
      intensity: { pct_reduction: 50 }, curfew: { ...DEFAULT_PARAMS.curfew, enabled: true } });
    for (const r of evaluateComponents(engine, p, "V")) for (const t of TERMS) expect(r.flux[t]).toBeCloseTo(r.baseFlux[t], 6);
  });
  it("test_A_01_only_selected_groups_and_counties_change", () => {
    const p = P({ selection: { groups: ["GRU"], counties: ["12001"] }, shielding: { pct_converted: 100, target_u: 0 } });
    for (const r of evaluateComponents(engine, p, "V")) {
      for (const st of r.states) {
        const changed = st.cohorts.some((c) => c.replaced);
        const isSel = st.stock.group === "GRU" && st.stock.county === "12001";
        if (!isSel) expect(changed).toBe(false);
      }
    }
    const gru = evaluateComponents(engine, p, "V").flatMap((r) => r.states).filter((s) => s.stock.group === "GRU");
    expect(gru.some((s) => s.cohorts.some((c) => c.replaced))).toBe(true);
  });
  it("test_A_01_neighbor_county_selection_changes_only_that_county", () => {
    const p = P({ selection: { groups: ["Municipal", "Utility"], counties: ["12083"] }, shielding: { pct_converted: 100, target_u: 0 } });
    const states = evaluateComponents(engine, p, "V").flatMap((r) => r.states);
    for (const st of states) if (st.stock.county !== "12083") expect(st.cohorts.some((c) => c.replaced)).toBe(false);
    expect(states.some((st) => st.stock.county === "12083" && st.cohorts.some((c) => c.replaced))).toBe(true);
    const m = computeModel(d, p, "V");
    expect(m.econ.byTariff.map((l) => l.tariff)).toEqual(["generic"]);
  });
  it("test_A_01_overlay_zone_is_its_own_selection", () => {
    const p = P({ selection: { groups: [], counties: [] }, overlays: [{ site: "CAV", lz0_radius_mi: 2, lz1_radius_mi: 5 }] });
    const res = evaluateComponents(engine, p, "V");
    const inZone = res.flatMap((r) => r.states).filter((s) => s.zone);
    expect(inZone.length).toBeGreaterThan(0);
    expect(inZone.every((s) => s.cohorts.every((c) => c.u === 0))).toBe(true);
    const outside = res.filter((r) => r.comp.kind === "group");
    for (const r of outside) for (const t of TERMS) expect(r.flux[t]).toBeCloseTo(r.baseFlux[t], 6);
  });
});

describe("A-02 every output panel shows the fixture count and inventory confidence", () => {
  const panels: [string, () => JSX.Element | null][] = [["Scenario", ScenarioPanel], ["Sites", SitesPanel], ["Economics", EconomicsPanel]];
  for (const [name, C] of panels) {
    it(`test_A_02_${name}_panel_shows_count_and_confidence`, () => {
      const html = strip(render(C, P({ shielding: { pct_converted: 100, target_u: 0 } })));
      expect(html).toMatch(/[\d,]+ modeled fixtures \(\s*[\d,]+ public, [\d,]+ private\) · inventory confidence 0\.\d\d/);
    });
  }
});

describe("A-07 the Bortle panel never shows a class without its magnitude", () => {
  it("test_A_07_formatSky_always_carries_magnitude", () => {
    const table = bortleTable(engine);
    for (let m = 17; m <= 22.2; m += 0.05) expect(formatSky(m, table)).toMatch(/^\d\d\.\d\d mag\/arcsec² \(Bortle \d(-9)?\)$/);
  });
  it("test_A_07_sites_panel_pairs_every_class_with_a_magnitude", () => {
    const html = strip(render(SitesPanel, P({ growth_baseline: "trend", shielding: { pct_converted: 100, target_u: 0 } })));
    const classes = html.match(/\(B\d(-9)?\)/g) ?? [];
    const paired = html.match(/\d\d\.\d\d \(B\d(-9)?\)/g) ?? [];
    expect(classes.length).toBeGreaterThan(0);
    expect(paired.length).toBe(classes.length);
  });
  it("test_A_07_bortle_thresholds_follow_clear_dark_sky_table", () => {
    const t = bortleTable(engine);
    expect([22.0, 21.9, 21.7, 21.0, 20.0, 19.0, 18.5, 18.0].map((m) => bortleClass(m, t))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("A-08 every scenario PDF opens with the planning-projection sentence and lists inventory confidence", () => {
  it("test_A_08_pdf_first_text_is_the_sentence", async () => {
    const m = computeModel(d, P({ shielding: { pct_converted: 100, target_u: 0 } }), "V");
    const doc = await buildBrief(m, (f) => `https://example.org/#f=${f}`);
    const raw = doc.output();
    const texts = [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((x) => x[1]);
    expect(texts[0]).toBe(A08_SENTENCE);
    expect(texts.slice(1, 4).join(" ")).toMatch(/Inventory confidence: 0\.\d\d/);
  });
});

describe("C-01 every figure in an export is hyperlinked to the scenario field it came from", () => {
  it("test_C_01_each_brief_figure_has_its_own_link", async () => {
    const m = computeModel(d, P({ shielding: { pct_converted: 100, target_u: 0 } }), "V");
    const doc = await buildBrief(m, (f) => `https://example.org/#f=${f}`);
    const uris = [...doc.output().matchAll(/\/URI \((https:[^)]*)\)/g)].map((x) => x[1]);
    for (const f of briefFigures(m)) expect(uris).toContain(`https://example.org/#f=${f.field}`);
  });
});

describe("C-04 defensibility panel", () => {
  it("test_C_04_shows_confidence_rmse_tier_agreement_and_stations", () => {
    const html = strip(render(Defensibility));
    for (const k of ["Inventory confidence", "Calibration RMSE", "Tier 1 vs Tier 2", "SQM stations used"]) expect(html).toContain(k);
    expect(html).toContain("not available: 0 SQM stations");
  });
});

describe("Module B", () => {
  const md = mcdaData();
  const norm = normalizeAll(engine, md);
  const w = defaultWeights(engine);
  const score = wlc(norm, w);
  const sites = rankSites(engine, md, norm, score, w);

  it("test_B_01_top_20_sites_of_at_least_4_contiguous_cells", () => {
    expect(sites.length).toBe(engine.seed.mcda.top_sites.value);
    for (const s of sites) expect(s.cells).toBeGreaterThanOrEqual(engine.seed.mcda.site_min_cells.value);
    for (let i = 1; i < sites.length; i++) expect(sites[i].score).toBeLessThanOrEqual(sites[i - 1].score);
  });
  it("test_B_01_moving_weights_changes_the_ranking", () => {
    const w2 = { ...w, sky: 0, access: 0.6 };
    const s2 = rankSites(engine, md, norm, wlc(norm, w2), w2);
    expect(s2.map((s) => s.best)).not.toEqual(sites.map((s) => s.best));
  });
  it("test_B_02_scorecard_lists_raw_norm_weight_contribution", () => {
    const sc = scorecard(md, norm, w, sites[0].best);
    expect(sc.map((l) => l.criterion)).toEqual([...CRITERIA]);
    for (const l of sc) {
      expect(Number.isFinite(l.raw)).toBe(true);
      expect(l.contrib).toBeCloseTo(l.norm * l.weight, 9);
    }
    expect(sc.reduce((a, l) => a + l.contrib, 0)).toBeCloseTo(score[sites[0].best], 5);
  });
  it("land estimates price every candidate from tax-roll and sales data, without private owner names", () => {
    expect(engine.land).toBeTruthy();
    const parcels = landParcels()!;
    expect(parcels.every((p) => p.owner === null || engine.land!.public_categories.includes(p.cat))).toBe(true);
    let priced = 0;
    for (const s of sites) {
      const l = landEstimate(engine, md, s.cellList, s.best, 80, parcels);
      expect(l.publicShare).toBeGreaterThanOrEqual(0);
      expect(l.publicShare).toBeLessThanOrEqual(1);
      if (l.marketCost !== null) {
        priced++;
        expect(l.marketCost).toBeCloseTo(l.marketUsdAcre! * 80, 6);
        expect(l.marketCostLow!).toBeLessThanOrEqual(l.marketCost + 1e-6);
        expect(l.marketCost).toBeLessThanOrEqual(l.marketCostHigh! + 1e-6);
      }
      if (l.largest) expect(l.largest.acres).toBeGreaterThanOrEqual(20);
    }
    expect(priced).toBeGreaterThan(sites.length / 2);
  });
  it("land cost weight can steer the ranking", () => {
    expect(defaultWeights(engine).land_cost).toBe(0);
    const w2 = { ...w, land_cost: 0.6 };
    expect(rankSites(engine, md, norm, wlc(norm, w2), w2).map((s) => s.best)).not.toEqual(sites.map((s) => s.best));
  });
  it("test_B_06_rho_and_cav_are_always_reference_rows", async () => {
    useMcda.setState({ data: md, norm, score: null, candidates: [], refs: [] });
    useMcda.getState().recompute(engine, { ...w, sky: 0.6 });
    const refs = useMcda.getState().refs.map((r) => r.id).sort();
    expect(refs).toEqual(["CAV-BillyDodd", "RHO-Dome1"]);
    for (const r of useMcda.getState().refs) expect(cellAt(md.grid, engine.sites.find((s) => s.id === r.id)!.lon, engine.sites.find((s) => s.id === r.id)!.lat)).toBeGreaterThanOrEqual(0);
  });
});

describe("Build tab: catalog fixtures, sports lighting, viewing time", () => {
  const street = (st: { stock: { county: string; group: string; kind?: string } }) => st.stock.group !== "Sports" && st.stock.kind !== "private_residential" && st.stock.kind !== "private_commercial" && st.stock.group !== "External";
  it("a street card replaces street stocks only in the selected counties, priced per unit", () => {
    const p = P({ selection: { groups: [], counties: ["12075"] }, fixtures: { street: { card: "roadway_pca_amber", pct: 100 } } });
    const states = evaluateComponents(engine, p, "V").flatMap((r) => r.states);
    for (const st of states) {
      const hit = st.cohorts.some((c) => c.card === "roadway_pca_amber");
      expect(hit).toBe(street(st) && st.stock.county === "12075");
    }
    const m = computeModel(d, p, "V");
    const line = m.econ.byCard.find((l) => l.card === "roadway_pca_amber")!;
    expect(line.units).toBeCloseTo(3135, 0);
    expect(line.total).toBeCloseTo(3135 * 600, -2);
  });
  it("sports lights are off in the SQM window and on in the evening", () => {
    const flux = (view: "late" | "evening") => evaluateComponents(engine, P({ view_window: view }), "V")
      .flatMap((r) => r.states).filter((s) => s.stock.group === "Sports")
      .reduce((a, s) => a + stockFlux(engine, s, "reflected", "V"), 0);
    expect(flux("late")).toBe(0);
    expect(flux("evening")).toBeGreaterThan(0);
  });
  it("a sports retrofit changes the evening sky but not the late-night sky", () => {
    const counties = Object.keys(engine.county_names);
    const card = { sports: { card: "sports_led_visor_3000", pct: 100 } };
    const rho = (p: ScenarioParams) => { const s = computeModel(d, p, "V").sites.find((x) => x.id === "RHO-Dome1")!; return s.scnMag - s.baseMag; };
    expect(Math.abs(rho(P({ selection: { groups: [], counties }, fixtures: card })))).toBeLessThan(1e-9);
    expect(rho(P({ selection: { groups: [], counties }, fixtures: card, view_window: "evening" }))).toBeGreaterThan(0);
  });
  it("motion-sensor residential card dims those fixtures and saves no public money", () => {
    const p = P({ selection: { groups: [], counties: ["12001"] }, fixtures: { residential: { card: "motion_security_2700", pct: 100 } } });
    const states = evaluateComponents(engine, p, "V").flatMap((r) => r.states).filter((s) => s.stock.kind === "private_residential" && s.stock.county === "12001");
    expect(states.length).toBeGreaterThan(0);
    for (const st of states) for (const c of st.cohorts) expect(c.on).toBeLessThan(1);
    const m = computeModel(d, p, "V");
    expect(m.econ.capex).toBe(0);
    expect(m.econ.privateCost).toBeGreaterThan(0);
  });
});

describe("engine behavior", () => {
  it("curfew overlap handles overnight windows", () => {
    expect(overlapHours("00:00", "05:00", "01:00", "04:00")).toBeCloseTo(3);
    expect(overlapHours("22:00", "06:30", "01:00", "04:00")).toBeCloseTo(3);
    expect(overlapHours("22:00", "00:30", "01:00", "04:00")).toBeCloseTo(0);
    expect(overlapHours("02:00", "03:00", "01:00", "04:00")).toBeCloseTo(1);
  });
  it("shielding conversion replaces HPS with LED at the retrofit lumen ratio", () => {
    const out = applyFixtureRules([{ spd: "HPS", u: 3, frac: 1, lm: 16650, replaced: false, from: "HPS", on: 1, onViirs: 1, energy: 1, dimmed: false }], 50, 0, null, 0.5);
    expect(out).toHaveLength(2);
    const conv = out.find((c) => c.replaced)!;
    expect(conv).toMatchObject({ spd: "LED3000", u: 0, frac: 0.5, lm: 8325 });
  });
  it("full shielding removes all direct uplight from the selection", () => {
    const p = P({ shielding: { pct_converted: 100, target_u: 0 } });
    for (const r of evaluateComponents(engine, p, "V"))
      for (const st of r.states) if (st.selected) expect(stockFlux(engine, st, "direct", "V")).toBeCloseTo(0, 9);
  });
  it("lowering CCT lowers scotopic skyglow more than visual skyglow", () => {
    const p = P({ cct_cap: "PCA590", selection: { groups: ["GRU", "Municipal", "Utility", "FDOT", "Private"], counties: ["12001", "12075"] } });
    const sum = (mode: "V" | "scotopic", k: "flux" | "baseFlux") => evaluateComponents(engine, p, mode).reduce((a, r) => (r.comp.kind === "external" ? a : a + r[k].direct + r[k].reflected), 0);
    const vRatio = sum("V", "flux") / sum("V", "baseFlux");
    const sRatio = sum("scotopic", "flux") / sum("scotopic", "baseFlux");
    expect(sRatio).toBeLessThan(vRatio);
  });
  it("VIIRS under-counts white-LED light, so an HPS->LED retrofit looks like a bigger drop from orbit", () => {
    const m = computeModel(d, P({ cct_cap: "LED4000", shielding: { pct_converted: 100, target_u: 0 } }), "V");
    expect(m.viirs.viirsPct).toBeLessThan(m.viirs.visualPct);
    expect(m.viirs.visualPct).toBeLessThan(0);
  });
  it("A-06 money lines carry tariff and rate basis", () => {
    const m = computeModel(d, P({ shielding: { pct_converted: 100, target_u: 0 } }), "V");
    expect(m.econ.byTariff.length).toBeGreaterThan(0);
    for (const l of m.econ.byTariff) { expect(l.tariff).toBeTruthy(); expect(l.rateDate).toBeTruthy(); }
  });
  it("baseline state reproduces stored cohorts exactly", () => {
    const s = engine.components[0].stocks[0];
    expect(baselineState(engine, s).cohorts.map(({ spd, u, frac, lm }) => ({ spd, u, frac, lm }))).toEqual(s.cohorts);
  });
});
