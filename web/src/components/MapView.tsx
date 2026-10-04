import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, ImageSource, MapLayerMouseEvent } from "maplibre-gl";
import { BASEMAP_STYLE as STYLE, maplibregl } from "../shared/map/maplibre";
import { enableTrackpadNav } from "../shared/map/navigation";
import CameraPad from "../shared/map/CameraPad";
import { useData, useModel } from "../state/model";
import { useStore, type MapView as View } from "../state/store";
import { useMcda } from "../state/mcda";
import { deltaColor, scoreColor, SKY_LEGEND, skyColor } from "../engine/colors";
import { bortleClass, bortleLabel } from "../engine/bortle";
import { cellLonLat, landEstimate, type Candidate } from "../engine/mcda";
import { useStargaze } from "../state/stargaze";
import { cloudAt, darknessFactor, hourIndex, WX_ATTRIBUTION } from "../engine/weather";
import { siteTimeLabel, skyState } from "../shared/sky";
import { add3DLayers, set3D, setLamps } from "../shared/map/terrain3d";
import { buildLamps, lampLayers, slotLooks } from "../map/lights3d";
import { basemapRoads } from "../shared/map/geo";
import type { GridMeta } from "../engine/types";
import type { FeatureCollection } from "geojson";
import { fetchJson, loadLin16, loadLog16 } from "../data/load";
import { fmtInt, fmtUsd } from "./ui";

function corners(g: GridMeta): [[number, number], [number, number], [number, number], [number, number]] {
  return [[g.west, g.north], [g.east, g.north], [g.east, g.south], [g.west, g.south]];
}

function paint(g: GridMeta, px: (i: number) => [number, number, number, number]) {
  const c = document.createElement("canvas");
  c.width = g.nx;
  c.height = g.ny;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(g.nx, g.ny);
  for (let i = 0; i < g.nx * g.ny; i++) {
    const [r, gg, b, a] = px(i);
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function circle(lon: number, lat: number, miles: number, n = 96): [number, number][] {
  const km = miles * 1.609344;
  const pts: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * 2 * Math.PI;
    pts.push([lon + (km * Math.sin(a)) / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (km * Math.cos(a)) / 111.32]);
  }
  return pts;
}

/** Land price color: green (cheap) → yellow → red (expensive) on a log scale between the MCDA land-cost anchors. */
function priceColor(usdAcre: number, best: number, worst: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, Math.log(usdAcre / best) / Math.log(worst / best)));
  return t < 0.5 ? [46 + (240 - 46) * t * 2, 160 + (200 - 160) * t * 2, 90 - 20 * t * 2] : [240 - 20 * (t - 0.5) * 2, 200 - 130 * (t - 0.5) * 2, 70 - 10 * (t - 0.5) * 2];
}
const PUBLIC_RGB: [number, number, number] = [80, 170, 230];
const usdShort = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : `$${Math.round(v / 1e3)}K`);

const VIEWS: { value: View; label: string }[] = [
  { value: "scenario", label: "Sky (scenario)" }, { value: "delta", label: "Change" }, { value: "baseline", label: "Sky (today)" }, { value: "fixtures", label: "Streetlights" },
];
const VIIRS_VIEWS: { value: View; label: string }[] = [{ value: "viirs", label: "VIIRS" }, { value: "trend", label: "Trend 2012–24" }];

