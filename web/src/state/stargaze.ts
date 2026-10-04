// Stargaze mode state: use case, selected spot, forecast hour, weather source, and saved spots.
import { create } from "zustand";
import { gridUrl, parseGrid, parsePoint, pointUrls, simGrid, simPoint, type WxGrid, type WxPoint, type WxSource } from "../engine/weather";
import { skyState } from "../shared/sky";
import type { Spot, UseCase } from "../engine/spots";

export type WxOverlay = "clouds" | "score" | "none";
export interface Place { lat: number; lon: number; name?: string }

const TTL = 30 * 60000;
const cache = new Map<string, { at: number; data: unknown }>();
async function getJson(url: string) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

const SAVED_KEY = "dss.savedSpots";
function readSaved(): Place[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]"); } catch { return []; }
}
function writeSaved(p: Place[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(p)); } catch { /* storage unavailable: keep in memory only */ }
}

/** First forecast hour that is astronomically dark at the region center (tonight's observing start). */
function firstDarkHour(times: number[]) {
  const now = Date.now() - 3600000;
  return times.find((t) => t >= now && skyState(t, 29.6, -82.5).sun.alt < -18) ?? times[0];
}

interface State {
  use: UseCase;
  source: WxSource;
  overlay: WxOverlay;
  hour: number | null;
  spot: Place | null;
  fly: number;            // bumps when the map should fly to the spot (list picks, not map clicks)
  spots: Spot[];
  grid: WxGrid | null;
  gridLoading: boolean;
  gridError: string | null;
  point: WxPoint | null;
  pointError: string | null;
  skyOpen: boolean;
  saved: Place[];
  setUse: (u: UseCase) => void;
  setSource: (s: WxSource) => void;
  setOverlay: (o: WxOverlay) => void;
  setHour: (t: number) => void;
  setSpot: (p: Place | null, fly?: boolean) => void;
  setSpots: (s: Spot[]) => void;
  setSkyOpen: (v: boolean) => void;
  saveSpot: (p: Place) => void;
  removeSaved: (i: number) => void;
  loadGrid: () => Promise<void>;
  loadPoint: (p: Place) => Promise<void>;
}

export const useStargaze = create<State>((set, get) => ({
  use: "grabgo", source: "live", overlay: "clouds", hour: null, spot: null, fly: 0, spots: [],
  grid: null, gridLoading: false, gridError: null, point: null, pointError: null, skyOpen: false, saved: readSaved(),
  setUse: (use) => set({ use }),
  setSource: (source) => { set({ source, grid: null, point: null }); get().loadGrid(); const s = get().spot; if (s) get().loadPoint(s); },
  setOverlay: (overlay) => set({ overlay }),
  setHour: (hour) => set({ hour }),
  setSpot: (spot, fly = false) => { set({ spot, point: null, fly: fly ? get().fly + 1 : get().fly }); if (spot) get().loadPoint(spot); },
  setSpots: (spots) => set({ spots }),
  setSkyOpen: (skyOpen) => set({ skyOpen }),
  saveSpot: (p) => { const saved = [...get().saved.filter((s) => s.lat !== p.lat || s.lon !== p.lon), p]; writeSaved(saved); set({ saved }); },
  removeSaved: (i) => { const saved = get().saved.filter((_, k) => k !== i); writeSaved(saved); set({ saved }); },
  loadGrid: async () => {
    if (get().gridLoading) return;
    set({ gridLoading: true, gridError: null });
    let grid: WxGrid;
    if (get().source === "sim") grid = simGrid(Date.now());
    else {
      try { grid = parseGrid(await getJson(gridUrl())); }
      catch (err) { grid = simGrid(Date.now()); set({ gridError: `Live forecast unavailable (${String(err instanceof Error ? err.message : err)}); showing simulated weather.` }); }
    }
    const h = get().hour;
    set({ grid, gridLoading: false, hour: h !== null && h >= grid.times[0] && h <= grid.times[grid.times.length - 1] ? h : firstDarkHour(grid.times) });
  },
  loadPoint: async (p) => {
    set({ pointError: null });
    if (get().source === "sim") { set({ point: simPoint(p.lat, p.lon, Date.now()) }); return; }
    const u = pointUrls(p.lat, p.lon);
    try {
      const fc = await getJson(u.forecast) as never;
      let aq: never | null = null;
      try { aq = await getJson(u.air) as never; } catch { aq = null; }
      if (get().spot === p) set({ point: parsePoint(fc, aq) });
    } catch (err) {
      if (get().spot === p) set({ point: simPoint(p.lat, p.lon, Date.now()), pointError: `Live forecast unavailable (${String(err instanceof Error ? err.message : err)}); showing simulated weather.` });
    }
  },
}));
