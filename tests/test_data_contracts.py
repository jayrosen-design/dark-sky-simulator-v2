"""Seed provenance, architecture rule, encoding, dedup, and the published data package."""
import ast
import json
from pathlib import Path

import numpy as np
import pytest

from ingest.inventory import dedup
from pipeline.config import load_county, load_seed
from pipeline.encode import decode_log16, read_codes, write_lin16, write_log16

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "dark-sky" / "data"


def test_engine_imports_nothing_county_specific():
    """0B: engine code imports nothing from counties/ (and does no pipeline/ingest I/O)."""
    for f in (ROOT / "engine").glob("*.py"):
        tree = ast.parse(f.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            for n in names:
                assert n.split(".")[0] not in ("counties", "pipeline", "ingest"), f"{f.name} imports {n}"


def test_every_seed_param_has_provenance():
    seed = load_seed()
    for block in (seed["engine"]["params"], seed["econ"]["params"]):
        for k, v in block.items():
            assert v.get("provenance"), k
    for code, row in seed["spd"].items():
        assert row["provenance"], code
        bands = sum(float(row[b]) for b in ("band_415", "band_480", "band_555", "band_590", "band_680"))
        assert bands == pytest.approx(1.0, abs=0.011), code


def test_county_packages_are_data_only():
    from pipeline.config import load_region
    region = load_region()
    for fips in region["model_counties"]:
        c = load_county(fips)
        assert c["fips"] == fips and c["stocks"]
        assert c["sites"] or fips not in region["reference_counties"]
        for s in c["stocks"]:
            assert 0 < s["confidence"] <= 1
            assert sum(s["spd_mix"].values()) == pytest.approx(1.0)
            for spd, um in s["u_mix"].items():
                assert sum(um.values()) == pytest.approx(1.0), (fips, s["id"], spd)


def test_log16_round_trip(tmp_path):
    a = np.array([[0.0, 1e-9, 3.3e-6], [1e-3, 0.5, 2.0]])
    meta = write_log16(tmp_path / "x.bin", [a])
    codes = read_codes(tmp_path / "x.bin", meta["shape"])[0]
    back = decode_log16(codes, meta["lo"], meta["hi"])
    assert back[0, 0] == 0.0
    nz = a > 0
    assert np.max(np.abs(back[nz] / a[nz] - 1)) < 5e-4


def test_lin16_nan(tmp_path):
    meta = write_lin16(tmp_path / "y.bin", [np.array([1.0, np.nan, 3.0])])
    codes = read_codes(tmp_path / "y.bin", meta["shape"])[0]
    assert codes[1] == 65535 and meta["layers"][0]["lo"] == 1.0


def test_dedup_merges_within_5m_keeping_richest():
    base = {"source": "osm", "owner": None, "fixture_class": None, "spd_class": None, "pole_height_m": None,
            "install_year": None, "confidence": 0.6, "lon": -82.3, "lat": 29.65}
    rich = {**base, "source": "socrata", "spd_class": "LED4000", "confidence": 0.9, "lon": -82.30003}
    far = {**base, "lon": -82.3002}
    kept, merged = dedup([base, rich, far])
    assert merged == 1 and len(kept) == 2
    assert any(k["source"] == "socrata" for k in kept)


ENGINE = json.loads((DATA / "engine.json").read_text()) if (DATA / "engine.json").exists() else None
needs_package = pytest.mark.skipif(ENGINE is None, reason="run python -m pipeline.build first")


@needs_package
def test_anchor_is_labeled_not_calibration():
    assert ENGINE["anchor"]["is_calibration"] is False
    assert ENGINE["data_status"]["calibration"]["sqm_stations"] == 0


@needs_package
def test_basis_file_matches_index():
    m = ENGINE["files"]["basis_a30"]
    assert read_codes(DATA / m["file"], m["shape"]).shape[0] == m["count"]
    layer_ids = sorted(i for c in ENGINE["components"] for i in c["layers"].values())
    assert layer_ids == list(range(m["count"]))


@needs_package
def test_every_site_has_contributions_and_bortle():
    assert {s["id"] for s in ENGINE["sites"]} >= {"RHO-Dome1", "CAV-BillyDodd", "PP-Overlook"}
    for s in ENGINE["sites"]:
        assert 17 < s["model_mag"] <= 22.0 and 1 <= s["model_bortle"] <= 8
        assert set(s["contrib"]) == {c["id"] for c in ENGINE["components"]}


@needs_package
def test_fixture_totals_match_seed_counts():
    by = {(r["county"], r["group"]): r["n"] for r in ENGINE["inventory"]["by_group"]}
    assert by[("12001", "GRU")] == pytest.approx(30000)
    assert by[("12001", "Utility")] == pytest.approx(9000)
    assert by[("12075", "Municipal")] + by[("12075", "Utility")] == pytest.approx(3135)


@needs_package
def test_overlay_rings_cover_both_sites():
    rings = {c["site"] for c in ENGINE["components"] if c["kind"] == "ring"}
    assert rings == {"RHO-Dome1", "CAV-BillyDodd"}


def test_nelm_conversion_inverts_the_web_formula():
    import math
    from pipeline.sanity import sqm_from_nelm
    for sqm in (18.0, 20.0, 21.5):
        nelm = 7.93 - 5 * math.log10(10 ** (4.316 - sqm / 5) + 1)  # web/src/engine/bortle.ts nelmFromSqm
        assert sqm_from_nelm(nelm) == pytest.approx(sqm, abs=1e-9)


@needs_package
def test_neighbor_counties_have_derived_public_stock():
    """Neighbors: public fixtures from the derived per-home rates, ordered like their housing counts, confidence 0.2."""
    rates = ENGINE["public_rates"]
    assert 0 < rates["rural_per_hu"] < rates["urban_per_hu"] < 1
    pub = {}
    for r in ENGINE["inventory"]["by_group"]:
        if r["group"] in ("Municipal", "Utility") and r["county"] not in ("12001", "12075"):
            pub[r["county"]] = pub.get(r["county"], 0) + r["n"]
            assert r["confidence"] == pytest.approx(0.2)
    order = [f for f, _ in sorted(pub.items(), key=lambda kv: -kv[1])]
    assert order == ["12083", "12019", "12107", "12007", "12041", "12125"]  # Marion, Clay, Putnam, Bradford, Gilchrist, Union
