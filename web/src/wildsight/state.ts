// WildSight planner state: data package (/wildsight/data), deployment parameters and the derived deployment.
import { create } from "zustand";
import type { FeatureCollection } from "geojson";
import { fetchJson } from "../shared/data";
import { candidates, coverageCurve, defaultParams, deploy, parseRoads, selectSegments, type DeployParams, type Deployment, type Segment, type WsMeta } from "./engine";

export interface CrashPoint { lon: number; lat: number; year: number; group: number; on: boolean }
export interface TrafficLayers { risk: boolean; crashes: boolean; hotspots: boolean; units: boolean }

interface Derived { cand: Segment[]; sel: Segment[]; dep: Deployment; curve: { miles: number; share: number }[]; candMiles: number }

interface TrafficState {
  meta: WsMeta | null; segs: Segment[] | null; crashes: CrashPoint[] | null; hotspots: FeatureCollection | null;
  loading: boolean; error: string | null;
  p: DeployParams | null; derived: Derived | null;
  selected: number | null; fly: number;
  layers: TrafficLayers;
  load: () => Promise<void>;
  setP: (patch: Partial<DeployParams>) => void;
  resetP: () => void;
  select: (id: number | null, fly?: boolean) => void;
  setLayers: (patch: Partial<TrafficLayers>) => void;
}

function derive(segs: Segment[], p: DeployParams): Derived {
  const cand = candidates(segs, p);
  const sel = selectSegments(segs, p);
  const networkRisk = cand.reduce((a, s) => a + s.eb, 0);
  return { cand, sel, dep: deploy(sel, p, networkRisk), curve: coverageCurve(cand), candMiles: cand.reduce((a, s) => a + s.km, 0) / 1.609344 };
}

export const useTraffic = create<TrafficState>((set, get) => ({
  meta: null, segs: null, crashes: null, hotspots: null, loading: false, error: null, p: null, derived: null,
  selected: null, fly: 0, layers: { risk: true, crashes: false, hotspots: true, units: true },
  load: async () => {
    if (get().meta || get().loading) return;
    set({ loading: true });
    try {
      const [meta, roads, crashes, hotspots] = await Promise.all([
        fetchJson<WsMeta>("meta.json"), fetchJson<{ cols: string[]; rows: unknown[][] }>("roads.json"),
        fetchJson<{ cols: string[]; rows: number[][] }>("crashes.json"), fetchJson<FeatureCollection>("hotspots.geojson"),
      ]);
      const segs = parseRoads(roads, Object.keys(meta.counties), meta.classes);
      const p = defaultParams(meta);
      set({ meta, segs, hotspots, p, derived: derive(segs, p), loading: false,
        crashes: crashes.rows.map(([lon, lat, year, group, on]) => ({ lon, lat, year, group, on: on === 1 })) });
    } catch (err) {
      set({ loading: false, error: String(err instanceof Error ? err.message : err) });
    }
  },
  setP: (patch) => {
    const { p, segs } = get();
    if (!p || !segs) return;
    const next = { ...p, ...patch };
    set({ p: next, derived: derive(segs, next) });
  },
  resetP: () => { const { meta, segs } = get(); if (meta && segs) { const p = defaultParams(meta); set({ p, derived: derive(segs, p) }); } },
  select: (selected, fly = false) => set({ selected, fly: fly ? get().fly + 1 : get().fly }),
  setLayers: (patch) => set({ layers: { ...get().layers, ...patch } }),
}));
