// Funding tab map layers: federal arts awards clustered with a dollar total on each cluster, Florida state awards
// summed per county, and open calls to artists labelled with their budget. Hidden on every other tab.
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import { byCounty, CALL_COLOR, SOURCE_COLOR, type Call, type Item } from "../engine/grants";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Noto Sans Regular"];
const LAYERS = ["gaw-cluster", "gaw-cluster-label", "gaw-point", "gaw-point-label", "gfl", "gfl-label", "gcall", "gcall-label"];

/** "$1.2M"-style label for a dollar value in a MapLibre expression (same rounding as fmtMoney). Rounds before
 * formatting: number-format treats "max-fraction-digits": 0 as unset and prints three decimals. */
function moneyExpr(v: ExpressionSpecification): ExpressionSpecification {
  const f = (div: number, tenths: boolean, unit: string): ExpressionSpecification => ["concat", "$",
    ["to-string", tenths ? ["/", ["round", ["/", v, div / 10]], 10] : ["round", ["/", v, div]]], unit];
  return ["case", [">=", v, 1e9], f(1e9, true, "B"), [">=", v, 1e6], f(1e6, true, "M"), [">=", v, 1e3], f(1e3, false, "K"), f(1, false, "")];
}

export function addGrantLayers(map: MlMap, onPick: (kind: "item" | "call" | "county", id: string) => void) {
  map.addSource("gaw", { type: "geojson", data: EMPTY, cluster: true, clusterRadius: 46, clusterMaxZoom: 11,
    clusterProperties: { sum: ["+", ["get", "amount"]] } });
  map.addSource("gfl", { type: "geojson", data: EMPTY });
  map.addSource("gcall", { type: "geojson", data: EMPTY });
  const hidden = { visibility: "none" as const };
  const sum = ["get", "sum"] as ExpressionSpecification;
  map.addLayer({ id: "gaw-cluster", type: "circle", source: "gaw", filter: ["has", "point_count"], layout: hidden, paint: {
    "circle-color": "rgba(183,156,255,0.22)", "circle-stroke-color": "#b79cff", "circle-stroke-width": 1.2,
    "circle-radius": ["interpolate", ["linear"], ["sqrt", sum], 300, 12, 3000, 22, 10000, 34] } });
  map.addLayer({ id: "gaw-cluster-label", type: "symbol", source: "gaw", filter: ["has", "point_count"], layout: { ...hidden,
    "text-field": ["concat", moneyExpr(sum), "\n", ["to-string", ["get", "point_count"]]], "text-size": 10.5, "text-font": FONT, "text-allow-overlap": true },
    paint: { "text-color": "#f5f1e6", "text-halo-color": "#05070d", "text-halo-width": 1 } });
  map.addLayer({ id: "gaw-point", type: "circle", source: "gaw", filter: ["!", ["has", "point_count"]], layout: hidden, paint: {
    "circle-color": ["match", ["get", "source"], "NEA", SOURCE_COLOR.NEA, "NEH", SOURCE_COLOR.NEH, SOURCE_COLOR.IMLS],
    "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "amount"]], 50, 3, 300, 6, 1500, 12],
    "circle-stroke-color": ["case", ["get", "sel"], "#ffffff", "#05070d"], "circle-stroke-width": ["case", ["get", "sel"], 2.5, 1] } });
  map.addLayer({ id: "gaw-point-label", type: "symbol", source: "gaw", filter: ["!", ["has", "point_count"]], minzoom: 9, layout: { ...hidden,
    "text-field": moneyExpr(["get", "amount"]), "text-size": 10, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": FONT },
    paint: { "text-color": "#d9d2bd", "text-halo-color": "#05070d", "text-halo-width": 1 } });
  const flSize: ExpressionSpecification = ["interpolate", ["linear"], ["sqrt", ["get", "total"]], 100, 6, 1000, 14, 4000, 26];
  map.addLayer({ id: "gfl", type: "circle", source: "gfl", layout: hidden, paint: {
    "circle-color": "rgba(246,180,75,0.18)", "circle-stroke-color": SOURCE_COLOR.FL, "circle-stroke-width": 1.5,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["*", 0.35, flSize], 7, flSize] } });
  map.addLayer({ id: "gfl-label", type: "symbol", source: "gfl", minzoom: 5.5, layout: { ...hidden,
    "text-field": ["step", ["zoom"], moneyExpr(["get", "total"]), 7, ["concat", ["get", "place"], "\n", moneyExpr(["get", "total"])]],
    "text-size": 10.5, "text-font": FONT }, paint: { "text-color": SOURCE_COLOR.FL, "text-halo-color": "#05070d", "text-halo-width": 1.2 } });
  map.addLayer({ id: "gcall", type: "circle", source: "gcall", layout: hidden, paint: {
    "circle-color": "#05070d", "circle-stroke-color": CALL_COLOR, "circle-stroke-width": ["case", ["get", "sel"], 3.5, 2.2],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 10, 8] } });
  map.addLayer({ id: "gcall-label", type: "symbol", source: "gcall", layout: { ...hidden,
    "text-field": ["case", ["has", "budget"], moneyExpr(["get", "budget"]), "call"], "text-size": 10.5, "text-offset": [0, -1.25], "text-anchor": "bottom",
    "text-font": FONT, "text-allow-overlap": false }, paint: { "text-color": CALL_COLOR, "text-halo-color": "#05070d", "text-halo-width": 1.2 } });

  map.on("click", "gaw-cluster", async (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    if (!f) return;
    const zoom = await (map.getSource("gaw") as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
  });
  const pick = (layer: string, kind: "item" | "call" | "county", key: string) => {
    map.on("click", layer, (ev: MapLayerMouseEvent) => { const id = ev.features?.[0]?.properties?.[key]; if (id != null) onPick(kind, String(id)); });
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  };
  pick("gaw-point", "item", "id");
  pick("gcall", "call", "id");
  pick("gfl", "county", "place");
  map.on("mouseenter", "gaw-cluster", () => { map.getCanvas().style.cursor = "zoom-in"; });
  map.on("mouseleave", "gaw-cluster", () => { map.getCanvas().style.cursor = ""; });
}

export function showGrantLayers(map: MlMap, on: boolean) {
  for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

const pt = (lon: number, lat: number, properties: Record<string, unknown>): Feature<Point> =>
  ({ type: "Feature", properties, geometry: { type: "Point", coordinates: [lon, lat] } });

/** Federal awards and Florida county totals from the filtered items; calls that are open and placed. */
export function setGrantData(map: MlMap, items: Item[], calls: Call[], selected: string | null) {
  const fed = items.filter((it) => it.source !== "FL").map((it) => pt(it.lon, it.lat, { id: it.id, source: it.source, amount: it.amount, sel: it.id === selected }));
  (map.getSource("gaw") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: fed });
  (map.getSource("gfl") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection",
    features: byCounty(items).map((c) => pt(c.lon, c.lat, { place: c.place, total: c.total, n: c.n })) });
  (map.getSource("gcall") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection",
    features: calls.filter((c) => c.lon != null && c.lat != null).map((c) => pt(c.lon!, c.lat!, { id: c.id, sel: c.id === selected,
      ...(c.budget_usd ? { budget: c.budget_usd } : {}) })) });
}
