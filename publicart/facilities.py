"""Publicly owned buildings for the Public Art Policy Simulator: who owns the land each artwork stands on, what public
buildings exist, what they are worth, and when they were expanded (the construction that can trigger public art).

    python -m publicart.facilities            # uses the raw-data cache in data_raw/
    python -m publicart.facilities --refresh  # refetches every source
    python -m publicart.facilities --cached-only   # statewide markers only for counties already fetched (a partial build)

Sources (public GIS services, data records only; no documents are downloaded):
- Alachua County: the County's parcel layers (maps.alachuacounty.us, one per tax year 2001-2024) give each public
  parcel's outline, owner, use, just value, improvement value and building area. Expansions are years when the
  building area grew (not value changes, which reassessments also move); each is valued at the building's 2024
  improvement value per square foot.
- Rest of Florida: the Department of Revenue 2025 parcel roll via the Florida Geographic Information Office (parcel
  centres): government use codes (080-089) with at least one building, just and land value, the year's new-construction
  value, year built. Statewide queries time out, so each county is queried on its own.
- Artworks: each Gainesville registry work and each Florida catalog work is tagged with the parcel it stands on
  (Alachua outlines locally; elsewhere the statewide parcel outlines, queried a county at a time).
Output: web/public/public-art/data/facilities.json, loaded by the Buildings tab and the collection cards.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.strtree import STRtree

from ingest import census
from ingest.common import arcgis_query, cache_path, cached_json, http

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "public-art" / "data"
OUT = DATA / "facilities.json"
ACO = "https://maps.alachuacounty.us/server/rest/services/Hosted/parcels_{y}/FeatureServer/0"
FGIO = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services"
CENTROIDS = f"{FGIO}/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0"
OUTLINES = f"{FGIO}/Florida_Statewide_Cadastral/FeatureServer/0"
HISTORY_YEARS = [y for y in range(2001, 2025) if y not in (2005, 2014, 2019)]   # 2005/2019 absent, 2014 has no building area
AREA_FROM = 2017      # before 2017 the County layers record no building area for tax-exempt public parcels (a 0 means "not recorded")
CLASSES = ["state", "county", "city", "school", "federal", "district"]
RESIDENTIAL = ("Single Family Residential", "Multiple Family Residential", "Mobile Home or Park & Misc. Residential")
DOR_CLASS = {"081": "federal", "083": "school", "084": "state", "086": "county", "087": "state", "088": "federal", "089": "city"}

# Owner name -> class. Order matters: "SCHOOL BOARD OF ALACHUA COUNTY" is a school board, not the county.
OWNER_RULES = [
    ("federal", r"\bUNITED STATES\b|\bU ?S GOVERNMENT\b|\bU S A\b|\bUSA\b|POSTAL SERVICE|VETERANS AFFAIRS|GENERAL SERVICES ADMIN"),
    ("school", r"SCHOOL B(OA)?R?D|SCHOOL DISTRICT|BOARD OF PUBLIC INSTRUCTION|STATE BOARD OF EDUCATION"),
    ("district", r"HOUSING AUTH|LIBRARY DIST|WATER MANAGE|HOSPITAL DIST|AIRPORT AUTH|PORT AUTH|TRANSIT AUTH|EXPRESSWAY AUTH|"
                 r"SOIL (AND|&) WATER|DRAINAGE DIST|MOSQUITO|SPECIAL DIST|DEVELOPMENT DIST"),
    ("state", r"STATE OF FL|\bIIF\b|INTERNAL IMPROVEMENT|\bTIITF\b|BOARD OF (REGENTS|GOVERNORS)|UNIVERSITY OF (FLORIDA|SOUTH FLORIDA|CENTRAL "
              r"FLORIDA|NORTH FLORIDA|WEST FLORIDA)(?!.*FOUNDATION)|FLORIDA (STATE|INTERNATIONAL|ATLANTIC|GULF COAST|A ?& ?M|POLYTECHNIC) "
              r"UNIV(?!.*FOUNDATION)|STATE UNIVERSITY|DISTRICT BOARD OF TRUSTEES|(SANTA FE|STATE) COLLEGE(?!.*FOUNDATION)|\bFDOT\b|"
              r"DEPARTMENT OF TRANSPORTATION|FLA DEPT|FL DEPT|FLORIDA DEP(AR)?T"),
    ("city", r"^(THE )?(CITY|TOWN|VILLAGE) OF\b|\bCITY OF\b|REGIONAL UTILIT|UTILITIES COMMISSION|COMMUNITY REDEVELOPMENT"),
    ("county", r"\bCOUNTY\b|\bCTY\b|\bCO BOARD\b|BOARD OF (COUNTY )?COMM|\bBOCC\b|SHERIFF|CLERK OF (THE )?CIRCUIT"),
]
PRIVATE_HINTS = r"\b(INC|LLC|LTD|CORP|FOUNDATION|PARTNERS|TRUSTEES?|ASSOCIATION|CHURCH|MINISTR)\b"


def owner_class(owner: str | None, dor_uc: str | None = None) -> str | None:
    """state | county | city | school | federal | district for public owners; None for private ones."""
    o = re.sub(r"\s+", " ", (owner or "").upper())
    for cls, pat in OWNER_RULES:
        if re.search(pat, o):
            return cls
    uc = (dor_uc or "").zfill(3)[-3:]
    if uc in DOR_CLASS and not re.search(PRIVATE_HINTS, o):
        return DOR_CLASS[uc]
    return None


def expansions(series: dict[int, float | None], min_sqft: float, min_share: float):
    """Years the recorded building area grew by at least min_sqft and min_share since the previous record (no more than
    three years earlier): [(year, area before, area after)]. A recorded zero followed by an area is a new building
    (before = 0); a year with no record for the parcel (None) is skipped."""
    out, prev = [], None
    for y in sorted(series):
        a = series[y]
        if a is None:
            continue
        if prev and y - prev[0] <= 3:
            d = a - prev[1]
            if d >= min_sqft and (prev[1] == 0 or d >= min_share * prev[1]):
                out.append((y, prev[1], a))
        prev = (y, a)
    return out


def clean_area(area: dict[int, float], just: dict[int, float], market=None) -> dict[int, float]:
    """Area series made usable: zeros before AREA_FROM are "not recorded" (exempt parcels had no building data), and from
    2023 the County's area field multiplies some parcels' area (Gainesville High: 221,526 -> 1,329,157 sq ft with an
    unchanged value), so a 2023+ area at least ~2x the last earlier one, without a 10% rise in just value beyond the
    market's, keeps the earlier area."""
    out = {y: (None if y < AREA_FROM and not a else a) for y, a in area.items()}
    base_y = max((y for y in out if y < 2023 and out.get(y)), default=None)
    if base_y is None:
        return out
    for y in (2023, 2024):
        a = area.get(y) or 0
        if a and a >= 1.9 * out[base_y] and not grew(just, base_y, y, 0.10, market):
            out[y] = out[base_y]
    return out


