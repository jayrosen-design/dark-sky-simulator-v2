"""Tier 1 Garstang-lite skyglow kernel (PRD 2.1, 0A.2).

Zenith sky luminance at an observer produced by 1 lm of upward flux from a ground source at horizontal
distance D, by single scattering (Rayleigh + Henyey-Greenstein aerosol) along the vertical line of sight,
with slant-path extinction, exponential atmospheres and Earth curvature. Two emission terms follow
Garstang (1986):

  direct uplight   I(theta) = F_up * 0.554 * theta^4 / (2 pi)   [cd per lm of direct upward flux]
  ground reflected I(theta) = F_refl * cos(theta) / pi           [cd per lm of reflected flux]

theta is the zenith angle of emission. The theta^4 term concentrates direct uplight near the horizon,
which is why shielding matters most for distant skyglow; the two terms get separate kernels.
Pure functions: no I/O, no county data.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

EARTH_RADIUS_M = 6_371_000.0
RAYLEIGH_SCALE_H_M = 8_000.0
AEROSOL_SCALE_H_M = 1_500.0
# Rayleigh optical depth of the whole atmosphere at 555 nm (literature value ~0.097).
TAU_RAYLEIGH_555 = 0.097
ANGSTROM_EXPONENT = 1.3


@dataclass(frozen=True)
class Atmosphere:
    turbidity: float = 3.5      # Linke turbidity (seed 6.1: 3.5 summer, 2.5 winter)
    hg_g: float = 0.80          # Henyey-Greenstein asymmetry (seed 6.1)
    wavelength_nm: float = 555.0

    @property
    def tau_rayleigh(self) -> float:
        return TAU_RAYLEIGH_555 * (555.0 / self.wavelength_nm) ** 4

    @property
    def tau_aerosol(self) -> float:
        # Linke turbidity T = (tau_R + tau_a) / tau_R at the reference wavelength.
        return (self.turbidity - 1.0) * TAU_RAYLEIGH_555 * (555.0 / self.wavelength_nm) ** ANGSTROM_EXPONENT

    @property
    def beta_r0(self) -> float:  # m^-1 at sea level
        return self.tau_rayleigh / RAYLEIGH_SCALE_H_M

    @property
    def beta_m0(self) -> float:
        return self.tau_aerosol / AEROSOL_SCALE_H_M


def rayleigh_phase(cos_psi):
    return 3.0 / (16.0 * np.pi) * (1.0 + cos_psi**2)


def hg_phase(cos_psi, g: float):
    return (1.0 - g**2) / (4.0 * np.pi * (1.0 + g**2 - 2.0 * g * cos_psi) ** 1.5)


def _vertical_tau(h, atm: Atmosphere):
    """Optical depth from the ground to altitude h (m) along the vertical."""
    return (atm.beta_r0 * RAYLEIGH_SCALE_H_M * (1.0 - np.exp(-h / RAYLEIGH_SCALE_H_M))
            + atm.beta_m0 * AEROSOL_SCALE_H_M * (1.0 - np.exp(-h / AEROSOL_SCALE_H_M)))


def _altitude_grid(n: int = 400, h_min: float = 5.0, h_max: float = 40_000.0):
    return np.geomspace(h_min, h_max, n)


def zenith_luminance_per_lm(distance_m, atm: Atmosphere, term: str):
    """Zenith luminance (cd m^-2) at the observer per lumen of upward flux of the given term.

    distance_m: scalar or 1-D array of horizontal source distances (m, > 0).
    term: 'direct' (theta^4 uplight) or 'reflected' (Lambertian).
    """
    d = np.atleast_1d(np.asarray(distance_m, dtype=float))[:, None]
    h = _altitude_grid()[None, :]
    # Earth curvature: the source sits D^2/2R below the observer's tangent plane.
    h_eff = h + d**2 / (2.0 * EARTH_RADIUS_M)
    r = np.sqrt(d**2 + h_eff**2)
    cos_theta = h_eff / r
    theta = np.arccos(np.clip(cos_theta, -1.0, 1.0))
    if term == "direct":
        intensity = 0.554 * theta**4 / (2.0 * np.pi)
    elif term == "reflected":
        intensity = cos_theta / np.pi
    else:
        raise ValueError(term)
    # Slant-path extinction from source to scattering point: vertical depth x air-mass r/h_eff.
    tau_sp = _vertical_tau(h, atm) * (r / h_eff)
    illum = intensity * np.exp(-tau_sp) / r**2                     # lux per lm
    cos_psi = -cos_theta                                          # propagation-direction angle to downward view
    scatter = (atm.beta_r0 * np.exp(-h / RAYLEIGH_SCALE_H_M) * rayleigh_phase(cos_psi)
               + atm.beta_m0 * np.exp(-h / AEROSOL_SCALE_H_M) * hg_phase(cos_psi, atm.hg_g))
    integrand = illum * scatter * np.exp(-_vertical_tau(h, atm))  # cd m^-3 per lm
    out = np.trapezoid(integrand, h, axis=1)
    return out if np.ndim(distance_m) else float(out[0])


# ---------------------------------------------------------------------------
# Fitted distance-decay kernel (the "Garstang-lite" kernel used for basis layers).
# log K(D) = c0 + c1 ln D + c2 (ln D)^2 + c3 (ln D)^3 + c4 D,  D in km, K in cd m^-2 per lm.


@dataclass(frozen=True)
class KernelFit:
    term: str
    coeffs: tuple[float, float, float, float, float]
    d_min_km: float
    d_max_km: float
    max_rel_error: float

    def __call__(self, d_km):
        d = np.clip(np.asarray(d_km, dtype=float), self.d_min_km, None)
        c0, c1, c2, c3, c4 = self.coeffs
        ld = np.log(d)
        k = np.exp(c0 + c1 * ld + c2 * ld**2 + c3 * ld**3 + c4 * d)
        return np.where(np.asarray(d_km) > self.d_max_km, 0.0, k)


def fit_kernel(term: str, atmospheres: list[Atmosphere], d_min_km: float = 0.05, d_max_km: float = 100.0,
               n: int = 120) -> KernelFit:
    """Fit the analytic kernel to the season-averaged numeric Garstang curve."""
    d_km = np.geomspace(d_min_km, d_max_km, n)
    b = np.mean([zenith_luminance_per_lm(d_km * 1000.0, atm, term) for atm in atmospheres], axis=0)
    ld = np.log(d_km)
    a = np.column_stack([np.ones_like(ld), ld, ld**2, ld**3, d_km])
    coeffs, *_ = np.linalg.lstsq(a, np.log(b), rcond=None)
    fit = KernelFit(term, tuple(float(c) for c in coeffs), d_min_km, d_max_km, 0.0)
    rel = np.abs(fit(d_km) / b - 1.0)
    return KernelFit(term, fit.coeffs, d_min_km, d_max_km, float(rel.max()))


def kernel_image(fit: KernelFit, dx_km: float, dy_km: float, sub: int = 4):
    """Kernel on a grid (cells of dx_km x dy_km) out to fit.d_max_km, cell-averaged with sub x sub samples.

    Returns a (2*ny+1, 2*nx+1) array: luminance at a cell center per lumen spread uniformly over a source cell.
    """
    nx = int(np.ceil(fit.d_max_km / dx_km))
    ny = int(np.ceil(fit.d_max_km / dy_km))
    offs = (np.arange(sub) + 0.5) / sub - 0.5
    ix = np.arange(-nx, nx + 1)[None, :, None, None]
    iy = np.arange(-ny, ny + 1)[:, None, None, None]
    sx = offs[None, None, None, :]
    sy = offs[None, None, :, None]
    d = np.hypot((ix + sx) * dx_km, (iy + sy) * dy_km)
    return fit(d).mean(axis=(2, 3))
