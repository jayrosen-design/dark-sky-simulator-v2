"""Public streetlight inventory connectors (PRD 2.2, 7.2) and 5 m deduplication.

Every record is normalized to the core.fixture field names (4.3): source, source_ref, owner, fixture_class,
spd_class, pole_height_m, install_year, confidence, lon, lat.
"""
from __future__ import annotations

import math

from .common import arcgis_query, bbox_tag, cached_json, http

SOCRATA_GNV = "https://data.cityofgainesville.org/resource/tk33-9jw3.geojson"
CITYWORKS = ("https://gis.alachuacounty.us/arcgis/rest/services/CityWorks/"
             "AlachuaCountyAssets_for_test_site/FeatureServer/0")
FDOT_RCI = "https://gis.fdot.gov/arcgis/rest/services/RCI_Layers/FeatureServer"
OVERPASS = ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter")
_LED_TYPES = {"FLED": "LED4000"}  # Socrata led_type code; CCT is not published, 4000K worst case (2.2)


def socrata_gainesville(refresh=False):
    def fetch():
        fc = http("GET", SOCRATA_GNV, params={"$limit": 50000})
        out = []
        for f in fc["features"]:
            p = f["properties"]
            lon, lat = f["geometry"]["coordinates"][:2]
            year = (p.get("installati") or "")[:4]
            out.append({"source": "socrata", "source_ref": p.get("objectid_1"), "owner": "City of Gainesville",
                        "fixture_class": None, "spd_class": _LED_TYPES.get(p.get("led_type"), "LED4000"),
                        "pole_height_m": _ft_to_m(p.get("mountheigh")), "install_year": int(year) if year.isdigit() else None,
                        "confidence": 0.9, "lon": lon, "lat": lat})
        return out
    return cached_json("inv_socrata_gnv.json", fetch, refresh)


def cityworks_alachua(refresh=False):
    """County Cityworks test-site layer. Returns [] (and records why) when the endpoint is unreachable."""
    def fetch():
        try:
            fc = arcgis_query(CITYWORKS)
        except RuntimeError as e:
            return {"error": str(e)[:300], "records": []}
        recs = []
        for f in fc["features"]:
            if not f.get("geometry"):
                continue
            p = f["properties"]
            lon, lat = f["geometry"]["coordinates"][:2]
            recs.append({"source": "arcgis", "source_ref": p.get("FacilityID"), "owner": "Alachua County",
                         "fixture_class": p.get("FixtureType"), "spd_class": None,
                         "pole_height_m": _ft_to_m(p.get("PoleHeight")), "install_year": None,
                         "confidence": 0.9, "lon": lon, "lat": lat, "watts": p.get("Wattage")})
        return {"error": None, "records": recs}
    return cached_json("inv_cityworks.json", fetch, refresh)


def osm_street_lamps(bbox, refresh=False):
    """Street lamps inside bbox [west, south, east, north]; county assignment happens downstream."""
    def fetch():
        w, s_, e, n = bbox
        q = (f'[out:json][timeout:120];(node["highway"="street_lamp"]({s_},{w},{n},{e});'
             f'node["utility"="street_lighting"]({s_},{w},{n},{e}););out body;')
        res, err = None, None
        for url in OVERPASS:
            try:
                res = http("POST", url, data={"data": q}, timeout=180)
                break
            except RuntimeError as ex:
                err = ex
        if res is None:
            raise err
        out = []
        for el in res.get("elements", []):
            t = el.get("tags", {})
            out.append({"source": "osm", "source_ref": str(el["id"]), "owner": t.get("operator"),
                        "fixture_class": None, "spd_class": _osm_spd(t.get("lamp_type")),
                        "pole_height_m": None, "install_year": None, "confidence": 0.6,
                        "lon": el["lon"], "lat": el["lat"]})
        return out
    return cached_json(f"inv_osm_{bbox_tag(bbox)}.json", fetch, refresh)


ROAD_CLASSES = ("motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|"
                "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link")


