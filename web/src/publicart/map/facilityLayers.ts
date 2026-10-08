// Public buildings on the map: Alachua County parcel outlines coloured by owner class, statewide parcel centres
// clustered by count. Shown on the Buildings tab and, as an overlay, on the Collection tab.
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { CLASS_COLOR, type Facility, type FacilitiesPkg } from "../engine/facilities";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Noto Sans Regular"];
const LAYERS = ["fac-fill", "fac-line", "fac-label", "fac-cluster", "fac-cluster-label", "fac-pt"];
const classColor: ExpressionSpecification = ["match", ["get", "cls"], ...Object.entries(CLASS_COLOR).flat(), "#a79f88"] as unknown as ExpressionSpecification;

export function addFacilityLayers(map: MlMap, before: string | undefined, onPick: (id: string) => void) {
  map.addSource("fac-poly", { type: "geojson", data: EMPTY });
  map.addSource("fac-pt", { type: "geojson", data: EMPTY, cluster: true, clusterRadius: 40, clusterMaxZoom: 12 });
  const hidden = { visibility: "none" as const };
  map.addLayer({ id: "fac-fill", type: "fill", source: "fac-poly", layout: hidden, paint: { "fill-color": classColor,
    "fill-opacity": ["case", ["get", "sel"], 0.4, ["get", "recent"], 0.28, 0.14] } }, before);
  map.addLayer({ id: "fac-line", type: "line", source: "fac-poly", layout: hidden, paint: { "line-color": classColor,
    "line-width": ["case", ["get", "sel"], 3, 1.3], "line-opacity": 0.9 } }, before);
  map.addLayer({ id: "fac-label", type: "symbol", source: "fac-poly", minzoom: 15.5, layout: { ...hidden, "text-field": ["get", "label"],
    "text-size": 10, "text-font": FONT, "text-max-width": 10 }, paint: { "text-color": classColor, "text-halo-color": "#05070d", "text-halo-width": 1.2 } });
  map.addLayer({ id: "fac-cluster", type: "circle", source: "fac-pt", filter: ["has", "point_count"], layout: hidden, paint: {
    "circle-color": "rgba(124,196,255,0.16)", "circle-stroke-color": "#7cc4ff", "circle-stroke-width": 1,
    "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 10, 100, 18, 1000, 28] } });
  map.addLayer({ id: "fac-cluster-label", type: "symbol", source: "fac-pt", filter: ["has", "point_count"], layout: { ...hidden,
    "text-field": ["to-string", ["get", "point_count"]], "text-size": 10.5, "text-font": FONT, "text-allow-overlap": true }, paint: { "text-color": "#d9d2bd" } });
  map.addLayer({ id: "fac-pt", type: "circle", source: "fac-pt", filter: ["!", ["has", "point_count"]], layout: hidden, paint: {
    "circle-color": "#05070d", "circle-stroke-color": classColor, "circle-stroke-width": ["case", ["get", "sel"], 3.5, ["get", "recent"], 2.6, 1.6],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 6] } });
  map.on("click", "fac-cluster", async (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    if (!f) return;
    const zoom = await (map.getSource("fac-pt") as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
  });
  for (const l of ["fac-fill", "fac-pt"]) {
    map.on("click", l, (ev: MapLayerMouseEvent) => { const id = ev.features?.[0]?.properties?.id; if (id) onPick(String(id)); });
    map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
  }
}

export function showFacilityLayers(map: MlMap, on: boolean) {
  for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

/** Outlines for the matching Alachua facilities, centres for the rest; `recent` marks construction since `since`. */
export function setFacilityData(map: MlMap, pkg: FacilitiesPkg, shown: Facility[], selected: string | null, since: number) {
  const keep = new Set(shown.map((f) => f.id));
  (map.getSource("fac-poly") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: pkg.alachua.features
    .filter((f) => keep.has(f.properties.id)).map((f) => ({ type: "Feature", geometry: f.geometry, properties: { id: f.properties.id, cls: f.properties.cls,
      label: f.properties.address ?? f.properties.owner, sel: f.properties.id === selected,
      recent: (f.properties.ev[f.properties.ev.length - 1]?.[0] ?? 0) >= since } })) });
  (map.getSource("fac-pt") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: shown.filter((f) => f.source === "florida")
    .map((f) => ({ type: "Feature", properties: { id: f.id, cls: f.cls, sel: f.id === selected, recent: (f.latest?.year ?? 0) >= since },
      geometry: { type: "Point", coordinates: [f.lon, f.lat] } })) });
}
