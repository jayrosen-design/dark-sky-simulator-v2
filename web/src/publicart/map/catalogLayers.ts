// Florida catalog map layers (Collection tab, Florida scope): works clustered with a count, single works labelled
// with their title up close. Works the archive marks off view are listed but not drawn.
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { Work } from "../engine/catalog";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Noto Sans Regular"];
const LAYERS = ["fla-cluster", "fla-cluster-label", "fla-point", "fla-point-label"];
export const CATALOG_COLOR = "#b79cff";

export function addCatalogLayers(map: MlMap, onPick: (id: string) => void) {
  map.addSource("fla", { type: "geojson", data: EMPTY, cluster: true, clusterRadius: 42, clusterMaxZoom: 13 });
  const hidden = { visibility: "none" as const };
  map.addLayer({ id: "fla-cluster", type: "circle", source: "fla", filter: ["has", "point_count"], layout: hidden, paint: {
    "circle-color": "rgba(183,156,255,0.25)", "circle-stroke-color": CATALOG_COLOR, "circle-stroke-width": 1.2,
    "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 11, 50, 18, 300, 28] } });
  map.addLayer({ id: "fla-cluster-label", type: "symbol", source: "fla", filter: ["has", "point_count"], layout: { ...hidden,
    "text-field": ["to-string", ["get", "point_count"]], "text-size": 11, "text-font": FONT, "text-allow-overlap": true },
    paint: { "text-color": "#f5f1e6" } });
  map.addLayer({ id: "fla-point", type: "circle", source: "fla", filter: ["!", ["has", "point_count"]], layout: hidden, paint: {
    "circle-color": ["case", ["get", "budget"], "#f6b44b", CATALOG_COLOR], "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 16, 7],
    "circle-stroke-color": ["case", ["get", "sel"], "#ffffff", "#05070d"], "circle-stroke-width": ["case", ["get", "sel"], 2.5, 1] } });
  map.addLayer({ id: "fla-point-label", type: "symbol", source: "fla", filter: ["!", ["has", "point_count"]], minzoom: 14, layout: { ...hidden,
    "text-field": ["get", "title"], "text-size": 10.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": FONT, "text-max-width": 12 },
    paint: { "text-color": "#d9d2bd", "text-halo-color": "#05070d", "text-halo-width": 1.2 } });
  map.on("click", "fla-cluster", async (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    if (!f) return;
    const zoom = await (map.getSource("fla") as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
  });
  map.on("click", "fla-point", (ev: MapLayerMouseEvent) => { const id = ev.features?.[0]?.properties?.id; if (id) onPick(String(id)); });
  for (const l of ["fla-cluster", "fla-point"]) {
    map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
  }
}

export function showCatalogLayers(map: MlMap, on: boolean) {
  for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

export function setCatalogData(map: MlMap, works: Work[], selected: string | null) {
  (map.getSource("fla") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: works.filter((w) => !w.offView).map((w) => ({
    type: "Feature", properties: { id: w.id, title: w.title, budget: w.budget != null, sel: w.id === selected },
    geometry: { type: "Point", coordinates: [w.lon, w.lat] } })) });
}