def osm_roads(bbox, tile_deg: float = 0.5, refresh=False):
    """Public road network with the OSM `lit` tag, fetched in tiles (PRD 2.2: utility fixtures are
    distributed along the served road network). Returns {"lines": [[lit(0/1), [[lon, lat], ...]], ...]}."""
    def fetch():
        w, s, e, n = bbox
        lines, seen = [], set()
        y = s
        while y < n:
            x = w
            while x < e:
                q = (f'[out:json][timeout:170];way["highway"~"^({ROAD_CLASSES})$"]'
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
                    lit = 1 if el.get("tags", {}).get("lit") == "yes" else 0
                    lines.append([lit, [[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]]])
                x += tile_deg
            y += tile_deg
        return {"bbox": list(bbox), "lines": lines}
    return cached_json(f"osm_roads_{bbox_tag(bbox)}.json", fetch, refresh)


SPORTS = "baseball|softball|american_football|soccer|lacrosse|tennis|pickleball|basketball|multi"


def osm_sports(bbox, refresh=False):
    """Sports venues that may be lit: stadiums, lit=yes pitches/tracks, and main-sport pitches without a lit tag.
    Returns [{lon, lat, leisure, sport, lit}] with lit in {"yes", "no", ""}."""
    def fetch():
        w, s, e, n = bbox
        b = f"({s},{w},{n},{e})"
        q = (f'[out:json][timeout:180];(nwr["leisure"="stadium"]{b};nwr["leisure"~"^(pitch|track)$"]["lit"="yes"]{b};'
             f'nwr["leisure"~"^(pitch|track)$"]["sport"~"{SPORTS}"]{b};);out tags center qt;')
        res, err = None, None
        for url in OVERPASS:
            try:
                res = http("POST", url, data={"data": q}, timeout=240)
                break
            except RuntimeError as ex:
                err = ex
        if res is None:
            raise err
        out = []
        for el in res.get("elements", []):
            c = el.get("center") or ({"lon": el["lon"], "lat": el["lat"]} if "lon" in el else None)
            if not c:
                continue
            t = el.get("tags", {})
            out.append({"lon": round(c["lon"], 5), "lat": round(c["lat"], 5), "leisure": t.get("leisure"),
                        "sport": (t.get("sport") or "").split(";")[0], "lit": t.get("lit", ""), "name": t.get("name")})
        return out
    return cached_json(f"osm_sports_{bbox_tag(bbox)}.json", fetch, refresh)


def fdot_lighting_district2(refresh=False):
    """FDOT RCI Feature 341 'Lighting System'. Discovers the layer by name; returns status when absent."""
    def fetch():
        svc = http("GET", FDOT_RCI, params={"f": "json"})
        layer = next((l for l in svc.get("layers", []) if "light" in l["name"].lower()), None)
        if layer is None:
            return {"status": "layer_not_published",
                    "checked_layers": [l["name"] for l in svc.get("layers", [])], "segments": []}
        fc = arcgis_query(f"{FDOT_RCI}/{layer['id']}", where="DISTRICT='2'")
        return {"status": "ok", "layer": layer["name"], "segments": fc["features"]}
    return cached_json("inv_fdot_rci341.json", fetch, refresh)


def dedup(records: list[dict], buffer_m: float = 5.0) -> tuple[list[dict], int]:
    """Merge records within buffer_m, keeping the most attribute-rich (PRD 2.2 5 m buffer)."""
    def richness(r):
        return sum(r.get(k) is not None for k in ("fixture_class", "spd_class", "pole_height_m", "install_year")) + r["confidence"]

    cell = buffer_m / 111_320.0
    buckets: dict[tuple[int, int], list[dict]] = {}
    kept: list[dict] = []
    merged = 0
    for r in sorted(records, key=richness, reverse=True):
        key = (int(r["lon"] / cell), int(r["lat"] / cell))
        near = [k for dx in (-1, 0, 1) for dy in (-1, 0, 1) for k in buckets.get((key[0] + dx, key[1] + dy), [])]
        if any(_meters(r, k) <= buffer_m for k in near):
            merged += 1
            continue
        buckets.setdefault(key, []).append(r)
        kept.append(r)
    return kept, merged


def _meters(a, b):
    dx = (a["lon"] - b["lon"]) * 111_320.0 * math.cos(math.radians(a["lat"]))
    dy = (a["lat"] - b["lat"]) * 111_320.0
    return math.hypot(dx, dy)


def _ft_to_m(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f * 0.3048, 1) if f > 0 else None


def _osm_spd(lamp_type):
    return {"sodium": "HPS", "high_pressure_sodium": "HPS", "LED": "LED4000", "led": "LED4000",
            "metal-halide": "MH", "metal_halide": "MH"}.get(lamp_type or "")
