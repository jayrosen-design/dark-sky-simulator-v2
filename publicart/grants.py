"""Arts funding index for the Public Art Policy Simulator: who got arts grants, what is open now, and calls to artists.

    python -m publicart.grants            # uses the raw-data cache in data_raw/
    python -m publicart.grants --refresh  # refetches everything first

Sources (all public, no keys):
- Federal awards: USAspending.gov prime grants from the National Endowment for the Arts, the National Endowment for the
  Humanities and the Institute of Museum and Library Services, FY2021-FY2025, placed at the recipient's ZIP centre
  (else its county or city) with the Census Gazetteer.
- Open federal opportunities: Grants.gov listings from those three agencies plus the Arts funding category (posted or
  forecast), with award ceiling, floor and deadline. Listings from U.S. missions abroad are left out.
- Florida state awards: the Division of Arts and Culture's published awards-by-county sheets, placed at the county's
  centre (the sheets give no addresses).
- Calls to artists: calls.yaml, curated by hand from the commissioning bodies' own pages (CaFE's terms forbid
  automated access, so it is linked, not read).
Output: web/public/public-art/data/grants.json, loaded by the app's Funding tab.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

from ingest import census, geocode, grantsgov, usaspending
from ingest.common import cached_json, http

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "web" / "public" / "public-art" / "data" / "grants.json"
AGENCIES = {"NEA": "National Endowment for the Arts", "NEH": "National Endowment for the Humanities",
            "IMLS": "Institute of Museum and Library Services"}
PERIOD = ("2020-10-01", "2025-09-30")            # federal FY2021-FY2025
US_VIEWBOX = (-180.0, 15.0, -60.0, 72.0)          # west, south, east, north: states and territories, for place searches
FL_INDEX = "https://dos.fl.gov/cultural/grants/grant-resources/grant-awards-recommendations/"
FL_PROGRAMS = {"GPS": "General Program Support", "SCP": "Specific Cultural Project", "CF": "Cultural Facilities",
               "CE": "Cultural Endowment", "250": "America 250 Florida"}   # codes used in the Division's award sheets; others are shown as given
CALL_KINDS = ["commission", "rfq", "rfp", "mural", "temporary", "residency", "other"]
STATE_FIPS = {"AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11", "FL": "12",
              "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23",
              "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
              "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
              "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55",
              "WY": "56", "AS": "60", "GU": "66", "MP": "69", "PR": "72", "VI": "78"}
SMALL = {"a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "de", "la", "del"}
KEEP_UPPER = {"USA", "US", "NEA", "NEH", "IMLS", "LLC", "YMCA", "YWCA", "PBS", "NPR", "WGBH", "KQED", "CUNY", "SUNY", "UCLA", "MIT",
              "II", "III", "IV", "TV", "FM", "AM", "DC", "LA", "NYC"}


def title_case(s: str) -> str:
    """Recipient names arrive in capitals; make them readable without mangling acronyms."""
    words = s.strip().split()
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Za-z]", "", w)
        if core.upper() in KEEP_UPPER or (len(core) <= 4 and not re.search(r"[AEIOUY]", core.upper()) and core.isupper()):
            out.append(w)
        elif i and core.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(out)


def sentence(s: str | None, n=220) -> str | None:
    if not s:
        return None
    s = re.sub(r"^\s*PURPOSE:\s*", "", s.strip(), flags=re.I)
    s = re.sub(r"\s+", " ", s)
    if s.isupper():
        s = s.lower()
        s = s[:1].upper() + s[1:]
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def fiscal_year(iso: str | None) -> int | None:
    if not iso:
        return None
    d = dt.date.fromisoformat(iso[:10])
    return d.year + 1 if d.month >= 10 else d.year


def jitter(pt, key: str, max_m=60.0):
    """Spread awards that share a ZIP or county centre (deterministic, up to max_m) so each can be clicked."""
    h = hashlib.sha1(key.encode()).digest()
    a, r = h[0] / 255 * 2 * math.pi, (h[1] / 255) ** 0.5 * max_m
    return [round(pt[0] + r * math.cos(a) / (111320 * math.cos(math.radians(pt[1]))), 5), round(pt[1] + r * math.sin(a) / 110574, 5)]


def federal_awards(gz, refresh=False):
    cols = ["id", "agency", "fy", "amount", "recipient", "city", "state", "lon", "lat", "precision", "cfda", "desc"]
    rows, report = [], {"by_agency": {}, "unlocated": 0, "outside_us": 0, "not_positive": 0}
    seen = set()
    for code, name in AGENCIES.items():
        n, total = 0, 0.0
        for r in usaspending.assistance_awards(name, *PERIOD, refresh=refresh)["rows"]:
            gid = r.get("generated_internal_id")
            if not gid or gid in seen:
                continue
            seen.add(gid)
            loc = r.get("Recipient Location") or {}
            if loc.get("location_country_code") not in (None, "USA"):
                report["outside_us"] += 1
                continue
            amount = round(float(r.get("Award Amount") or 0))
            if amount <= 0:                                   # fully de-obligated or net-zero awards
                report["not_positive"] += 1
                continue
            st, z, cc, city = loc.get("state_code"), (loc.get("zip5") or "")[:5], loc.get("county_code"), loc.get("city_name")
            pt, prec = gz["zcta"].get(z), "zip"
            if not pt and st in STATE_FIPS and cc:
                pt, prec = gz["counties"].get(STATE_FIPS[st] + cc.zfill(3)), "county"
            if not pt and st and city:
                pt, prec = gz["place"].get(f"{st}|{city.lower()}"), "city"
            if not pt:
                report["unlocated"] += 1
                continue
            n += 1
            total += amount
            rows.append([gid, code, fiscal_year(r.get("Start Date")), amount, title_case(r.get("Recipient Name") or ""),
                         title_case(city) if city else None, st, *jitter(pt, gid), prec, r.get("CFDA Number"), sentence(r.get("Description"))])
        report["by_agency"][code] = {"awards": n, "total_usd": round(total)}
    report["precision"] = dict(Counter(r[9] for r in rows))
    return {"cols": cols, "rows": rows}, report


def parse_fl_sheet(text: str):
    """One award sheet. The layout changes by year: county headers are "ALACHUA COUNTY", "Alachua,,Total:,$n",
    "Alachua,Total:,$n" or "Alachua,,$n"; award rows are "[grant number,] organization, program code, amount".
    Returns ([(county, org, program, amount)], rows that fit neither)."""
    money = lambda v: float(re.sub(r"[^\d.]", "", v)) if re.search(r"\d", v or "") and re.fullmatch(r"\$?[\d,]+(\.\d+)?", v.strip()) else None
    program = lambda v: re.fullmatch(r"[A-Z0-9]{2,5}", v or "") is not None      # GPS, SCP, CF, 250 (America 250)
    out, county, skipped = [], None, 0
    for rec in csv.reader(io.StringIO(text)):
        cells = [x.strip() for x in rec if x.strip()]
        if not cells or cells[0].lower().startswith(("list #", "total", "grant number")):
            continue
        if re.match(r"^\d{2}\.[a-z]\.", cells[0]):                       # leading grant number
            cells = cells[1:]
        if len(cells) == 3 and program(cells[1]) and money(cells[2]) is not None:
            if county:
                out.append((county, cells[0], cells[1], round(money(cells[2]))))
            else:
                skipped += 1
        elif "Total:" in cells or (len(cells) == 2 and money(cells[1]) is not None) or (len(cells) == 1 and cells[0].upper().endswith(" COUNTY")):
            county = re.sub(r"\s+county$", "", cells[0], flags=re.I).title()
        else:
            skipped += 1
    return out, skipped


def florida_awards(gz, refresh=False):
    """Every year's awards-by-county sheets (published Google Sheets) -> rows of [fy, county, org, program, amount]."""
    def fetch():
        idx = http("GET", FL_INDEX, binary=True).decode("utf-8", "replace")
        pages = sorted(set(re.findall(r'href="(/cultural/grants/grant-resources/grant-awards-recommendations/(\d{4})-(\d{4})-awards-by-county/)"', idx)))
        out = []
        for path, y0, y1 in pages:
            html = http("GET", "https://dos.fl.gov" + path, binary=True).decode("utf-8", "replace")
            sheets = re.findall(r'docs\.google\.com/spreadsheets/d/e/([\w-]+)/pubhtml', html)
            for sid in dict.fromkeys(sheets):
                text = http("GET", f"https://docs.google.com/spreadsheets/d/e/{sid}/pub?output=csv", binary=True).decode("utf-8", "replace")
                out.append({"fy": f"{y0}-{y1[2:]}", "page": "https://dos.fl.gov" + path, "sheet": sid, "csv": text})
        return {"sheets": out}
    raw = cached_json("florida_dca_awards.json", fetch, refresh)
    cols = ["fy", "county", "org", "program", "amount"]
    rows, report, counties = [], {"by_year": {}, "unparsed_rows": 0, "programs": {}}, {}
    pages = {sh["fy"]: sh["page"] for sh in raw["sheets"]}
    for sh in raw["sheets"]:
        recs, skipped = parse_fl_sheet(sh["csv"])
        report["unparsed_rows"] += skipped
        for county, org, program, amount in recs:
            rows.append([sh["fy"], county, org, program, amount])
            report["programs"][program] = report["programs"].get(program, 0) + 1
            report["by_year"][sh["fy"]] = report["by_year"].get(sh["fy"], 0) + amount
    for name in sorted({r[1] for r in rows}):
        if name == "Statewide":                            # statewide awards (e.g. America 250) are shown at the capital
            counties[name] = gz["place"]["FL|tallahassee"]
            continue
        key = f"FL|{name.lower()} county"
        geoid = gz["county_names"].get(key) or gz["county_names"].get(key.replace("st ", "st. "))
        if geoid:
            counties[name] = gz["counties"][geoid]
    report["unplaced_counties"] = sorted({r[1] for r in rows} - set(counties))
    return {"cols": cols, "rows": rows, "counties": counties, "pages": pages, "programs": FL_PROGRAMS}, report


