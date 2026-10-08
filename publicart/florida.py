"""Florida public art catalog for the Public Art Policy Simulator: every Florida work listed in the Public Art Archive.

    python -m publicart.florida            # uses the raw-data cache in data_raw/
    python -m publicart.florida --refresh  # refetches the archive first

Source: the Public Art Archive, a publication of Creative West (publicartarchive.org), through its public search.
FACTS ONLY, as for the Alachua import (ADR 0002): title, artist, year, materials, work type, placement, collection,
owner, building, city and the archive's coordinates, each work linked to its archive record. Descriptions and images
are neither requested nor stored. The county comes from the coordinates (2020 Census county polygons).

The archive has no budget field. Budgets come from florida_budgets.yaml, compiled from the commissioning bodies' own
documents (inventories, agenda items, press releases) and matched to works by title and artist; each keeps its source.
Output: web/public/public-art/data/florida.json, loaded by the Collection tab's Florida catalog.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

import yaml
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from ingest import census
from ingest.common import cached_json, http

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "web" / "public" / "public-art" / "data" / "florida.json"
API = "https://api-ng.publicartarchive.org/graphql"
FIELDS = """id titles collections artists owners address { address city state zip } geo currentLocation appSlug titleEncoded
            metaInfo { mapView } placement workTypes materials yearCreated"""
QUERY = "query SearchArts($dto: SearchArtsInput!) { searchArts(dto: $dto) { items { %s } meta { totalItems hasMore } } }" % FIELDS
CENTER, RADIUS = (28.1, -83.6), 600        # a search circle that covers the whole state (its units are the archive's)
BUDGET_KINDS = ["commission", "purchase", "appraised", "project"]


def fetch_archive(refresh=False):
    """Every archive record in the search circle, facts fields only: {"fetched", "items"}. About one request a second."""
    def fetch():
        items, page = [], 1
        while True:
            res = http("POST", API, json_body={"query": QUERY, "variables": {"dto": {
                "geoDistance": {"lat": CENTER[0], "lon": CENTER[1], "distance": RADIUS}, "page": page, "limit": 100}}})["data"]["searchArts"]
            items += res["items"]
            if not res["meta"]["hasMore"]:
                break
            page += 1
            time.sleep(1.2)
        return {"fetched": dt.date.today().isoformat(), "items": items}
    return cached_json("paa_florida.json", fetch, refresh)


def term(t: str) -> str:
    """Archive vocabulary terms carry qualifiers: "bronze (metal)" -> "bronze", "paintings (visual works)" -> "paintings"."""
    return re.sub(r"\s*\([^)]*\)", "", t).strip()


def terms(ts) -> str | None:
    out = list(dict.fromkeys(term(t) for t in ts or [] if t and term(t)))
    return ", ".join(out) or None


def key(title: str | None, artist: str | None) -> str:
    """Match key for budgets: title and the artist's first surname-like token, accents and punctuation removed."""
    norm = lambda s: re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()).strip()
    a = norm(artist).split()
    return f"{norm(title)}|{a[-1] if a else ''}"


def load_budgets():
    path = HERE / "florida_budgets.yaml"
    if not path.exists():
        return {}
    out = {}
    for b in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("budgets") or []:
        for artist in re.split(r"\s*(?:,|&| and )\s*", b.get("artist") or "") or [""]:
            out.setdefault(key(b.get("title"), artist), b)
    return out


def build(refresh=False):
    raw = fetch_archive(refresh)
    fl = [it for it in raw["items"] if (it.get("address") or {}).get("state") in ("Florida", "FL") and it.get("geo")]
    counties = [(f["properties"]["BASENAME"], shape(f["geometry"])) for f in census.state_counties("12")["features"]]
    tree = STRtree([g for _, g in counties])
    budgets, used = load_budgets(), set()
    cols = ["id", "title", "artist", "year", "medium", "types", "placement", "collection", "owner", "building", "city", "county",
            "lon", "lat", "off_view", "url", "budget", "budget_kind", "budget_source"]
    rows, report = [], {"outside_counties": 0}
    for it in fl:
        lon, lat = it["geo"]
        hits = [counties[i][0] for i in tree.query(Point(lon, lat), predicate="intersects")]
        if not hits:
            report["outside_counties"] += 1        # offshore points (reefs, the underwater museum) keep no county
        artists = ", ".join(a.strip() for a in it.get("artists") or [] if a.strip()) or None
        title = (it.get("titles") or ["Untitled"])[0].strip()
        b = None
        for a in (it.get("artists") or [None]):
            b = budgets.get(key(title, a))
            if b:
                used.add(key(b.get("title"), a))
                break
        yr = it.get("yearCreated")
        yr = int(yr) if isinstance(yr, (int, float)) or (isinstance(yr, str) and yr.isdigit()) else None
        addr = it.get("address") or {}
        rows.append([it["appSlug"], title, artists, yr, terms(it.get("materials")), terms(it.get("workTypes")), terms(it.get("placement")),
                     "; ".join(c.replace("’", "'") for c in it.get("collections") or []) or None,     # names may contain commas
                     ((it.get("owners") or [None])[0] or "").replace("’", "'") or None, (it.get("currentLocation") or "").strip() or None,
                     addr.get("city"), hits[0] if hits else None, round(lon, 5), round(lat, 5), (it.get("metaInfo") or {}).get("mapView") == "offview",
                     f"https://www.publicartarchive.org/art/{it['titleEncoded']}/{it['appSlug']}",
                     b and b.get("amount_usd"), b and b.get("kind"), b and b.get("source_url")])
    rows.sort(key=lambda r: (r[11] or "~", r[10] or "", r[1]))
    report |= {"records_in_circle": len(raw["items"]), "florida": len(rows), "fetched": raw["fetched"],
               "by_county": dict(Counter(r[11] for r in rows).most_common()), "by_collection": dict(Counter(r[7] for r in rows).most_common(25)),
               "with_year": sum(r[3] is not None for r in rows), "with_medium": sum(r[4] is not None for r in rows),
               "with_budget": sum(r[16] is not None for r in rows), "budget_entries": len(budgets), "off_view": sum(r[14] for r in rows)}
    pkg = {"built": dt.date.today().isoformat(), "fetched": raw["fetched"],
           "source": {"name": "Public Art Archive, a publication of Creative West", "url": "https://publicartarchive.org",
                      "note": "Facts only, each linked to its record; descriptions and images are not copied."},
           "works": {"cols": cols, "rows": rows}, "report": report}
    OUT.write_text(json.dumps(pkg, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{OUT.name}: {OUT.stat().st_size / 1e6:.2f} MB")
    print(json.dumps({k: v for k, v in report.items() if k not in ("by_collection",)}, indent=1))
    return pkg


if __name__ == "__main__":
    build(refresh="--refresh" in sys.argv)
