// Buildings tab state (and the collection's "show public buildings" overlay), kept apart from the scenario store:
// the facilities package, loaded on first use, its filters, the map view it counts, the selection and fly requests.
import { create } from "zustand";
import { fetchJson } from "../shared/data";
import type { Bounds } from "./engine/grants";
import type { FacClass, FacilitiesPkg } from "./engine/facilities";

interface BuildingsState {
  pkg: FacilitiesPkg | null; loading: boolean; error: string | null;
  q: string; classes: FacClass[]; since: number | null; overlay: boolean;
  view: Bounds | null; sel: string | null; flyTo: { lon: number; lat: number; zoom: number; n: number } | null;
  load: () => Promise<void>;
  set: (p: Partial<Pick<BuildingsState, "q" | "classes" | "since" | "overlay" | "view" | "sel">>) => void;
  fly: (lon: number, lat: number, zoom: number) => void;
}

export const useBuildings = create<BuildingsState>((set, get) => ({
  pkg: null, loading: false, error: null,
  q: "", classes: ["state", "county", "city", "school", "federal", "district"], since: null, overlay: false, view: null, sel: null, flyTo: null,
  load: async () => {
    if (get().pkg || get().loading) return;
    set({ loading: true, error: null });
    try { set({ pkg: await fetchJson<FacilitiesPkg>("facilities.json"), loading: false }); }
    catch (e) { set({ error: String((e as Error).message ?? e), loading: false }); }
  },
  set: (p) => set(p),
  fly: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, n: (get().flyTo?.n ?? 0) + 1 } }),
}));