export default function MapView() {
  const d = useData();
  const m = useModel();
  const { e } = m;
  const view = useStore((s) => s.mapView);
  const setView = useStore((s) => s.setMapView);
  const tab = useStore((s) => s.tab);
  const mode = useStore((s) => s.mode);
  const setFocus = useStore((s) => s.setFocusSite);
  const mc = useMcda();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const observatory = tab === "observatory";
  const stargaze = tab === "stargaze";
  const planner = !observatory && !stargaze;
  const sg = useStargaze();
  const showInstalls = useStore((s) => s.showInstalls);
  const buildOpen = useStore((s) => s.buildOpen) && planner;
  const lift = buildOpen ? "md:bottom-[19rem]" : "";
  const [venues, setVenues] = useState<FeatureCollection | null>(null);
  const prevMode = useRef<"planner" | "observatory" | "stargaze">("planner");
  const [is3D, setIs3D] = useState(false);              // planner tabs: terrain, buildings and light sources in 3D
  const [lightOpacity, setLightOpacity] = useState(0.55); // 3D: transparency of the sky-brightness (light) map over the terrain
  const [zoom, setZoom] = useState(8);
  const [surveyed, setSurveyed] = useState<FeatureCollection | null>(null);
  const [hover, setHover] = useState<{ rank: number; x: number; y: number } | null>(null);
  const [priceView, setPriceView] = useState(false);   // Observatory: land-price overlay instead of suitability
  const acres = mc.acres ?? e.seed.mcda.land_pricing?.target_site_acres.value ?? 80;
  const costAnchor = e.seed.mcda.anchors.land_cost_usd_acre as { best: number; worst: number } | undefined;
  const year = useStore((s) => s.viirsYear);
  const setYear = useStore((s) => s.setViirsYear);
  const [viirs, setViirs] = useState<{ years: Float32Array[]; trend: Float32Array[] } | null>(null);
  useEffect(() => {
    if ((view === "viirs" || view === "trend") && !viirs && e.files.viirs_a15 && e.files.viirs_trend_a15)
      Promise.all([loadLog16(e.files.viirs_a15), loadLin16(e.files.viirs_trend_a15)]).then(([years, trend]) => setViirs({ years, trend }));
  }, [view, viirs, e]);

  // ---- init once
  useEffect(() => {
    setReady(false);
    const map = new maplibregl.Map({
      container: ref.current!, style: STYLE, bounds: [[e.grids.a15.west, e.grids.a15.south], [e.grids.a15.east, e.grids.a15.north]], fitBoundsOptions: { padding: 10 },
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // needed for PNG map export (0A.2 Reports row)
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", async () => {
      const blank = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const firstSymbol = map.getStyle().layers.find((l: { type: string }) => l.type === "symbol")?.id;
      map.addSource("sky", { type: "image", url: blank, coordinates: corners(e.grids.a15) });
      map.addLayer({ id: "sky", type: "raster", source: "sky", paint: { "raster-opacity": 0.82, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstSymbol);
      map.addSource("score", { type: "image", url: blank, coordinates: corners(e.grids.b) });
      map.addLayer({ id: "score", type: "raster", source: "score", layout: { visibility: "none" }, paint: { "raster-opacity": 0.8, "raster-fade-duration": 0 } }, firstSymbol);
      map.addSource("price", { type: "image", url: blank, coordinates: corners(e.grids.b) });
      map.addLayer({ id: "price", type: "raster", source: "price", layout: { visibility: "none" }, paint: { "raster-opacity": 0.75, "raster-fade-duration": 0 } }, firstSymbol);
      // Stargaze: modeled sky over the 11-county region, and the weather overlay on top of it.
      map.addSource("skyb", { type: "image", url: blank, coordinates: corners(e.grids.b) });
      map.addLayer({ id: "skyb", type: "raster", source: "skyb", layout: { visibility: "none" }, paint: { "raster-opacity": 0.82, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstSymbol);
      map.addSource("wx", { type: "image", url: blank, coordinates: corners(e.grids.b) });
      map.addLayer({ id: "wx", type: "raster", source: "wx", layout: { visibility: "none" }, paint: { "raster-opacity": 1, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstSymbol);
      const [counties, towns] = await Promise.all([fetchJson<FeatureCollection>("counties.geojson"), fetchJson<FeatureCollection>("towns.geojson")]);
      map.addSource("counties", { type: "geojson", data: counties });
      map.addLayer({ id: "counties", type: "line", source: "counties", paint: { "line-color": "#d9d2bd", "line-opacity": 0.45, "line-width": 1 } });
      map.addSource("towns", { type: "geojson", data: towns });
      map.addLayer({ id: "towns", type: "symbol", source: "towns", minzoom: 8, layout: { "text-field": ["get", "name"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#a79f88", "text-halo-color": "#05070d", "text-halo-width": 1 } });
      map.addSource("rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": ["match", ["get", "zone"], "lz0", "#f6b44b", "#7cc4ff"], "line-width": 1.5, "line-dasharray": [2, 1] } });
      map.addSource("fixtures", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "fixtures", type: "circle", source: "fixtures", layout: { visibility: "none" },
        paint: { "circle-radius": 2.5, "circle-color": ["match", ["get", "source"], "socrata", "#f6b44b", "#7cc4ff"], "circle-stroke-width": 0 } });
      map.addSource("sites", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "sites", type: "circle", source: "sites", paint: { "circle-radius": 5, "circle-color": "#f5f1e6", "circle-stroke-color": "#05070d", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "site-labels", type: "symbol", source: "sites", layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top", "text-font": ["Noto Sans Regular"], "text-allow-overlap": false },
        paint: { "text-color": "#f5f1e6", "text-halo-color": "#05070d", "text-halo-width": 1.2 } });
      map.addSource("candidates", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "candidates", type: "circle", source: "candidates", layout: { visibility: "none" }, paint: { "circle-radius": 6, "circle-color": "#f6b44b", "circle-stroke-color": "#05070d", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "candidate-labels", type: "symbol", source: "candidates", layout: { visibility: "none", "text-field": ["get", "rank"], "text-size": 10, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#05070d" } });
      map.addLayer({ id: "candidate-price", type: "symbol", source: "candidates", layout: { visibility: "none", "text-field": ["get", "price"], "text-size": 11,
        // Above the dot when it fits; otherwise beside or below, so neighboring candidates stay readable. Better ranks place first.
        "text-font": ["Noto Sans Regular"], "text-variable-anchor": ["bottom", "left", "right", "top"], "text-radial-offset": 0.9,
        "symbol-sort-key": ["to-number", ["get", "rank"]], "text-padding": 1 },
        paint: { "text-color": "#f6d28b", "text-halo-color": "#05070d", "text-halo-width": 1.6 } });
      map.addSource("spots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "spots", type: "circle", source: "spots", layout: { visibility: "none" }, paint: { "circle-radius": 7, "circle-color": "#8fe38f", "circle-stroke-color": "#05070d", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "spot-labels", type: "symbol", source: "spots", layout: { visibility: "none", "text-field": ["get", "rank"], "text-size": 10, "text-font": ["Noto Sans Regular"], "text-allow-overlap": true }, paint: { "text-color": "#05070d" } });
      map.addSource("spot-sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "spot-sel", type: "circle", source: "spot-sel", layout: { visibility: "none" }, paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#f6b44b", "circle-stroke-width": 2.5 } });
      map.on("click", (ev) => {
        if (useStore.getState().tab !== "stargaze") return;
        const f = map.queryRenderedFeatures(ev.point, { layers: ["spots"] })[0];
        if (f) {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const sp = useStargaze.getState().spots.find((x) => String(x.rank) === String(f.properties?.rank));
          useStargaze.getState().setSpot({ lat, lon, name: sp ? `${e.region_county_names[sp.county] ?? sp.county} #${sp.rank}` : undefined });
        } else useStargaze.getState().setSpot({ lat: +ev.lngLat.lat.toFixed(4), lon: +ev.lngLat.lng.toFixed(4) });
      });
      map.on("mouseenter", "spots", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "spots", () => { map.getCanvas().style.cursor = ""; });
      // Catalog install markers (Build tab): clustered by count, colored by slot.
      map.addSource("installs", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 45,
        clusterMaxZoom: 13, clusterProperties: { units: ["+", ["get", "units"]] } });
      map.addLayer({ id: "install-clusters", type: "circle", source: "installs", filter: ["has", "point_count"],
        paint: { "circle-color": "rgba(246,180,75,0.25)", "circle-stroke-color": "#f6b44b", "circle-stroke-width": 1.5,
          "circle-radius": ["interpolate", ["linear"], ["get", "units"], 10, 10, 1000, 18, 20000, 30] } });
      map.addLayer({ id: "install-count", type: "symbol", source: "installs", filter: ["has", "point_count"],
        layout: { "text-field": ["case", [">=", ["get", "units"], 1000], ["concat", ["to-string", ["round", ["/", ["get", "units"], 1000]]], "k"],
          ["to-string", ["round", ["get", "units"]]]], "text-size": 10, "text-font": ["Noto Sans Regular"], "text-allow-overlap": true },
        paint: { "text-color": "#f5f1e6" } });
      map.addLayer({ id: "install-points", type: "circle", source: "installs", filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": ["interpolate", ["linear"], ["get", "units"], 0, 2.5, 50, 6],
          "circle-color": ["match", ["get", "slot"], "street", "#f6b44b", "commercial", "#7cc4ff", "residential", "#f08ab8", "#8fe38f"],
          "circle-stroke-color": "#05070d", "circle-stroke-width": 0.8 } });
      map.on("click", "install-clusters", async (ev: MapLayerMouseEvent) => {
        const f = ev.features?.[0];
        if (!f) return;
        const src = map.getSource("installs") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      map.on("click", "sites", (ev: MapLayerMouseEvent) => { const id = ev.features?.[0]?.properties?.id; if (id) setFocus(String(id)); });
      map.on("mouseenter", "sites", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "sites", () => { map.getCanvas().style.cursor = ""; });
      // Observatory candidates: hover label next to the circle.
      map.on("mousemove", "candidates", (ev: MapLayerMouseEvent) => {
        const rank = Number(ev.features?.[0]?.properties?.rank);
        if (!rank) return;
        map.getCanvas().style.cursor = "pointer";
        const p = map.project((ev.features![0].geometry as GeoJSON.Point).coordinates as [number, number]);
        setHover({ rank, x: p.x, y: p.y });
      });
      map.on("mouseleave", "candidates", () => { map.getCanvas().style.cursor = ""; setHover(null); });
      map.on("movestart", () => setHover(null));
      add3DLayers(map, "sky");
      map.on("zoomend", () => setZoom(map.getZoom()));
      // Publish the map to the other effects only once its sources exist (a remount or hot reload otherwise races them).
      mapRef.current = map;
      setReady(true);
    });
    return () => { mapRef.current = null; map.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sky / change raster
  const skyUrl = useMemo(() => {
    const g = e.grids.a15;
    if (view === "viirs" || view === "trend") {
      if (!viirs || !e.viirs) return null;
      if (view === "viirs") {
        const r = viirs.years[e.viirs.years.indexOf(year)];
        return paint(g, (i) => { const t = Math.min(1, Math.max(0, Math.log10(r[i] / 0.1) / 3)); return [255 * t, 200 * t ** 1.5, 90 * t ** 3, r[i] > 0.1 ? 60 + 195 * t : 0]; });
      }
      const pct = viirs.trend[0];
      return paint(g, (i) => (viirs.years[viirs.years.length - 1][i] > 0.3 ? deltaColor(-pct[i], 50) : [0, 0, 0, 0]));
    }
    if (view === "fixtures") {
      const f = d.fixCat15?.[0];
      if (!f) return null;
      return paint(g, (i) => { const v = f[i]; if (!(v > 0.05)) return [0, 0, 0, 0]; const t = Math.min(1, Math.log10(1 + v * 10) / 2.5); return [246, 180 - 80 * t, 75, 60 + 180 * t]; });
    }
    if (view === "baseline" || !m.fields) {
      const base = m.fields?.baseMag15;
      if (!base) {
        const L = d.base15; const Ln = e.physics.L_nat;
        return paint(g, (i) => { const [r, gg, b] = skyColor(12.6 - 2.5 * Math.log10(L[i] + Ln)); return [r, gg, b, 255]; });
      }
      return paint(g, (i) => { const [r, gg, b] = skyColor(base[i]); return [r, gg, b, 255]; });
    }
    if (view === "delta") {
      const f = m.fields;
      if (mode === "V") return paint(g, (i) => deltaColor(f.deltaMag15[i], 0.3));
      return paint(g, (i) => deltaColor(-f.relChange15[i], 0.5));
    }
    const s = m.fields.scnMag15;
    return paint(g, (i) => { const [r, gg, b] = skyColor(s[i]); return [r, gg, b, 255]; });
  }, [view, m.fields, d.base15, d.fixCat15, e, mode, viirs, year]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !skyUrl || !map.getSource("sky")) return;
    (map.getSource("sky") as ImageSource).updateImage({ url: skyUrl, coordinates: corners(e.grids.a15) });
  }, [ready, skyUrl, e]);

  // ---- vectors: sites, rings, fixtures
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const feats = m.sites.map((s) => {
      const site = e.sites.find((x) => x.id === s.id)!;
      const mag = m.growthOn && s.futureScnMag !== null ? s.futureScnMag : s.scnMag;
      return { type: "Feature" as const, properties: { id: s.id, label: `${s.name}\n${mag.toFixed(2)} · B${bortleLabel(bortleClass(mag, m.table), m.table)}` },
        geometry: { type: "Point" as const, coordinates: [site.lon, site.lat] } };
    });
    (map.getSource("sites") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    const rings = m.params.overlays.flatMap((o) => {
      const site = e.sites.find((s) => s.id.startsWith(o.site))!;
      return [{ zone: "lz0", r: o.lz0_radius_mi }, { zone: "lz1", r: o.lz1_radius_mi }].map((z) => ({
        type: "Feature" as const, properties: { zone: z.zone }, geometry: { type: "LineString" as const, coordinates: circle(site.lon, site.lat, z.r) } }));
    });
    (map.getSource("rings") as GeoJSONSource).setData({ type: "FeatureCollection", features: rings });
  }, [ready, m.sites, m.params.overlays, m.growthOn, m.table, e]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const show = view === "fixtures" && !stargaze;
    map.setLayoutProperty("fixtures", "visibility", show ? "visible" : "none");
    if (show && !(map.getSource("fixtures") as GeoJSONSource & { _loaded?: boolean })._loaded) {
      fetchJson<FeatureCollection>("fixtures_surveyed.geojson").then((fc) => {
        const src = map.getSource("fixtures") as GeoJSONSource & { _loaded?: boolean };
        src.setData(fc);
        src._loaded = true;
      });
    }
  }, [ready, view, stargaze]);

  // ---- catalog install markers
  const params = m.params;
  useEffect(() => {
    if (params.fixtures.sports && !venues) fetchJson<FeatureCollection>("sports_venues.geojson").then(setVenues);
  }, [params.fixtures.sports, venues]);
  const installs = useMemo((): FeatureCollection => {
    const feats: GeoJSON.Feature[] = [];
    if (!showInstalls || !d.fixCat15 || !d.county15) return { type: "FeatureCollection", features: feats };
    const g = e.grids.a15;
    const sel = new Set(params.selection.counties.map((f) => e.files.county_a15.values.indexOf(f)));
    const layers = e.files.fixtures_cat_a15.names ?? ["street", "commercial", "residential", "sports"];
    for (const slot of ["street", "commercial", "residential"] as const) {
      const ch = params.fixtures[slot];
      if (!ch) continue;
      const grid = d.fixCat15[layers.indexOf(slot)];
      const share = ch.pct / 100;
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i] * share;
        if (!(v >= 0.3) || !sel.has(d.county15[i])) continue;
        const x = i % g.nx, y = Math.floor(i / g.nx);
        feats.push({ type: "Feature", properties: { slot, units: v },
          geometry: { type: "Point", coordinates: [g.west + (x + 0.5) * g.res_deg, g.north - (y + 0.5) * g.res_deg] } });
      }
    }
    const sp = params.fixtures.sports;
    if (sp && venues) {
      for (const f of venues.features) {
        const pr = f.properties as { county: string; fixtures: number };
        if (!params.selection.counties.includes(pr.county)) continue;
        feats.push({ type: "Feature", properties: { slot: "sports", units: pr.fixtures * (sp.pct / 100) }, geometry: f.geometry });
      }
    }
    return { type: "FeatureCollection", features: feats };
  }, [showInstalls, d.fixCat15, d.county15, params.fixtures, params.selection.counties, venues, e]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("installs")) return;
    (map.getSource("installs") as GeoJSONSource).setData(installs);
    for (const id of ["install-clusters", "install-count", "install-points"]) map.setLayoutProperty(id, "visibility", planner ? "visible" : "none");
  }, [ready, installs, planner]);

  // ---- Module B heatmap and candidates
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("score", "visibility", observatory && mc.score && !priceView ? "visible" : "none");
    map.setLayoutProperty("price", "visibility", observatory && priceView ? "visible" : "none");
    map.setLayoutProperty("candidate-price", "visibility", observatory && priceView ? "visible" : "none");
    map.setLayoutProperty("sky", "visibility", planner ? "visible" : "none");
    for (const id of ["candidates", "candidate-labels"]) map.setLayoutProperty(id, "visibility", observatory ? "visible" : "none");
    for (const id of ["rings"]) map.setLayoutProperty(id, "visibility", planner ? "visible" : "none");
    for (const id of ["skyb", "spots", "spot-labels", "spot-sel"]) map.setLayoutProperty(id, "visibility", stargaze ? "visible" : "none");
    map.setLayoutProperty("wx", "visibility", stargaze && sg.overlay !== "none" ? "visible" : "none");
    const modeNow = observatory ? "observatory" : stargaze ? "stargaze" : "planner";
    if (modeNow !== prevMode.current) {
      const g = modeNow === "planner" ? e.grids.a15 : e.grids.b;
      map.fitBounds([[g.west, g.south], [g.east, g.north]], { padding: modeNow === "planner" ? 10 : 20, duration: 600 });
    }
    prevMode.current = modeNow;
  }, [ready, observatory, stargaze, planner, mc.score, priceView, sg.overlay, e]);

  // ---- 3D terrain, buildings and light sources (planner tabs)
  const show3D = is3D && planner;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    set3D(map, show3D, 3);
    if (show3D) {
      map.setMaxPitch(75);
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
      map.easeTo({ pitch: 60, duration: 800 });
      if (!surveyed) fetchJson<FeatureCollection>("fixtures_surveyed.geojson").then(setSurveyed);
      if (!venues) fetchJson<FeatureCollection>("sports_venues.geojson").then(setVenues);
    } else if (map.getPitch() > 0 || map.getBearing() !== 0) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
  }, [ready, show3D]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) map.setPaintProperty("sky", "raster-opacity", show3D ? lightOpacity : 0.82);
  }, [ready, show3D, lightOpacity]);

  // Trackpad navigation in 3D (shared): swipe pans, pinch zooms, Shift + swipe turns and tilts.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !show3D) return;
    return enableTrackpadNav(map, 75);
  }, [ready, show3D]);

  const lampInputs = useRef<() => void>(() => undefined);
  lampInputs.current = () => {
    const map = mapRef.current;
    if (!map || !show3D) return;
    const b = map.getBounds(), z = map.getZoom();
    const near = z >= 14; // individual modeled lights need street-level tiles
    const roads = near ? basemapRoads(map) : [];
    const c = map.getCenter();
    const lamps = buildLamps({
      e, looks: slotLooks(e, params), selected: new Set(params.selection.counties), surveyed, venues, sportsOn: params.view_window === "evening",
      grid: e.grids.a15, cat: d.fixCat15, catNames: e.files.fixtures_cat_a15.names ?? ["street", "commercial", "residential", "sports"],
      county: d.county15, countyValues: e.files.county_a15.values, roads, focus: [c.lng, c.lat],
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], maxLamps: near ? 6000 : 2500,
    });
    const { poles, pools } = lampLayers(lamps);
    setLamps(map, poles, pools);
  };
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!show3D) { setLamps(map, { type: "FeatureCollection", features: [] }, { type: "FeatureCollection", features: [] }); return; }
    let t = 0;
    const onIdle = () => { clearTimeout(t); t = window.setTimeout(() => lampInputs.current(), 150); };
    map.on("idle", onIdle);
    lampInputs.current();
    return () => { clearTimeout(t); map.off("idle", onIdle); };
  }, [ready, show3D, surveyed, venues, params.fixtures, params.selection.counties, params.view_window, d.fixCat15, d.county15]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Stargaze layers
  useEffect(() => {
    const map = mapRef.current;
    const r = mc.data?.raw;
    if (!ready || !map || !stargaze || !r?.sky) return;
    const url = paint(e.grids.b, (i) => { const v = r.sky[i]; if (!Number.isFinite(v) || !(mc.data!.county[i] >= 0)) return [0, 0, 0, 0]; const [cr, cg, cb] = skyColor(v); return [cr, cg, cb, 255]; });
    (map.getSource("skyb") as ImageSource).updateImage({ url, coordinates: corners(e.grids.b) });
  }, [ready, stargaze, mc.data, e]);

  useEffect(() => {
    const map = mapRef.current;
    const g = sg.grid;
    if (!ready || !map || !stargaze || !g || sg.hour === null || sg.overlay === "none") return;
    const h = hourIndex(g.times, sg.hour);
    if (sg.overlay === "clouds") {
      // Upsample the forecast grid 8x with bilinear interpolation; white with opacity = cloud cover.
      const W = (g.nx - 1) * 8, H = (g.ny - 1) * 8, east = g.west + (g.nx - 1) * g.step, north = g.south + (g.ny - 1) * g.step;
      const url = paint({ west: g.west, south: g.south, east, north, res_deg: g.step / 8, nx: W, ny: H, dx_km: 0, dy_km: 0 }, (i) => {
        const lon = g.west + ((i % W) + 0.5) * (g.step / 8), lat = north - (Math.floor(i / W) + 0.5) * (g.step / 8);
        const c = cloudAt(g, h, lat, lon);
        return [236, 240, 247, Math.round(Math.min(1, Math.max(0, c / 100)) ** 0.8 * 215)];
      });
      (map.getSource("wx") as ImageSource).updateImage({ url, coordinates: [[g.west, north], [east, north], [east, g.south], [g.west, g.south]] });
    } else if (mc.data) {
      // Dark & clear: modeled darkness x forecast clear sky x usable darkness (Sun/Moon) at that hour.
      const st = skyState(g.times[h], 29.6, -82.5);
      const dark = darknessFactor(st.sun.alt, st.moon.alt, st.moon.illum);
      const d = mc.data;
      const url = paint(e.grids.b, (i) => {
        const v = d.raw.sky[i];
        if (!Number.isFinite(v) || !(d.county[i] >= 0) || !Number.isFinite(d.raw.elevation?.[i])) return [0, 0, 0, 0];
        const [lon, lat] = cellLonLat(e.grids.b, i);
        const s = Math.min(1, Math.max(0, (v - 20) / 2)) * (1 - cloudAt(g, h, lat, lon) / 100) * dark;
        const [cr, cg, cb] = scoreColor(s);
        return [cr, cg, cb, 200];
      });
      (map.getSource("wx") as ImageSource).updateImage({ url, coordinates: corners(e.grids.b) });
    }
  }, [ready, stargaze, sg.grid, sg.hour, sg.overlay, mc.data, e]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("spots")) return;
    (map.getSource("spots") as GeoJSONSource).setData({ type: "FeatureCollection", features: sg.spots.map((s) => ({
      type: "Feature", properties: { rank: String(s.rank) }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })) });
  }, [ready, sg.spots]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("spot-sel")) return;
    (map.getSource("spot-sel") as GeoJSONSource).setData({ type: "FeatureCollection", features: sg.spot
      ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [sg.spot.lon, sg.spot.lat] } }] : [] });
  }, [ready, sg.spot]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !sg.spot || !sg.fly) return;
    map.easeTo({ center: [sg.spot.lon, sg.spot.lat], zoom: Math.max(map.getZoom(), 9.5), duration: 700 });
  }, [ready, sg.fly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Land-price surface: market $/acre from nearby qualified vacant-land sales; mostly-public parcels in blue.
  useEffect(() => {
    const map = mapRef.current;
    const r = mc.data?.raw;
    if (!ready || !map || !r?.sale_usd_acre || !costAnchor) return;
    const county = mc.data!.county;
    const url = paint(e.grids.b, (i) => {
      const pa = r.parcel_acres?.[i] ?? 0, pu = r.public_acres?.[i] ?? 0;
      if (pa > 0 && pu / pa >= 0.5) return [...PUBLIC_RGB, 200];
      const v = r.sale_usd_acre[i];
      if (!(v > 0) || !Number.isFinite(v) || !(county[i] >= 0)) return [0, 0, 0, 0];
      return [...priceColor(v, costAnchor.best, costAnchor.worst), pa > 0 ? 200 : 110];
    });
    (map.getSource("price") as ImageSource).updateImage({ url, coordinates: corners(e.grids.b) });
  }, [ready, mc.data, costAnchor, e]);

  // Candidate points carry their rank and a land-cost label (market range for the target acres).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getSource("candidates")) return;
    const label = (c: Candidate) => {
      const l = mc.data && e.land ? landEstimate(e, mc.data, c.cellList, c.best, acres, mc.parcels) : null;
      if (!l) return `#${c.rank}`;
      const range = l.marketCostLow !== null && l.marketCostHigh !== null ? `${usdShort(l.marketCostLow)}–${usdShort(l.marketCostHigh)}`
        : l.marketCost !== null ? `≈${usdShort(l.marketCost)}` : "no sales data";
      return `#${c.rank} ${range}${l.publicShare >= 0.5 ? `\n${Math.round(l.publicShare * 100)}% public land` : ""}`;
    };
    (map.getSource("candidates") as GeoJSONSource).setData({ type: "FeatureCollection", features: mc.candidates.map((c) => ({
      type: "Feature", properties: { rank: String(c.rank), price: label(c) }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })) });
  }, [ready, mc.candidates, mc.data, mc.parcels, acres, e]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !mc.score || !map.getSource("score")) return;
    const s = mc.score;
    let lo = Infinity, hi = -Infinity;
    for (const v of s) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const url = paint(e.grids.b, (i) => { const v = s[i]; if (!Number.isFinite(v)) return [0, 0, 0, 0]; const [r, g, b] = scoreColor((v - lo) / (hi - lo || 1)); return [r, g, b, 210]; });
    (map.getSource("score") as ImageSource).updateImage({ url, coordinates: corners(e.grids.b) });
  }, [ready, mc.score, e]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" role="application" aria-label="Map of projected zenith sky brightness" />
      {planner && (
        <div className="absolute left-2 top-2 flex flex-wrap gap-1 rounded-lg bg-ink-950/80 p-1 backdrop-blur" role="radiogroup" aria-label="Map layer">
          {[...VIEWS, ...(e.viirs ? VIIRS_VIEWS : [])].map((v) => (
            <button key={v.value} role="radio" aria-checked={view === v.value} onClick={() => setView(v.value)}
              className={`rounded px-2 py-1 text-xs ${view === v.value ? "bg-amber-400 text-ink-950" : "text-star-300 hover:bg-ink-800"}`}>{v.label}</button>
          ))}
          <button onClick={() => setIs3D(!is3D)} aria-pressed={is3D} title="3D terrain, buildings and light sources"
            className={`ml-1 rounded border px-2 py-1 text-xs font-semibold ${is3D ? "border-glow-400 bg-glow-400/20 text-glow-400" : "border-ink-600 text-star-300 hover:bg-ink-800"}`}>3D</button>
        </div>
      )}
      {show3D && (
        <div className={`absolute bottom-24 left-2 max-w-[17rem] rounded-lg bg-ink-950/85 p-2 text-[10px] text-star-300 backdrop-blur ${lift}`}>
          <b className="text-star-100">3D</b> · terrain ×3
          <label className="mt-1 flex items-center gap-2">Light map
            <input type="range" min={0} max={100} value={Math.round(lightOpacity * 100)} onChange={(ev) => setLightOpacity(Number(ev.target.value) / 100)}
              className="w-24 accent-amber-400" aria-label="Light map transparency" />
            <span className="tabular-nums">{Math.round(lightOpacity * 100)}%</span>
          </label>
          <div className="mt-1 text-star-500">Trackpad: two-finger swipe pans · pinch zooms · Shift + swipe turns and tilts. Mouse: wheel zooms, right-drag tilts. Keys: arrows pan, Shift + arrows turn/tilt, +/− zoom.</div>
          <div className="mt-1">{zoom < 14 ? "Zoom in to street level to see buildings and each modeled light." : "Mapped streetlights at their surveyed spots; modeled lights spread along the roads of their ~450 m cell (streetlights on the road, business and porch lights set back from it). Lamp color = fixture type (equipped cards recolor their share); sports towers light up in the evening view."}</div>
        </div>
      )}
      {show3D && <CameraPad map={mapRef.current} className={lift} />}
      {observatory && e.land && (
        <div className="absolute left-2 top-2 flex gap-1 rounded-lg bg-ink-950/80 p-1 backdrop-blur" role="radiogroup" aria-label="Observatory overlay">
          {[{ v: false, label: "Suitability" }, { v: true, label: `Land prices (${acres} ac)` }].map((o) => (
            <button key={String(o.v)} role="radio" aria-checked={priceView === o.v} onClick={() => setPriceView(o.v)}
              className={`rounded px-2 py-1 text-xs ${priceView === o.v ? "bg-amber-400 text-ink-950" : "text-star-300 hover:bg-ink-800"}`}>{o.label}</button>
          ))}
        </div>
      )}
      {stargaze && <StargazeControls />}
      <Legend view={observatory ? (priceView ? "price" : "score") : stargaze ? `stargaze-${sg.overlay}` : view} mode={mode} lift={lift} anchor={costAnchor} />
      {view === "viirs" && e.viirs && planner && (
        <label className="absolute left-2 top-12 flex items-center gap-2 rounded-lg bg-ink-950/80 px-2 py-1 text-xs text-star-300 backdrop-blur">
          VNP46A2 {year}
          <input type="range" min={e.viirs.years[0]} max={e.viirs.years[e.viirs.years.length - 1]} value={year} onChange={(ev) => setYear(Number(ev.target.value))} className="accent-amber-400" aria-label="VIIRS year" />
        </label>
      )}
      <button onClick={() => exportPng(mapRef.current)} className={`absolute bottom-6 right-2 ${lift} rounded-md bg-ink-950/80 px-2 py-1 text-[11px] text-star-300 backdrop-blur hover:bg-ink-800`}>PNG</button>
      {observatory && hover && (() => {
        const c = mc.candidates.find((x) => x.rank === hover.rank);
        return c ? <CandidateLabel c={c} x={hover.x} y={hover.y} width={ref.current?.clientWidth ?? 0} /> : null;
      })()}
      {!d.basis && planner && <div className="absolute right-12 top-2 rounded bg-ink-900/90 px-2 py-1 text-[11px] text-star-300">Loading scenario layers…</div>}
    </div>
  );
}

