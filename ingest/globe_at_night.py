"""Globe at Night citizen observations (PRD 7.5): sparse validation points for the v2.0 sanity check (0A.2)."""
from __future__ import annotations

import csv
import io
import re

from .common import bbox_tag, cached_json, http

INDEX = "https://globeatnight.org/maps-data/"
BASE = "https://globeatnight.org"


def observations(bbox, refresh=False):
    """Every GaN / SQM record inside bbox [west, south, east, north] across all published yearly CSVs."""
    def fetch():
        import requests
        html = requests.get(INDEX, timeout=60, headers={"User-Agent": "dark-sky-simulator/2.0"}).text
        links = sorted(set(re.findall(r'href="(/documents/\d+/GaN\d{4}\.csv)"', html)))
        w, s, e, n = bbox
        rows = []
        for link in links:
            text = http("GET", BASE + link, binary=True, timeout=180).decode("utf-8", errors="replace")
            for r in csv.DictReader(io.StringIO(text)):
                try:
                    lat, lon = float(r["Latitude"]), float(r["Longitude"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not (w <= lon <= e and s <= lat <= n):
                    continue
                rows.append({"id": r.get("ID"), "lat": lat, "lon": lon, "date": r.get("LocalDate"), "time": r.get("LocalTime"),
                             "limiting_mag": _num(r.get("LimitingMag")), "sqm": _num(r.get("SQMReading")),
                             "cloud": r.get("CloudCover"), "source_file": link.rsplit("/", 1)[-1]})
        return {"files": links, "rows": rows}
    return cached_json(f"globe_at_night_{bbox_tag(bbox)}.json", fetch, refresh)


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None
