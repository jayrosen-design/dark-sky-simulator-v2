"""OpenStreetMap connectors shared by the apps (Overpass API; data (c) OpenStreetMap contributors, ODbL): streets and
paths, points of interest, route relations (rail-trails) and artworks."""
from __future__ import annotations

from .common import bbox_tag, cached_json, http
from .inventory import OVERPASS

STREET_CLASSES = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|footway|cycleway|path"
POI_TAGS = {
    "food": ('amenity', "restaurant|cafe|fast_food|ice_cream|food_court"),
    "night": ('amenity', "bar|pub|nightclub|biergarten"),
    "culture": ('amenity', "theatre|cinema|arts_centre|library|community_centre|marketplace"),
    "retail": ('shop', ".*"),
    "tourism": ('tourism', "museum|gallery|attraction|hotel|motel|guest_house"),
}


def overpass(q: str, timeout=240):
    err = None
    for url in OVERPASS:
        try:
            return http("POST", url, data={"data": q}, timeout=timeout)
        except RuntimeError as ex:
            err = ex
    raise err


def _s(bbox):
    w, s, e, n = bbox
    return f"{s},{w},{n},{e}"


def streets(bbox, refresh=False):
    """Streets, paths and trails: {"ways": [[highway, name, maxspeed, lanes, [[lon, lat], ...]], ...]}."""
    def fetch():
        res = overpass(f'[out:json][timeout:220];way["highway"~"^({STREET_CLASSES})$"]({_s(bbox)});out tags geom qt;')
        ways = []
        for el in res.get("elements", []):
            if "geometry" not in el:
                continue
            t = el.get("tags", {})
            ways.append([t.get("highway", ""), t.get("name") or t.get("ref") or "", t.get("maxspeed", ""), t.get("lanes", ""),
                         [[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]]])
        return {"bbox": list(bbox), "ways": ways}
    return cached_json(f"osm_streets_{bbox_tag(bbox)}.json", fetch, refresh)


def pois(bbox, refresh=False):
    """Points of interest by category (food, night, culture, retail, tourism): {"rows": [[lon, lat, cat, name], ...]}."""
    def fetch():
        rows = []
        for cat, (key, rx) in POI_TAGS.items():
            res = overpass(f'[out:json][timeout:180];nwr["{key}"~"^({rx})$"]({_s(bbox)});out center tags qt;')
            for el in res.get("elements", []):
                c = el if "lat" in el else el.get("center")
                if c:
                    rows.append([round(c["lon"], 5), round(c["lat"], 5), cat, el.get("tags", {}).get("name", "")])
        return {"bbox": list(bbox), "rows": rows}
    return cached_json(f"osm_pois_{bbox_tag(bbox)}.json", fetch, refresh)


def route_relations(ids, refresh=False):
    """Member-way geometry of route relations (e.g. rail-trails): {"routes": [{"id", "name", "lines": [[[lon, lat], ...]]}]}."""
    def fetch():
        routes = []
        for rid in ids:
            tags = overpass(f"[out:json][timeout:120];relation({rid});out tags;")["elements"]
            ways = overpass(f"[out:json][timeout:180];relation({rid});way(r);out geom qt;")["elements"]
            routes.append({"id": rid, "name": (tags[0].get("tags", {}).get("name") if tags else "") or f"relation {rid}",
                           "lines": [[[round(p["lon"], 5), round(p["lat"], 5)] for p in w["geometry"]] for w in ways if "geometry" in w]})
        return {"routes": routes}
    return cached_json("osm_routes_" + "_".join(map(str, ids)) + ".json", fetch, refresh)


def artworks(bbox, refresh=False):
    """tourism=artwork nodes/ways/relations (centres) with their tags."""
    def fetch():
        res = overpass(f'[out:json][timeout:120];nwr["tourism"="artwork"]({_s(bbox)});out center tags qt;')
        rows = []
        for el in res.get("elements", []):
            c = el if "lat" in el else el.get("center")
            if c:
                rows.append({"osm": f'{el["type"]}/{el["id"]}', "lon": round(c["lon"], 6), "lat": round(c["lat"], 6), "tags": el.get("tags", {})})
        return {"rows": rows}
    return cached_json(f"osm_artworks_{bbox_tag(bbox)}.json", fetch, refresh)
