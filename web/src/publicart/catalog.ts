// Collection tab scope and the Florida catalog's state (kept apart from the scenario store): the catalog, loaded on
// first use, its search and filters, the map view it counts, the selection and fly requests.
import { create } from "zustand";
import { fetchJson } from "../shared/data";
import type { Bounds } from "./engine/grants";
import type { FloridaPkg } from "./engine/catalog";

interface CatalogState {
  scope: "gainesville" | "florida";
  pkg: FloridaPkg | null; loading: boolean; error: string | null;
  q: string; county: string | null; collection: string | null; budgetOnly: boolean; land: string;
  view: Bounds | null; sel: string | null; flyTo: { lon: number; lat: number; zoom: number; n: number } | null;
  load: () => Promise<void>;
  set: (p: Partial<Pick<CatalogState, "scope" | "q" | "county" | "collection" | "budgetOnly" | "land" | "view" | "sel">>) => void;
  fly: (lon: number, lat: number, zoom: number) => void;
}

export const useCatalog = create<CatalogState>((set, get) => ({
  scope: "gainesville", pkg: null, loading: false, error: null,
  q: "", county: null, collection: null, budgetOnly: false, land: "", view: null, sel: null, flyTo: null,
  load: async () => {
    if (get().pkg || get().loading) return;
    set({ loading: true, error: null });
    try { set({ pkg: await fetchJson<FloridaPkg>("florida.json"), loading: false }); }
    catch (e) { set({ error: String((e as Error).message ?? e), loading: false }); }
  },
  set: (p) => set(p),
  fly: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, n: (get().flyTo?.n ?? 0) + 1 } }),
}));
