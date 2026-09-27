"""Five-band spectral treatment (PRD 2.1 "Spectral treatment", seed 6.2).

Each SPD class is five radiant-power fractions in AS7341-aligned bands (415, 480, 555, 590, 680 nm centers).
Fixtures are specified in photopic lumens, so for every SPD we compute, per photopic lumen:

  skyglow factor[term][mode] = sum_b p_b * S_term(lambda_b) * W_mode(b) / sum_b p_b * Vbar(b)

S_term is the band's integrated Garstang kernel relative to 555 nm (blue scatters more near the source and
is extinguished faster far away); W_mode is the chunk-mean sensitivity of the output mode (photopic V,
scotopic V', or a single band). The 'V' factor of monochromatic 555 nm light is 1, so V-mode results stay
in absolute cd m^-2 and feed magnitudes directly.
"""
from __future__ import annotations

import numpy as np

from .garstang import Atmosphere, zenith_luminance_per_lm

BAND_CENTERS_NM = (415, 480, 555, 590, 680)
BAND_KEYS = ("band_415", "band_480", "band_555", "band_590", "band_680")
# Each band fraction stands for a chunk of the 380-780 nm spectrum (design decision, docs/adr/0003).
BAND_EDGES_NM = (380, 450, 520, 570, 630, 781)

# CIE 1924 photopic V(lambda) and CIE 1951 scotopic V'(lambda), 380-780 nm at 10 nm (literature).
_WL = np.arange(380, 781, 10)
_V = np.array([0.0000390, 0.000120, 0.000396, 0.00121, 0.00400, 0.0116, 0.023, 0.038, 0.060, 0.09098,
               0.13902, 0.20802, 0.323, 0.503, 0.710, 0.862, 0.954, 0.99495, 0.995, 0.952, 0.870, 0.757,
               0.631, 0.503, 0.381, 0.265, 0.175, 0.107, 0.061, 0.032, 0.017, 0.00821, 0.004102, 0.002091,
               0.001047, 0.00052, 0.000249, 0.00012, 0.00006, 0.00003, 0.000015])
_VS = np.array([0.000589, 0.002209, 0.00929, 0.03484, 0.0966, 0.1998, 0.3281, 0.455, 0.567, 0.676, 0.793,
                0.904, 0.982, 0.997, 0.935, 0.811, 0.650, 0.481, 0.3288, 0.2076, 0.1212, 0.0655, 0.03315,
                0.01593, 0.00737, 0.003335, 0.001497, 0.000677, 0.0003129, 0.0001480, 0.0000715,
                0.00003533, 0.00001780, 0.00000914, 0.00000478, 0.000002546, 0.000001379, 0.000000760,
                0.000000425, 0.000000241, 0.000000139])


def _chunk_mean(curve: np.ndarray) -> np.ndarray:
    out = []
    for lo, hi in zip(BAND_EDGES_NM[:-1], BAND_EDGES_NM[1:]):
        m = (_WL >= lo) & (_WL < hi)
        out.append(curve[m].mean())
    return np.array(out)


VBAR = _chunk_mean(_V)
VSBAR = _chunk_mean(_VS)

MODES = ("V", "scotopic") + BAND_KEYS


def mode_weights(mode: str) -> np.ndarray:
    if mode == "V":
        return VBAR
    if mode == "scotopic":
        return VSBAR
    w = np.zeros(5)
    w[BAND_KEYS.index(mode)] = 1.0
    return w


def band_scatter_ratios(term: str, atmospheres: list[Atmosphere], d_max_km: float = 100.0) -> np.ndarray:
    """Area-integrated kernel at each band center relative to 555 nm (season-averaged)."""
    d_km = np.geomspace(0.05, d_max_km, 200)

    def integrated(wl):
        b = np.mean([zenith_luminance_per_lm(d_km * 1000.0, Atmosphere(a.turbidity, a.hg_g, wl), term)
                     for a in atmospheres], axis=0)
        return np.trapezoid(b * 2 * np.pi * d_km, d_km)

    ref = integrated(555.0)
    return np.array([integrated(float(wl)) / ref for wl in BAND_CENTERS_NM])


def skyglow_factors(band_fractions: dict[str, np.ndarray], scatter: dict[str, np.ndarray]) -> dict:
    """factors[term][mode][spd] per photopic lumen (see module docstring)."""
    out: dict = {}
    for term, s in scatter.items():
        out[term] = {}
        for mode in MODES:
            w = mode_weights(mode)
            out[term][mode] = {spd: float(np.sum(p * s * w) / np.sum(p * VBAR)) for spd, p in band_fractions.items()}
    return out
