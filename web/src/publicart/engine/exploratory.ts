// Staff study tab (exploratory): items the Trust handout leaves to staff and legal review: a voluntary Chapter 30
// private-development incentive, GRU / enterprise-funded projects, and City-County shared services. Every parameter is
// a hypothetical from the TRD or an assumption; outputs never feed the main KPIs and carry no legal conclusion.
import type { CipProject, Seed } from "../types";

export const EXPLORATORY = { exploratory: true as const, legalConclusion: null };

export type Ch30Option = "A" | "B" | "C";
export interface Ch30Site { valuation: number; gfaSf: number; option: Ch30Option; farBonus: number; extraStory: boolean; parkingReduction: number }

/** One private project: pledge versus the value of the density bonus, with bonuses clamped to the TRD caps. */
export function ch30Site(s: Ch30Site, seed: Seed) {
  const T = seed.staff_study, caps = T.ch30_bonus_caps.value, rate = T.ch30_options.value[s.option].rate;
  const far = Math.min(caps.far, Math.max(0, s.farBonus)), parking = Math.min(caps.parking, Math.max(0, s.parkingReduction));
  const pledge = s.valuation * rate;
  const bonusSf = s.gfaSf * far, bonusValue = bonusSf * T.ch30_land_value_per_buildable_sf.value;
  return { ...EXPLORATORY, voluntary: true as const, rate, pledge, toTrust: s.option === "C" ? pledge : 0, onsiteArt: s.option === "A" ? pledge : 0,
    offsiteArt: s.option === "B" ? pledge : 0, far, stories: s.extraStory ? caps.stories : 0, parking, bonusSf, bonusValue, netToDeveloper: bonusValue - pledge };
}

/** Program level: art and in-lieu dollars per year from voluntary uptake across eligible private construction. */
export function ch30Program(uptake: number, construction: number, mix: Record<Ch30Option, number>, seed: Seed) {
  const o = seed.staff_study.ch30_options.value, tot = mix.A + mix.B + mix.C || 1;
  const v = construction * uptake;
  return { ...EXPLORATORY, voluntary: true as const, onsite: (v * mix.A / tot) * o.A.rate, offsite: (v * mix.B / tot) * o.B.rate, inLieu: (v * mix.C / tot) * o.C.rate };
}

/** GRU / enterprise-funded capital projects: allocations held in a restricted sub-account; planned uses outside the
 *  nexus categories are flagged. */
export function gruAccount(projects: CipProject[], rate: number, cap: number, uses: Record<string, number | null>) {
  const rows = projects.filter((p) => p.funding === "enterprise_gru").map((p) => {
    const alloc = Math.min(rate * p.budget_usd, cap);
    const use = uses[p.id] ?? null;
    return { id: p.id, name: p.name, fy: p.fy, alloc, use, flagged: use === null };
  });
  return { ...EXPLORATORY, rows, total: rows.reduce((a, r) => a + r.alloc, 0), flagged: rows.filter((r) => r.flagged).length };
}

/** City-County shared program manager and conservator versus two separate programs. */
export function interlocal(seed: Seed, split: "population" | "even" = "population") {
  const L = seed.staff_study.interlocal.value, pop = seed.staff_study.populations.value;
  const base = L.manager_cost + L.conservator_cost;
  const separate = 2 * base * (1 + L.separate_overhead);
  const shared = base * (1 + L.shared_overhead) * L.shared_capacity;   // one program covering both jurisdictions
  const cityShare = split === "even" ? 0.5 : pop.city / (pop.city + pop.county_unincorporated);
  return { ...EXPLORATORY, separate, shared, savings: separate - shared, city: shared * cityShare, county: shared * (1 - cityShare), cityShare };
}
