"""Geocoding for hand-compiled records: the U.S. Census Geocoder for street addresses, and OpenStreetMap's Nominatim
search as a fallback for newer streets and named places (public, no key; one request per second per its usage
policy). Results are cached per query in data_raw/ (None when there is no match)."""
from __future__ import annotations

import json
import time

from .common import cache_path, http

GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
NOMINATIM = "https://nominatim.openstreetmap.org/search"


def _cached(name: str, key: str, fetch, refresh=False):
    p = cache_path(name)
    cache = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    if key in cache and not refresh:
        return cache[key]
    cache[key] = fetch()
    p.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    return cache[key]


def census_geocode(address: str, refresh=False):
    """[lon, lat, matched address] or None."""
    def fetch():
        res = http("GET", GEOCODER, params={"address": address, "benchmark": "Public_AR_Current", "format": "json"})
        m = res.get("result", {}).get("addressMatches", [])
        return [round(m[0]["coordinates"]["x"], 6), round(m[0]["coordinates"]["y"], 6), m[0]["matchedAddress"]] if m else None
    return _cached("geocode_census.json", address, fetch, refresh)


def nominatim(query: str, viewbox, refresh=False):
    """[lon, lat, display name] for a free-text query bounded to viewbox (west, south, east, north), or None."""
    def fetch():
        time.sleep(1.1)
        res = http("GET", NOMINATIM, params={"q": query, "format": "jsonv2", "limit": 1, "bounded": 1,
                                             "viewbox": ",".join(map(str, viewbox))})
        return [round(float(res[0]["lon"]), 6), round(float(res[0]["lat"]), 6), res[0]["display_name"]] if res else None
    return _cached("geocode_nominatim.json", f"{query}|{viewbox}", fetch, refresh)
