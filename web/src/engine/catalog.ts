// Catalog helpers for the Build tab: how many existing fixtures a card would replace, and how its light output
// compares with what is there now.
import type { CatalogFixture, EngineData } from "./types";
import { slotOf, type ScenarioParams, type Slot } from "./scenario";

export interface SlotStats { units: number; avgLm: number; confidence: number }

/** Existing fixtures in a slot within the selected counties (stocks are partitioned across components). */
export function slotStats(e: EngineData, p: ScenarioParams, slot: Slot): SlotStats {
  let n = 0, lmN = 0, confN = 0;
  for (const comp of e.components) {
    for (const s of comp.stocks) {
      if (slotOf(s) !== slot || !p.selection.counties.includes(s.county)) continue;
      n += s.n;
      lmN += s.n * s.cohorts.reduce((a, c) => a + c.frac * c.lm, 0);
      confN += s.n * s.confidence;
    }
  }
  return { units: n, avgLm: n ? lmN / n : 0, confidence: n ? confN / n : 0 };
}

export function cardsFor(e: EngineData, category: string): CatalogFixture[] {
  return (e.seed.catalog?.fixtures ?? []).filter((f) => f.category === category);
}

export const CCT_LABEL: Record<string, string> = {
  LED4000: "4000K", LED3000: "3000K", LED2700: "2700K", PCA590: "Amber (PCA)", NBA: "Amber (NBA)", HPS: "HPS", MH: "MH",
};