def value_at(series: dict[int, float], year: int, direction: int, reach: int):
    """(year, value) of the nearest recorded value at or after (direction 1) / at or before (-1) a year, within `reach` years."""
    for k in range(reach + 1):
        v = series.get(year + direction * k)
        if v:
            return year + direction * k, v
    return None


def grew(just: dict[int, float], before: int, after: int, share: float, market=None):
    """True if the just value rose by at least `share` more than the market did between the nearest records around the
    two years (at most 3 years before, 2 after). `market(y0, y1)` is the median ratio for all public parcels."""
    a, b = value_at(just, before, -1, 3), value_at(just, after, 1, 2)
    if not (a and b):
        return False
    m = market(a[0], b[0]) if market else 1.0
    return b[1] >= a[1] * m * (1 + share)


def alachua_current(refresh=False):
    """Public parcels with a building, 2024: outlines and attributes."""
    pats = ["CITY OF %", "TOWN OF %", "ALACHUA COUNTY%", "STATE OF FL%", "%INTERNAL IMPROVEMENT%", "UNIVERSITY OF FLORIDA BOARD%",
            "SCHOOL B%", "UNITED STATES%", "GAINESVILLE REGIONAL UTIL%", "%HOUSING AUTH%", "%LIBRARY DIST%", "%AIRPORT AUTH%",
            "DISTRICT BOARD OF TRUSTEES%", "SANTA FE COLLEGE%"]
    where = "impvalue > 0 AND (puse LIKE '8%' OR puse LIKE '08%' OR " + " OR ".join(f"firstname1 LIKE '{p}'" for p in pats) + ")"
    fields = "parcel,firstname1,address1,city,puse,propertyus,p_category,justvalue,impvalue,squarefeet,heatedsqua,buildingqu,acres,link_acpa,taxyear"
    return cached_json("aco_public_2024.json", lambda: arcgis_query(ACO.format(y=2024), where=where, out_fields=fields, max_offset=0.00001), refresh)


