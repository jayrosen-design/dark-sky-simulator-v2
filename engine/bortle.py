"""Luminance <-> sky magnitude and Bortle banding (PRD 2.1, seed 6.1).

Magnitude is the primary output; Bortle is only a labeled band on a computed magnitude (A-07).
"""
from __future__ import annotations

import numpy as np

MAG_ZERO_POINT = 12.6  # m = 12.6 - 2.5 log10(L_v [cd m^-2])


def luminance_from_mag(mag, zero_point: float = MAG_ZERO_POINT):
    return 10.0 ** ((zero_point - np.asarray(mag, dtype=float)) / 2.5)


def mag_from_luminance(lum, zero_point: float = MAG_ZERO_POINT):
    return zero_point - 2.5 * np.log10(np.asarray(lum, dtype=float))


def total_mag(artificial_lum, natural_mag: float, zero_point: float = MAG_ZERO_POINT):
    """Zenith magnitude of natural background plus artificial luminance (cd m^-2)."""
    return mag_from_luminance(np.asarray(artificial_lum, dtype=float) + luminance_from_mag(natural_mag, zero_point), zero_point)


def bortle_class(mag, thresholds: list[tuple[int, float | None]]):
    """Return the Bortle class for a magnitude.

    thresholds: [(bortle, min_mag), ...] sorted by bortle ascending; the last class has min_mag None (catch-all).
    """
    m = float(mag)
    for bortle, min_mag in thresholds:
        if min_mag is None or m >= min_mag:
            return bortle
    return thresholds[-1][0]
