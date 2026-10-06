// Public Art Policy Simulator state: the data package, the scenario (code version and policy knobs, economic
// assumptions, proposed works), the view (tab, 3D, date and time, selection), and the share-URL round trip.
import { create } from "zustand";
import type { FeatureCollection, MultiLineString, Point } from "geojson";
import { fetchJson } from "../shared/data";
import { decodeState, encodeState, readHash, shareHref } from "../shared/share";
import { utcToZoned, zonedToUtc } from "../shared/sky";
import { defaultPolicy, type PolicyParams } from "./engine/ledger";
import { defaultEcon, type EconParams } from "./engine/economics";
import type { ArtTypeName, Artwork, Block, Cells, Cip, Meta, Pkg, RoadPiece, Scale } from "./types";

export type Tab = "collection" | "place" | "activity" | "policy" | "conservation" | "equity" | "economics" | "funding" | "staff" | "brief";
export const TABS: Tab[] = ["collection", "place", "activity", "policy", "conservation", "equity", "economics", "funding", "staff", "brief"];
export interface DateParts { y: number; mo: number; d: number }

export interface Proposal {
  id: string; lon: number; lat: number; type: ArtTypeName; scale: Scale; lit: boolean; material: string; bearing: number;
  funding: "pooled" | "onsite" | "private" | "grant"; seating: boolean; title: string;
}

export const SCALE_DIMS: Record<Scale, { figure: [number, number]; other: [number, number]; mural: [number, number] }> = {
  small: { figure: [1.8, 0.8], other: [1.6, 1.2], mural: [3, 3] },
  medium: { figure: [3, 1.2], other: [3.5, 2.5], mural: [6, 6] },
  large: { figure: [6, 2.5], other: [8, 5], mural: [9, 12] },
  landmark: { figure: [14, 5], other: [15, 10], mural: [15, 20] },
};

/** A proposal as an artwork record (dimensions from its type and scale). */
export function proposalArt(p: Proposal): Artwork {
  const d = SCALE_DIMS[p.scale][p.type === "figure" ? "figure" : p.type === "mural" ? "mural" : "other"];
  const [h, w] = p.type === "wall" || p.type === "fence" ? [2.4, { small: 4, medium: 10, large: 25, landmark: 60 }[p.scale]] : d;
  return { id: p.id, lon: p.lon, lat: p.lat, title: p.title, artist: null, year: null, status: "proposed", type: p.type, material: p.material,
    height: h, width: w, bearing: p.bearing, bearing_estimated: false, lit: p.lit, provenance: "proposed", scale: p.scale, seating: p.seating };
}

interface Scenario { policy: PolicyParams; econ: EconParams; proposals: Proposal[]; showPlanned: boolean; localTarget: number }

interface State extends Scenario {
  data: Pkg | null; error: string | null; loading: boolean;
  tab: Tab; show3D: boolean; date: DateParts; minutes: number; selected: string | null; fly: number; placing: boolean;
  template: Omit<Proposal, "id" | "lon" | "lat">; highlightField: string | null;
  load: () => Promise<void>;
  setTab: (t: Tab) => void; setShow3D: (v: boolean) => void; setTime: (date: DateParts, minutes: number) => void;
  select: (id: string | null, fly?: boolean) => void; setPlacing: (v: boolean) => void; setTemplate: (p: Partial<State["template"]>) => void;
  setPolicy: (p: Partial<PolicyParams>) => void; setEcon: (p: Partial<EconParams>) => void; setShowPlanned: (v: boolean) => void;
  setLocalTarget: (v: number) => void;
  addProposal: (lon: number, lat: number) => void; updateProposal: (id: string, p: Partial<Proposal>) => void; removeProposal: (id: string) => void;
  resetScenario: () => void;
}

const today = utcToZoned(Date.now());
const hash = readHash();
const shared = hash.s ? decodeState<Partial<Scenario> & { date?: DateParts; minutes?: number }>(hash.s) : null;

const parseRoads = (j: { classes: string[]; rows: [number, string, number, number, number, [number, number][]][] }): RoadPiece[] =>
  j.rows.map(([cls, name, mph, aadt, fdot, coords]) => ({ cls, name, mph, aadt, fdot: !!fdot, coords }));

