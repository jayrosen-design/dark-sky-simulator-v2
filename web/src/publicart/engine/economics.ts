// Visitor spending induced by an artwork (TRD Module 4), built bottom-up so it cannot borrow AEP6's sector totals:
// incremental visits (a share of daily stops are new trips, plus destination visits by scale) x per-person spending
// from AEP6 for local and non-local attendees x a realisation factor (a stop at a mural is not an arts-event
// attendance), room nights from non-local overnight visitors, 5% tourist development tax on them, and a bounded
// range for sales lift at shops and restaurants within 500 ft. AEP6 Alachua figures appear only as context.
import type { Scale, Seed } from "../types";

export interface EconParams { shareNonlocal: number; incrementalShare: number; realisation: number; overnightShare: number }

export const defaultEcon = (seed: Seed): EconParams => ({
  shareNonlocal: seed.economics.share_nonlocal.value, incrementalShare: seed.economics.incremental_visit_share.value,
  realisation: seed.economics.realisation.value, overnightShare: seed.economics.overnight_share.value,
});

export interface Econ { visits: number; spending: number; roomNights: number; tdt: number; retail: [number, number, number] }

/** Per year, for one work with `stopsPerDay` (from impressions) and `shops` food/retail/nightlife places within 500 ft. */
export function induced(stopsPerDay: number, scale: Scale, shops: number, seed: Seed, P: EconParams): Econ {
  const E = seed.economics, A = E.aep6.value;
  const visits = 365 * stopsPerDay * P.incrementalShare + E.destination_visits.value[scale];
  const perVisit = (P.shareNonlocal * A.spend_nonlocal + (1 - P.shareNonlocal) * A.spend_local) * P.realisation;
  const roomNights = (visits * P.shareNonlocal * P.overnightShare) / E.persons_per_room.value;
  const sales = shops * E.sales_per_establishment.value;
  return { visits, spending: visits * perVisit, roomNights, tdt: roomNights * E.adr.value * E.tdt_rate.value,
    retail: [sales * (E.retail_lift.low ?? 0), sales * E.retail_lift.value, sales * (E.retail_lift.high ?? E.retail_lift.value)] };
}

/** AEP6 Alachua County context (sector-wide, annual; not a project multiplier). */
export function aep6Context(seed: Seed) {
  const A = seed.economics.aep6.value;
  return { ...A, tax_total: A.tax_local + A.tax_state + A.tax_federal };
}
