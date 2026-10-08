"""US Census connectors (PRD 7.3 TIGER/Line): 2020 block groups with housing units, places with population,
county subdivisions with 2010->2020 housing growth, counties, primary/secondary roads.

All counts come from TIGERweb decennial attributes (HU100, POP100), which need no API key; the Census
data API (ACS) now requires a key, so ACS B25024 structure-type splits are not used in v2.0.
"""
from __future__ import annotations

from .common import arcgis_query, bbox_tag, cached_json

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


def block_group_polygons(bbox, refresh=False):
    """2020 block-group polygons (generalized to ~20 m) with GEOID, population and housing units."""
    return cached_json(f"census_bg_polygons_{bbox_tag(bbox)}.json", lambda: arcgis_query(
        f"{C2020}/8", bbox=bbox, out_fields="GEOID,POP100,HU100", max_offset=0.0002), refresh)


def blocks(bbox, refresh=False):
    """2020 census-block internal points with population and housing units (for walk-access coverage)."""
    def fetch():
        fc = arcgis_query(f"{C2020}/10", bbox=bbox, geometry=False, out_fields="GEOID,INTPTLAT,INTPTLON,POP100,HU100")
        return {"vintage": "2020 decennial (TIGERweb POP100/HU100)", "rows": [
            [round(float(p["INTPTLON"]), 5), round(float(p["INTPTLAT"]), 5), int(p["POP100"] or 0), int(p["HU100"] or 0), p["GEOID"]]
            for p in (f["properties"] for f in fc["features"])]}
    return cached_json(f"census_blocks_{bbox_tag(bbox)}.json", fetch, refresh)


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


GAZETTEER = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_{kind}_national.zip"


def gazetteer(kind: str, refresh=False):
    """Census Gazetteer internal points for every ZCTA ("zcta"), county ("counties") or place ("place"):
    {"rows": {key: [lon, lat]}}; keys are the ZCTA, the county GEOID, or "ST|place name" (lower case, without the
    trailing type such as 'city', 'town', 'CDP' or 'metro government', or '(balance)'; consolidated names also get a
    short key, e.g. "KY|louisville"). Counties also carry {"names": {"ST|name county": GEOID}}."""
    import io
    import re
    import zipfile

    from .common import http

    def fetch():
        z = zipfile.ZipFile(io.BytesIO(http("GET", GAZETTEER.format(kind=kind), binary=True)))
        lines = z.read(z.namelist()[0]).decode("latin-1").splitlines()
        head = [h.strip() for h in lines[0].split("\t")]
        rows, names = {}, {}
        for line in lines[1:]:
            r = dict(zip(head, (v.strip() for v in line.split("\t"))))
            pt = [round(float(r["INTPTLONG"]), 5), round(float(r["INTPTLAT"]), 5)]
            if kind == "place":
                name = re.sub(r"\s*\(balance\)$", "", r["NAME"])           # consolidated cities: "Indianapolis city (balance)"
                name = re.sub(r"\s+(city|town|village|CDP|borough|municipality|city and borough|metro(politan)? government|"
                              r"unified government|consolidated government)$", "", name, flags=re.I)
                rows[f'{r["USPS"]}|{name.lower()}'] = pt
                short = re.split(r"[/-]", name)[0].strip()                 # "Louisville/Jefferson County", "Nashville-Davidson"
                rows.setdefault(f'{r["USPS"]}|{short.lower()}', pt)
            else:
                rows[r["GEOID"]] = pt
                if kind == "counties":
                    names[f'{r["USPS"]}|{r["NAME"].lower()}'] = r["GEOID"]
        return {"vintage": "2024 Gazetteer", "rows": rows} | ({"names": names} if names else {})
    return cached_json(f"census_gazetteer_{kind}.json", fetch, refresh)


def state_counties(state_fips: str, refresh=False):
    """2020 county polygons for one state (generalized to ~200 m) with GEOID and NAME."""
    return cached_json(f"census_counties_state{state_fips}.json", lambda: arcgis_query(
        f"{C2020}/82", where=f"STATE='{state_fips}'", out_fields="GEOID,BASENAME,NAME", max_offset=0.002), refresh)
