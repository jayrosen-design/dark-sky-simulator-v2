"""Approximate drive time (minutes) from one origin to every cell of a grid (docs/adr/0014).

A cost-distance over the grid's 8-neighbor graph: a cell crossed by a TIGER primary road is driven at the primary
speed, one with a secondary road at the secondary speed, and any other land cell at the local-road speed (local roads
are not loaded on the region grid). Water cells can't be crossed. An approximation for ranking sites, not routing.
"""
from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

from . import rasterize as R


def drive_minutes(grid, roads, blocked, origin_lonlat, speeds_kmh):
    primary = R.line_length_km(grid, [f for f in roads if f["properties"].get("road_class") == "primary"]) > 0
    secondary = R.line_length_km(grid, [f for f in roads if f["properties"].get("road_class") == "secondary"]) > 0
    speed = np.full((grid.ny, grid.nx), float(speeds_kmh["local"]))
    speed[secondary] = speeds_kmh["secondary"]
    speed[primary] = speeds_kmh["primary"]
    ok = ~blocked
    idx = np.arange(grid.ny * grid.nx).reshape(grid.ny, grid.nx)
    rows, cols, cost = [], [], []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a = idx[max(0, -dy):grid.ny - max(0, dy), max(0, -dx):grid.nx - max(0, dx)]
        b = idx[max(0, dy):, max(0, dx):][:a.shape[0], :a.shape[1]] if dx >= 0 else idx[dy:, :dx][:a.shape[0], :a.shape[1]]
        ra, ca = np.divmod(a.ravel(), grid.nx)
        rb, cb = np.divmod(b.ravel(), grid.nx)
        keep = ok[ra, ca] & ok[rb, cb]
        km = np.hypot(dx * grid.dx_km, dy * grid.dy_km)
        v = 0.5 * (speed[ra, ca] + speed[rb, cb])
        rows.append(a.ravel()[keep]); cols.append(b.ravel()[keep]); cost.append((km / v * 60)[keep])
    n = grid.ny * grid.nx
    g = coo_matrix((np.concatenate(cost), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
    r0, c0 = grid.index(np.array([origin_lonlat[0]]), np.array([origin_lonlat[1]]))
    d = dijkstra(g, directed=False, indices=int(r0[0] * grid.nx + c0[0]))
    return d.reshape(grid.ny, grid.nx)
