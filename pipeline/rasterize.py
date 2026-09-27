"""Vector -> grid helpers (polygon masks, line length, block-group housing spread)."""
from __future__ import annotations

import numpy as np
import shapely
from shapely.geometry import shape

from engine.grid import KM_PER_DEG_LAT, Grid


def polygon_mask(grid: Grid, geoms) -> np.ndarray:
    """True where a cell center falls inside any of the (GeoJSON or shapely) polygons."""
    mask = np.zeros((grid.ny, grid.nx), dtype=bool)
    lons, lats = grid.lons(), grid.lats()
    for g in geoms:
        geom = shape(g) if isinstance(g, dict) else g
        if geom.is_empty:
            continue
        w, s, e, n = geom.bounds
        c0, c1 = np.searchsorted(lons, [w, e])
        r0, r1 = np.searchsorted(-lats, [-n, -s])
        if c1 <= c0 or r1 <= r0:
            continue
        xx, yy = np.meshgrid(lons[c0:c1], lats[r0:r1])
        shapely.prepare(geom)
        mask[r0:r1, c0:c1] |= shapely.contains_xy(geom, xx, yy)
    return mask


def label_raster(grid: Grid, features, key: str) -> tuple[np.ndarray, list]:
    """Integer label per cell (index into returned value list, -1 = none)."""
    out = np.full((grid.ny, grid.nx), -1, dtype=np.int32)
    values = []
    for f in features:
        m = polygon_mask(grid, [f["geometry"]])
        out[m & (out < 0)] = len(values)
        values.append(f["properties"][key])
    return out, values


def line_length_km(grid: Grid, features, step_km: float = 0.05) -> np.ndarray:
    """Road length (km) per cell by dense sampling along each LineString."""
    out = np.zeros((grid.ny, grid.nx))
    kx = KM_PER_DEG_LAT * np.cos(np.radians(grid.lat0))
    for f in features:
        geom = f.get("geometry")
        if not geom:
            continue
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for line in lines:
            pts = np.asarray(line, dtype=float)[:, :2]
            if len(pts) < 2:
                continue
            seg = np.diff(pts, axis=0)
            seg_km = np.hypot(seg[:, 0] * kx, seg[:, 1] * KM_PER_DEG_LAT)
            for (x0, y0), (dx, dy), L in zip(pts[:-1], seg, seg_km):
                n = max(1, int(np.ceil(L / step_km)))
                t = (np.arange(n) + 0.5) / n
                r, c = grid.index(x0 + t * dx, y0 + t * dy)
                ok = r >= 0
                np.add.at(out, (r[ok], c[ok]), L / n)
    return out


def spread_block_groups(grid: Grid, rows, value_key: str) -> np.ndarray:
    """Spread each block group's value uniformly over a disk of its land area at its internal point."""
    out = np.zeros((grid.ny, grid.nx))
    lons, lats = grid.lons(), grid.lats()
    kx = KM_PER_DEG_LAT * np.cos(np.radians(grid.lat0))
    for r in rows:
        v = r[value_key]
        if not v:
            continue
        rad_km = max(np.sqrt(r["aland_m2"] / 1e6 / np.pi), 0.5 * min(grid.dx_km, grid.dy_km))
        c0, c1 = np.searchsorted(lons, [r["lon"] - rad_km / kx, r["lon"] + rad_km / kx])
        r0, r1 = np.searchsorted(-lats, [-(r["lat"] + rad_km / KM_PER_DEG_LAT), -(r["lat"] - rad_km / KM_PER_DEG_LAT)])
        if c1 <= c0 or r1 <= r0:
            rr, cc = grid.index(r["lon"], r["lat"])
            if rr >= 0:
                out[rr, cc] += v
            continue
        xx, yy = np.meshgrid(lons[c0:c1], lats[r0:r1])
        d = np.hypot((xx - r["lon"]) * kx, (yy - r["lat"]) * KM_PER_DEG_LAT)
        m = d <= rad_km
        if not m.any():
            rr, cc = grid.index(r["lon"], r["lat"])
            if rr >= 0:
                out[rr, cc] += v
            continue
        out[r0:r1, c0:c1][m] += v / m.sum()
    return out
