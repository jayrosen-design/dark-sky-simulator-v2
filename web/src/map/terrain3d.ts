// 3D terrain, extruded buildings and light-source layers, shared by the planner map and the Sites ground view.
// Terrain: AWS Terrain Tiles (Terrarium encoding; USGS 3DEP and other public DEMs), no key. Buildings: the
// OpenFreeMap/OpenMapTiles building layer (render_height).
import type { FeatureCollection, Point, Polygon } from "geojson";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { emptyFC } from "./lights3d";

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

const DEM = {
  type: "raster-dem" as const, tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  encoding: "terrarium" as const, tileSize: 256, maxzoom: 15,
  attribution: "Terrain: <a href=\"https://registry.opendata.aws/terrain-tiles/\">AWS Terrain Tiles</a> (USGS 3DEP et al.)",
};
const LAT_COS = Math.cos((29.5 * Math.PI) / 180);
/** Circle radius in pixels for a radius in meters at any zoom (MapLibre 512-px tiles). */
const metersToPx = (prop: string) => ["interpolate", ["exponential", 2], ["zoom"], 0, ["/", ["get", prop], 78271.517 * LAT_COS], 24, ["/", ["*", ["get", prop], 2 ** 24], 78271.517 * LAT_COS]];

export const LAYERS_3D = ["hillshade-3d", "buildings-3d", "lamp-pools", "lamp-poles"] as const;

/** Add (hidden) 3D sources and layers once, after the style has loaded. */
export function add3DLayers(map: MlMap, beforeId?: string) {
  if (map.getSource("dem")) return;
  map.addSource("dem", DEM);
  map.addSource("dem-hs", DEM); // hillshade on its own source, as MapLibre recommends alongside terrain
  map.addLayer({ id: "hillshade-3d", type: "hillshade", source: "dem-hs", layout: { visibility: "none" },
    paint: { "hillshade-exaggeration": 0.5, "hillshade-shadow-color": "#05070d", "hillshade-highlight-color": "#5a6682", "hillshade-accent-color": "#1a1f2c" } }, beforeId);
  map.addLayer({ id: "buildings-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
    filter: ["!=", ["get", "hide_3d"], true], layout: { visibility: "none" },
    paint: { "fill-extrusion-color": "#34405a", "fill-extrusion-opacity": 0.85, "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] } });
  map.addSource("lamp-pools", { type: "geojson", data: emptyFC<Point>() });
  map.addLayer({ id: "lamp-pools", type: "circle", source: "lamp-pools", layout: { visibility: "none" },
    paint: { "circle-color": ["get", "color"], "circle-opacity": ["get", "o"], "circle-blur": 0.9, "circle-pitch-alignment": "map",
      "circle-radius": metersToPx("r") as never } });
  map.addSource("lamp-poles", { type: "geojson", data: emptyFC<Polygon>() });
  map.addLayer({ id: "lamp-poles", type: "fill-extrusion", source: "lamp-poles", minzoom: 12, layout: { visibility: "none" },
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-opacity": 1 } });
}

/** Turn terrain + 3D layers on or off. */
export function set3D(map: MlMap, on: boolean, exaggeration = 1) {
  if (!map.getSource("dem")) return;
  map.setTerrain(on ? { source: "dem", exaggeration } : null);
  for (const id of LAYERS_3D) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

export function setLamps(map: MlMap, poles: FeatureCollection<Polygon>, pools: FeatureCollection<Point>) {
  (map.getSource("lamp-poles") as GeoJSONSource | undefined)?.setData(poles);
  (map.getSource("lamp-pools") as GeoJSONSource | undefined)?.setData(pools);
}