def alachua_history(ids: list[str], refresh=False):
    """{year: {parcel: [area, building value, just value]}} for the given parcels, from each year's layer."""
    def fetch():
        out = {}
        for y in HISTORY_YEARS:
            meta = http("GET", ACO.format(y=y), params={"f": "json"})
            names = {f["name"].lower(): f["name"] for f in meta.get("fields", [])}
            key = names.get("parcel") or names.get("pin") or names.get("id")
            area = names.get("squarefeet") or names.get("sqft")
            value = names.get("impvalue") or names.get("bldg")
            just = names.get("justvalue") or names.get("just")
            if not key or not area:
                continue
            rows = {}
            for i in range(0, len(ids), 150):
                chunk = ",".join(f"'{p}'" for p in ids[i:i + 150])
                fc = arcgis_query(ACO.format(y=y), where=f"{key} IN ({chunk})", out_fields=",".join(x for x in (key, area, value, just) if x), geometry=False)
                for f in fc["features"]:
                    a = f["properties"]
                    rows[str(a[key]).strip()] = [a.get(area) or 0, a.get(value) if value else None, a.get(just) if just else None]
                time.sleep(0.3)
            out[str(y)] = rows
        return out
    return cached_json(f"aco_public_history_v2_{len(ids)}.json", fetch, refresh)


def alachua_roll(ids: list[str], refresh=False):
    """The 2025 state roll for the given Alachua parcels: physical address, city, year built and the year's new
    construction (the County layer's address is the owner's mailing address)."""
    def fetch():
        out = {}
        for i in range(0, len(ids), 150):
            chunk = ",".join(f"'{p}'" for p in ids[i:i + 150])
            fc = arcgis_query(CENTROIDS, where=f"CO_NO=11 AND PARCEL_ID IN ({chunk})", out_fields="PARCEL_ID,PHY_ADDR1,PHY_CITY,ACT_YR_BLT,EFF_YR_BLT,NCONST_VAL",
                              geometry=False)
            for f in fc["features"]:
                a = f["properties"]
                out[a["PARCEL_ID"].strip()] = [(a.get("PHY_ADDR1") or "").strip() or None, (a.get("PHY_CITY") or "").strip() or None,
                                               int(a.get("ACT_YR_BLT") or 0) or None, round(a.get("NCONST_VAL") or 0)]
            time.sleep(0.3)
        return out
    return cached_json(f"dor_alachua_public_{len(ids)}.json", fetch, refresh)


