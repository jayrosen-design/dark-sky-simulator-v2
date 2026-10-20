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


def background(stack: dict[int, np.ndarray], share: float = 0.2) -> dict[int, float]:
    """Per-year background offset: median radiance of the grid's darkest fifth of pixels (by 2012-2024 median).

    VNP46A2 keeps airglow, which follows the solar cycle: on the region grid the unlit background is 0.10 nW in
    2019-20 and 0.33 nW in 2023, so uncorrected forests and wetlands read as brightening 70-120%. The NOAA EOG
    monthly composites show the same lit-area rise after 2021 once this offset is removed (checked 2026-10-19).
    """
    med = np.median(np.stack([stack[y] for y in YEARS]), axis=0)
    dark = med <= np.quantile(med, share)
    return {y: float(np.median(stack[y][dark])) for y in YEARS}


def stacks(a15: Grid, rg: Grid):
    """Background-corrected annual radiance on both grids, plus the offsets removed ({grid: {year: nW}})."""
    out, bg = [], {}
    for name, g in (("module_a", a15), ("region", rg)):
        raw = {y: v[0] for y, v in viirs_gee.annual_medians(g, YEARS).items()}
        bg[name] = background(raw)
        out.append({y: np.maximum(raw[y] - bg[name][y], 0.0) for y in YEARS})
    return out[0], out[1], bg


def trend_layers(stack15: dict[int, np.ndarray]):
    arr = np.stack([stack15[y] for y in YEARS])
    t = trends.trend_rasters(np.array(YEARS, dtype=float), arr)
    return arr, t


def change_events(grid: Grid, arr: np.ndarray, tr: dict, towns: list[tuple[str, float, float]], top: int = 40):
    """Group flagged pixels into events (8-connected, same direction), largest radiance change first."""
    from scipy import ndimage

    sy, sp = tr["step_year"], tr["step_pct"]
    delta = arr[-3:].mean(axis=0) - arr[:3].mean(axis=0)
    out = []
    for sign in (1, -1):
        lab, n = ndimage.label((sy > 0) & (np.sign(sp) == sign), structure=np.ones((3, 3)))
        for i in range(1, n + 1):
            r, c = np.nonzero(lab == i)
            lon, lat = grid.west + (c.mean() + 0.5) * grid.res, grid.north - (r.mean() + 0.5) * grid.res
            name, tlon, tlat = min(towns, key=lambda t: (t[1] - lon) ** 2 + ((t[2] - lat) * 1.15) ** 2)
            year = int(np.bincount(sy[r, c]).argmax())
            # The cell the AI tab opens: the largest step among cells that stepped in the event's year.
            k = np.argmax(np.where(sy[r, c] == year, np.abs(sp[r, c]), -1))
            out.append({"year": year, "pct": round(float(np.median(sp[r, c])), 1),
                        "pixels": int(len(r)), "change": round(float(delta[r, c].sum()), 1),
                        "lon": round(float(lon), 4), "lat": round(float(lat), 4), "cell": int(r[k] * grid.nx + c[k]),
                        "near": name, "near_km": round(float(np.hypot((tlon - lon) * 96.6, (tlat - lat) * 111.0)), 1)})
    out.sort(key=lambda e: -abs(e["change"]))
    return out[:top], {"rises": sum(e["pct"] > 0 for e in out), "drops": sum(e["pct"] < 0 for e in out)}


def growth_rates(stack_rg: dict[int, np.ndarray], cov: dict[str, np.ndarray], valid: np.ndarray, clip=(-0.01, 0.06)):
    """LightGBM growth rate per region cell plus back-test metrics; falls back to Theil-Sen if too few lit cells."""
    lit = valid & (stack_rg[2018] > 0.5)
    arr = np.stack([stack_rg[y] for y in YEARS])
    ts = trends.theil_sen_log_slope(np.array(YEARS, dtype=float), arr)
    if lit.sum() < 500:
        return np.clip(ts, *clip), {"method": "theil_sen", "note": "too few lit cells for the GBM back-test"}
    bt = growth.backtest(stack_rg, cov, lit)
    cov24 = {**cov, "log_radiance": np.log(np.maximum(stack_rg[2024], 0.05))}
    r, _ = growth.forecast(bt.pop("model"), stack_rg, cov24, lit)
    r = np.where(np.isfinite(r), r, ts)
    return np.clip(r, *clip), {"method": "lightgbm", **bt}
