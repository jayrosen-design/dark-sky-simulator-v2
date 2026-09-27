"""ML components on synthetic VIIRS-like data (real VIIRS needs Earth Engine credentials)."""
import numpy as np
import pytest

from ml import growth, trends

YEARS = np.arange(2012, 2025, dtype=float)


def test_theil_sen_recovers_growth_rate():
    rng = np.random.default_rng(1)
    r = np.full((5, 5), 0.015)
    stack = 10 * np.exp(r[None] * (YEARS - 2012)[:, None, None]) * np.exp(rng.normal(0, 0.02, (13, 5, 5)))
    slope = trends.theil_sen_log_slope(YEARS, stack)
    assert np.allclose(slope, 0.015, atol=0.004)
    assert np.allclose(trends.pct_change(stack), (np.exp(0.015 * 10) - 1) * 100, atol=4)


def test_step_change_detects_retrofit_drop():
    rng = np.random.default_rng(2)
    stack = 20 * np.exp(rng.normal(0, 0.03, (13, 4, 4)))
    stack[7:, :, :2] *= 0.6  # 2019 retrofit in the left two columns
    sy, sp, _ = trends.step_change(YEARS, stack)
    assert np.all(sy[:, :2] == 2019)
    assert np.allclose(sp[:, :2], -40, atol=6)
    assert np.all(sy[:, 2:] == 0)


def test_dark_pixels_are_not_flagged():
    stack = np.full((13, 3, 3), 0.01)
    sy, _, _ = trends.step_change(YEARS, stack)
    assert np.all(sy == 0)


def test_growth_backtest_on_structured_data():
    pytest.importorskip("lightgbm")
    rng = np.random.default_rng(3)
    shape = (60, 60)
    d_road = rng.uniform(0, 20, shape)
    d_urban = rng.uniform(0, 60, shape)
    hu = rng.uniform(0, 300, shape)
    r_true = 0.04 * np.exp(-d_urban / 20) + 0.002
    base = 1 + hu / 20
    stack = {y: base * np.exp(r_true * (y - 2012)) * np.exp(rng.normal(0, 0.01, shape)) for y in range(2012, 2025)}
    cov = {"d_road_km": d_road, "d_urban_km": d_urban, "log_radiance": np.log(stack[2018]), "hu_density": hu,
           "elevation": rng.uniform(0, 50, shape), "conservation": np.zeros(shape)}
    res = growth.backtest(stack, cov, np.ones(shape, bool))
    assert res["median_ape_pct"] < 5
    r, l34 = growth.forecast(res["model"], stack, {**cov, "log_radiance": np.log(stack[2024])}, np.ones(shape, bool))
    assert np.corrcoef(r.ravel(), r_true.ravel())[0, 1] > 0.8
    assert np.all(l34 > stack[2024] * 0.9)


def test_blocked_cv_runs():
    pytest.importorskip("sklearn")
    rng = np.random.default_rng(4)
    x = rng.normal(size=(400, 3))
    y = x[:, 0] * 2 + rng.normal(0, 0.1, 400)
    blocks = growth.block_ids((20, 20), 5).ravel()
    assert growth.blocked_cv_r2(x, y, blocks) > 0.8
