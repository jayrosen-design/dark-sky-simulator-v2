import { create } from "zustand";
import { DEFAULT_PARAMS, type ScenarioParams } from "../engine/scenario";
import type { Mode } from "../engine/types";
import type { Weights } from "../engine/mcda";
import { decodeState, encodeState, readHash, shareHref } from "../shared/share";

export type Tab = "scenario" | "sites" | "economics" | "observatory" | "stargaze" | "brief";
export type MapView = "scenario" | "delta" | "baseline" | "fixtures" | "viirs" | "trend";

interface State {
  params: ScenarioParams;
  mode: Mode;
  tab: Tab;
  mapView: MapView;
  focusSite: string | null;
  highlightField: string | null;
  weights: Weights | null;
  viirsYear: number;
  setViirsYear: (y: number) => void;
  showInstalls: boolean;
  setShowInstalls: (v: boolean) => void;
  buildOpen: boolean;
  setBuildOpen: (v: boolean) => void;
  setParams: (patch: Partial<ScenarioParams>) => void;
  replaceParams: (p: ScenarioParams) => void;
  setMode: (m: Mode) => void;
  setTab: (t: Tab) => void;
  setMapView: (v: MapView) => void;
  setFocusSite: (id: string | null) => void;
  setWeights: (w: Weights) => void;
}

// Scenario state lives in the URL hash so any view can be shared and a PDF figure can link back to the
// exact field it came from (C-01).
export const encodeParams = (p: ScenarioParams) => encodeState(p);

export function decodeParams(s: string): ScenarioParams | null {
  const v = decodeState<Partial<ScenarioParams>>(s);
  return v ? { ...DEFAULT_PARAMS, ...v } : null;
}

function fromHash() {
  const h = readHash();
  return { params: h.s ? decodeParams(h.s) : null, field: h.field, tab: h.tab as Tab | null };
}

const initial = typeof location !== "undefined" ? fromHash() : { params: null, field: null, tab: null };

export const useStore = create<State>((set) => ({
  params: initial.params ?? DEFAULT_PARAMS,
  mode: "V",
  // C-01 links: a site figure opens the Sites tab on that site, a money figure opens Costs.
  tab: initial.tab ?? (initial.field?.startsWith("site_metrics.") ? "sites" : initial.field ? "economics" : "scenario"),
  mapView: "scenario",
  focusSite: initial.field?.startsWith("site_metrics.") ? initial.field.slice("site_metrics.".length) : null,
  highlightField: initial.field,
  weights: null,
  viirsYear: 2024,
  setViirsYear: (viirsYear) => set({ viirsYear }),
  showInstalls: true,
  setShowInstalls: (showInstalls) => set({ showInstalls }),
  buildOpen: false,
  setBuildOpen: (buildOpen) => set({ buildOpen }),
  setParams: (patch) => set((s) => ({ params: { ...s.params, ...patch } })),
  replaceParams: (p) => set({ params: p }),
  setMode: (mode) => set({ mode }),
  setTab: (tab) => set({ tab }),
  setMapView: (mapView) => set({ mapView }),
  setFocusSite: (focusSite) => set({ focusSite }),
  setWeights: (weights) => set({ weights }),
}));

export const shareUrl = (p: ScenarioParams, field?: string, tab?: Tab) => shareHref(encodeParams(p), field, tab);

if (typeof window !== "undefined") {
  useStore.subscribe((s, prev) => {
    if (s.params !== prev.params) history.replaceState(null, "", `#s=${encodeParams(s.params)}`);
  });
}
