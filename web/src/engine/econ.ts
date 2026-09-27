// Module A economics (PRD 3 outputs table, seed 6.4). Public fixtures carry CAPEX, energy and O&M; private
// fixtures replaced with a catalog card are costed separately as owner-borne cost (no corpus value for a generic
// private retrofit, so those are counted but not costed). A-06: every money figure carries its tariff and rate date.
import type { EngineData, SpdCode } from "./types";
import { catalogCard, slotOf, type CohortState, type StockState } from "./scenario";

export interface TariffLine {
  tariff: string;
  rateDate: string;
  kwhSaved: number;
  usdSaved: number;
  flags: string[];
}

export interface CardLine { card: string; name: string; slot: string; units: number; unitCost: number; total: number; public: boolean }

export interface EconResult {
  replacedPublic: number;
  nodes: number;
  capexRetrofit: number;
  capexNodes: number;
  capex: number;
  kwhBase: number;
  kwhScn: number;
  kwhSaved: number;
  kwhSavedRetrofit: number;
  kwhSavedDimming: number;
  usdEnergy: number;
  opexDelta: number;
  annualBenefit: number;
  paybackYears: number | null;
  byTariff: TariffLine[];
  byCard: CardLine[];
  privateAffected: number;
  privateCost: number;
  co2Blocked: boolean;
  co2Tons: number;
}

export function efficacy(e: EngineData, spd: SpdCode) {
  return Number(e.seed.engine[`efficacy_${spd.toLowerCase()}_lm_w`]);
}

const watts = (e: EngineData, c: { spd: SpdCode; lm: number; w?: number }) => c.w ?? c.lm / efficacy(e, c.spd);

/** Annual kWh of a stock; `withControls` false ignores dimming/motion (the fixture change alone). */
function kwh(e: EngineData, st: StockState, cohorts: CohortState[] | StockState["stock"]["cohorts"], withControls: boolean) {
  const hours = st.stock.burn_hours ?? Number(e.seed.engine.burn_hours_per_year);
  let w = 0;
  for (const c of cohorts) w += c.frac * watts(e, c) * (withControls && "energy" in c ? c.energy : 1);
  return (st.stock.n * w * hours) / 1000;
}

export function economics(e: EngineData, affected: StockState[]): EconResult {
  const P = e.seed.econ.params;
  const T = e.seed.econ.tariffs;
  const lines = new Map<string, TariffLine>();
  const cards = new Map<string, CardLine>();
  const sportsDefault = catalogCard(e, "sports_led_visor_3000")?.unit_cost.value ?? P.capex_retrofit_u0.value;
  let replaced = 0, nodes = 0, kBase = 0, kScn = 0, kRetro = 0, avoidedMaint = 0, privateAffected = 0, privateCost = 0;
  let capexRetrofit = 0;
  for (const st of affected) {
    const n = st.stock.n;
    // Catalog cards are costed for public and private fixtures alike.
    for (const c of st.cohorts) {
      if (!c.card) continue;
      const card = catalogCard(e, c.card)!;
      const line = cards.get(card.id) ?? { card: card.id, name: card.name, slot: card.slot, units: 0, unitCost: card.unit_cost.value, total: 0, public: st.stock.public };
      line.units += c.frac * n;
      line.total += c.frac * n * card.unit_cost.value;
      cards.set(card.id, line);
    }
    if (!st.stock.public) {
      privateAffected += n;
      privateCost += st.cohorts.filter((c) => c.card).reduce((a, c) => a + c.frac * n * catalogCard(e, c.card)!.unit_cost.value, 0);
      continue;
    }
    const kb = kwh(e, st, st.stock.cohorts, false);
    const kFix = kwh(e, st, st.cohorts, false);   // new fixtures, no dimming
    const ks = kwh(e, st, st.cohorts, true);      // new fixtures with dimming, motion and hours
    for (const c of st.cohorts) {
      if (!c.replaced) continue;
      replaced += c.frac * n;
      capexRetrofit += c.frac * n * (c.card ? catalogCard(e, c.card)!.unit_cost.value
        : slotOf(st.stock) === "sports" ? sportsDefault : P.capex_retrofit_u0.value);
      if (c.from === "HPS" || c.from === "MH") avoidedMaint += c.frac * n * P.avoided_maintenance.value;
    }
    const dimmedShare = st.cohorts.filter((c) => c.dimmed).reduce((a, c) => a + c.frac, 0);
    nodes += dimmedShare * n;
    kBase += kb; kScn += ks; kRetro += kb - kFix;
    for (const [name, share] of Object.entries(st.stock.tariff)) {
      const t = T[name];
      const line = lines.get(name) ?? { tariff: name, rateDate: t.rate_date, kwhSaved: 0, usdSaved: 0, flags: [] };
      const retro = (kb - kFix) * share;
      const dim = (kFix - ks) * share;
      line.kwhSaved += retro + dim;
      if (t.type === "energy") {
        line.usdSaved += (retro + (t.dimming_savings ? dim : 0)) * (t.usd_per_kwh ?? 0);
      } else {
        // Deemed tariffs bill a flat charge per fixture; the LED rate class is not loaded, so the retrofit
        // saving is valued at the generic $/kWh and dimming earns $0 (PRD 3 Energy savings row).
        line.usdSaved += retro * (T.generic.usd_per_kwh ?? 0);
        const f1 = "deemed tariff: retrofit valued at generic $/kWh (LED rate class not loaded)";
        const f2 = "deemed tariff: dimming returns $0";
        if (retro > 0 && !line.flags.includes(f1)) line.flags.push(f1);
        if (dim > 0 && !line.flags.includes(f2)) line.flags.push(f2);
      }
      lines.set(name, line);
    }
  }
  const capexNodes = nodes * P.capex_smart_node.value;
  const capex = capexRetrofit + capexNodes;
  const usdEnergy = [...lines.values()].reduce((a, l) => a + l.usdSaved, 0);
  const opexDelta = avoidedMaint - nodes * (P.cms_saas_default.value + P.node_replacement_reserve.value);
  const annualBenefit = usdEnergy + opexDelta;
  return {
    replacedPublic: replaced, nodes, capexRetrofit, capexNodes, capex,
    kwhBase: kBase, kwhScn: kScn, kwhSaved: kBase - kScn, kwhSavedRetrofit: kRetro, kwhSavedDimming: kBase - kScn - kRetro,
    usdEnergy, opexDelta, annualBenefit,
    paybackYears: capex > 0 && annualBenefit > 0 ? capex / annualBenefit : null,
    byTariff: [...lines.values()].filter((l) => l.kwhSaved !== 0 || l.usdSaved !== 0).sort((a, b) => b.usdSaved - a.usdSaved),
    byCard: [...cards.values()].sort((a, b) => b.total - a.total),
    privateAffected, privateCost,
    co2Blocked: Boolean(P.co2_grid_factor_kg_kwh.display_blocked),
    co2Tons: ((kBase - kScn) * P.co2_grid_factor_kg_kwh.value) / 1000,
  };
}

/** Cumulative net cash position by year for the payback chart. */
export function cashflow(r: EconResult, years = 15) {
  return Array.from({ length: years + 1 }, (_, y) => ({ year: y, net: -r.capex + r.annualBenefit * y }));
}
