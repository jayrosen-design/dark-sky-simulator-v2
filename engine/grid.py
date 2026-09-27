"""Regular lat/lon grids (EPSG:4326) and the raster helpers the pipeline needs. Pure functions."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage, signal

KM_PER_DEG_LAT = 111.32


@dataclass(frozen=True)
class Grid:
    west: float
    south: float
    res: float      # degrees
    nx: int
    ny: int

    @classmethod
    def from_bounds(cls, west, east, south, north, res):
        return cls(west, south, res, int(round((east - west) / res)), int(round((north - south) / res)))

    @property
    def east(self):
        return self.west + self.nx * self.res

    @property
    def north(self):
        return self.south + self.ny * self.res

    @property
    def lat0(self):
        return 0.5 * (self.south + self.north)

    @property
    def dx_km(self):
        return self.res * KM_PER_DEG_LAT * np.cos(np.radians(self.lat0))

    @property
    def dy_km(self):
        return self.res * KM_PER_DEG_LAT

    @property
    def cell_area_km2(self):
        return self.dx_km * self.dy_km

    def lons(self):
        return self.west + (np.arange(self.nx) + 0.5) * self.res

    def lats(self):
        # Row 0 is the northern edge (image order).
        return self.north - (np.arange(self.ny) + 0.5) * self.res

    def mesh(self):
        return np.meshgrid(self.lons(), self.lats())

    def index(self, lon, lat):
        """(row, col) of points; -1 where outside."""
        col = np.floor((np.asarray(lon) - self.west) / self.res).astype(int)
        row = np.floor((self.north - np.asarray(lat)) / self.res).astype(int)
        bad = (col < 0) | (col >= self.nx) | (row < 0) | (row >= self.ny)
        return np.where(bad, -1, row), np.where(bad, -1, col)

    def bounds(self):
        return [self.west, self.south, self.east, self.north]

    def to_dict(self):
        return {"west": self.west, "south": self.south, "east": self.east, "north": self.north,
                "res_deg": self.res, "nx": self.nx, "ny": self.ny, "dx_km": self.dx_km, "dy_km": self.dy_km}


def accumulate_points(grid: Grid, lon, lat, weight=None):
    """Sum point weights into grid cells."""
    r, c = grid.index(lon, lat)
    ok = r >= 0
    w = np.ones(len(r)) if weight is None else np.asarray(weight, dtype=float)
    out = np.zeros((grid.ny, grid.nx))
    np.add.at(out, (r[ok], c[ok]), w[ok])
    return out


def distance_km_to(grid: Grid, lon, lat):
    """Distance (km) from every cell center to a point (local equirectangular)."""
    lons, lats = grid.mesh()
    dx = (lons - lon) * KM_PER_DEG_LAT * np.cos(np.radians(lat))
    dy = (lats - lat) * KM_PER_DEG_LAT
    return np.hypot(dx, dy)


def distance_transform_km(grid: Grid, mask: np.ndarray):
    """Distance (km) from each cell to the nearest True cell of mask."""
    if not mask.any():
        return np.full(mask.shape, np.inf)
    return ndimage.distance_transform_edt(~mask, sampling=(grid.dy_km, grid.dx_km))


def convolve(field: np.ndarray, kernel: np.ndarray):
    """Same-size linear convolution (FFT)."""
    return signal.fftconvolve(field, kernel, mode="same")


def resample_block_mean(field: np.ndarray, factor: int):
    ny, nx = field.shape
    return field[: ny - ny % factor, : nx - nx % factor].reshape(ny // factor, factor, nx // factor, factor).mean(axis=(1, 3))


def sample_bilinear(grid: Grid, field: np.ndarray, lon, lat):
    """Bilinear sample of a cell-centered field at points."""
    fx = (np.asarray(lon) - grid.west) / grid.res - 0.5
    fy = (grid.north - np.asarray(lat)) / grid.res - 0.5
    return ndimage.map_coordinates(field, [np.atleast_1d(fy), np.atleast_1d(fx)], order=1, mode="nearest")
