"""Projected flood depth per grid cell from the WRI Aqueduct Floods hazard maps (V2), via Google Earth Engine.

Used to keep observatory candidates out of land expected to flood within the facility's lifetime (docs/adr/0014).
Aqueduct is published on the same 30-arcsecond grid as the pipeline's region grid. Two layers, both the 100-year
event in 2080 under RCP8.5: the latest horizon and the high-emissions scenario, a conservative choice for a facility
meant to last decades (Rosemary Hill has operated since 1967) and past the 30-year window asked for:
- coastal: storm surge on top of projected sea-level rise and land subsidence (95th-percentile sea-level projection);
- riverine: inland river flooding, the mean of the five GCM runs.
Values are inundation depth in meters (0 = not flooded).

Status: first run 2026-10-20 (project dark-sky-simulator, noncommercial Community tier).
"""
from __future__ import annotations

import numpy as np

from .common import cache_path

COLLECTION = "WRI/Aqueduct_Flood_Hazard_Maps/V2"
YEAR = 2080
COASTAL = f"inuncoast_rcp8p5_wtsub_{YEAR}_rp0100_0"


def _cache(grid):
    return cache_path(f"aqueduct{YEAR}_{grid.nx}x{grid.ny}.npz")


def available(grid) -> bool:
    return _cache(grid).exists()


def depths(grid, project: str | None = None, refresh=False):
    """Return {"coastal": depth_m[ny, nx], "riverine": depth_m[ny, nx]} on `grid` (engine.grid.Grid)."""
    p = _cache(grid)
    if p.exists() and not refresh:
        z = np.load(p)
        return {"coastal": z["coastal"], "riverine": z["riverine"]}
    import ee  # optional dependency: pip install -e ".[viirs]"
    ee.Initialize(project=project)
    col = ee.ImageCollection(COLLECTION)
    coastal = col.filter(ee.Filter.eq("system:index", COASTAL)).first().rename("coastal")
    riverine = (col.filter(ee.Filter.eq("floodtype", "inunriver")).filter(ee.Filter.eq("climatescenario", "rcp8p5"))
                .filter(ee.Filter.eq("year", YEAR)).filter(ee.Filter.eq("returnperiod", 100)).mean().rename("riverine"))
    img = coastal.addBands(riverine).unmask(0).toFloat()
    arr = ee.data.computePixels({
        "expression": img,
        "fileFormat": "NUMPY_NDARRAY",
        "grid": {"dimensions": {"width": grid.nx, "height": grid.ny},
                 "affineTransform": {"scaleX": grid.res, "shearX": 0, "translateX": grid.west,
                                     "shearY": 0, "scaleY": -grid.res, "translateY": grid.north},
                 "crsCode": "EPSG:4326"},
    })
    out = {k: np.asarray(arr[k], dtype=np.float32) for k in ("coastal", "riverine")}
    np.savez_compressed(p, **out)
    return out
