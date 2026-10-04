"""Public Art Policy Simulator connectors: City of Gainesville ArcGIS Online layers (GCRA boundary and priority areas,
zoning, bicycle/pedestrian counters) and the RTS transit feed. Public, no keys. Generic connectors (OSM, Census, ACS,
BLS CPI, GTFS, geocoding, FDOT traffic) are the shared backend in ingest/."""
from __future__ import annotations

from ingest.common import arcgis_query, cached_json

GNV = "https://services2.arcgis.com/Zzhtlau4ccHkQgTu/arcgis/rest/services"
LAYERS = {
    "gcra_boundary": f"{GNV}/GCRA_Expanded_Boundary_2022/FeatureServer/0",
    "gcra_projects": f"{GNV}/GCRA_Reinvestment_Initiatives_WFL1/FeatureServer/0",
    "gcra_housing": f"{GNV}/GCRA_Reinvestment_Initiatives_WFL1/FeatureServer/1",
    "gcra_economic": f"{GNV}/GCRA_Reinvestment_Initiatives_WFL1/FeatureServer/2",
    "gcra_public_space": f"{GNV}/GCRA_Reinvestment_Initiatives_WFL1/FeatureServer/3",
    "zoning": f"{GNV}/Gainesville_Existing_Zoning_01_05_2025/FeatureServer/1",
    "counters": f"{GNV}/Bicycle_Pedestrian_Counts_2025/FeatureServer/0",
}
# RTS static GTFS (Fall 2026), linked from go-rts.com/rts-data; the file name changes each service change.
RTS_GTFS = "https://go-rts.com/wp-content/uploads/2026/08/RTSGTFS_Fall2026-1.zip"


def city_layer(name: str, out_fields="*", max_offset=None, refresh=False):
    """A City of Gainesville layer as GeoJSON, cached as data_raw/gnv_<name>.json."""
    return cached_json(f"gnv_{name}.json", lambda: arcgis_query(LAYERS[name], out_fields=out_fields, max_offset=max_offset), refresh)
