import { createContext, useContext, useMemo } from "react";
import type { EngineData, Mode } from "../engine/types";
import { account, affectedStates, baselineState, countyStates, evaluateComponents, siteMetrics, stockViirs, viewWindow, type ScenarioParams } from "../engine/scenario";
import { combine, sampleGrid, skyFields } from "../engine/field";
import { economics } from "../engine/econ";
import { bortleTable } from "../engine/bortle";
import { useStore } from "./store";

export interface DataPackage {
  e: EngineData;
  base15: Float32Array;
  basis: Float32Array[] | null; // lazy
  growth30: Float32Array | null;
  fixCat15: Float32Array[] | null; // modeled fixtures per 15" cell: street, commercial, residential, sports
  county15: Int8Array | null;      // index into e.files.county_a15.values, -1 outside the model counties
}

export const DataContext = createContext<DataPackage | null>(null);
export const useData = () => {
  const d = useContext(DataContext);
  if (!d) throw new Error("data not loaded");
  return d;
};

/** Everything the panels, map and brief show for one scenario. Pure, so tests can call it directly. */
export function computeModel(d: DataPackage, params: ScenarioParams, mode: Mode) {
  const { e } = d;
  const table = bortleTable(e);
  const growthOn = params.growth_baseline === "trend";
  const years = params.growth_years;
  const results = evaluateComponents(e, params, mode);
  const resultsV = mode === "V" ? results : evaluateComponents(e, params, "V");
  const growthAt = (lon: number, lat: number) =>
    growthOn && d.growth30 ? sampleGrid(e.grids.a30, d.growth30, lon, lat) ** (years / 10) : null;
  const sites = siteMetrics(e, resultsV, growthAt);

  let fields = null;
  if (d.basis) {
    const scn = combine(e, d.basis, results, "flux");
    const bas = combine(e, d.basis, results, "baseFlux");
    const vScn = mode === "V" ? scn : combine(e, d.basis, resultsV, "flux");
    const vBas = mode === "V" ? bas : combine(e, d.basis, resultsV, "baseFlux");
    // The 15" baseline map is the late-night sky; in the evening window, scale it by evening/late baseline light.
    const lateBas = params.view_window === "late" ? null
      : combine(e, d.basis, evaluateComponents(e, { ...params, view_window: "late" }, "V"), "baseFlux");
    fields = skyFields(e, d.base15, scn, bas, growthOn ? d.growth30 : null, years, vScn, vBas, lateBas);
  }

  const affected = affectedStates(resultsV);
  const econ = economics(e, affected);
  const affectedAcct = account(affected);
  const county = countyStates(resultsV);
  const allAcct = account(county);

  const vBase = county.reduce((a, s) => a + stockViirs(e, baselineState(e, s.stock, viewWindow(e, params))), 0);
  const vScnV = county.reduce((a, s) => a + stockViirs(e, s), 0);
  const visBase = resultsV.reduce((a, r) => a + (r.comp.kind === "external" ? 0 : r.baseFlux.direct + r.baseFlux.reflected), 0);
  const visScn = resultsV.reduce((a, r) => a + (r.comp.kind === "external" ? 0 : r.flux.direct + r.flux.reflected), 0);
  const viirs = { viirsPct: (vScnV / vBase - 1) * 100, visualPct: (visScn / visBase - 1) * 100 };

  return { e, params, mode, table, results, resultsV, sites, fields, econ, affectedAcct, allAcct, viirs, growthOn, years };
}

export type Model = ReturnType<typeof computeModel>;

export function useModel(): Model {
  const d = useData();
  const params = useStore((s) => s.params);
  const mode = useStore((s) => s.mode);
  return useMemo(() => computeModel(d, params, mode), [d, params, mode]);
}
