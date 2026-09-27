"""End-to-end build in VIIRS mode with a synthetic radiance cache, written to a temp directory.

Exercises the code path that runs after `earthengine authenticate`: radiance-based placement, trend and
step-change export, and the LightGBM growth model with back-test metrics. Real VNP46A2 data has not been
run through it yet.
"""
import json

import numpy as np
import pytest

from ingest.common import RAW


@pytest.mark.skipif(not (RAW / "census_block_groups.json").exists(), reason="run python -m pipeline.ingest_all first")
def test_build_in_viirs_mode(tmp_path, monkeypatch):
    pytest.importorskip("lightgbm")
    from ingest import viirs_gee
    from pipeline import build
    from pipeline import rasterize as R

    bgs = json.loads((RAW / "census_block_groups.json").read_text())["rows"]
    cache = {}

    def fake_medians(grid, years=range(2012, 2025), **_):
        key = (grid.nx, grid.ny)
        if key not in cache:
            hu = R.spread_block_groups(grid, bgs, "hu") / grid.cell_area_km2
            cache[key] = {y: (np.maximum(hu / 50.0, 0.02) * (1.015 ** (y - 2012)), np.full(hu.shape, 30)) for y in range(2012, 2025)}
        return {y: cache[key][y] for y in years}

    monkeypatch.setattr(viirs_gee, "available", lambda grid, years=None: True)
    monkeypatch.setattr(viirs_gee, "annual_medians", fake_medians)
    monkeypatch.setattr(build, "OUT", tmp_path)
    build.main()
    e = json.loads((tmp_path / "engine.json").read_text())
    assert e["mode"] == "viirs" and e["data_status"]["viirs"]["loaded"]
    assert e["viirs"]["years"] == list(range(2012, 2025))
    for f in ("12001", "12075"):
        # first-3 vs last-3 year means of a 1.5%/yr series: 1.015^10 - 1
        assert e["viirs"]["county_pct_change"][f] == pytest.approx((1.015 ** 10 - 1) * 100, rel=0.05)
    assert e["growth_model"]["method"] in ("lightgbm", "theil_sen")
    assert (tmp_path / "viirs_a15.bin").exists() and (tmp_path / "viirs_trend_a15.bin").exists()
    assert e["anchor"]["is_calibration"] is False
