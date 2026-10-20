"""Calibrated radiance change, 2013 -> 2024, for the areas in the screenshot reconstruction (ADR 0013).

NOAA EOG annual composites (`average_masked`; version 2.1 for 2013, 2.2 for 2024), summed at their native ~460 m in
Earth Engine, and NASA Black Marble VNP46A2 annual medians from the pipeline's cache (30-arcsec region grid, airglow
background removed as in VIIRS mode). Earth Engine's EOG collection starts in 2013, so 2013 stands in for 2012.

Needs the VIIRS cache (`python -m pipeline.ingest_all --viirs --ee-project <project>`) and Earth Engine access.
Run from the repository root:  python -m analysis.epac_reconstruction.radiance_comparison --ee-project <project>
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from engine.grid import Grid
from ingest import viirs_gee
from pipeline import rasterize as R
from pipeline import viirs_mode
from pipeline.config import load_region

HERE = Path(__file__).parent
# The first reconstruction's crop, (150, 50)-(1430, 840) on the slide images, georeferenced (south, north, west, east).
WHOLE_MAP = (29.080, 30.258, -83.752, -81.567)
APP_2025_PAYNES_PRAIRIE = (29.55, 29.62, -82.35, -82.25)


def bounds_of(geometry: dict):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    pts = np.vstack([np.asarray(r) for poly in polys for r in poly])
    return pts[:, 1].min(), pts[:, 1].max(), pts[:, 0].min(), pts[:, 0].max()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ee-project", required=True)
    args = ap.parse_args()
    feats = {f["properties"]["id"]: f for f in json.loads((HERE / "boundaries.geojson").read_text())["features"]}

    g = load_region()["grids"]["region"]
    G = Grid.from_bounds(g["west"], g["east"], g["south"], g["north"], g["res_deg"])
    raw = {y: v[0] for y, v in viirs_gee.annual_medians(G, viirs_mode.YEARS).items()}
    bg = viirs_mode.background(raw)
    bm = {y: np.maximum(raw[y] - bg[y], 0.0) for y in (2013, 2024)}

    def box_mask(s, n, w, e):
        m = np.zeros((G.ny, G.nx), bool)
        m[int((G.north - n) / G.res):int(np.ceil((G.north - s) / G.res)), int((w - G.west) / G.res):int(np.ceil((e - G.west) / G.res))] = True
        return m

    import ee
    ee.Initialize(project=args.ee_project)

    def eog_sum(year: int, geom) -> float:
        cid = "NOAA/VIIRS/DNB/ANNUAL_V21" if year <= 2021 else "NOAA/VIIRS/DNB/ANNUAL_V22"
        img = ee.ImageCollection(cid).filterDate(f"{year}-01-01", f"{year + 1}-01-01").first().select("average_masked")
        return img.reduceRegion(ee.Reducer.sum(), geom, 463.83, maxPixels=1e9).getInfo()["average_masked"]

    rect = lambda s, n, w, e: ee.Geometry.Rectangle([w, s, e, n])
    areas = {
        "Alachua County (boundary)": (ee.Geometry(feats["alachua_county"]["geometry"]),
                                      R.polygon_mask(G, [feats["alachua_county"]["geometry"]])),
        "Whole map view (212 x 131 km)": (rect(*WHOLE_MAP), box_mask(*WHOLE_MAP)),
        "Alachua County, bounding box": (rect(*bounds_of(feats["alachua_county"]["geometry"])), box_mask(*bounds_of(feats["alachua_county"]["geometry"]))),
        "Gainesville, bounding box": (rect(*bounds_of(feats["gainesville"]["geometry"])), box_mask(*bounds_of(feats["gainesville"]["geometry"]))),
        "City of Alachua, bounding box": (rect(*bounds_of(feats["alachua_city"]["geometry"])), box_mask(*bounds_of(feats["alachua_city"]["geometry"]))),
        "Paynes Prairie Preserve, bounding box": (rect(*bounds_of(feats["paynes_prairie_park"]["geometry"])), box_mask(*bounds_of(feats["paynes_prairie_park"]["geometry"]))),
        "Paynes Prairie, 2025 app rectangle": (rect(*APP_2025_PAYNES_PRAIRIE), box_mask(*APP_2025_PAYNES_PRAIRIE)),
    }
    rows = []
    print(f"{'Area':<40} {'NOAA EOG':>9} {'Black Marble':>13}   (2013 -> 2024)")
    for name, (geom, m) in areas.items():
        eog = (eog_sum(2024, geom) / eog_sum(2013, geom) - 1) * 100
        nasa = (bm[2024][m].sum() / bm[2013][m].sum() - 1) * 100
        rows.append({"area": name, "eog_2013_2024_pct": round(eog, 1), "black_marble_2013_2024_pct": round(nasa, 1)})
        print(f"{name:<40} {eog:>+8.1f}% {nasa:>+12.1f}%")
    out = HERE / "region_results" / "radiance_comparison.csv"
    with out.open("w", encoding="utf-8") as f:
        f.write("area,eog_2013_2024_pct,black_marble_2013_2024_pct\n")
        f.writelines(f"\"{r['area']}\",{r['eog_2013_2024_pct']},{r['black_marble_2013_2024_pct']}\n" for r in rows)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
