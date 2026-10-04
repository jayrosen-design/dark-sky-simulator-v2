// Conservation: condition of each work year by year (a 0-100 index losing points per year by material, faster in
// North Florida's UV and humidity, for outdoor works only), interventions when it falls below a threshold, routine care, and the
// Conservation Reserve that pays for them under the draft (Sec. 5.5-5). Under the 1989 code there is no reserve, so
// every dollar of needed care is unfunded by the art program. All rates are seeded assumptions to be replaced by a
// conservator's condition survey.
import type { Artwork, Seed } from "../types";
import { isOutdoor } from "./impressions";

export function replacementValue(a: Artwork, seed: Seed) {
  if (a.budget) return a.budget;
  if (a.type === "mural") return a.height * a.width * seed.conservation.value_per_m2_mural.value;
  return seed.conservation.replacement_value.value[a.scale];
}

export interface ConsYear { fy: number; required: number; routine: number; interventions: number; reserveIn: number; spent: number; balance: number; shortfall: number }
export interface ArtCondition { id: string; value: number; path: number[]; interventions: number[] }

/** Condition paths and the reserve over the fiscal years of `reserveIn` (one entry per year, in order). */
export function conservation(arts: Artwork[], seed: Seed, fys: number[], reserveIn: number[], startBalance = 0) {
  const C = seed.conservation, mats = C.materials.value, F = C.florida_factor.value;
  const works = arts.filter((a) => a.status !== "removed").map((a) => ({
    a, value: replacementValue(a, seed), m: mats[a.material] ?? mats.mixed, f: isOutdoor(a) ? F : 1,
    c: a.status === "existing" ? C.start_condition.value : 100, from: a.status === "planned" || a.status === "proposed" ? fys[0] + 1 : fys[0],
  }));
  const conds: ArtCondition[] = works.map((w) => ({ id: w.a.id, value: w.value, path: [], interventions: [] }));
  let bal = startBalance;
  const years: ConsYear[] = fys.map((fy, k) => {
    let routine = 0, interv = 0;
    works.forEach((w, i) => {
      if (fy < w.from) { conds[i].path.push(w.c); return; }
      w.c = Math.max(0, w.c - w.m.decay * w.f);
      if ((fy - w.from) % Math.max(1, w.m.routine_every) === 0) routine += w.m.routine * w.value;
      if (w.c < w.m.threshold) { interv += w.m.intervention * w.value; w.c = 90; conds[i].interventions.push(fy); }
      conds[i].path.push(w.c);
    });
    const required = routine + interv;
    bal += reserveIn[k] ?? 0;
    const spent = Math.min(bal, required);
    bal -= spent;
    return { fy, required, routine, interventions: interv, reserveIn: reserveIn[k] ?? 0, spent, balance: bal, shortfall: required - spent };
  });
  return { years, conds, endBalance: bal, totalShortfall: years.reduce((a, y) => a + y.shortfall, 0), totalRequired: years.reduce((a, y) => a + y.required, 0) };
}