export const usePaps = create<State>((set, get) => ({
  data: null, error: null, loading: false,
  tab: (TABS as string[]).includes(hash.tab ?? "") ? (hash.tab as Tab) : "collection",
  show3D: false, date: shared?.date ?? { y: today.y, mo: today.mo, d: today.d }, minutes: shared?.minutes ?? 15 * 60,
  selected: null, fly: 0, placing: false, highlightField: hash.field,
  template: { type: "sculpture", scale: "medium", lit: true, material: "painted_steel", bearing: 180, funding: "pooled", seating: false, title: "Proposed work" },
  policy: null as unknown as PolicyParams, econ: null as unknown as EconParams, proposals: shared?.proposals ?? [], showPlanned: shared?.showPlanned ?? true,
  localTarget: shared?.localTarget ?? 0.15,

  load: async () => {
    if (get().data || get().loading) return;
    set({ loading: true });
    try {
      const [meta, cells, roads, art, cip, cpi, blocks, equity, areas, trails, counters, lights, pois, transit] = await Promise.all([
        fetchJson<Meta>("meta.json"), fetchJson<Cells>("cells.json"), fetchJson<Parameters<typeof parseRoads>[0]>("roads.json"),
        fetchJson<FeatureCollection<Point>>("artworks.geojson"), fetchJson<Cip>("cip.json"), fetchJson<Pkg["cpi"]>("cpi.json"),
        fetchJson<{ rows: [number, number, number, number][] }>("blocks.json"), fetchJson<FeatureCollection>("equity.geojson"),
        fetchJson<FeatureCollection>("areas.geojson"), fetchJson<FeatureCollection<MultiLineString>>("trails.geojson"),
        fetchJson<FeatureCollection<Point>>("counters.geojson"), fetchJson<{ rows: [number, number][] }>("streetlights.json"),
        fetchJson<Pkg["pois"]>("pois.json"), fetchJson<Pkg["transit"]>("transit.json"),
      ]);
      const arts: Artwork[] = art.features.map((f) => ({ ...(f.properties as Artwork), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
      const data: Pkg = { meta, cells, roads: parseRoads(roads), roadClasses: roads.classes, art: arts, cip, cpi, equity, areas, trails, counters,
        blocks: blocks.rows.map(([lon, lat, pop, bg]): Block => ({ lon, lat, pop, bg })), streetlights: lights.rows, pois, transit };
      const seed = meta.seed;
      set({ data, loading: false, policy: { ...defaultPolicy(seed), ...(shared?.policy ?? {}) }, econ: { ...defaultEcon(seed), ...(shared?.econ ?? {}) },
        localTarget: shared?.localTarget ?? seed.policy.local_artist_target.value });
    } catch (e) {
      set({ error: String((e as Error).message ?? e), loading: false });
    }
  },
  setTab: (tab) => set({ tab, placing: tab === "place" ? get().placing : false }),
  setShow3D: (show3D) => set({ show3D }),
  setTime: (date, minutes) => set({ date, minutes }),
  select: (selected, fly = false) => set({ selected, fly: fly ? get().fly + 1 : get().fly }),
  setPlacing: (placing) => set({ placing }),
  setTemplate: (p) => set({ template: { ...get().template, ...p } }),
  setPolicy: (p) => set({ policy: { ...get().policy, ...p } }),
  setEcon: (p) => set({ econ: { ...get().econ, ...p } }),
  setShowPlanned: (showPlanned) => set({ showPlanned }),
  setLocalTarget: (localTarget) => set({ localTarget }),
  addProposal: (lon, lat) => {
    const n = get().proposals.length + 1;
    const p: Proposal = { ...get().template, id: `proposed-${Date.now().toString(36)}`, lon: +lon.toFixed(6), lat: +lat.toFixed(6), title: `Proposed work ${n}` };
    set({ proposals: [...get().proposals, p], selected: p.id });
  },
  updateProposal: (id, p) => set({ proposals: get().proposals.map((q) => (q.id === id ? { ...q, ...p } : q)) }),
  removeProposal: (id) => set({ proposals: get().proposals.filter((q) => q.id !== id), selected: get().selected === id ? null : get().selected }),
  resetScenario: () => {
    const seed = get().data?.meta.seed;
    if (seed) set({ policy: defaultPolicy(seed), econ: defaultEcon(seed), proposals: [], showPlanned: true, localTarget: seed.policy.local_artist_target.value });
  },
}));

export const timeMs = (s: { date: DateParts; minutes: number }) => zonedToUtc(s.date.y, s.date.mo, s.date.d, s.minutes);

const scenarioOf = (s: State) => ({ policy: s.policy, econ: s.econ, proposals: s.proposals, showPlanned: s.showPlanned, localTarget: s.localTarget, date: s.date, minutes: s.minutes });

/** Link to the current scenario, optionally opening a tab and highlighting a field (brief figures link here). */
export const shareUrl = (field?: string, tab?: Tab) => shareHref(encodeState(scenarioOf(usePaps.getState())), field, tab);

if (typeof window !== "undefined") {
  usePaps.subscribe((s, prev) => {
    if (!s.data || !s.policy) return;
    if (s.policy !== prev.policy || s.econ !== prev.econ || s.proposals !== prev.proposals || s.showPlanned !== prev.showPlanned || s.localTarget !== prev.localTarget)
      history.replaceState(null, "", `#s=${encodeState(scenarioOf(s))}`);
  });
}
