"""VIIRS mode for the build (active only when every VNP46A2 year is cached by ingest/viirs_gee.py).

- placement weight: 2024 annual median radiance replaces housing units for where light sits
  (fixture counts still come from the inventory and Census, PRD 0A.2 Streetlight inventory row);
- per-pixel trend and retrofit step-change rasters (ml/trends.py) for the year slider and trend map;
- growth rate per cell from the LightGBM forecast with the 2012-2018 -> 2024 back-test (ml/growth.py).
"""
from __future__ import annotations

import numpy as np

from engine.grid import Grid
from ingest import viirs_gee
from ml import growth, trends

YEARS = list(range(2012, 2025))


def available(a15: Grid, rg: Grid) -> bool:
    return viirs_gee.available(a15, YEARS) and viirs_gee.available(rg, YEARS)


def stacks(a15: Grid, rg: Grid):
    s15 = viirs_gee.annual_medians(a15, YEARS)
    srg = viirs_gee.annual_medians(rg, YEARS)
    return {y: s15[y][0] for y in YEARS}, {y: srg[y][0] for y in YEARS}


def trend_layers(stack15: dict[int, np.ndarray]):
    arr = np.stack([stack15[y] for y in YEARS])
    t = trends.trend_rasters(np.array(YEARS, dtype=float), arr)
    return arr, t


def growth_rates(stack_rg: dict[int, np.ndarray], cov: dict[str, np.ndarray], valid: np.ndarray, clip=(-0.01, 0.06)):
    """LightGBM growth rate per region cell plus back-test metrics; falls back to Theil-Sen if too few lit cells."""
    lit = valid & (stack_rg[2018] > 0.5)
    arr = np.stack([stack_rg[y] for y in YEARS])
    ts = trends.theil_sen_log_slope(np.array(YEARS, dtype=float), arr)
    if lit.sum() < 500:
        return np.clip(ts, *clip), {"method": "theil_sen", "note": "too few lit cells for the GBM back-test"}
    cov18 = {**cov, "log_radiance": np.log(np.maximum(stack_rg[2018], 0.05))}
    bt = growth.backtest(stack_rg, cov18, lit)
    cov24 = {**cov, "log_radiance": np.log(np.maximum(stack_rg[2024], 0.05))}
    r, _ = growth.forecast(bt.pop("model"), stack_rg, cov24, lit)
    r = np.where(np.isfinite(r), r, ts)
    return np.clip(r, *clip), {"method": "lightgbm", **bt}
