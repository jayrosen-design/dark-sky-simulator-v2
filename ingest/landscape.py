"""Terrain and land-protection connectors (PRD 7.3): USGS 3DEP elevation, FNAI conservation lands."""
from __future__ import annotations

import io

import numpy as np
import tifffile

from .common import arcgis_query, cache_path, cached_json, http

DEP3 = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
FNAI = ("https://services.arcgis.com/9Jk4Zl9KofTtvg3x/ArcGIS/rest/services/"
        "FL_Conservation_Lands_web/FeatureServer/9")


def dem_3dep(bounds, nx: int, ny: int, refresh=False) -> np.ndarray:
    """Elevation (m) on a lat/lon grid; NaN where 3DEP has no data (open water/Gulf)."""
    p = cache_path(f"dem_3dep_{nx}x{ny}.npy")
    if p.exists() and not refresh:
        return np.load(p)
    west, south, east, north = bounds
    raw = http("GET", DEP3, binary=True, timeout=300, params={
        "bbox": f"{west},{south},{east},{north}", "bboxSR": 4326, "imageSR": 4326,
        "size": f"{nx},{ny}", "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation",
        "f": "image"})
    arr = tifffile.imread(io.BytesIO(raw)).astype(np.float32)
    arr[(arr < -100) | (arr > 10000)] = np.nan
    np.save(p, arr)
    return arr


def conservation_lands(bbox, refresh=False):
    return cached_json("fnai_conservation_lands.json",
                       lambda: arcgis_query(FNAI, bbox=bbox, out_fields="MANAME,MATYPE,OWNER,MANAGING_A,TOTACRES",
                                            max_offset=0.001), refresh)
