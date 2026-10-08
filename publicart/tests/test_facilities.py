"""Public buildings: owner classes, expansion detection, the seeded art rules and the built package."""
import json

import pytest
import yaml

from publicart.facilities import OUT, ROOT, clean_area, expansions, grew, owner_class


def test_owner_names_sort_into_public_classes():
    cases = {
        "SCHOOL BD OF ALACHUA CTY": "school", "SCHOOL BOARD OF BROWARD COUNTY": "school",
        "STATE OF FLA IIF EDUCATION-UNIV OF FLA": "state", "BOARD OF TRUSTEES OF THE INTERNAL IMPROVEMENT TRUST FUND": "state",
        "DISTRICT BOARD OF TRUSTEES OF SANTA FE COLLEGE (THE)": "state", "CITY OF GAINESVILLE": "city", "TOWN OF MICANOPY": "city",
        "ALACHUA COUNTY": "county", "MIAMI-DADE COUNTY": "county", "ALACHUA COUNTY HOUSING AUTHORITY": "district",
        "ALACHUA COUNTY LIBRARY DIST": "district", "UNITED STATES OF AMERICA": "federal", "U S GOVERNMENT": "federal",
    }
    for owner, cls in cases.items():
        assert owner_class(owner) == cls, owner
    assert owner_class("SMITH & SMITH TRUSTEES") is None and owner_class("U OF F FOUNDATION INC") is None
    assert owner_class("SANTA FE COLLEGE FOUNDATION INC") is None
    assert owner_class("JOHN DOE", "086") == "county" and owner_class("OSPINA ENTERPRISES INC", "086") is None   # use code alone, unless clearly private


def test_expansions_are_area_jumps_not_noise():
    s = {2001: 10000, 2002: 10000, 2003: 10200, 2008: 30000, 2012: 30000, 2013: 36000, 2016: 36100}
    assert expansions(s, 1000, 0.10) == [(2013, 30000, 36000)]          # 2003 too small; 2003->2008 gap too long
    assert expansions({2010: 0, 2011: 5000}, 1000, 0.1) == [(2011, 0, 5000)]          # a recorded zero, then a building: new
    assert expansions({2009: 4000, 2010: None, 2011: 9000}, 1000, 0.1) == [(2011, 4000, 9000)]   # a year without a record is skipped


def test_2023_area_multiples_without_a_value_rise_are_ignored():
    area = {2021: 221526, 2022: 221526, 2023: 1329157, 2024: 1329157}
    flat = {2021: 41.7e6, 2022: 41.7e6, 2023: 41.6e6, 2024: 41.6e6}
    assert clean_area(area, flat)[2023] == 221526 and expansions(clean_area(area, flat), 1000, 0.1) == []
    real = {2021: 10e6, 2022: 10e6, 2023: 24e6, 2024: 24e6}                     # a real expansion moves the value too
    assert clean_area({2022: 50000, 2023: 120000}, real)[2023] == 120000
    assert grew(real, 2022, 2023, 0.10) and not grew(flat, 2022, 2023, 0.10)
    assert not grew({2012: 1e6, 2018: 1.3e6}, 2012, 2018, 0.10, market=lambda a, b: 1.25)   # 30% vs a 25% market: no


def test_zero_area_before_2017_is_not_a_new_building():
    # Gainesville High: exempt parcels had no building data before 2017, then its real area appears.
    gh = {2012: 0, 2016: 0, 2017: 225798, 2018: 225798, 2022: 221526}
    assert expansions(clean_area(gh, {}), 1000, 0.1) == []
    assert expansions(clean_area({2018: 0, 2020: 40000}, {}), 1000, 0.1) == [(2020, 0, 40000)]   # a recorded 0 from 2017 on is real


def test_seed_quotes_the_state_rule_and_the_missing_county_rule():
    F = yaml.safe_load((ROOT / "publicart" / "seed.yaml").read_text(encoding="utf-8"))["facilities"]
    assert F["state_rule"]["value"]["rate"] == 0.005 and F["state_rule"]["value"]["cap"] == 100000
    assert "255.043" in F["state_rule"]["provenance"] and F["county_rule"]["value"] is None


@pytest.mark.skipif(not OUT.exists(), reason="facilities not built")
def test_facilities_package_is_consistent():
    pkg = json.loads(OUT.read_text(encoding="utf-8"))
    al = pkg["alachua"]["features"]
    assert len(al) > 200 and all(f["properties"]["cls"] in pkg["classes"] for f in al)
    for f in al:
        for y, before, after, value, new, basis in f["properties"]["ev"]:
            assert after > before and 2001 <= y <= 2024, f["properties"]["id"]
    rows = pkg["florida"]["rows"]
    assert len(rows) > 1000 and all(r[1] in pkg["classes"] for r in rows)
    assert len({r[0] for r in rows}) == len(rows) and len({f["properties"]["id"] for f in al}) == len(al)   # each parcel once
    assert all(r[5] != "Alachua" for r in rows)                            # Alachua is drawn as outlines instead
    assert set(pkg["tags"]["registry"]) and set(pkg["tags"]["catalog"])
