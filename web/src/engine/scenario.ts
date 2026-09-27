// Module A scenario engine (client side). Controls map to physical parameters (PRD 2.1):
// shielding rewrites U-ratings, the CCT cap reassigns SPD class, intensity scales lumens, and time controls
// (operating hours, curfew, dimming, motion sensors) scale each fixture cohort over the viewing window: the SQM
// window 01:00-04:00 by default, or the evening window. The VIIRS readout uses the 01:30 overpass.
// Controls apply only to the explicit fixture selection (A-01); overlay zones apply to every fixture inside them;
// catalog fixtures (Build tab) replace a whole fixture slot in the selected counties.
import type { CatalogFixture, Component, EngineData, Group, Mode, SpdCode, Stock, Term } from "./types";

export const GROUPS: Group[] = ["GRU", "Municipal", "Utility", "FDOT", "Private", "Sports"];
export const TERMS: Term[] = ["direct", "reflected"];
export const CCT_OPTIONS: SpdCode[] = ["LED4000", "LED3000", "LED2700", "PCA590"];
export const SLOTS = ["street", "commercial", "residential", "sports"] as const;
export type Slot = (typeof SLOTS)[number];

export interface OverlaySpec { site: string; lz0_radius_mi: number; lz1_radius_mi: number }
export interface FixtureChoice { card: string; pct: number }

// Field names follow the PRD 4.3 ScenarioParams JSON (plus v2.0 additions: view_window, fixtures).
export interface ScenarioParams {
  selection: { groups: Group[]; counties: string[] };
  shielding: { pct_converted: number; target_u: 0 | 1 | 2 };
  cct_cap: SpdCode | null;
  intensity: { pct_reduction: number };
  curfew: { enabled: boolean; start: string; end: string; dim_level_pct: number; motion_only: boolean };
  overlays: OverlaySpec[];
  growth_baseline: "hold_2024" | "trend";
  growth_years: number;
  amortization: { years: number; public_deadline_years: number };
  view_window: "late" | "evening";
  fixtures: Partial<Record<Slot, FixtureChoice>>;
}

export const DEFAULT_PARAMS: ScenarioParams = {
  selection: { groups: ["GRU", "Municipal", "Utility", "FDOT"], counties: ["12001", "12075"] },
  shielding: { pct_converted: 0, target_u: 0 },
  cct_cap: null,
  intensity: { pct_reduction: 0 },
  curfew: { enabled: false, start: "00:00", end: "05:00", dim_level_pct: 50, motion_only: false },
  overlays: [],
  growth_baseline: "hold_2024",
  growth_years: 10,
  amortization: { years: 10, public_deadline_years: 5 },
  view_window: "late",
  fixtures: {},
};

const CCT: Record<SpdCode, number> = { HPS: 2100, MH: 4000, LED4000: 4000, LED3000: 3000, LED2700: 2700, PCA590: 2200, NBA: 1800 };
const DISCHARGE = new Set<SpdCode>(["HPS", "MH"]);

/** A share of a stock's fixtures in one state. `on` = lit share of the viewing window (hours, curfew, dimming,
 *  motion), `onViirs` = the same at the 01:30 overpass, `energy` = share of full-power annual energy. */
export interface CohortState {
  spd: SpdCode; u: number; frac: number; lm: number;
  replaced: boolean; from: SpdCode;
  on: number; onViirs: number; energy: number; dimmed: boolean;
  card?: string; w?: number;
}

export interface StockState {
  stock: Stock;
  cohorts: CohortState[];
  selected: boolean;
  zone: "lz0" | "lz1" | null;
  equipped: string | null; // catalog card applied to this stock
}

// ------------------------------------------------------------------ time helpers

const toH = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h + m / 60;
};

/** Hours of [a,b] (overnight wrap allowed) that overlap [c,d]. */
export function overlapHours(a: string, b: string, c: string, d: string) {
  const seg = (x: number, y: number): [number, number][] => (y > x ? [[x, y]] : [[x, 24], [0, y]]);
  let tot = 0;
  for (const [s1, e1] of seg(toH(a), toH(b)))
    for (const [s2, e2] of seg(toH(c), toH(d))) tot += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
  return tot;
}

export function curfewHours(start: string, end: string) {
  const s = toH(start), e = toH(end);
  return e > s ? e - s : 24 - s + e;
}

