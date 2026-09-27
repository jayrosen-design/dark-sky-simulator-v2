"""Sports lighting source, operating hours, and the fixture catalog."""
import json
from pathlib import Path

import pytest

from pipeline.build import on_fraction
from pipeline.config import load_seed

DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data"


def test_on_fraction_windows():
    late, evening = ("01:00", "04:00"), ("20:30", "22:30")
    assert on_fraction(None, late) == 1.0
    assert on_fraction("18:00-22:30", late) == 0.0
    assert on_fraction("18:00-22:30", evening) == pytest.approx(1.0)
    assert on_fraction("18:00-22:00", evening) == pytest.approx(0.75)
    assert on_fraction("22:00-06:30", late) == pytest.approx(1.0)


def test_catalog_cards_meet_darksky_criteria_and_cite_costs():
    seed = load_seed()
    cat = seed["catalog"]
    slots = {"street", "commercial", "residential", "sports"}
    ids = set()
    for f in cat["fixtures"]:
        assert f["id"] not in ids
        ids.add(f["id"])
        assert f["slot"] in slots and f["category"] in cat["categories"]
        assert f["spd"] in seed["spd"] and int(seed["spd"][f["spd"]]["cct_k"]) <= 3000   # DarkSky Approved: <= 3000K
        assert f["u"] <= 1                                                               # fully shielded or visor
        c = f["unit_cost"]
        assert c["low"] <= c["value"] <= c["high"] and c["provenance"] and c["ref"]
    for slot in slots:
        assert any(f["slot"] == slot for f in cat["fixtures"])


ENGINE = json.loads((DATA / "engine.json").read_text()) if (DATA / "engine.json").exists() else None


@pytest.mark.skipif(ENGINE is None, reason="run python -m pipeline.build first")
def test_package_has_sports_stock_off_in_the_sqm_window():
    sports = [s for c in ENGINE["components"] for s in c["stocks"] if s["group"] == "Sports"]
    assert sports and all(s["hours"] == "18:00-22:30" for s in sports)
    groups = [c for c in ENGINE["components"] if c.get("group") == "Sports"]
    assert groups and all(c["baseline_flux_V"]["reflected"] == 0 for c in groups)
    venues = json.loads((DATA / "sports_venues.geojson").read_text())["features"]
    assert venues and all(v["properties"]["kind"] in ("field", "court", "track", "stadium") for v in venues)
    assert all(v["properties"]["lit"] != "no" for v in venues)
