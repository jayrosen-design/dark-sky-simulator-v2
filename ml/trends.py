"""Per-pixel VIIRS trend and retrofit step-change detection (PRD 0A.2 Machine learning (1)).

Input: annual median radiance stack [years, ny, nx] (nW cm^-2 sr^-1) from ingest/viirs_gee.py.
Outputs per pixel:
  slope      Theil-Sen slope of ln(radiance) per year (robust growth rate r)
  pct_change radiance change from the first to the last 3-year mean, %
  step_year  first year of a new level on top of the pixel's trend, or 0 when there is no significant step
  step_pct   size of that step, % (negative = drop, the signature of an LED/shielding retrofit; positive = new lights)
Pure NumPy; runs on CPU in seconds for the Alachua + Levy grid.

Step detection (first real run 2026-10-19 showed the old before/after t-test flagging two thirds of lit pixels,
because a steady trend also separates the means of any two segments): for each pixel, ln radiance is fitted with a
line and with a line plus a step at each candidate year; the best step's F statistic is compared with the
critical value of that maximum under pure noise, found by simulation (choosing the best year inflates the plain F
test). The region's shared year-to-year movement (median over lit pixels) is removed first, so only local events
count, and a step must also change radiance by at least 20%.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

FLOOR = 0.05  # nW cm^-2 sr^-1; below this a pixel is treated as dark (log undefined / noise dominated)
LIT_NW = 1.0  # a pixel is tested only if its first or last 3-year mean exceeds this (dimmer cells are noise)


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


def lit_mask(stack: np.ndarray, window: int = 3) -> np.ndarray:
    return np.maximum(stack[:window].mean(axis=0), stack[-window:].mean(axis=0)) > LIT_NW


def common_mode(stack: np.ndarray, lit: np.ndarray) -> np.ndarray:
    """The region's shared movement of ln radiance per year: median over lit pixels of each pixel's deviation from
    its own mean. It holds whatever moves every pixel together (regional growth, sensor or processing changes)."""
    y = np.log(np.maximum(stack[:, lit], FLOOR))
    return np.median(y - y.mean(axis=0), axis=1)


def _designs(n: int, min_seg: int):
    """Residual makers for the line, and for line + step at each candidate split k (new level from index k)."""
    t = np.arange(n, dtype=float) - (n - 1) / 2
    x1 = np.column_stack([np.ones(n), t])
    m1 = np.eye(n) - x1 @ np.linalg.pinv(x1)
    ks = list(range(min_seg, n - min_seg + 1))
    out = []
    for k in ks:
        x2 = np.column_stack([x1, (np.arange(n) >= k).astype(float)])
        p = np.linalg.pinv(x2)
        out.append((k, np.eye(n) - x2 @ p, p[2]))
    return m1, out


def _sup_f(y: np.ndarray, min_seg: int):
    """For columns of y [n, m]: max over splits of the F statistic for adding a step, the split, and the step size."""
    n = y.shape[0]
    m1, designs = _designs(n, min_seg)
    rss1 = np.sum((m1 @ y) ** 2, axis=0)
    best_f = np.full(y.shape[1], -np.inf)
    best_k = np.zeros(y.shape[1], dtype=int)
    best_d = np.zeros(y.shape[1])
    for k, m2, prow in designs:
        rss2 = np.sum((m2 @ y) ** 2, axis=0)
        f = (rss1 - rss2) / np.maximum(rss2 / (n - 3), 1e-12)
        better = f > best_f
        best_f = np.where(better, f, best_f)
        best_k = np.where(better, k, best_k)
        best_d = np.where(better, prow @ y, best_d)
    return best_f, best_k, best_d


@lru_cache(maxsize=None)
def critical_f(n: int, min_seg: int = 3, alpha: float = 0.001, sims: int = 200_000) -> float:
    """1 - alpha quantile of the best-split F under independent Gaussian noise around any line. The statistic
    ignores the line and the noise level, so one simulation (fixed seed) serves every pixel."""
    z = np.random.default_rng(0).standard_normal((n, sims))
    return float(np.quantile(_sup_f(z, min_seg)[0], 1 - alpha))


def step_change(years: np.ndarray, stack: np.ndarray, min_seg: int = 3, alpha: float = 0.001,
                min_step: float = 0.20, common: np.ndarray | None = None):
    """One level shift per pixel on top of its trend (ln radiance, optionally minus a shared `common` series).

    Returns (step_year, step_pct, f_stat, meta); step_year = 0 where the pixel is not lit, the best step is not
    significant at `alpha`, or it changes radiance by less than `min_step`.
    """
    years = np.asarray(years)
    n = len(years)
    y = np.log(np.maximum(stack, FLOOR))
    if common is not None:
        y = y - np.asarray(common)[:, None, None]
    f, k, d = (a.reshape(stack.shape[1:]) for a in _sup_f(y.reshape(n, -1), min_seg))
    crit = critical_f(n, min_seg, alpha)
    lit = lit_mask(stack)
    sig = lit & (f >= crit) & (np.abs(np.exp(d) - 1.0) >= min_step)
    step_year = np.where(sig, years[np.clip(k, 0, n - 1)], 0).astype(int)
    step_pct = np.where(sig, (np.exp(d) - 1.0) * 100.0, 0.0)
    meta = {"alpha": alpha, "critical_f": crit, "min_step_pct": min_step * 100, "lit_nw": LIT_NW, "floor_nw": FLOOR,
            "n_lit": int(lit.sum()), "n_flagged": int(sig.sum()), "expected_false": float(alpha * lit.sum()),
            "first_year": int(years[min_seg]), "last_year": int(years[n - min_seg])}
    return step_year, step_pct, np.where(lit, f, 0.0), meta


def residual_noise(stack: np.ndarray, lit: np.ndarray, common: np.ndarray | None) -> np.ndarray:
    """Year-to-year scatter of each lit pixel's ln radiance around its own straight line (≈ fractional noise)."""
    n = stack.shape[0]
    y = np.log(np.maximum(stack[:, lit], FLOOR)) - (0 if common is None else np.asarray(common)[:, None])
    m1, _ = _designs(n, 3)
    return np.sqrt(np.sum((m1 @ y) ** 2, axis=0) / (n - 2))