export type Window = [string, string];

export function viewWindow(e: EngineData, p: Pick<ScenarioParams, "view_window">): Window {
  const s = e.seed.engine;
  return p.view_window === "evening"
    ? [String(s.evening_window_start), String(s.evening_window_end)]
    : [String(s.sqm_window_start), String(s.sqm_window_end)];
}

/** Share of a window during which fixtures with these operating hours are lit (null = dusk to dawn). */
export function onFraction(hours: string | null | undefined, w: Window) {
  if (!hours) return 1;
  const [a, b] = hours.split("-");
  return overlapHours(a, b, w[0], w[1]) / (curfewHours(w[0], w[1]) || 1);
}

const OVERPASS: Window = ["01:29", "01:31"];

/** Multiply a cohort's time factors for a dimming period at dim%. */
function dimCohort(e: EngineData, c: CohortState, dimPct: number, start: string, end: string, w: Window): CohortState {
  const d = dimPct / 100;
  const night = Number(e.seed.engine.night_hours);
  const hrs = Math.min(curfewHours(start, end), night);
  return {
    ...c, dimmed: true,
    on: c.on * (1 - (1 - d) * (overlapHours(start, end, w[0], w[1]) / (curfewHours(w[0], w[1]) || 1))),
    onViirs: c.onViirs * (overlapHours(start, end, ...OVERPASS) > 0 ? d : 1),
    energy: c.energy * (1 - (1 - d) * (hrs / night)),
  };
}

function motionCohort(e: EngineData, c: CohortState): CohortState {
  const d = Number(e.seed.overlay.motion_only_equivalent_dim_pct.value) / 100;
  return { ...c, dimmed: true, on: c.on * d, onViirs: c.onViirs * d, energy: c.energy * d };
}

// ------------------------------------------------------------------ cohort transforms

function retrofit(c: CohortState, spd: SpdCode, u: number, ratio: number): CohortState {
  const lm = DISCHARGE.has(c.spd) && !DISCHARGE.has(spd) ? c.lm * ratio : c.lm;
  return { ...c, spd, u, lm, replaced: true, w: undefined };
}

/** Convert pct% of fixtures worse than targetU to targetU; replace anything above the CCT cap. */
export function applyFixtureRules(cohorts: CohortState[], pct: number, targetU: number, cap: SpdCode | null, ratio: number) {
  const out: CohortState[] = [];
  const newSpd = (spd: SpdCode) => (cap && (DISCHARGE.has(spd) || CCT[spd] > CCT[cap]) ? cap : DISCHARGE.has(spd) ? (cap ?? "LED3000") : spd);
  for (const c of cohorts) {
    let parts: CohortState[] = [c];
    if (pct > 0 && c.u > targetU) {
      const f = Math.min(pct, 100) / 100;
      parts = [
        retrofit({ ...c, frac: c.frac * f }, newSpd(c.spd), targetU, ratio),
        ...(f < 1 ? [{ ...c, frac: c.frac * (1 - f) }] : []),
      ];
    }
    for (const q of parts) {
      if (cap && CCT[q.spd] > CCT[cap]) out.push(retrofit(q, cap, q.u, ratio));
      else out.push(q);
    }
  }
  return out;
}

/** Replace pct% of every cohort with the catalog fixture (one-for-one; lumens and watts from the card). */
export function applyCard(e: EngineData, cohorts: CohortState[], card: CatalogFixture, pct: number, stockHours: string | null | undefined,
  w: Window, curfew: ScenarioParams["curfew"]): CohortState[] {
  const f = Math.min(Math.max(pct, 0), 100) / 100;
  if (f <= 0) return cohorts;
  const hours = card.hours ?? stockHours;
  const out: CohortState[] = [];
  for (const c of cohorts) {
    let n: CohortState = {
      spd: card.spd, u: card.u, frac: c.frac * f, lm: card.lumens, w: card.watts, replaced: true, from: c.from,
      on: onFraction(hours, w), onViirs: onFraction(hours, OVERPASS), energy: 1, dimmed: false, card: card.id,
    };
    if (card.motion_only) n = motionCohort(e, n);
    if (card.dimming) {
      const dm = curfew.enabled ? { start: curfew.start, end: curfew.end, dim_level_pct: curfew.dim_level_pct } : card.dimming;
      n = dimCohort(e, n, dm.dim_level_pct, dm.start, dm.end, w);
    }
    out.push(n);
    if (f < 1) out.push({ ...c, frac: c.frac * (1 - f) });
  }
  return out;
}

