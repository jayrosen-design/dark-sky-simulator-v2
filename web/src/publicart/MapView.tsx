// Public Art map on the shared dark basemap: artworks as provenance-coloured markers (by condition on the
// Conservation tab), proposals placed by clicking, a visibility heatmap (Place), moving people and vehicles and the
// City's counters (Activity), income shading, half-mile rings and suggested places (Equity), 500 ft rings
// (Economics). In 3D: extruded buildings (shared terrain3d, flat ground) and the Three.js art layer lit by the Sun
// for the chosen date and time, with murals snapped onto the facade of the building they are painted on.
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import { BASEMAP_STYLE, maplibregl, metersToPx } from "../shared/map/maplibre";
import { enableTrackpadNav } from "../shared/map/navigation";
import { add3DLayers, set3D } from "../shared/map/terrain3d";
import CameraPad from "../shared/map/CameraPad";
import { skyState } from "../shared/sky";
import { Crowd } from "./agents";
import { ArtLayer, type PlacedArt } from "./map/ArtLayer";
import { ACCENT, GNV_BOUNDS, GNV_CENTER, PROVENANCE_COLOR } from "./constants";
import { contextOf, type Model } from "./model";
import type { Suggestion } from "./engine/equity";
import { isOutdoor } from "./engine/impressions";
import { timeMs, usePaps } from "./state";
import type { Artwork, Cells } from "./types";
import KpiHud from "./KpiHud";
import TimeBar from "./TimeBar";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const MURAL_COLORS = ["#d0485a", "#3a7bd5", "#e8962c", "#5fd6c4", "#b07cff", "#8fe38f"];

function heatCanvas(c: Cells) {
  const { nx, ny } = c.grid, cv = document.createElement("canvas");
  cv.width = nx; cv.height = ny;
  const g = cv.getContext("2d")!, img = g.createImageData(nx, ny), C = c.cols;
  const vals = C.veh_ref.map((v, i) => v + C.ped_ref[i]);
  const max = Math.log1p(Math.max(...vals));
  const ramp = [[20, 30, 70], [70, 60, 160], [183, 156, 255], [255, 220, 150], [255, 255, 240]];
  vals.forEach((v, i) => {
    const t = Math.log1p(v) / max;
    if (t < 0.2) return;
    const u = Math.min(0.999, (t - 0.2) / 0.8) * (ramp.length - 1), k = Math.floor(u), f = u - k;
    for (let j = 0; j < 3; j++) img.data[i * 4 + j] = ramp[k][j] + (ramp[k + 1][j] - ramp[k][j]) * f;
    img.data[i * 4 + 3] = Math.round(70 + 150 * u / (ramp.length - 1));
  });
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

const conditionColor = (c: number) => (c >= 80 ? "#8fe38f" : c >= 70 ? "#e3c34a" : c >= 60 ? "#f08a3c" : "#e0453a");

/** Put a mural on the nearest building wall (within 30 m) from the basemap footprints, facing out of the building;
 *  an address geocode lands on the street centreline, not on the wall. A bearing from the registry is kept. */
function snapToFacade(map: maplibregl.Map, a: Artwork): { lon: number; lat: number; bearing: number } {
  const keep = { lon: a.lon, lat: a.lat, bearing: a.bearing };
  if (a.type !== "mural") return keep;
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180), ky = 111320;
  const m = (lon: number, lat: number): [number, number] => [(lon - a.lon) * kx, (lat - a.lat) * ky];
  let best: { d: number; px: number; py: number; nx: number; ny: number } | null = null;
  try {
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "building" })) {
      const g = f.geometry;
      const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
      for (const r of rings) {
        const pts = (r as number[][]).map(([x, y]) => m(x, y));
        if (!pts.some(([x, y]) => Math.abs(x) < 60 && Math.abs(y) < 60)) continue;
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        for (let i = 0; i + 1 < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L2 = (bx - ax) ** 2 + (by - ay) ** 2;
          if (L2 < 4) continue;                                            // skip slivers under 2 m
          const t = Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / L2));
          const px = ax + t * (bx - ax), py = ay + t * (by - ay), d = Math.hypot(px, py);
          let nx = -(by - ay), ny = bx - ax; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
          if ((px - cx) * nx + (py - cy) * ny < 0) { nx = -nx; ny = -ny; }   // outward normal
          if (d <= 30 && (!best || d < best.d)) best = { d, px, py, nx, ny };
        }
      }
    }
  } catch { return keep; }
  if (!best) return keep;
  const bearing = a.bearing_estimated === false ? a.bearing : ((Math.atan2(best.nx, best.ny) * 180) / Math.PI + 360) % 360;
  return { lon: a.lon + (best.px + best.nx * 0.4) / kx, lat: a.lat + (best.py + best.ny * 0.4) / ky, bearing };
}