def florida_markers(refresh=False, cached_only=False):
    """Government-use parcels with a building in every county but Alachua (DOR 2025 roll, parcel centres). Large counties
    time out as one query, so each is read in OBJECTID windows, one request at a time, with retries."""
    from ingest.parcels import _oid_range
    fields = "PARCEL_ID,CO_NO,DOR_UC,OWN_NAME,PHY_ADDR1,PHY_CITY,JV,LND_VAL,NCONST_VAL,ACT_YR_BLT,EFF_YR_BLT,TOT_LVG_AR,NO_BULDNG,ASMNT_YR"
    rows, included = [], []
    for co in range(12, 78):
        if cached_only and not cache_path(f"dor_public_co{co}.json").exists():
            continue
        included.append(co)
        def fetch(co=co):
            lo, hi = _oid_range(co)
            out = []
            for a in range(lo - 1, hi, 100_000):
                where = f"CO_NO={co} AND OBJECTID>{a} AND OBJECTID<={min(a + 100_000, hi)} AND DOR_UC LIKE '08%' AND NO_BULDNG > 0"
                for attempt in range(5):
                    try:
                        fc = arcgis_query(CENTROIDS, where=where, out_fields=fields)
                        break
                    except RuntimeError:
                        if attempt == 4:
                            raise
                        time.sleep(5 * (attempt + 1))
                out += [[*f["geometry"]["coordinates"], f["properties"]] for f in fc["features"] if f.get("geometry")]
                time.sleep(0.3)
            return out
        rows += cached_json(f"dor_public_co{co}.json", fetch, refresh)
    return rows, included


def parcel_at_points(points: list[tuple[str, float, float]], refresh=False):
    """Owner of the statewide parcel under each point: {id: [owner, DOR use, county no. + parcel id, just value]}, a county at a time."""
    def fetch():
        out = {}
        by_county = defaultdict(list)
        for pid, lon, lat in points:
            by_county[county_of(lon, lat)].append((pid, lon, lat))
        for county, pts in by_county.items():
            for i in range(0, len(pts), 40):
                chunk = pts[i:i + 40]
                mp = {"points": [[lon, lat] for _, lon, lat in chunk], "spatialReference": {"wkid": 4326}}
                res = http("POST", OUTLINES + "/query", data={"geometry": json.dumps(mp), "geometryType": "esriGeometryMultipoint", "inSR": 4326,
                    "spatialRel": "esriSpatialRelIntersects", "outFields": "OWN_NAME,DOR_UC,PARCEL_ID,CO_NO,JV", "returnGeometry": "true",
                    "outSR": 4326, "f": "geojson"})
                polys = [(shape(f["geometry"]), f["properties"]) for f in res.get("features", []) if f.get("geometry")]
                for pid, lon, lat in chunk:
                    p = Point(lon, lat)
                    hit = next((a for g, a in polys if g.contains(p)), None)
                    out[pid] = [hit["OWN_NAME"], hit["DOR_UC"], f'{int(hit["CO_NO"])}-{hit["PARCEL_ID"]}', hit["JV"]] if hit else None
                time.sleep(0.4)
        return out
    return cached_json(f"parcel_owner_at_points_{len(points)}.json", fetch, refresh)


_COUNTIES = None


def county_of(lon, lat):
    global _COUNTIES
    if _COUNTIES is None:
        feats = census.state_counties("12")["features"]
        geoms = [shape(f["geometry"]) for f in feats]
        _COUNTIES = (STRtree(geoms), geoms, [f["properties"]["BASENAME"] for f in feats])
    tree, geoms, names = _COUNTIES
    hits = tree.query(Point(lon, lat), predicate="intersects")
    return names[hits[0]] if len(hits) else None