function zoneOf(comp: Component, p: ScenarioParams, siteKey: (id: string) => string): "lz0" | "lz1" | null {
  if (comp.kind !== "ring" || !comp.site) return null;
  const ov = p.overlays.find((o) => o.site === siteKey(comp.site!));
  if (!ov) return null;
  if ((comp.r1_mi ?? 99) <= ov.lz0_radius_mi) return "lz0";
  if ((comp.r1_mi ?? 99) <= ov.lz1_radius_mi) return "lz1";
  return null;
}

/** "RHO-Dome1" -> "RHO", "CAV-BillyDodd" -> "CAV" (ScenarioParams uses the PRD short site keys). */
export const siteKey = (id: string) => id.split("-")[0];

export function isSelected(stock: Stock, p: ScenarioParams) {
  return stock.group !== "External" && p.selection.groups.includes(stock.group) && p.selection.counties.includes(stock.county);
}

/** Which catalog slot a stock belongs to (null for fixed external sources). */
export function slotOf(stock: Stock): Slot | null {
  if (stock.group === "External") return null;
  if (stock.group === "Sports") return "sports";
  if (stock.kind === "private_residential") return "residential";
  if (stock.kind === "private_commercial") return "commercial";
  return "street";
}

export function catalogCard(e: EngineData, id: string | undefined) {
  return id ? e.seed.catalog?.fixtures.find((f) => f.id === id) ?? null : null;
}

function initialCohorts(stock: Stock, w: Window): CohortState[] {
  const on = onFraction(stock.hours, w);
  const onViirs = onFraction(stock.hours, OVERPASS);
  return stock.cohorts.map((c) => ({ ...c, replaced: false, from: c.spd, on, onViirs, energy: 1, dimmed: false }));
}

export function stockState(e: EngineData, stock: Stock, comp: Component, p: ScenarioParams): StockState {
  const ratio = Number(e.seed.engine.retrofit_lumen_ratio);
  const w = viewWindow(e, p);
  let cohorts = initialCohorts(stock, w);
  const selected = isSelected(stock, p);
  const slot = slotOf(stock);
  const choice = slot ? p.fixtures?.[slot] : undefined;
  const card = catalogCard(e, choice?.card);
  let equipped: string | null = null;
  if (card && choice && p.selection.counties.includes(stock.county)) {
    cohorts = applyCard(e, cohorts, card, choice.pct, stock.hours, w, p.curfew);
    equipped = card.id;
  }
  if (selected) {
    const keep = cohorts.filter((c) => c.card);
    const rest = applyFixtureRules(cohorts.filter((c) => !c.card), p.shielding.pct_converted, p.shielding.target_u, p.cct_cap, ratio);
    cohorts = [...keep, ...rest];
    if (p.intensity.pct_reduction > 0) cohorts = cohorts.map((c) => ({ ...c, lm: c.lm * (1 - p.intensity.pct_reduction / 100) }));
    if (p.curfew.enabled) {
      cohorts = cohorts.map((c) => {
        if (c.card && catalogCard(e, c.card)?.dimming) return c; // already dimmed on the curfew schedule
        return p.curfew.motion_only ? motionCohort(e, c) : dimCohort(e, c, p.curfew.dim_level_pct, p.curfew.start, p.curfew.end, w);
      });
    }
  }
  const zone = stock.group === "External" ? null : zoneOf(comp, p, siteKey);
  if (zone === "lz0") {
    const r = e.seed.overlay.lz0;
    cohorts = applyFixtureRules(cohorts, 100, 0, r.spd, ratio);
    if (r.motion_only) cohorts = cohorts.map((c) => (c.dimmed ? c : motionCohort(e, c)));
  } else if (zone === "lz1") {
    cohorts = applyFixtureRules(cohorts, 100, 0, e.seed.overlay.lz1.cct_cap, ratio);
  }
  return { stock, cohorts, selected, zone, equipped };
}

export function baselineState(e: EngineData, stock: Stock, w?: Window): StockState {
  return { stock, cohorts: initialCohorts(stock, w ?? viewWindow(e, { view_window: "late" })), selected: false, zone: null, equipped: null };
}

