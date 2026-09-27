"""Module B normalizations (PRD 3 Module B, seed 6.6). 0 = worst, 1 = best. Pure functions."""
from __future__ import annotations

import numpy as np


def linear(x, worst, best):
    return np.clip((np.asarray(x, dtype=float) - worst) / (best - worst), 0.0, 1.0)


def logistic(x, midpoint, scale):
    return 1.0 / (1.0 + np.exp(-(np.asarray(x, dtype=float) - midpoint) / scale))


def plateau_linear(d, full, zero):
    """1 within `full`, falling linearly to 0 at `zero` (access criterion)."""
    return np.clip((zero - np.asarray(d, dtype=float)) / (zero - full), 0.0, 1.0)


def wlc(scores: dict[str, np.ndarray], weights: dict[str, float]):
    """Weighted linear combination with weights renormalized to sum to 1."""
    total = sum(weights.values())
    return sum(scores[k] * (w / total) for k, w in weights.items())
