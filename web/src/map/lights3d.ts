// 3D light sources for the map and the Sites ground view: surveyed streetlights at their mapped positions, modeled
// fixtures placed roughly where they are (spread along the mapped roads in their ~450 m cell: streetlights on the
// road, commercial and porch lights set back from it), and sports-field towers at the OSM venues. Colors follow
// the fixture type in the current scenario (a catalog card replaces a slot's fixtures in the selected counties).
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import type { EngineData, GridMeta, SpdCode } from "../engine/types";
import { catalogCard, slotOf, SLOTS, type ScenarioParams, type Slot } from "../engine/scenario";
import { hash01, M_PER_DEG, placeAlong, square, stochasticRound } from "../shared/map/geo";

export const SPD_COLOR: Record<SpdCode, string> = {
  HPS: "#ffab45", MH: "#e6eeff", LED4000: "#dfe9ff", LED3000: "#ffe3b3", LED2700: "#ffd394", PCA590: "#ffb42a", NBA: "#ff9a1f",
};

export interface Look { spd: SpdCode; u: number }
export interface SlotLook { base: Look; card: Look | null; pct: number }

/** Dominant existing fixture type per slot (by fixture count) and the equipped catalog card, if any. */
export function slotLooks(e: EngineData, p: ScenarioParams): Record<Slot, SlotLook> {
  const out = {} as Record<Slot, SlotLook>;
  for (const slot of SLOTS) {
    const w = new Map<string, number>();
    for (const c of e.components) for (const s of c.stocks) {
      if (slotOf(s) !== slot) continue;
      for (const k of s.cohorts) w.set(`${k.spd}|${k.u}`, (w.get(`${k.spd}|${k.u}`) ?? 0) + s.n * k.frac);
    }
    const top = [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LED4000|1";
    const [spd, u] = top.split("|");
    const ch = p.fixtures[slot];
    const card = ch ? catalogCard(e, ch.card) : undefined;
    out[slot] = { base: { spd: spd as SpdCode, u: Number(u) }, card: card ? { spd: card.spd, u: card.u } : null, pct: ch?.pct ?? 0 };
  }
  return out;
}

export interface Lamp { lon: number; lat: number; slot: Slot; modeled: boolean; spd: SpdCode; u: number; height: number; r: number; on: boolean }

const KIND: Record<Slot, { height: number; r: number; half: number }> = {
  street: { height: 9, r: 18, half: 0.35 }, commercial: { height: 6, r: 22, half: 0.3 }, residential: { height: 2.5, r: 7, half: 0.2 }, sports: { height: 24, r: 70, half: 0.8 },
};

/** Pole + glowing head extrusions and ground light pools for a list of lamps. */
export function lampLayers(lamps: Lamp[]): { poles: FeatureCollection<Polygon>; pools: FeatureCollection<Point> } {
  const poles: Feature<Polygon>[] = [], pools: Feature<Point>[] = [];
  for (const l of lamps) {
    const k = KIND[l.slot], color = SPD_COLOR[l.spd];
    if (l.slot !== "residential") poles.push({ type: "Feature", properties: { base: 0, top: l.height - 0.6, color: "#3a3f4a" }, geometry: square(l.lon, l.lat, k.half) });
    poles.push({ type: "Feature", properties: { base: Math.max(0, l.height - 0.6), top: l.height, color: l.on ? color : "#555" }, geometry: square(l.lon, l.lat, k.half * 1.8) });
    // Shielded (U0) fixtures throw a tighter pool; uplight-heavy ones a wider, fainter halo.
    if (l.on) pools.push({ type: "Feature", properties: { color, r: l.r * (l.u === 0 ? 0.85 : 1 + 0.15 * l.u), o: l.u === 0 ? 0.55 : 0.4, modeled: l.modeled }, geometry: { type: "Point", coordinates: [l.lon, l.lat] } });
  }
  return { poles: { type: "FeatureCollection", features: poles }, pools: { type: "FeatureCollection", features: pools } };
}

export interface LightInputs {
  e: EngineData; looks: Record<Slot, SlotLook>; selected: Set<string>;
  surveyed: FeatureCollection | null; venues: FeatureCollection | null; sportsOn: boolean;
  grid: GridMeta; cat: Float32Array[] | null; catNames: string[]; county: Int8Array | null; countyValues: string[];
  roads: [number, number][][];                                      // mapped road polylines from the basemap tiles in view
  focus: [number, number];                                          // viewer position: nearer cells are filled first
  bbox: [number, number, number, number];                           // west, south, east, north
  maxLamps?: number;
}

function lookFor(l: SlotLook, key: number, countySelected: boolean): Look {
  return l.card && countySelected && hash01(key, 3) < l.pct / 100 ? l.card : l.base;
}

/** All lamps inside bbox. */
export function buildLamps(inp: LightInputs): Lamp[] {
  const [w, s, e_, n] = inp.bbox, lamps: Lamp[] = [], max = inp.maxLamps ?? 6000;
  const inBox = (lon: number, lat: number) => lon >= w && lon <= e_ && lat >= s && lat <= n;
  const g = inp.grid;
  const cellOf = (lon: number, lat: number) => {
    const x = Math.floor((lon - g.west) / g.res_deg), y = Math.floor((g.north - lat) / g.res_deg);
    return x < 0 || y < 0 || x >= g.nx || y >= g.ny ? -1 : y * g.nx + x;
  };
  const selectedCell = (i: number) => !!inp.county && i >= 0 && inp.selected.has(inp.countyValues[inp.county[i]]);

  // Surveyed streetlights (mapped positions). They are part of each cell's modeled count, so they are subtracted below.
  const surveyedIn = new Map<number, number>();
  for (const f of inp.surveyed?.features ?? []) {
    const [lon, lat] = (f.geometry as Point).coordinates;
    const i = cellOf(lon, lat);
    if (i >= 0) surveyedIn.set(i, (surveyedIn.get(i) ?? 0) + 1);
    if (!inBox(lon, lat)) continue;
    const key = Math.round(lon * 1e5) ^ Math.round(lat * 1e5);
    const lk = inp.looks.street.card && selectedCell(i) && hash01(key, 3) < inp.looks.street.pct / 100 ? inp.looks.street.card
      : { spd: ((f.properties as { spd_class?: SpdCode })?.spd_class ?? inp.looks.street.base.spd), u: inp.looks.street.base.u };
    lamps.push({ lon, lat, slot: "street", modeled: false, ...lk, height: Math.max(6, Number((f.properties as { pole_height_m?: number })?.pole_height_m) || 9), r: KIND.street.r, on: true });
  }

  // Sports venues: four towers per field at the OSM venue position.
  for (const f of inp.venues?.features ?? []) {
    const [lon, lat] = (f.geometry as Point).coordinates;
    if (!inBox(lon, lat)) continue;
    const pr = f.properties as { county: string; kind: string };
    const key = Math.round(lon * 1e5) ^ Math.round(lat * 1e5);
    const lk = lookFor(inp.looks.sports, key, inp.selected.has(pr.county));
    const off = pr.kind === "court" ? 18 : 55;
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      lamps.push({ lon: lon + (dx * off) / (M_PER_DEG * Math.cos(lat * (Math.PI / 180))), lat: lat + (dy * off * 0.6) / M_PER_DEG, slot: "sports", modeled: false, ...lk,
        height: pr.kind === "court" ? 12 : 24, r: pr.kind === "court" ? 30 : KIND.sports.r, on: inp.sportsOn });
    }
  }

  if (!inp.cat || !inp.county) return lamps;
  const layer = (slot: Slot) => inp.cat![inp.catNames.indexOf(slot)];
  // Modeled fixtures: each cell's expected counts go on the mapped roads inside that cell: streetlights on the road,
  // business and porch lights set back from it on alternating sides (homes and shops face their streets). Cells are
  // filled nearest-first so the lamp budget drops distant lights, not the ones in front of the viewer.
  const byCell = new Map<number, [number, number][][]>();
  for (const line of inp.roads) for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k], b = line[k + 1], i = cellOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    if (i < 0 || !inBox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
    (byCell.get(i) ?? byCell.set(i, []).get(i)!).push([a, b]);
  }
  const [fx, fy] = inp.focus;
  const cells = [...byCell.entries()].map(([i, segs]) => {
    const x = i % g.nx, y = Math.floor(i / g.nx);
    return { i, segs, d: Math.hypot(g.west + (x + 0.5) * g.res_deg - fx, g.north - (y + 0.5) * g.res_deg - fy) };
  }).sort((a, b) => a.d - b.d);
  const setback = (pt: [number, number], seg: [number, number][], meters: number): [number, number] => {
    const k = Math.cos(pt[1] * (Math.PI / 180)), dx = (seg[1][0] - seg[0][0]) * k, dy = seg[1][1] - seg[0][1], len = Math.hypot(dx, dy) || 1;
    return [pt[0] + ((-dy / len) * meters) / (M_PER_DEG * k), pt[1] + ((dx / len) * meters) / M_PER_DEG];
  };
  const street = layer("street"), comm = layer("commercial"), res = layer("residential");
  for (const { i, segs } of cells) {
    if (lamps.length >= max) break;
    const sel = selectedCell(i);
    const nStreet = Math.min(200, Math.max(0, stochasticRound(street[i] || 0, i) - (surveyedIn.get(i) ?? 0)));
    placeAlong(segs, nStreet).forEach(([lon, lat], k) => {
      lamps.push({ lon, lat, slot: "street", modeled: true, ...lookFor(inp.looks.street, i * 1000 + k, sel), height: 9, r: KIND.street.r, on: true });
    });
    for (const [slot, L, cap, dist] of [["commercial", comm, 60, 28], ["residential", res, 150, 16]] as const) {
      const n = Math.min(cap, stochasticRound(L[i] || 0, i + (slot === "commercial" ? 17 : 29)));
      placeAlong(segs, n).forEach((pt, k) => {
        const key = i * 1000 + k + (slot === "commercial" ? 400 : 700);
        const seg = segs[Math.min(segs.length - 1, Math.floor((k + 0.5) / n * segs.length))];
        const [lon, lat] = setback(pt, seg, (hash01(key, 5) < 0.5 ? 1 : -1) * dist * (0.8 + 0.4 * hash01(key, 9)));
        lamps.push({ lon, lat, slot, modeled: true, ...lookFor(inp.looks[slot], key, sel), height: KIND[slot].height, r: KIND[slot].r, on: true });
      });
    }
  }
  return lamps.slice(0, max);
}
