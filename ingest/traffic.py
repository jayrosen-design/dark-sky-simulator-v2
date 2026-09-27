"""Traffic Insights (WildSight) connectors: tagged road network, FDOT traffic volumes, animal-vehicle crash
records and hotspots. All public, no keys."""
from __future__ import annotations

from .common import arcgis_query, bbox_tag, cached_json, http
from .inventory import OVERPASS

# Roads where roadside wildlife warning units could go. Residential streets and links are left out.
WVC_ROAD_CLASSES = "motorway|trunk|primary|secondary|tertiary|unclassified"
FDOT_AADT = "https://services1.arcgis.com/O1JpcwDW8sjYuddV/arcgis/rest/services/Annual_Average_Daily_Traffic_TDA/FeatureServer/0"
# University of Florida Center for Landscape Conservation Planning, from Signal Four Analytics crash reports.
UF_AVC = "https://services.arcgis.com/LBbVDC0hKPAnLRpO/arcgis/rest/services/Animal_Related_Vehicle_Collisions_2014_2024/FeatureServer/0"
UF_AVC_HOTSPOTS = "https://services.arcgis.com/LBbVDC0hKPAnLRpO/arcgis/rest/services/AnimalVehicleCollisionHotspots_2014To2024/FeatureServer/120"


def osm_roads_tagged(bbox, tile_deg: float = 0.5, refresh=False):
    """OSM roads with class, name/ref, maxspeed and lanes. Returns {"ways": [[cls, name, maxspeed, lanes, [[lon, lat], ...]], ...]}."""
    def fetch():
        w, s, e, n = bbox
        ways, seen = [], set()
        y = s
        while y < n:
            x = w
            while x < e:
                q = (f'[out:json][timeout:170];way["highway"~"^({WVC_ROAD_CLASSES})$"]'
                     f'({y},{x},{min(y + tile_deg, n)},{min(x + tile_deg, e)});out tags geom qt;')
                res, err = None, None
                for url in OVERPASS:
                    try:
                        res = http("POST", url, data={"data": q}, timeout=240)
                        break
                    except RuntimeError as ex:
                        err = ex
                if res is None:
                    raise err
                for el in res.get("elements", []):
                    if el["id"] in seen or "geometry" not in el:
                        continue
                    seen.add(el["id"])
                    t = el.get("tags", {})
                    name = t.get("name") or t.get("ref") or ""
                    if t.get("ref") and t.get("name") and t["ref"] not in t["name"]:
                        name = f'{t["name"]} ({t["ref"]})'
                    ways.append([t.get("highway", ""), name, t.get("maxspeed", ""), t.get("lanes", ""),
                                 [[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]]])
                x += tile_deg
            y += tile_deg
        return {"bbox": list(bbox), "ways": ways}
    return cached_json(f"osm_roads_tagged_{bbox_tag(bbox)}.json", fetch, refresh)


def fdot_aadt(county_names, refresh=False):
    """FDOT annual average daily traffic on state-highway sections in the named counties (polylines)."""
    where = "COUNTY IN (" + ",".join(f"'{c}'" for c in county_names) + ")"
    return cached_json("fdot_aadt.json", lambda: arcgis_query(
        FDOT_AADT, where=where, out_fields="YEAR_,ROADWAY,DESC_FRM,DESC_TO,AADT,TFCTR,COUNTY"), refresh)


def avc_crashes(bbox, refresh=False):
    """Animal-related vehicle crash reports 2014-2024 (Signal Four Analytics, species-coded by UF CLCP)."""
    return cached_json(f"uf_avc_{bbox_tag(bbox)}.json", lambda: arcgis_query(
        UF_AVC, bbox=bbox, out_fields="Record_Year,Size_Group,Species_Class,WL_Species_Group,Species_ID,Verification_Status"), refresh)


def avc_hotspots(bbox, refresh=False):
    """Getis-Ord Gi* animal-vehicle collision hotspots 2014-2024 (UF CLCP for FDOT)."""
    return cached_json(f"uf_avc_hotspots_{bbox_tag(bbox)}.json", lambda: arcgis_query(
        UF_AVC_HOTSPOTS, bbox=bbox, out_fields="Gi_Bin,Confidence_Level,NAME,WVC_Total,S4_Deer,FWC_Bear,FWC_Panther,S4_Alligator"), refresh)
