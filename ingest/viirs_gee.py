"""NASA Black Marble VNP46A2 annual medians via Google Earth Engine (PRD 2.2, 0A.2).

Needs a one-time `earthengine authenticate` and a Cloud project registered for Earth Engine
(free research tier). Pixels are pulled straight onto the pipeline grid with ee.data.computePixels,
so no Drive/GCS export step is needed at this size.

Recipe (2.2): daily DNB_BRDF_Corrected_NTL, keep Mandatory_Quality_Flag == 0 (high quality: cloud-free,
no lunar/stray-light issues flagged), annual per-pixel median, nW cm^-2 sr^-1. VNP46A2 in Earth Engine
starts 2012-01-19, so no EOG fill is needed for 2012-2013.

Status: written against the Earth Engine Python API; not yet run (no credentials on the build machine).
"""
from __future__ import annotations

import numpy as np

from .common import cache_path

COLLECTION = "NASA/VIIRS/002/VNP46A2"
BAND = "DNB_BRDF_Corrected_NTL"
SCALE = 0.1  # catalog scale factor for DNB_BRDF_Corrected_NTL


def _init(project: str | None):
    import ee  # optional dependency: pip install -e ".[viirs]"
    ee.Initialize(project=project)
    return ee


def annual_medians(grid, years=range(2012, 2025), project: str | None = None, refresh=False):
    """Return {year: (radiance[ny, nx], n_clear[ny, nx])} on `grid` (engine.grid.Grid)."""
    out = {}
    ee = None
    for year in years:
        p = cache_path(f"viirs_{grid.nx}x{grid.ny}_{year}.npz")
        if p.exists() and not refresh:
            z = np.load(p)
            out[year] = (z["radiance"], z["n_clear"])
            continue
        ee = ee or _init(project)
        col = (ee.ImageCollection(COLLECTION).filterDate(f"{year}-01-01", f"{year + 1}-01-01")
               .map(lambda img: img.select(BAND).multiply(SCALE)
                    .updateMask(img.select("Mandatory_Quality_Flag").eq(0))))
        img = col.median().rename("radiance").addBands(col.count().rename("n_clear")).unmask(0)
        arr = ee.data.computePixels({
            "expression": img,
            "fileFormat": "NUMPY_NDARRAY",
            "grid": {"dimensions": {"width": grid.nx, "height": grid.ny},
                     "affineTransform": {"scaleX": grid.res, "shearX": 0, "translateX": grid.west,
                                         "shearY": 0, "scaleY": -grid.res, "translateY": grid.north},
                     "crsCode": "EPSG:4326"},
        })
        rad = np.asarray(arr["radiance"], dtype=np.float32)
        n = np.asarray(arr["n_clear"], dtype=np.int16)
        np.savez_compressed(p, radiance=rad, n_clear=n)
        out[year] = (rad, n)
    return out


def available(grid, years=range(2012, 2025)) -> bool:
    """True when every year is already cached locally (the pipeline never blocks on Earth Engine)."""
    return all(cache_path(f"viirs_{grid.nx}x{grid.ny}_{y}.npz").exists() for y in years)
