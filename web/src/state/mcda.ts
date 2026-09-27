import { create } from "zustand";
import type { EngineData } from "../engine/types";
import { cellAt, normalizeAll, percentile, rankSites, scorecard, wlc, type Candidate, type Criterion, type LandParcel, type McdaData, type ScoreLine, type Weights } from "../engine/mcda";
import { fetchJson, loadInt8, loadLin16 } from "../data/load";

export interface RefRow { id: string; name: string; score: number; pct: number; mag2024: number; mag2034: number; scorecard: ScoreLine[]; cell: number }

interface McdaState {
  data: McdaData | null;
  norm: Record<Criterion, Float32Array> | null;
  score: Float32Array | null;
  candidates: Candidate[];
  refs: RefRow[];
  parcels: LandParcel[] | null;
  loading: boolean;
  acres: number | null;   // target site size for land estimates (null = seed default)
  setAcres: (acres: number) => void;
  load: (e: EngineData) => Promise<void>;
  recompute: (e: EngineData, w: Weights) => void;
}

export const useMcda = create<McdaState>((set, get) => ({
  data: null, norm: null, score: null, candidates: [], refs: [], parcels: null, loading: false, acres: null,
  setAcres: (acres) => set({ acres }),
  load: async (e) => {
    if (get().data || get().loading) return;
    set({ loading: true });
    const [layers, county, parcels] = await Promise.all([loadLin16(e.files.mcda_b), loadInt8(e.files.mcda_b_county.file),
      e.land ? fetchJson<LandParcel[]>(e.land.parcels_file) : Promise.resolve(null)]);
    const names = e.files.mcda_b.names ?? [];
    const raw = Object.fromEntries(names.map((n, i) => [n, layers[i]]));
    const data: McdaData = { grid: e.grids.b, raw, county, countyFips: e.files.mcda_b_county.values };
    set({ data, norm: normalizeAll(e, data), parcels, loading: false });
  },
  recompute: (e, w) => {
    const { data, norm } = get();
    if (!data || !norm) return;
    const score = wlc(norm, w);
    const candidates = rankSites(e, data, norm, score, w);
    const refs = e.sites.filter((s) => s.reference).map((s) => {
      const i = cellAt(data.grid, s.lon, s.lat);
      return { id: s.id, name: s.name, score: score[i], pct: percentile(score, score[i]), mag2024: data.raw.sky[i], mag2034: data.raw.mag_2034[i], scorecard: scorecard(data, norm, w, i), cell: i };
    });
    set({ score, candidates, refs });
  },
}));
