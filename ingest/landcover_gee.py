"""Open water and wetland share per grid cell from USGS NLCD 2021 land cover, via Google Earth Engine.

Used to keep observatory candidates off open water, marsh and swamp (docs/adr/0014). NLCD classes: 11 open water,
90 woody wetlands, 95 emergent herbaceous wetlands. The 30 m classes are averaged onto the pipeline grid with
reduceResolution, so each cell holds the fraction of its area in each group (0-1); area outside NLCD coverage
(the open Gulf) counts as water.

Status: first run 2026-10-20 (project dark-sky-simulator, noncommercial Community tier).
"""
from __future__ import annotations

import numpy as np

from .common import cache_path

ASSET = "USGS/NLCD_RELEASES/2021_REL/NLCD/2021"


def _cache(grid):
    return cache_path(f"nlcd2021_{grid.nx}x{grid.ny}.npz")


def available(grid) -> bool:
    return _cache(grid).exists()


def fractions(grid, project: str | None = None, refresh=False):
    """Return {"water": frac[ny, nx], "wetland": frac[ny, nx]} on `grid` (engine.grid.Grid)."""
    p = _cache(grid)
    if p.exists() and not refresh:
        z = np.load(p)
        return {"water": z["water"], "wetland": z["wetland"]}
    import ee  # optional dependency: pip install -e ".[viirs]"
    ee.Initialize(project=project)
    lc = ee.Image(ASSET).select("landcover")
    # NLCD has no data over the open Gulf, so the share of a cell outside its coverage counts as water.
    covered = lc.mask().rename("covered")
    img = (lc.eq(11).unmask(0).rename("water").addBands(lc.eq(90).Or(lc.eq(95)).unmask(0).rename("wetland")).addBands(covered)
           .toFloat().reduceResolution(ee.Reducer.mean(), maxPixels=4096).unmask(0))
    # Earth Engine caps the 30 m reprojection behind one request, so the grid is pulled in tiles.
    out = {k: np.zeros((grid.ny, grid.nx), np.float32) for k in ("water", "wetland", "covered")}
    T = 64
    for r0 in range(0, grid.ny, T):
        for c0 in range(0, grid.nx, T):
            h, w = min(T, grid.ny - r0), min(T, grid.nx - c0)
            arr = ee.data.computePixels({
                "expression": img,
                "fileFormat": "NUMPY_NDARRAY",
                "grid": {"dimensions": {"width": w, "height": h},
                         "affineTransform": {"scaleX": grid.res, "shearX": 0, "translateX": grid.west + c0 * grid.res,
                                             "shearY": 0, "scaleY": -grid.res, "translateY": grid.north - r0 * grid.res},
                         "crsCode": "EPSG:4326"},
            })
            for k in out:
                out[k][r0:r0 + h, c0:c0 + w] = np.asarray(arr[k], dtype=np.float32)
    out["water"] = out["water"] + (1.0 - out.pop("covered"))
    np.savez_compressed(p, **out)
    return out
