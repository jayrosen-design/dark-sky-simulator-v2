"""Per-pixel VIIRS trend and retrofit step-change detection (PRD 0A.2 Machine learning (1)).

Input: annual median radiance stack [years, ny, nx] (nW cm^-2 sr^-1) from ingest/viirs_gee.py.
Outputs per pixel:
  slope      Theil-Sen slope of ln(radiance) per year (robust growth rate r)
  pct_change radiance change from the first to the last 3-year mean, %
  step_year  year of the largest mean shift (first year of the new level), or 0 when no significant step
  step_pct   size of that shift, % (negative = drop, the signature of an LED/shielding retrofit)
Pure NumPy; runs on CPU in seconds for the Alachua + Levy grid.
"""
from __future__ import annotations

import numpy as np

FLOOR = 0.05  # nW cm^-2 sr^-1; below this a pixel is treated as dark (log undefined / noise dominated)


def theil_sen_log_slope(years: np.ndarray, stack: np.ndarray) -> np.ndarray:
    """Median of pairwise slopes of ln(max(stack, FLOOR)) over all year pairs."""
    y = np.log(np.maximum(stack, FLOOR))
    i, j = np.triu_indices(len(years), k=1)
    slopes = (y[j] - y[i]) / (years[j] - years[i])[:, None, None]
    return np.median(slopes, axis=0)


def pct_change(stack: np.ndarray, window: int = 3) -> np.ndarray:
    a = np.maximum(stack[:window].mean(axis=0), FLOOR)
    b = np.maximum(stack[-window:].mean(axis=0), FLOOR)
    return (b / a - 1.0) * 100.0


def step_change(years: np.ndarray, stack: np.ndarray, min_seg: int = 3, t_crit: float = 4.0):
    """Single change point per pixel by maximum Welch t between segments of ln radiance.

    Returns (step_year, step_pct, t_stat); step_year = 0 where |t| < t_crit or the pixel is dark.
    """
    y = np.log(np.maximum(stack, FLOOR))
    n = len(years)
    best_t = np.zeros(y.shape[1:])
    best_k = np.zeros(y.shape[1:], dtype=int)
    best_d = np.zeros(y.shape[1:])
    for k in range(min_seg, n - min_seg + 1):
        a, b = y[:k], y[k:]
        va = a.var(axis=0, ddof=1) / len(a)
        vb = b.var(axis=0, ddof=1) / len(b)
        d = b.mean(axis=0) - a.mean(axis=0)
        t = d / np.sqrt(va + vb + 1e-6)
        better = np.abs(t) > np.abs(best_t)
        best_t = np.where(better, t, best_t)
        best_k = np.where(better, k, best_k)
        best_d = np.where(better, d, best_d)
    dark = stack.max(axis=0) < FLOOR * 4
    sig = (np.abs(best_t) >= t_crit) & ~dark
    step_year = np.where(sig, years[np.clip(best_k, 0, n - 1)], 0)
    step_pct = np.where(sig, (np.exp(best_d) - 1.0) * 100.0, 0.0)
    return step_year.astype(int), step_pct, best_t


def trend_rasters(years, stack):
    years = np.asarray(years, dtype=float)
    stack = np.asarray(stack, dtype=float)
    sy, sp, t = step_change(years, stack)
    return {"slope": theil_sen_log_slope(years, stack), "pct_change": pct_change(stack),
            "step_year": sy, "step_pct": sp, "step_t": t}
