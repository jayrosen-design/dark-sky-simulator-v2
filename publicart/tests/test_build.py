"""Public Art Policy Simulator: registry, capital program, assumptions and the data package."""
import json
from pathlib import Path

import pytest
import yaml

from publicart.build import DEFAULT_DIMS, MATERIALS, PROVENANCE, REGISTRIES, SETTINGS, STATUS, TYPES, _cut, scale_of

HERE = Path(__file__).resolve().parents[1]
DATA = HERE.parents[0] / "web" / "public" / "public-art" / "data"
REG = [a for name in REGISTRIES for a in yaml.safe_load((HERE / name).read_text(encoding="utf-8"))["artworks"]]
PAA = [a for a in REG if a["id"].startswith("paa-")]
CIP = yaml.safe_load((HERE / "cip.yaml").read_text(encoding="utf-8"))
SEED = yaml.safe_load((HERE / "seed.yaml").read_text(encoding="utf-8"))


def test_registry_entries_are_sourced_and_use_known_values():
    ids = [a["id"] for a in REG]
    assert len(ids) == len(set(ids))
    for a in REG:
        assert str(a.get("source_url", "")).startswith("http"), a["id"]
        assert a["type"] in TYPES and a["status"] in STATUS, a["id"]
        assert a.get("provenance") in PROVENANCE + [None], a["id"]
        assert a.get("material") in MATERIALS + [None], a["id"]
        assert a.get("setting", "outdoor") in SETTINGS, a["id"]
        assert "graffitistreet" not in json.dumps(a), a["id"]


def test_archive_entries_are_facts_linked_to_their_records():
    assert len(PAA) >= 100
    for a in PAA:
        slug = a["id"].removeprefix("paa-")
        assert a["source_url"].startswith("https://www.publicartarchive.org/art/") and a["source_url"].endswith("/" + slug), a["id"]
        assert a["setting"] in SETTINGS and a["lon"] and a["lat"], a["id"]
        assert "description" not in a and len(a.get("notes") or "") < 300, a["id"]     # facts only, no copied text
    # Works already in the hand-compiled registry are merged there, not duplicated.
    hand = json.dumps([a for a in REG if not a["id"].startswith("paa-")])
    for a in PAA:
        assert a["source_url"] not in hand, a["id"]
    assert hand.count("publicartarchive.org/art/") == 3


def test_registry_keeps_the_verified_facts():
    by = {a["title"]: a for a in REG}
    cl = next(a for a in REG if "Common Light" in a["title"])
    assert cl["status"] == "planned" and cl["budget_usd"] == 100000
    assert next(a for a in REG if "HeART" in a["title"])["provenance"] == "partner"
    assert by["Sankofa"]["provenance"] == "county"


def test_capital_program_components_never_exceed_the_budget():
    for p in CIP["projects"]:
        assert sum((p.get("components") or {}).values()) <= p["budget_usd"], p["id"]
        assert p["fy"] in CIP["fiscal_years"], p["id"]
        assert str(p.get("source_url", "")).startswith("http"), p["id"]


def test_seed_quotes_the_draft_and_the_verified_aep6_figures():
    P, A = SEED["policy"], SEED["economics"]["aep6"]["value"]
    assert P["cap_1989"]["value"] == 100000 and P["cap_draft"]["value"] == 300000
    assert P["reserve_share"]["value"] == 0.15 and P["cap_round_to"]["value"] == 5000 and P["index_first_fy"]["value"] == 2028
    assert A["tax_local"] + A["tax_state"] + A["tax_federal"] == 33148133
    assert (A["total_activity"], A["jobs"], A["share_nonlocal"], A["spend_nonlocal"], A["spend_local"]) == (189462764, 2992, 0.573, 76.48, 29.26)
    for section in ("policy", "impressions", "conservation", "equity", "economics", "staff_study"):
        for k, v in SEED[section].items():
            if isinstance(v, dict) and "value" in v and k not in ("poi_radius_m",):
                assert v.get("provenance"), f"{section}.{k} has no provenance"


def test_scale_classes_and_street_cutting():
    assert scale_of("figure", *DEFAULT_DIMS["figure"]) == "medium"
    assert scale_of("wall", 2.4, 63.4) == "landmark"
    assert scale_of("mural", 6, 10) == "large"
    pieces = _cut([[-82.33, 29.65], [-82.32, 29.65]], 200)
    assert len(pieces) >= 4 and pieces[0][0] == [-82.33, 29.65] and pieces[-1][-1] == [-82.32, 29.65]


@pytest.mark.skipif(not (DATA / "meta.json").exists(), reason="data package not built")
def test_data_package_is_consistent():
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    assert meta["seed"]["policy"]["cap_draft"]["value"] == 300000
    arts = json.loads((DATA / "artworks.geojson").read_text(encoding="utf-8"))["features"]
    assert len(arts) == meta["report"]["registry"]["on_map"] >= 30
    for f in arts:
        lon, lat = f["geometry"]["coordinates"]
        assert -82.66 <= lon <= -82.05 and 29.41 <= lat <= 29.95, f["properties"]["id"]   # Alachua County
    cells = json.loads((DATA / "cells.json").read_text(encoding="utf-8"))
    n = cells["grid"]["nx"] * cells["grid"]["ny"]
    assert all(len(v) == n for v in cells["cols"].values())
    pm = meta["report"]["pedestrian_model"]
    for site, counted, modeled, on_trail in pm["counter_vs_model"]:
        if on_trail:
            assert modeled == round(counted), site      # trail counters are used as measured
    cpi = json.loads((DATA / "cpi.json").read_text(encoding="utf-8"))["monthly"]
    assert cpi[0][0] == "1989-01" and cpi[-1][1] > 2.5 * cpi[0][1]          # CPI-U has risen about 2.8x since 1989
