# ADR 0005: Lighter Python stack for the v2.0 pipeline

Status: accepted (v2.0) · 2026-09-26

PRD 0A.3 lists earthengine-api, rasterio/rioxarray, GeoPandas, NumPy, LightGBM, Ultralytics and rio-pmtiles/
tippecanoe. v2.0 uses Python 3.12 with NumPy, SciPy, Shapely 2, tifffile, requests, PyYAML, plus optional
earthengine-api, LightGBM and scikit-learn.

Reasons: every grid is a regular EPSG:4326 lattice small enough for NumPy; ArcGIS REST and TIGERweb return GeoJSON
directly; 3DEP's exportImage returns a plain GeoTIFF on the requested grid; publishing is handled by ADR 0001. This
avoids GDAL wheels on Windows and keeps `pip install -e .` fast.

Distances use a local equirectangular approximation (under 0.5% error across the region), not UTM 17N or
EPSG:3086; v3.0's PostGIS pipeline should reproject as PRD 4.3 specifies.