ARTS_WORDS = re.compile(r"\b(arts?|artists?|artworks?|cultur\w*|museums?|humanities|heritage|music|theat\w*|dance|film|creative|librar\w*|biennal\w*)\b", re.I)


def iso_date(v: str | None) -> str | None:
    """Grants.gov dates come as "2026-12-15-00-00-00" or "Dec 15, 2026 ..."; 2099 marks an open-ended listing."""
    if not v:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", v)
    if m:
        d = m.group(0)
    else:
        m = re.match(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", v.strip())
        if not m:
            return None
        d = dt.datetime.strptime(m.group(0), "%b %d, %Y").date().isoformat()
    return None if d >= "2090" else d


def opportunities(refresh=False):
    hits = {}
    for q in ({"agencies": "|".join(AGENCIES)}, {"categories": "AR"}):
        for h in grantsgov.search(**q, refresh=refresh)["hits"]:
            hits[h["id"]] = h
    out, abroad, off_topic = [], 0, 0
    for oid, h in sorted(hits.items()):
        d = grantsgov.opportunity(oid, refresh=refresh)
        s = d.get("synopsis") or d.get("forecast") or {}
        agency = s.get("agencyName") or h.get("agency") or ""
        if re.match(r"U\.?S\.? (Mission|Embassy|Consulate)", agency):
            abroad += 1
            continue
        if h.get("agencyCode") not in AGENCIES and not ARTS_WORDS.search(f'{h.get("title")} {s.get("synopsisDesc") or ""}'):
            off_topic += 1                                  # filed under Arts on Grants.gov but not about the arts
            continue
        num = lambda k: int(float(s[k])) if str(s.get(k) or "").replace(".", "").isdigit() and float(s[k]) > 0 else None
        close = iso_date(s.get("responseDateStr") or s.get("estApplicationResponseDateStr") or s.get("responseDate") or h.get("closeDate"))
        desc = re.sub(r"<[^>]+>", " ", s.get("synopsisDesc") or s.get("forecastDesc") or "")
        out.append({"id": oid, "number": h.get("number"), "title": h.get("title"), "agency": agency, "agency_code": h.get("agencyCode"),
                    "status": h.get("oppStatus"), "posted": iso_date(s.get("postingDateStr") or h.get("openDate")), "close": close,
                    "ceiling": num("awardCeiling"), "floor": num("awardFloor"), "estimated_total": num("estimatedFunding"),
                    "awards_expected": num("numberOfAwards"),
                    "applicants": [t.get("description") for t in s.get("applicantTypes") or []][:6],
                    "summary": sentence(desc, 260), "url": f"https://www.grants.gov/search-results-detail/{oid}"})
    return out, {"listed": len(out), "left_out_abroad": abroad, "left_out_not_arts": off_topic}


def calls(gz):
    path = HERE / "calls.yaml"
    if not path.exists():
        return [], [], {"entries": 0}
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    out, unplaced = [], []
    for c in doc.get("calls") or []:
        pt, how = None, None
        street = re.search(r"(?:^|,\s*)(\d+[A-Za-z]?\s+[A-Za-z].*)", str(c.get("address") or ""))   # from a street number on
        if street:
            s = street.group(1)
            q = s if re.search(rf'\b{c.get("state")}\b', s) else f'{s}, {c.get("city") or ""}, {c.get("state")}'
            try:
                g = geocode.census_geocode(q)
            except RuntimeError:                                  # the geocoder rejects some free-text addresses
                g = None
            if g:
                pt, how = g[:2], "address"
        if not pt and c.get("city") and c.get("state"):
            pt = gz["place"].get(f'{c["state"]}|{str(c["city"]).lower()}')
            how = "city centre" if pt else None
        if not pt and c.get("city") and c.get("state"):           # towns that are not Census places (New England)
            g = geocode.nominatim(f'{c["city"]}, {c["state"]}, USA', US_VIEWBOX)
            pt, how = (g[:2], "town centre (OpenStreetMap)") if g else (None, None)
        if pt and how != "address":                              # calls sharing a city centre stay clickable
            pt = jitter(pt, c["id"], 250)
        if not pt:
            unplaced.append(c["id"])
        out.append({**{k: c.get(k) for k in ("id", "title", "organization", "kind", "city", "state", "budget_usd", "budget_note", "deadline",
                                              "rolling", "eligibility", "source_url", "retrieved", "notes")},
                    "deadline": str(c["deadline"]) if c.get("deadline") else None,
                    "lon": pt[0] if pt else None, "lat": pt[1] if pt else None, "located_by": how})
    return out, doc.get("linkouts") or [], {"entries": len(out), "unplaced": unplaced}


def build(refresh=False):
    gz = {k: census.gazetteer(k)["rows"] for k in ("zcta", "counties", "place")}
    gz["county_names"] = census.gazetteer("counties")["names"]
    awards, rep_aw = federal_awards(gz, refresh)
    fl, rep_fl = florida_awards(gz, refresh)
    opps, rep_op = opportunities(refresh)
    cl, links, rep_cl = calls(gz)
    pkg = {
        "built": dt.date.today().isoformat(),
        "period": {"federal": "FY2021–FY2025"},          # awards with any action from Oct 1 2020 to Sep 30 2025
        "sources": [
            {"name": "USAspending.gov award search (NEA, NEH, IMLS prime grants)", "url": "https://www.usaspending.gov", "note": "public domain"},
            {"name": "Grants.gov opportunity listings", "url": "https://www.grants.gov", "note": "public domain"},
            {"name": "Florida Division of Arts and Culture, grant awards by county", "url": FL_INDEX, "note": "published award lists"},
            {"name": "U.S. Census Bureau Gazetteer 2024 (ZCTA, county and place centres)", "url": "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html"},
            {"name": "Calls to artists: curated from each commissioning body's own page (calls.yaml)", "url": None},
        ],
        "awards": awards, "florida": fl, "opportunities": opps, "calls": cl, "linkouts": links,
        "report": {"federal": rep_aw, "florida": rep_fl, "opportunities": rep_op, "calls": rep_cl},
    }
    OUT.write_text(json.dumps(pkg, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{OUT.name}: {OUT.stat().st_size / 1e6:.2f} MB")
    print(json.dumps(pkg["report"], indent=1))
    return pkg


if __name__ == "__main__":
    build(refresh="--refresh" in sys.argv)