def build(refresh=False, cached_only=False):
    import yaml
    seed = yaml.safe_load((ROOT / "publicart" / "seed.yaml").read_text(encoding="utf-8"))["facilities"]
    min_sqft, min_share = seed["expansion_min_sqft"]["value"], seed["expansion_min_share"]["value"]
    report = {}

    # ---- Alachua County outlines and expansion history
    cur = alachua_current(refresh)["features"]
    feats, dropped = [], Counter()
    for f in cur:
        a = f["properties"]
        puse = str(a.get("puse") or "").lstrip("0")
        cls = owner_class(a["firstname1"], "0" + puse[:2] if puse else None)            # County "8700" = DOR "087"
        if not cls:
            dropped["private owner with a government use code"] += 1
            continue
        if a.get("p_category") in RESIDENTIAL and not str(a.get("puse") or "").lstrip("0").startswith("8"):
            dropped["residential (housing)"] += 1
            continue
        feats.append((f, cls))
    hist = alachua_history(sorted({f["properties"]["parcel"].strip() for f, _ in feats}), refresh)
    import statistics
    just_by = {pid: {int(y): rows[pid][2] for y, rows in hist.items() if pid in rows and rows[pid][2]} for pid in set().union(*[set(r) for r in hist.values()])}
    _mk = {}
    def market(y0, y1):
        """Median just-value ratio y1/y0 over all public parcels with both values (reassessment drift)."""
        if (y0, y1) not in _mk:
            r = [j[y1] / j[y0] for j in just_by.values() if j.get(y0) and j.get(y1)]
            _mk[(y0, y1)] = statistics.median(r) if len(r) >= 20 else 1.0
        return _mk[(y0, y1)]
    out_feats, events_n, artifacts, unconfirmed = [], 0, 0, 0
    roll = alachua_roll(sorted({f["properties"]["parcel"].strip() for f, _ in feats}), refresh)
    for f, cls in feats:
        a = f["properties"]
        pid = a["parcel"].strip()
        rec = lambda i: {int(y): (rows[pid][i] if pid in rows else None) for y, rows in hist.items()}   # None: no record that year
        raw_area, values, just = rec(0), rec(1), rec(2)
        raw_area[2024], just[2024] = a.get("squarefeet") or 0, a.get("justvalue")
        series = clean_area(raw_area, just, market)
        artifacts += any(series.get(y) != raw_area.get(y) for y in (2023, 2024))
        per_sqft = (a["impvalue"] / series[2024]) if series.get(2024) else None
        ev = []
        for y, b, c in expansions(series, min_sqft, min_share):
            prev_y = max(k for k in series if k < y and series[k] is not None)
            has_values = bool(value_at(just, prev_y, -1, 3) and value_at(just, y, 1, 2))
            if has_values and not grew(just, prev_y, y, 0.10, market):
                unconfirmed += 1                                  # area grew but the value did not: a re-measurement
                continue
            ev.append([y, round(b), round(c), round((c - b) * per_sqft) if per_sqft else None, b == 0, "area and value" if has_values else "area only"])
        events_n += len(ev)
        out_feats.append({"type": "Feature", "geometry": mapping(shape(f["geometry"]).simplify(0.000005, preserve_topology=True)), "properties": {
            "id": pid, "cls": cls, "owner": a["firstname1"].strip(), "address": (roll.get(pid) or [None])[0], "city": (roll.get(pid) or [None, None])[1],
            "yb": (roll.get(pid) or [None, None, None])[2], "nc": (roll.get(pid) or [None, None, None, 0])[3], "use": a.get("propertyus"),
            "jv": a.get("justvalue"), "bv": a.get("impvalue"), "sqft": a.get("squarefeet"), "quality": a.get("buildingqu"), "acpa": a.get("link_acpa"),
            "ev": ev, "area": {str(y): round(v) for y, v in sorted(series.items()) if v}, "jvh": {str(y): v for y, v in sorted(just.items()) if v}}})
    report["alachua"] = {"facilities": len(out_feats), "with_site_address": sum(1 for f in out_feats if f["properties"]["address"]), "by_class": dict(Counter(f["properties"]["cls"] for f in out_feats)),
                         "dropped": dict(dropped), "expansions": events_n, "area_artifacts_2023": artifacts,
                         "area_jumps_without_value_rise": unconfirmed, "history_years": HISTORY_YEARS}

    # ---- Rest of Florida: parcel centres
    fl_rows, fl_drop, seen, multipart = [], 0, set(), 0
    markers, included = florida_markers(refresh, cached_only)
    for lon, lat, a in markers:
        fid = f'{int(a["CO_NO"])}-{a["PARCEL_ID"]}'
        if fid in seen:                       # multi-part parcels repeat with identical values: keep one centre
            multipart += 1
            continue
        seen.add(fid)
        cls = owner_class(a["OWN_NAME"], a["DOR_UC"])
        if not cls:
            fl_drop += 1
            continue
        bv = max(0.0, (a.get("JV") or 0) - (a.get("LND_VAL") or 0))
        fl_rows.append([fid, cls, (a.get("OWN_NAME") or "").strip(), (a.get("PHY_ADDR1") or "").strip() or None,
                        (a.get("PHY_CITY") or "").strip() or None, county_of(lon, lat), a.get("DOR_UC"), round(a.get("JV") or 0), round(bv),
                        round(a.get("NCONST_VAL") or 0), int(a.get("ACT_YR_BLT") or 0) or None, int(a.get("EFF_YR_BLT") or 0) or None,
                        int(a.get("TOT_LVG_AR") or 0) or None, round(lon, 5), round(lat, 5)])
    report["florida"] = {"facilities": len(fl_rows), "by_class": dict(Counter(r[1] for r in fl_rows)), "private_owner_dropped": fl_drop,
                         "with_new_construction": sum(r[9] > 0 for r in fl_rows), "dor_counties_included": len(included), "dor_counties_total": 66,
                         "multipart_duplicates_dropped": multipart}

    # ---- Artworks: the parcel each stands on
    polys = [(shape(f["geometry"]), f["properties"]) for f in out_feats]
    tree = STRtree([g for g, _ in polys])
    def alachua_hit(lon, lat):
        p = Point(lon, lat)
        for i in tree.query(p, predicate="intersects"):
            return polys[i][1]["id"]
        return None
    reg = json.loads((DATA / "artworks.geojson").read_text(encoding="utf-8"))["features"]
    tags_reg = {f["properties"]["id"]: alachua_hit(*f["geometry"]["coordinates"]) for f in reg}
    cat = json.loads((DATA / "florida.json").read_text(encoding="utf-8"))["works"]
    c = {k: i for i, k in enumerate(cat["cols"])}
    tags_cat, outside = {}, []
    for r in cat["rows"]:
        if r[c["county"]] == "Alachua":
            tags_cat[r[0]] = ["alachua", alachua_hit(r[c["lon"]], r[c["lat"]])]
        else:
            outside.append((r[0], r[c["lon"]], r[c["lat"]]))
    for pid, hit in parcel_at_points(outside, refresh).items():
        if hit:
            owner, uc, parcel, jv = hit
            tags_cat[pid] = ["parcel", owner_class(owner, uc), (owner or "").strip(), uc, round(jv or 0), parcel]
        else:
            tags_cat[pid] = ["parcel", None, None, None, None, None]
    report["artworks"] = {"registry_on_public_parcels": sum(1 for v in tags_reg.values() if v),
                          "catalog_on_public_land": sum(1 for v in tags_cat.values() if (v[0] == "alachua" and v[1]) or (v[0] == "parcel" and v[1]))}

    pkg = {"built": dt.date.today().isoformat(), "classes": CLASSES,
           "sources": [{"name": "Alachua County parcel layers, tax years 2001-2024", "url": "https://maps.alachuacounty.us/server/rest/services/Hosted"},
                       {"name": "Florida Department of Revenue 2025 parcel roll (Florida Geographic Information Office)", "url": FGIO}],
           "alachua": {"type": "FeatureCollection", "features": out_feats},
           "florida": {"cols": ["id", "cls", "owner", "address", "city", "county", "dor_uc", "jv", "bv", "new_construction", "year_built",
                                "eff_year", "area", "lon", "lat"], "rows": fl_rows},
           "tags": {"registry": tags_reg, "catalog": tags_cat}, "report": report}
    OUT.write_text(json.dumps(pkg, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{OUT.name}: {OUT.stat().st_size / 1e6:.2f} MB")
    print(json.dumps(report, indent=1))
    return pkg


if __name__ == "__main__":
    build(refresh="--refresh" in sys.argv, cached_only="--cached-only" in sys.argv)