export default function MapView({ m, agents, suggestions }: { m: Model | null; agents: boolean; suggestions: Suggestion[] }) {
  const { show3D, setShow3D, tab, selected, fly, placing } = usePaps();
  const minutes = usePaps((s) => s.minutes);
  const time = usePaps(timeMs);
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const artRef = useRef<ArtLayer | null>(null);
  const [ready, setReady] = useState(false);
  const [snapTick, setSnapTick] = useState(0);

  useEffect(() => {
    setReady(false);
    const map = new maplibregl.Map({ container: ref.current!, style: BASEMAP_STYLE, bounds: GNV_BOUNDS, fitBoundsOptions: { padding: 10 },
      attributionControl: { compact: true }, maxPitch: 75, canvasContextAttributes: { antialias: true } });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const offNav = enableTrackpadNav(map, 75);
    map.on("load", () => {
      const firstSymbol = map.getStyle().layers.find((l: { type: string }) => l.type === "symbol")?.id;
      add3DLayers(map, firstSymbol);
      const add = (id: string) => map.addSource(id, { type: "geojson", data: EMPTY });
      add("equity");
      map.addLayer({ id: "equity-fill", type: "fill", source: "equity", layout: { visibility: "none" },
        paint: { "fill-color": ["case", ["==", ["get", "mhi"], null], "#2a3a60", ["interpolate", ["linear"], ["get", "mhi"], 15000, "#7a2e5c", 45000, "#3a3a7a", 90000, "#1a3a4a"]],
          "fill-opacity": 0.45 } }, firstSymbol);
      map.addLayer({ id: "equity-low", type: "line", source: "equity", layout: { visibility: "none" }, filter: ["==", ["get", "low_income"], true],
        paint: { "line-color": "#f08ab8", "line-width": 1, "line-opacity": 0.7 } }, firstSymbol);
      add("areas");
      map.addLayer({ id: "areas-line", type: "line", source: "areas", paint: {
        "line-color": ["match", ["get", "kind"], "city", "#d9d2bd", "east", "#f6b44b", "gcra", "#5fd6c4", "#5fd6c4"],
        "line-opacity": ["match", ["get", "kind"], "city", 0.35, "priority", 0.35, 0.8], "line-width": ["match", ["get", "kind"], "priority", 0.8, 1.4],
        "line-dasharray": ["match", ["get", "kind"], "gcra", ["literal", [3, 2]], ["literal", [1, 0]]] } }, firstSymbol);
      add("rings");
      map.addLayer({ id: "rings", type: "circle", source: "rings", layout: { visibility: "none" }, paint: { "circle-radius": metersToPx("r") as never,
        "circle-color": "rgba(183,156,255,0.04)", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1, "circle-stroke-opacity": 0.5, "circle-pitch-alignment": "map" } });
      add("counters");
      map.addLayer({ id: "counters", type: "circle", source: "counters", layout: { visibility: "none" },
        paint: { "circle-radius": 6, "circle-color": "#05070d", "circle-stroke-color": "#5fd6c4", "circle-stroke-width": 2 } });
      map.addLayer({ id: "counters-label", type: "symbol", source: "counters", layout: { visibility: "none", "text-field": ["concat", ["to-string", ["get", "daily"]], "/day"],
        "text-size": 10, "text-offset": [0, 1.2], "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#5fd6c4", "text-halo-color": "#05070d", "text-halo-width": 1.2 } });
      add("crowd");
      map.addLayer({ id: "crowd", type: "circle", source: "crowd", layout: { visibility: "none" }, paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 17, 3.2], "circle-color": ["case", ["==", ["get", "k"], 0], "#f6b44b", "#5fd6c4"],
        "circle-opacity": ["case", ["get", "seen"], 1, 0.55], "circle-stroke-color": "#ffffff", "circle-stroke-width": ["case", ["get", "seen"], 1, 0] } });
      add("sugs");
      map.addLayer({ id: "sugs", type: "circle", source: "sugs", layout: { visibility: "none" }, paint: { "circle-radius": 9, "circle-color": "rgba(183,156,255,0.25)",
        "circle-stroke-color": ACCENT, "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "sugs-label", type: "symbol", source: "sugs", layout: { visibility: "none", "text-field": ["get", "n"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#ffffff" } });
      add("art");
      map.addLayer({ id: "art-halo", type: "circle", source: "art",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 14], "circle-color": ["get", "color"], "circle-opacity": 0.18, "circle-blur": 0.6 } });
      map.addLayer({ id: "art", type: "circle", source: "art",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "proposed"], 5, ["get", "indoor"], 2.2, 3.5], 16, ["case", ["get", "proposed"], 9, ["get", "indoor"], 4.5, 7]],
          "circle-color": ["case", ["get", "planned"], "#05070d", ["get", "color"]], "circle-opacity": ["case", ["get", "indoor"], 0.6, 1], "circle-stroke-color": ["case", ["get", "sel"], "#ffffff", ["get", "planned"], ["get", "color"], "#05070d"],
          "circle-stroke-width": ["case", ["get", "sel"], 2.5, ["get", "planned"], 2, 1.2] } });
      map.on("click", "art", (ev: MapLayerMouseEvent) => {
        if (usePaps.getState().placing) return;
        const id = ev.features?.[0]?.properties?.id;
        if (id) usePaps.getState().select(String(id));
      });
      map.on("mouseenter", "art", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "art", () => { map.getCanvas().style.cursor = usePaps.getState().placing ? "crosshair" : ""; });
      map.on("click", (ev: MapMouseEvent) => { const s = usePaps.getState(); if (s.placing) s.addProposal(ev.lngLat.lng, ev.lngLat.lat); });
      map.on("idle", () => setSnapTick((n) => n + 1));
      const art = new ArtLayer();
      map.addLayer(art);
      artRef.current = art;
      mapRef.current = map;
      if (import.meta.env.DEV) Object.assign(window, { __paps: { map, art } });   // dev builds only: handle for automated checks
      setReady(true);
    });
    return () => { offNav(); mapRef.current = null; artRef.current = null; map.remove(); };
  }, []);

  // Static layers once the data has loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !m) return;
    (map.getSource("areas") as GeoJSONSource).setData(m.data.areas);
    (map.getSource("equity") as GeoJSONSource).setData(m.data.equity);
    (map.getSource("counters") as GeoJSONSource).setData(m.data.counters);
    if (!map.getSource("heat")) {
      const g = m.data.cells.grid, east = g.west + (g.nx * g.res_m) / g.kx, north = g.south + (g.ny * g.res_m) / g.ky;
      map.addSource("heat", { type: "image", url: heatCanvas(m.data.cells), coordinates: [[g.west, north], [east, north], [east, g.south], [g.west, g.south]] });
      map.addLayer({ id: "heat", type: "raster", source: "heat", layout: { visibility: "none" }, paint: { "raster-opacity": 0.8, "raster-resampling": "linear" } }, "areas-line");
    }
  }, [ready, m?.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Artwork markers and 3D meshes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !m) return;
    const cond = new Map(m.cons.conds.map((c) => [c.id, c.path[c.path.length - 1] ?? 100]));
    const color = (a: Artwork) => (tab === "conservation" ? (cond.has(a.id) ? conditionColor(cond.get(a.id)!) : "#3a3f4a") : PROVENANCE_COLOR[a.provenance] ?? "#d9d2bd");
    (map.getSource("art") as GeoJSONSource).setData({ type: "FeatureCollection", features: m.arts.map((a): Feature<Point> => ({ type: "Feature",
      properties: { id: a.id, color: color(a), planned: a.status === "planned", proposed: a.status === "proposed", indoor: !isOutdoor(a), sel: a.id === selected },
      geometry: { type: "Point", coordinates: [a.lon, a.lat] } })) });
    const ringFor = (a: Artwork, r: number, c: string): Feature<Point> => ({ type: "Feature", properties: { r, color: c }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } });
    const rings = tab === "equity" ? m.arts.map((a) => ringFor(a, m.data.meta.seed.equity.walk_radius_m.value, a.status === "proposed" ? ACCENT : "#d9d2bd"))
      : tab === "economics" ? m.proposals.map((a) => ringFor(a, 152.4, ACCENT))
      : tab === "place" || tab === "activity" ? m.arts.filter((a) => a.id === selected).map((a) => ringFor(a, m.imp.get(a.id)?.radius ?? 60, ACCENT)) : [];
    (map.getSource("rings") as GeoJSONSource).setData({ type: "FeatureCollection", features: rings });
  }, [ready, m, tab, selected]);

  useEffect(() => {
    const map = mapRef.current, art = artRef.current;
    if (!ready || !map || !art || !m) return;
    const placed: PlacedArt[] = m.arts.filter(isOutdoor).map((a, i) => {
      const { lon, lat, bearing } = show3D ? snapToFacade(map, a) : a;
      return { id: a.id, lon, lat, type: a.type, material: (a.material as PlacedArt["material"]) ?? "steel", height: a.height, width: a.width, bearing,
        color: a.type === "mural" ? MURAL_COLORS[i % MURAL_COLORS.length] : a.provenance === "proposed" ? ACCENT : PROVENANCE_COLOR[a.provenance] ?? "#d9d2bd",
        lit: a.lit, proposed: a.status === "proposed" };
    });
    const key = JSON.stringify(placed.map((p) => [p.id, p.lon.toFixed(6), p.lat.toFixed(6), p.type, p.height, p.lit, p.bearing]));
    if ((art as unknown as { _key?: string })._key !== key) { (art as unknown as { _key?: string })._key = key; art.setArtworks(placed); }
  }, [ready, m, show3D, snapTick]);

  // Layer visibility by tab.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("heat", tab === "place");
    vis("equity-fill", tab === "equity"); vis("equity-low", tab === "equity");
    vis("rings", ["equity", "economics", "place", "activity"].includes(tab));
    vis("counters", tab === "activity"); vis("counters-label", tab === "activity");
    vis("crowd", tab === "activity" && agents);
    vis("sugs", tab === "equity"); vis("sugs-label", tab === "equity");
    map.getCanvas().style.cursor = placing ? "crosshair" : "";
  }, [ready, tab, agents, placing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("sugs") as GeoJSONSource).setData({ type: "FeatureCollection", features: suggestions.map((s, i) => ({ type: "Feature",
      properties: { n: String(i + 1) }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })) });
  }, [ready, suggestions]);

  // 3D on/off and Sun lighting.
  useEffect(() => {
    const map = mapRef.current, art = artRef.current;
    if (!ready || !map || !art) return;
    set3D(map, show3D, 1, false);
    art.visible = show3D;
    // In 3D the markers become thin rings lying on the ground around each work, so they don't hide it.
    map.setLayoutProperty("art-halo", "visibility", show3D ? "none" : "visible");
    map.setPaintProperty("art", "circle-pitch-alignment", show3D ? "map" : "viewport");
    map.setPaintProperty("art", "circle-opacity", show3D ? 0 : ["case", ["get", "indoor"], 0.6, 1]);
    map.setPaintProperty("art", "circle-stroke-color", show3D ? ["get", "color"] : ["case", ["get", "sel"], "#ffffff", ["get", "planned"], ["get", "color"], "#05070d"]);
    map.setPaintProperty("art", "circle-radius", show3D ? ["interpolate", ["exponential", 2], ["zoom"], 15, ["case", ["get", "indoor"], 2, 4], 21, ["case", ["get", "indoor"], 30, 120]]
      : ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "proposed"], 5, ["get", "indoor"], 2.2, 3.5], 16, ["case", ["get", "proposed"], 9, ["get", "indoor"], 4.5, 7]]);
    const a = m?.arts.find((x) => x.id === selected);
    if (show3D) map.easeTo({ center: a ? [a.lon, a.lat] : map.getZoom() < 14 ? GNV_CENTER : map.getCenter(), zoom: Math.max(map.getZoom(), a ? 18.8 : 16.5), pitch: 62, duration: 900 });
    else map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    map.triggerRepaint();
  }, [ready, show3D]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !artRef.current) return;
    const st = skyState(time, GNV_CENTER[1], GNV_CENTER[0]);
    artRef.current.setLighting({ sunAlt: st.sun.alt, sunAz: st.sun.az });
  }, [ready, time]);

  // Fly to a selected work.
  useEffect(() => {
    const map = mapRef.current;
    const a = m?.arts.find((x) => x.id === selected);
    if (!ready || !map || !a || !fly) return;
    map.easeTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), show3D ? 18.8 : 15.5), duration: 800 });
  }, [ready, fly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Moving people and vehicles (Activity tab).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !m || tab !== "activity" || !agents) return;
    const { ctx } = contextOf(m.data);
    const crowd = new Crowd(ctx.roads, m.data.cells, m.data.meta.seed);
    const f = ctx.roads.f;
    const artXY = m.arts.map((a) => [(a.lon - f.west) * f.kx, (a.lat - f.south) * f.ky, m.imp.get(a.id)?.radius ?? 60] as const);
    const reset = () => {
      const c = map.getCenter(), b = map.getBounds();
      const r = Math.min(1500, ((b.getEast() - b.getWest()) * f.kx) / 2);
      crowd.reset((c.lng - f.west) * f.kx, (c.lat - f.south) * f.ky, r, Math.floor(usePaps.getState().minutes / 60) % 24);
    };
    reset();
    map.on("moveend", reset);
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t; acc += dt;
      if (acc >= 1 / 30) {
        const pos = crowd.step(acc); acc = 0;
        (map.getSource("crowd") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: pos.map(([x, y, k]) => ({ type: "Feature",
          properties: { k, seen: artXY.some(([ax, ay, r]) => Math.abs(ax - x) < r && Math.hypot(ax - x, ay - y) < r) },
          geometry: { type: "Point", coordinates: [f.west + x / f.kx, f.south + y / f.ky] } })) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); map.off("moveend", reset); (map.getSource("crowd") as GeoJSONSource | undefined)?.setData(EMPTY); };
  }, [ready, m?.data, m?.arts, tab, agents, Math.floor(minutes / 60)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" role="application" aria-label="Map of public art in Gainesville" />
      <div className="absolute left-2 top-2 flex gap-1">
        <button onClick={() => setShow3D(!show3D)} aria-pressed={show3D} title="3D buildings and artworks lit by the Sun"
          className={`rounded border px-2 py-1 text-xs font-semibold ${show3D ? "border-[#b79cff] bg-[#b79cff]/20 text-[#b79cff]" : "border-ink-600 bg-ink-950/85 text-star-300 hover:bg-ink-800"}`}>3D</button>
      </div>
      {m && <div className="absolute right-12 top-2 w-[440px] max-w-[70%]"><KpiHud m={m} /></div>}
      {!m && <div className="absolute left-14 top-2 rounded bg-ink-900/90 px-2 py-1 text-[11px] text-star-300">Loading the art registry and city data…</div>}
      {ready && show3D && <CameraPad map={mapRef.current} maxPitch={75} resetPitch={62} />}
      <div className="pointer-events-none absolute bottom-6 left-1/2 w-[min(560px,70%)] -translate-x-1/2"><TimeBar /></div>
      <Legend tab={tab} agents={agents} />
    </div>
  );
}

