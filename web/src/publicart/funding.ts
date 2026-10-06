// Funding tab state, kept apart from the scenario store (it is not part of a shared scenario): the grants index,
// loaded on first use, the search and filters, the map view the summaries count, the selection and fly requests.
import { create } from "zustand";
import { fetchJson } from "../shared/data";
import type { Bounds, GrantsPkg, Source } from "./engine/grants";

export type FundingSel = { kind: "item" | "call"; id: string } | null;

interface FundingState {
  pkg: GrantsPkg | null; loading: boolean; error: string | null;
  q: string; sources: Source[]; year: number | null; scope: "view" | "usa";
  view: Bounds | null; sel: FundingSel; flyTo: { lon: number; lat: number; zoom: number; n: number } | null;
  load: () => Promise<void>;
  set: (p: Partial<Pick<FundingState, "q" | "sources" | "year" | "scope" | "view" | "sel">>) => void;
  fly: (lon: number, lat: number, zoom: number) => void;
}

export const useFunding = create<FundingState>((set, get) => ({
  pkg: null, loading: false, error: null,
  q: "", sources: ["NEA", "NEH", "IMLS", "FL"], year: null, scope: "view", view: null, sel: null, flyTo: null,
  load: async () => {
    if (get().pkg || get().loading) return;
    set({ loading: true, error: null });
    try { set({ pkg: await fetchJson<GrantsPkg>("grants.json"), loading: false }); }
    catch (e) { set({ error: String((e as Error).message ?? e), loading: false }); }
  },
  set: (p) => set(p),
  fly: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, n: (get().flyTo?.n ?? 0) + 1 } }),
}));

/** Today in Gainesville as an ISO date (deadlines are local dates). */
export const todayIso = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
