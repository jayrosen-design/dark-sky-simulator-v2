"""10-year radiance growth forecast (PRD 0A.2 Machine learning (2); 2.3 development-trajectory model).

Gradient-boosted regression (LightGBM) of the per-cell log-radiance growth rate over the next six years on the
cell's state at the start: distance to major roads, distance to urban cores, radiance, housing density, elevation
and a conservation-land flag. Back-test: fit on the 2012 state -> 2012-2018 growth, apply to the 2018 state, and
score the predicted 2024 radiance (never seen in training) against two baselines, no change and each cell's own
2012-2018 rate carried forward. The forecasting model is refit the same way on the latest window (2018 state ->
2018-2024 growth) and gives L(2034) = L(2024) * exp(10 * r_hat), which assumes the 2018-2024 pace continues.

Spatially blocked cross-validation (2.3) scores how well that model generalises to unseen areas.

First real run (2026-10-19, background-corrected VNP46A2): lit-area radiance fell 3.7% over 2012-2018 and rose
20.6% over 2018-2024. No model trained on the first window can see that reversal coming, so the back-test's
median error matches no change; the model's skill is in where growth concentrates (rate_corr), not how much.
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


def _fit(x, y, seed):
    import lightgbm as lgb

    return lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8,
                             subsample_freq=1, colsample_bytree=0.9, random_state=seed, verbose=-1).fit(x, y)


def backtest(stack: dict[int, np.ndarray], cov: dict[str, np.ndarray], mask: np.ndarray, seed: int = 0) -> dict:
    """Out-of-time back-test (2012 state -> 2018-2024 growth) and the forecasting model refit on 2018 -> 2024.

    `cov` holds the static covariates; log_radiance is taken from `stack` for each window's start year.
    """
    state = lambda y: _matrix({**cov, "log_radiance": np.log(np.maximum(stack[y], 0.05))}, mask)
    past, future = _rate(stack[2012], stack[2018], 6)[mask], _rate(stack[2018], stack[2024], 6)[mask]
    r_hat = _fit(state(2012), past, seed).predict(state(2018))
    l18, obs = stack[2018][mask], stack[2024][mask]
    lit = obs > 0.5

    def mape(r):
        return float(np.median(np.abs(l18[lit] * np.exp(6 * r[lit]) / obs[lit] - 1.0)) * 100)

    def rmse(r):
        return float(np.sqrt(np.mean((np.log(np.maximum(l18 * np.exp(6 * r), 0.05)) - np.log(np.maximum(obs, 0.05))) ** 2)))

    zero = np.zeros_like(r_hat)
    x_last = state(2018)
    return {"model": _fit(x_last, future, seed),
            "median_ape_pct": mape(r_hat), "nochange_median_ape_pct": mape(zero), "naive_median_ape_pct": mape(past),
            "rmse_log": rmse(r_hat), "nochange_rmse_log": rmse(zero),
            "rate_corr": float(np.corrcoef(r_hat, future)[0, 1]),
            "cv_r2": blocked_cv_r2(x_last, future, block_ids(mask.shape)[mask], seed=seed),
            "lit_change_pct": {"2012-2018": float((l18.sum() / stack[2012][mask].sum() - 1) * 100),
                               "2018-2024": float((obs.sum() / l18.sum() - 1) * 100)},
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