function Legend({ tab, agents }: { tab: string; agents: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-28 left-2 max-w-[240px] rounded-lg bg-ink-950/80 p-2 text-[10px] text-star-300 backdrop-blur">
      {tab === "conservation" ? <div>Condition at the end: <span className="text-[#8fe38f]">●</span> good <span className="text-[#e3c34a]">●</span> fair <span className="text-[#f08a3c]">●</span> poor <span className="text-[#e0453a]">●</span> needs work</div>
        : <div className="flex flex-wrap gap-x-2">{Object.entries({ municipal: "City", county: "County", cra: "CRA", uf: "UF", private: "Private", partner: "Partner/other", proposed: "Proposed" }).map(([k, l]) =>
          <span key={k}><span style={{ color: PROVENANCE_COLOR[k] }}>●</span> {l}</span>)}<span>○ planned</span><span>· small: indoors</span></div>}
      {tab === "place" && <div className="mt-1">Heatmap: daily impressions a medium sculpture would get (low → <span className="text-[#ffdc96]">high</span>)</div>}
      {tab === "equity" && <div className="mt-1">Shading: median household income (darker purple = lower); <span className="text-[#f08ab8]">pink edge</span> low-income; rings ½ mile;
        <span className="text-amber-400"> East Gainesville</span>; <span className="text-[#5fd6c4]">GCRA</span> dashed</div>}
      {tab === "activity" && <div className="mt-1">{agents ? <><span className="text-amber-400">●</span> vehicles <span className="text-[#5fd6c4]">●</span> people (illustrative) · </> : null}○ City counters (people/day)</div>}
    </div>
  );
}
