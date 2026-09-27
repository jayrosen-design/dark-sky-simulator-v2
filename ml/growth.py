"""10-year radiance growth forecast (PRD 0A.2 Machine learning (2); 2.3 development-trajectory model).

Gradient-boosted regression (LightGBM) of the per-cell log-radiance growth rate on open covariates:
distance to major roads, distance to urban cores, current radiance, housing density, elevation and a
conservation-land flag. Back-test (0A.4 week of 2026-10-11): fit on the 2012->2018 growth, predict
2018->2024 from 2018 covariates, and report the error of the predicted 2024 radiance. The trained
model then forecasts L(2034) = L(2024) * exp(10 * r_hat).

Spatially blocked cross-validation (2.3) is used for the hold-out score so neighbouring cells do not leak.
"""
from __future__ import annotations

import numpy as np

FEATURES = ("d_road_km", "d_urban_km", "log_radiance", "hu_density", "elevation", "conservation")


def _matrix(cov: dict[str, np.ndarray], mask: np.ndarray) -> np.ndarray:
    return np.column_stack([np.asarray(cov[k])[mask] for k in FEATURES])


def _rate(a, b, years):
    return (np.log(np.maximum(b, 0.05)) - np.log(np.maximum(a, 0.05))) / years


def block_ids(shape, block: int = 16) -> np.ndarray:
    r, c = np.indices(shape)
    return (r // block) * 10_000 + (c // block)


def backtest(stack: dict[int, np.ndarray], cov_2018: dict[str, np.ndarray], mask: np.ndarray, seed: int = 0) -> dict:
    """Fit on 2012->2018 growth; predict 2024 from 2018. Returns metrics and the fitted model."""
    import lightgbm as lgb

    y_train = _rate(stack[2012], stack[2018], 6)[mask]
    x = _matrix(cov_2018, mask)
    model = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40,
                              subsample=0.8, subsample_freq=1, colsample_bytree=0.9, random_state=seed, verbose=-1)
    model.fit(x, y_train)
    r_hat = model.predict(x)
    pred_2024 = stack[2018][mask] * np.exp(6 * r_hat)
    obs_2024 = stack[2024][mask]
    naive_2024 = stack[2018][mask] * np.exp(6 * y_train)  # persistence of the 2012-2018 trend
    lit = obs_2024 > 0.5
    def mape(p):
        return float(np.median(np.abs(p[lit] / obs_2024[lit] - 1.0)) * 100)
    return {"model": model, "median_ape_pct": mape(pred_2024), "naive_median_ape_pct": mape(naive_2024),
            "rmse_log": float(np.sqrt(np.mean((np.log(np.maximum(pred_2024, 0.05)) - np.log(np.maximum(obs_2024, 0.05))) ** 2))),
            "n_cells": int(mask.sum())}


def blocked_cv_r2(x: np.ndarray, y: np.ndarray, blocks: np.ndarray, folds: int = 5, seed: int = 0) -> float:
    import lightgbm as lgb
    from sklearn.metrics import r2_score

    ub = np.unique(blocks)
    rng = np.random.default_rng(seed)
    fold_of = dict(zip(ub, rng.integers(0, folds, len(ub))))
    f = np.array([fold_of[b] for b in blocks])
    pred = np.zeros_like(y)
    for k in range(folds):
        tr, te = f != k, f == k
        if te.sum() == 0 or tr.sum() == 0:
            continue
        m = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, min_child_samples=40, random_state=seed, verbose=-1)
        m.fit(x[tr], y[tr])
        pred[te] = m.predict(x[te])
    return float(r2_score(y, pred))


def forecast(model, stack: dict[int, np.ndarray], cov_2024: dict[str, np.ndarray], mask: np.ndarray, horizon: int = 10):
    """Per-cell growth rate r_hat and L(2024 + horizon); cells outside mask get NaN."""
    r = np.full(mask.shape, np.nan)
    r[mask] = model.predict(_matrix(cov_2024, mask))
    return r, stack[2024] * np.exp(horizon * np.nan_to_num(r))