/** Stargaze map controls: overlay choice and the forecast time slider. */
function StargazeControls() {
  const sg = useStargaze();
  const g = sg.grid;
  const idx = g && sg.hour !== null ? hourIndex(g.times, sg.hour) : 0;
  const t = g?.times[idx];
  const st = t ? skyState(t, 29.6, -82.5) : null;
  return (
    <div className="absolute left-2 top-2 w-[min(22rem,calc(100%-4rem))] rounded-lg bg-ink-950/85 p-2 text-[11px] text-star-300 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Weather overlay">
        {([["clouds", "Clouds"], ["score", "Dark & clear"], ["none", "Off"]] as const).map(([v, label]) => (
          <button key={v} role="radio" aria-checked={sg.overlay === v} onClick={() => sg.setOverlay(v)}
            className={`rounded px-2 py-0.5 ${sg.overlay === v ? "bg-amber-400 text-ink-950" : "hover:bg-ink-800"}`}>{label}</button>
        ))}
        <span className={`ml-auto rounded px-1.5 text-[10px] ${g?.source === "sim" ? "bg-amber-400/20 text-amber-400" : "bg-glow-400/15 text-glow-400"}`}>
          {g ? (g.source === "sim" ? "SIMULATED" : "LIVE forecast") : "loading…"}</span>
      </div>
      {g && t !== undefined && (
        <>
          <input type="range" min={0} max={g.times.length - 1} value={idx} onChange={(ev) => sg.setHour(g.times[Number(ev.target.value)])}
            className="mt-1 w-full accent-amber-400" aria-label="Forecast hour" />
          <div className="flex justify-between">
            <span className="font-semibold text-star-100">{siteTimeLabel(t, true)}</span>
            <span className="text-star-500">{st?.twilight}{st && st.moon.alt > 0 ? ` · Moon ${Math.round(st.moon.illum * 100)}% up` : ""}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Hover label for an Observatory candidate: placed to the right of the circle, flipped left near the edge. */
function CandidateLabel({ c, x, y, width }: { c: Candidate; x: number; y: number; width: number }) {
  const { e } = useData();
  const mc = useMcda();
  const acres = mc.acres ?? e.seed.mcda.land_pricing?.target_site_acres.value ?? 80;
  const l = mc.data && e.land ? landEstimate(e, mc.data, c.cellList, c.best, acres, mc.parcels) : null;
  const pubName = l?.publicCat ? e.land?.categories[String(l.publicCat)] : null;
  const top = c.scorecard.filter((s) => s.weight > 0).sort((a, b) => b.contrib - a.contrib).slice(0, 3);
  const flip = x > width - 260;
  return (
    <div role="tooltip" className="pointer-events-none absolute z-20 w-60 rounded-lg border border-amber-400/60 bg-ink-950/95 p-2 text-[11px] text-star-300 shadow-lg backdrop-blur"
      style={{ left: flip ? x - 252 : x + 12, top: Math.max(4, y - 20) }}>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-amber-400">Candidate #{c.rank}</span>
        <span className="text-star-500">{e.region_county_names[c.county] ?? c.county}</span>
      </div>
      <table className="mt-1 w-full"><tbody>
        <tr><td className="pr-2 text-star-500">Score</td><td className="tabular-nums">{c.score.toFixed(3)} · {c.cells} cells (~{(c.cells * e.grids.b.dx_km * e.grids.b.dy_km).toFixed(1)} km²)</td></tr>
        <tr><td className="pr-2 text-star-500">Sky</td><td className="tabular-nums">{c.mag2024.toFixed(2)} → {c.mag2034.toFixed(2)} mag (2024 → 2034)</td></tr>
        {l && <tr><td className="pr-2 align-top text-star-500">Land</td><td>
          {l.marketCost !== null ? <>≈{fmtUsd(l.marketCost)} for {acres} ac <span className="text-star-500">(${fmtInt(l.marketUsdAcre ?? 0)}/ac)</span></> : "no price data"}
          {l.marketCostLow !== null && l.marketCostHigh !== null && <div className="text-star-500">range {fmtUsd(l.marketCostLow)}–{fmtUsd(l.marketCostHigh)}</div>}
          {l.publicShare > 0 && <div className="text-glow-400">{Math.round(l.publicShare * 100)}% public{pubName ? ` · ${pubName}` : ""}</div>}
          {l.largest && <div className="text-star-500">largest parcel {fmtInt(l.largest.acres)} ac</div>}
        </td></tr>}
        <tr><td className="pr-2 align-top text-star-500">Strengths</td><td>{top.map((s) => e.seed.mcda.weights[s.criterion]?.label ?? s.criterion).join(", ")}</td></tr>
        <tr><td className="pr-2 text-star-500">Location</td><td className="tabular-nums">{c.lat.toFixed(3)}, {c.lon.toFixed(3)}</td></tr>
      </tbody></table>
    </div>
  );
}

/** PNG map export with the uncalibrated caption burned in. */
function exportPng(map: maplibregl.Map | null) {
  if (!map) return;
  const src = map.getCanvas();
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height + 28;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  ctx.fillStyle = "#f6b44b";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Dark Sky Simulator v2.0 · uncalibrated planning projection, not an observed outcome", 8, src.height + 19);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `dark-sky-map-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
}

function Legend({ view, mode, lift, anchor }: { view: string; mode: string; lift: string; anchor?: { best: number; worst: number } }) {
  let body;
  const skyBar = <><div className="flex h-2 w-44 overflow-hidden rounded">{[...SKY_LEGEND].reverse().map((s) => <div key={s.mag} className="flex-1" style={{ background: s.css }} />)}</div>
    <div className="flex justify-between text-[10px]"><span>17.8 urban</span><span>modeled sky</span><span>22.0 natural</span></div></>;
  if (view.startsWith("stargaze")) {
    body = <>{view === "stargaze-score" ? <><div className="h-2 w-44 rounded" style={{ background: "linear-gradient(90deg, rgb(30,40,70), rgb(90,140,140), rgb(255,240,120))" }} />
      <div className="flex justify-between text-[10px]"><span>poor</span><span>dark &amp; clear now</span><span>best</span></div></> : <>{skyBar}
      {view === "stargaze-clouds" && <div className="mt-1 flex items-center gap-1 text-[10px]"><span className="inline-block h-2 w-8 rounded-sm" style={{ background: "linear-gradient(90deg, rgba(236,240,247,0.1), rgba(236,240,247,0.9))" }} /> forecast cloud cover</div>}</>}
      <div className="mt-1 text-[10px] text-star-500">{WX_ATTRIBUTION}</div></>;
  } else if (view === "price" && anchor) {
    const css = (v: number) => `rgb(${priceColor(v, anchor.best, anchor.worst).map(Math.round).join(",")})`;
    body = <><div className="h-2 w-44 rounded" style={{ background: `linear-gradient(90deg, ${css(anchor.best)}, ${css(Math.sqrt(anchor.best * anchor.worst))}, ${css(anchor.worst)})` }} />
      <div className="flex justify-between text-[10px]"><span>${fmtInt(anchor.best)}</span><span>market $/acre</span><span>${fmtInt(anchor.worst)}+</span></div>
      <div className="mt-1 flex items-center gap-1 text-[10px]"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: `rgb(${PUBLIC_RGB.join(",")})` }} /> mostly public land (transfer/lease)</div>
      <div className="text-[10px] text-star-500">Labels: 25th–75th percentile of nearby sales × target acres</div></>;
  } else if (view === "score") {
    body = <><div className="h-2 w-40 rounded" style={{ background: "linear-gradient(90deg, rgb(30,40,70), rgb(90,140,140), rgb(255,240,120))" }} /><div className="flex justify-between text-[10px]"><span>lower</span><span>suitability</span><span>higher</span></div></>;
  } else if (view === "delta") {
    body = <><div className="h-2 w-40 rounded" style={{ background: "linear-gradient(90deg, rgb(255,110,70), rgba(0,0,0,0), rgb(60,150,255))" }} />
      <div className="flex justify-between text-[10px]"><span>brighter</span><span>{mode === "V" ? "Δ mag ±0.3" : `${mode} ±50%`}</span><span>darker</span></div></>;
  } else if (view === "viirs") {
    body = <div className="text-[10px]">VIIRS DNB annual median radiance, nW cm⁻² sr⁻¹ (log scale, 0.1 → 100)</div>;
  } else if (view === "trend") {
    body = <><div className="h-2 w-40 rounded" style={{ background: "linear-gradient(90deg, rgb(60,150,255), rgba(0,0,0,0), rgb(255,110,70))" }} />
      <div className="flex justify-between text-[10px]"><span>−50%</span><span>radiance 2012–14 → 2022–24</span><span>+50%</span></div></>;
  } else if (view === "fixtures") {
    body = <div className="max-w-[16rem] text-[10px]"><span className="text-amber-400">●</span> Gainesville Socrata <span className="ml-2 text-glow-400">●</span> OSM (surveyed) · shading = <b>modeled</b> public fixtures expected per ~500 m cell, placed on OSM roads (lit roads first); 8 counties</div>;
  } else {
    body = <><div className="flex h-2 w-44 overflow-hidden rounded">{[...SKY_LEGEND].reverse().map((s) => <div key={s.mag} className="flex-1" style={{ background: s.css }} />)}</div>
      <div className="flex justify-between text-[10px]"><span>17.8 urban</span><span>mag/arcsec²</span><span>22.0 natural</span></div></>;
  }
  return <div className={`pointer-events-none absolute bottom-6 left-2 ${lift} rounded-lg bg-ink-950/80 p-2 text-star-300 backdrop-blur`}>{body}</div>;
}
