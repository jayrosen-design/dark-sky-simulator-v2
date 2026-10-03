// WildSight map: crash-risk roads, deployed corridors with units and gateways, UF hotspots, crash reports.
// Built on the shared mapping core (src/shared/map): MapLibre setup, basemap, trackpad navigation, camera buttons.
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { BASEMAP_STYLE, maplibregl, metersToPx } from "../shared/map/maplibre";
import { enableTrackpadNav } from "../shared/map/navigation";
import CameraPad from "../shared/map/CameraPad";
import { fetchJson } from "../shared/data";
import { useTraffic } from "./state";
import { gatewayPoints, unitPoints } from "./engine";

const EMPTY = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });
// The eight-county map range (shared region manifest, counties/region: module_a grid).
const BOUNDS: [[number, number], [number, number]] = [[-83.4, 28.9], [-81.4, 30.25]];
const GROUP_COLOR = ["#c78d52", "#b07cff", "#8fe38f", "#7cc4ff", "#f08ab8", "#a79f88"];

export default function MapView() {
  const tf = useTraffic();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { tf.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReady(false); // a remount or hot reload builds a new map: the data effects must run again once it loads
    const map = new maplibregl.Map({ container: ref.current!, style: BASEMAP_STYLE, bounds: BOUNDS, fitBoundsOptions: { padding: 10 },
      attributionControl: { compact: true }, maxPitch: 60 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const offNav = enableTrackpadNav(map, 60);
    map.on("load", async () => {
      const firstSymbol = map.getStyle().layers.find((l: { type: string }) => l.type === "symbol")?.id;
      const add = (id: string) => map.addSource(id, { type: "geojson", data: EMPTY() });
      add("counties");
      map.addLayer({ id: "counties", type: "line", source: "counties", paint: { "line-color": "#d9d2bd", "line-opacity": 0.45, "line-width": 1 } }, firstSymbol);
      add("ws-hot");
      map.addLayer({ id: "ws-hot", type: "fill", source: "ws-hot", paint: { "fill-color": ["match", ["get", "tier"], 3, "#ff5a4f", 2, "#ff9a3c", "#ffd84a"], "fill-opacity": 0.16 } }, firstSymbol);
      map.addLayer({ id: "ws-hot-line", type: "line", source: "ws-hot", paint: { "line-color": ["match", ["get", "tier"], 3, "#ff5a4f", 2, "#ff9a3c", "#ffd84a"], "line-width": 1, "line-opacity": 0.6 } }, firstSymbol);
      add("ws-roads");
      map.addLayer({ id: "ws-roads-case", type: "line", source: "ws-roads", layout: { "line-cap": "round" },
        paint: { "line-color": "#f6b44b", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 13, 10],
          "line-opacity": ["case", ["boolean", ["feature-state", "dep"], false], 0.85, 0] } }, firstSymbol);
      map.addLayer({ id: "ws-roads", type: "line", source: "ws-roads", layout: { "line-cap": "round" },
        paint: { "line-color": ["interpolate", ["linear"], ["get", "risk"], 0, "#2b3552", 0.1, "#4a6fa5", 0.3, "#e3c34a", 0.7, "#f08a3c", 1.5, "#e0453a"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, ["match", ["get", "cls"], [0, 1], 1.6, 1.1], 13, ["match", ["get", "cls"], [0, 1], 5, 3.5]],
          "line-opacity": 0.9 } }, firstSymbol);
      add("ws-sel");
      map.addLayer({ id: "ws-sel", type: "line", source: "ws-sel", layout: { "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 9], "line-opacity": 0.9 } });
      add("ws-crashes");
      map.addLayer({ id: "ws-crashes", type: "circle", source: "ws-crashes",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 4],
          "circle-color": ["match", ["get", "g"], 0, GROUP_COLOR[0], 1, GROUP_COLOR[1], 2, GROUP_COLOR[2], 3, GROUP_COLOR[3], 4, GROUP_COLOR[4], GROUP_COLOR[5]], "circle-opacity": 0.8 } });
      add("ws-units");
      map.addLayer({ id: "ws-units", type: "circle", source: "ws-units", minzoom: 12,
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1.8, 16, 4.5], "circle-color": "#5fd6c4", "circle-stroke-color": "#05070d", "circle-stroke-width": 0.6 } });
      add("ws-gw");
      map.addLayer({ id: "ws-gw-range", type: "circle", source: "ws-gw",
        paint: { "circle-radius": metersToPx("r") as never, "circle-color": "rgba(95,214,196,0.05)", "circle-stroke-color": "rgba(95,214,196,0.45)",
          "circle-stroke-width": 1, "circle-pitch-alignment": "map" } });
      map.addLayer({ id: "ws-gw", type: "circle", source: "ws-gw",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 7], "circle-color": "#ffffff", "circle-stroke-color": "#5fd6c4", "circle-stroke-width": 2 } });
      map.on("click", "ws-roads", (ev: MapLayerMouseEvent) => {
        const id = ev.features?.[0]?.id;
        if (id !== undefined) useTraffic.getState().select(Number(id));
      });
      map.on("mouseenter", "ws-roads", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "ws-roads", () => { map.getCanvas().style.cursor = ""; });
      fetchJson<FeatureCollection>("counties.geojson").then((fc) => (map.getSource("counties") as GeoJSONSource | undefined)?.setData(fc)).catch(() => undefined);
      mapRef.current = map;
      setReady(true);
    });
    return () => { offNav(); mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const L = tf.layers, vis = (on: boolean) => (on ? "visible" : "none");
    for (const id of ["ws-roads", "ws-roads-case", "ws-sel"]) map.setLayoutProperty(id, "visibility", vis(L.risk));
    for (const id of ["ws-hot", "ws-hot-line"]) map.setLayoutProperty(id, "visibility", vis(L.hotspots));
    map.setLayoutProperty("ws-crashes", "visibility", vis(L.crashes));
    for (const id of ["ws-units", "ws-gw", "ws-gw-range"]) map.setLayoutProperty(id, "visibility", vis(L.units));
  }, [ready, tf.layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !tf.segs) return;
    (map.getSource("ws-roads") as GeoJSONSource).setData({ type: "FeatureCollection", features: tf.segs.map((s) => ({
      type: "Feature", id: s.id, properties: { risk: s.risk, cls: s.cls }, geometry: { type: "LineString", coordinates: s.coords } })) });
    (map.getSource("ws-crashes") as GeoJSONSource).setData({ type: "FeatureCollection", features: (tf.crashes ?? []).map((c) => ({
      type: "Feature", properties: { g: c.group, y: c.year }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })) });
    if (tf.hotspots) (map.getSource("ws-hot") as GeoJSONSource).setData(tf.hotspots);
  }, [ready, tf.segs, tf.crashes, tf.hotspots]);

  useEffect(() => {
    const map = mapRef.current;
    const D = tf.derived, P = tf.p;
    if (!ready || !map || !D || !P || !tf.segs) return;
    map.removeFeatureState({ source: "ws-roads" });
    for (const s of D.sel) map.setFeatureState({ source: "ws-roads", id: s.id }, { dep: true });
    (map.getSource("ws-units") as GeoJSONSource).setData({ type: "FeatureCollection", features: unitPoints(D.sel, P.spacingM, P.sides).map(([lon, lat]) => ({
      type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } })) });
    (map.getSource("ws-gw") as GeoJSONSource).setData({ type: "FeatureCollection", features: gatewayPoints(D.sel, P.gatewayKm).map((c) => ({
      type: "Feature", properties: { r: P.gatewayKm * 1000 }, geometry: { type: "Point", coordinates: c } })) });
  }, [ready, tf.derived, tf.p, tf.segs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !tf.segs) return;
    const s = tf.selected !== null ? tf.segs[tf.selected] : null;
    (map.getSource("ws-sel") as GeoJSONSource).setData({ type: "FeatureCollection", features: s ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: s.coords } }] : [] });
  }, [ready, tf.selected, tf.segs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !tf.segs || tf.selected === null || !tf.fly) return;
    const s = tf.segs[tf.selected], c = s.coords[Math.floor(s.coords.length / 2)];
    map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 12.5), duration: 700 });
  }, [ready, tf.fly]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" role="application" aria-label="Map of expected animal-vehicle crash risk and WildSight deployment" />
      {!tf.segs && <div className="absolute left-2 top-2 rounded bg-ink-900/90 px-2 py-1 text-[11px] text-star-300">Loading road network…</div>}
      {ready && <CameraPad map={mapRef.current} maxPitch={60} resetPitch={0} />}
      <div className="pointer-events-none absolute bottom-6 left-2 rounded-lg bg-ink-950/80 p-2 text-star-300 backdrop-blur">
        <div className="h-2 w-44 rounded" style={{ background: "linear-gradient(90deg, #2b3552, #4a6fa5, #e3c34a, #f08a3c, #e0453a)" }} />
        <div className="flex justify-between text-[10px]"><span>0</span><span>crashes / mile / yr (expected)</span><span>1.5+</span></div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px]">
          <span><span className="inline-block h-1.5 w-3 rounded-sm bg-amber-400 align-middle" /> deployed</span>
          <span><span className="text-[#5fd6c4]">●</span> unit</span><span>○ gateway + LoRa range</span>
          <span><span className="inline-block h-2 w-3 rounded-sm align-middle" style={{ background: "rgba(255,90,79,0.35)" }} /> UF hotspot</span>
        </div>
        <div className="text-[10px] text-star-500">Crash reports: <span style={{ color: GROUP_COLOR[0] }}>deer</span> · <span style={{ color: GROUP_COLOR[1] }}>bear</span> · <span style={{ color: GROUP_COLOR[2] }}>other wildlife</span> · <span style={{ color: GROUP_COLOR[3] }}>dogs/cats</span> · <span style={{ color: GROUP_COLOR[4] }}>livestock</span></div>
        <div className="text-[10px] text-star-500">Trackpad: swipe pans · pinch zooms · Shift + swipe tilts</div>
      </div>
    </div>
  );
}