// ------------------------------------------------------------------ flux

/** Same formula as engine/flux.py effective_flux, times each cohort's lit share of the viewing window. */
export function stockFlux(e: EngineData, st: StockState, term: Term, mode: Mode) {
  const { ulor, albedo, spectral_factors } = e.physics;
  let tot = 0;
  for (const c of st.cohorts) {
    const u = ulor[String(c.u)];
    const geom = term === "direct" ? u : (1 - u) * albedo;
    tot += c.frac * c.lm * geom * spectral_factors[term][mode][c.spd] * c.on;
  }
  return st.stock.n * tot;
}

/** Upward light as VIIRS would record it (no scattering; DNB blue-blindness via 1/viirs_cf, PRD 2.2). */
export function stockViirs(e: EngineData, st: StockState) {
  const { ulor, albedo } = e.physics;
  let tot = 0;
  for (const c of st.cohorts) {
    const u = ulor[String(c.u)];
    tot += (c.frac * c.lm * (u + (1 - u) * albedo) * c.onViirs) / Number(e.seed.spd[c.spd].viirs_cf);
  }
  return st.stock.n * tot;
}

export interface ComponentResult {
  comp: Component;
  states: StockState[];
  flux: Record<Term, number>;      // scenario, current mode and viewing window
  baseFlux: Record<Term, number>;  // baseline, current mode and viewing window
}

export function evaluateComponents(e: EngineData, p: ScenarioParams, mode: Mode): ComponentResult[] {
  const w = viewWindow(e, p);
  return e.components.map((comp) => {
    const states = comp.stocks.map((s) => stockState(e, s, comp, p));
    const base = comp.stocks.map((s) => baselineState(e, s, w));
    const flux = { direct: 0, reflected: 0 };
    const baseFlux = { direct: 0, reflected: 0 };
    for (const t of TERMS) {
      flux[t] = states.reduce((a, s) => a + stockFlux(e, s, t, mode), 0);
      baseFlux[t] = base.reduce((a, s) => a + stockFlux(e, s, t, mode), 0);
    }
    return { comp, states, flux, baseFlux };
  });
}

// ------------------------------------------------------------------ site metrics

export interface SiteMetric {
  id: string;
  name: string;
  baseArt: number;
  scnArt: number;
  baseMag: number;
  scnMag: number;
  futureBaseMag: number | null;
  futureScnMag: number | null;
}

export function siteMetrics(e: EngineData, results: ComponentResult[], growthAt: (lon: number, lat: number) => number | null): SiteMetric[] {
  const a = e.anchor.alpha;
  const Ln = e.physics.L_nat;
  const mag = (L: number) => 12.6 - 2.5 * Math.log10(Math.max(L, 0) + Ln);
  return e.sites.map((s) => {
    let base = 0, scn = 0;
    for (const r of results) {
      const c = s.contrib[r.comp.id];
      if (!c) continue;
      for (const t of TERMS) {
        base += a * r.baseFlux[t] * c[t];
        scn += a * r.flux[t] * c[t];
      }
    }
    const g = growthAt(s.lon, s.lat);
    return {
      id: s.id, name: s.name, baseArt: base, scnArt: scn, baseMag: mag(base), scnMag: mag(scn),
      futureBaseMag: g === null ? null : mag(base * g), futureScnMag: g === null ? null : mag(scn * g),
    };
  });
}

// ------------------------------------------------------------------ inventory accounting (A-02)

export interface FixtureAccount { total: number; public: number; private: number; confidence: number }

export function account(states: StockState[]): FixtureAccount {
  let total = 0, pub = 0, priv = 0, cw = 0;
  for (const s of states) {
    total += s.stock.n;
    cw += s.stock.n * s.stock.confidence;
    if (s.stock.public) pub += s.stock.n;
    else priv += s.stock.n;
  }
  return { total, public: pub, private: priv, confidence: total ? cw / total : 0 };
}

/** Fixtures the controls, overlays or catalog fixtures actually act on. */
export function affectedStates(results: ComponentResult[]) {
  return results.flatMap((r) => r.states.filter((s) => s.selected || s.zone || s.equipped));
}

/** Every modeled fixture in the model counties (used by map-wide panels). */
export function countyStates(results: ComponentResult[]) {
  return results.flatMap((r) => r.states.filter((s) => s.stock.group !== "External"));
}