def detection_rates(noise: float, n: int = 13, steps=(-0.3, 0.5), at: int = 7, sims: int = 20_000, **kw) -> dict:
    """Share of simulated pixels (a straight line plus Gaussian noise of this size, with or without a step at index
    `at`) that the detector flags: the false-alarm rate and its power for each step size."""
    rng = np.random.default_rng(1)
    years = np.arange(2012, 2012 + n, dtype=float)
    out = {}
    for step in (0.0, *steps):
        y = 20 * np.exp(0.02 * (years - years[0]))[:, None, None] * np.exp(rng.normal(0, noise, (n, 1, sims)))
        y[at:] *= 1 + step
        sy = step_change(years, y, **kw)[0]
        out["none" if step == 0 else f"{step * 100:+.0f}%"] = float((sy > 0).mean())
    return out


def trend_rasters(years, stack):
    years = np.asarray(years, dtype=float)
    stack = np.asarray(stack, dtype=float)
    lit = lit_mask(stack)
    common = common_mode(stack, lit) if lit.sum() >= 50 else None
    sy, sp, f, meta = step_change(years, stack, common=common)
    meta["common_log"] = None if common is None else [float(c) for c in common]
    meta["common_mode_pct"] = None if common is None else [round(float(np.exp(c - common[0]) - 1) * 100, 1) for c in common]
    noise = residual_noise(stack, lit, common)
    meta["noise_pct"] = {q: round(float(np.percentile(noise, p)) * 100, 1) for q, p in (("p25", 25), ("median", 50), ("p75", 75))}
    meta["detection_at_median_noise"] = detection_rates(float(np.median(noise)), len(years))
    return {"slope": theil_sen_log_slope(years, stack), "pct_change": pct_change(stack),
            "step_year": sy, "step_pct": sp, "step_f": f, "step_meta": meta}
