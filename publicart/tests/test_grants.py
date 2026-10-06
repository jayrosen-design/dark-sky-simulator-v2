"""Arts funding index: parsing helpers, the curated calls, and the built package."""
import json
import math
from pathlib import Path

import pytest
import yaml

from publicart.grants import CALL_KINDS, OUT, fiscal_year, iso_date, jitter, parse_fl_sheet, sentence, title_case

HERE = Path(__file__).resolve().parents[1]
CALLS = HERE / "calls.yaml"


def test_federal_fields_are_cleaned():
    assert fiscal_year("2024-10-01") == 2025 and fiscal_year("2025-09-30") == 2025 and fiscal_year(None) is None
    assert title_case("THE HIPPODROME STATE THEATRE, INC.") == "The Hippodrome State Theatre, Inc."
    assert title_case("YMCA OF THE USA") == "YMCA of the USA"
    assert sentence("PURPOSE: TO SUPPORT A MURAL.") == "To support a mural."
    assert iso_date("2026-12-15-00-00-00") == "2026-12-15" and iso_date("Dec 15, 2026 12:00:00 AM EST") == "2026-12-15"
    assert iso_date("2099-01-01-00-00-00") is None and iso_date("") is None          # open-ended listings have no deadline
    a, b = jitter([-82.3, 29.6], "x"), jitter([-82.3, 29.6], "x")
    assert a == b and math.hypot((a[0] + 82.3) * 96700, (a[1] - 29.6) * 110574) <= 61     # deterministic, within 60 m


def test_florida_sheets_parse_every_year_layout():
    want = [("Alachua", "Dance Alive!", "GPS", 45921), ("Miami-Dade", "X", "SCP", 9)]
    layouts = [   # 2021-22, 2022-24, 2025-26 and 2026-27 layouts
        'Grant Number,Organization Name,Program,Award\n,,,\nALACHUA COUNTY,,,\n22.c.ps.101.084,Dance Alive!,GPS,"$45,921"\nMIAMI-DADE COUNTY,,,\n22.c.pr.1.2,X,SCP,$9\n',
        'Alachua,,Total:,"$1,325,123"\n23.c.ps.101.025,Dance Alive!,GPS,"$45,921"\nMiami-Dade,,Total:,$9\n23.c.pr.1.2,X,SCP,$9\n',
        'Alachua,Total:,"$509,619"\nDance Alive!,GPS,"$45,921"\nMiami-Dade,Total:,$9\nX,SCP,$9\n',
        'List #1,,\nAlachua,,"$557,254"\nDance Alive!,GPS,"$45,921"\n,,\nMiami-Dade,,$9\nX,SCP,$9\n',
    ]
    for text in layouts:
        assert parse_fl_sheet(text) == (want, 0), text[:30]
    assert parse_fl_sheet('Orphan Org,GPS,$5\n') == ([], 1)      # an award before any county is reported, not guessed


@pytest.mark.skipif(not CALLS.exists(), reason="no curated calls yet")
def test_calls_are_curated_from_the_commissioning_bodies():
    doc = yaml.safe_load(CALLS.read_text(encoding="utf-8"))
    ids = [c["id"] for c in doc["calls"]]
    assert len(ids) == len(set(ids))
    for c in doc["calls"]:
        assert c["kind"] in CALL_KINDS and len(c["state"]) == 2, c["id"]
        assert str(c["source_url"]).startswith("http"), c["id"]
        # Not read from listings whose terms forbid automated access, nor from the site the user's antivirus flagged.
        assert not any(d in c["source_url"] for d in ("callforentry.org", "zapplication.org", "nyfa.org", "graffitistreet")), c["id"]
        assert c.get("deadline") or c.get("rolling"), c["id"]
        assert c.get("budget_usd") is None or c["budget_usd"] > 0, c["id"]


@pytest.mark.skipif(not OUT.exists(), reason="funding index not built")
def test_funding_index_is_consistent():
    pkg = json.loads(OUT.read_text(encoding="utf-8"))
    aw = pkg["awards"]
    assert len(aw["rows"]) > 10000 and all(len(r) == len(aw["cols"]) for r in aw["rows"])
    assert {r[1] for r in aw["rows"]} == {"NEA", "NEH", "IMLS"}
    assert all(-180 <= r[7] <= 180 and -15 <= r[8] <= 72 for r in aw["rows"])          # US states and territories
    assert len({r[0] for r in aw["rows"]}) == len(aw["rows"])                         # each award once
    fl = pkg["florida"]
    assert fl["rows"] and not pkg["report"]["florida"]["unplaced_counties"]
    assert all(r[1] in fl["counties"] and r[0] in fl["pages"] for r in fl["rows"])
    assert all(o["url"].startswith("https://www.grants.gov/") for o in pkg["opportunities"])
    assert not any(o["agency"].startswith(("U.S. Mission", "U.S. Embassy")) for o in pkg["opportunities"])
