"""US Census connectors (PRD 7.3 TIGER/Line): 2020 block groups with housing units, places with population,
county subdivisions with 2010->2020 housing growth, counties, primary/secondary roads.

All counts come from TIGERweb decennial attributes (HU100, POP100), which need no API key; the Census
data API (ACS) now requires a key, so ACS B25024 structure-type splits are not used in v2.0.
"""
from __future__ import annotations

from .common import arcgis_query, cached_json

TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb"
C2020 = f"{TIGER}/tigerWMS_Census2020/MapServer"
C2010 = f"{TIGER}/tigerWMS_Census2010/MapServer"


def block_groups(bbox, refresh=False):
    """2020 block-group internal points, land area, housing units, population, urban/rural flag."""
    def fetch():
        fc = arcgis_query(f"{C2020}/8", bbox=bbox, geometry=False,
                          out_fields="GEOID,AREALAND,INTPTLAT,INTPTLON,HU100,POP100,UR")
        rows = [{"geoid": p["GEOID"], "lat": float(p["INTPTLAT"]), "lon": float(p["INTPTLON"]),
                 "aland_m2": float(p["AREALAND"] or 0), "hu": int(p["HU100"] or 0), "pop": int(p["POP100"] or 0),
                 "urban": p.get("UR") == "U"} for p in (f["properties"] for f in fc["features"])]
        return {"vintage": "2020 decennial (TIGERweb HU100/POP100)", "rows": rows}
    return cached_json("census_block_groups.json", fetch, refresh)


def places(bbox, refresh=False):
    """Incorporated places + CDPs (2020) with population and generalized polygons."""
    def fetch():
        feats = []
        for layer, kind in ((26, "incorporated"), (28, "cdp")):
            fc = arcgis_query(f"{C2020}/{layer}", bbox=bbox, max_offset=0.001,
                              out_fields="GEOID,STATE,BASENAME,NAME,INTPTLAT,INTPTLON,POP100,HU100")
            for f in fc["features"]:
                f["properties"]["kind"] = kind
            feats.extend(fc["features"])
        return {"type": "FeatureCollection", "features": feats}
    return cached_json("census_places.json", fetch, refresh)


def county_subdivisions(bbox, refresh=False):
    """2020 county subdivisions with HU 2020 and the matching 2010 HU (same GEOID)."""
    def fetch():
        fc = arcgis_query(f"{C2020}/20", bbox=bbox, max_offset=0.002, out_fields="GEOID,NAME,HU100,POP100")
        old = arcgis_query(f"{C2010}/28", bbox=bbox, geometry=False, out_fields="GEOID,HU100")
        hu10 = {f["properties"]["GEOID"]: f["properties"]["HU100"] for f in old["features"]}
        for f in fc["features"]:
            p = f["properties"]
            p["hu2020"], p["hu2010"] = p.pop("HU100"), hu10.get(p["GEOID"])
        return fc
    return cached_json("census_county_subdivisions.json", fetch, refresh)


def counties(bbox, refresh=False):
    return cached_json("census_counties.json",
                       lambda: arcgis_query(f"{C2020}/82", bbox=bbox, max_offset=0.002,
                                            out_fields="GEOID,STATE,COUNTY,BASENAME,NAME,HU100,POP100"),
                       refresh)


def major_roads(bbox, refresh=False):
    """TIGER primary (interstates) and secondary (US/state highways) roads."""
    def fetch():
        feats = []
        for layer_id, cls in ((2, "primary"), (6, "secondary")):
            fc = arcgis_query(f"{TIGER}/Transportation/MapServer/{layer_id}", bbox=bbox,
                              out_fields="MTFCC,NAME,RTTYP", max_offset=0.0005)
            for f in fc["features"]:
                f["properties"]["road_class"] = cls
            feats.extend(fc["features"])
        return {"type": "FeatureCollection", "features": feats}
    return cached_json("census_major_roads.json", fetch, refresh)
