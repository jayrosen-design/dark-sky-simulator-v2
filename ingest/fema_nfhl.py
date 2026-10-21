"""Share of each region-grid cell inside FEMA's 1%-annual-chance (100-year) floodplain, from the National Flood Hazard
Layer (NFHL) map service. Used to keep observatory candidates off mapped floodplain, including the swamp and
depression flooding a river model misses (docs/adr/0014).

The NFHL "Flood Hazard Zones" layer only draws at map scales finer than 1:36,111, so each 0.25-degree tile is rendered
at 4 pixels per 30-arcsecond cell with a low dpi (about 1:25,000). Only Special Flood Hazard Area polygons are drawn
(SFHA_TF = 'T': zones A, AE, AH, AO, VE), so any opaque pixel is floodplain. FEMA's server takes one to four minutes
per tile, so tiles are fetched one at a time, cached one by one, and only where a `need` mask has cells.

    python -m ingest.fema_nfhl     # fetch the tiles covering the Module B region's land cells

Status: first run 2026-10-20.
"""
from __future__ import annotations

import json
import struct
import sys
import zlib

import numpy as np

from .common import cache_path, http

EXPORT = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export"
LAYER = 28
TILE = 30          # cells per tile side (0.25 degree on the 30-arcsecond grid)
PX = 4             # pixels per cell side
SCALE = 25000      # target map scale, under the layer's 1:36,111 limit


def _dir(grid):
    d = cache_path(f"fema_sfha_{grid.nx}x{grid.ny}")
    d.mkdir(exist_ok=True)
    return d


def _png_alpha(raw: bytes) -> np.ndarray:
    """Alpha channel of an 8-bit RGBA PNG (what ArcGIS returns for png32), without an imaging library."""
    pos, idat, w, h = 8, b"", 0, 0
    while pos < len(raw):
        n, kind = struct.unpack(">I4s", raw[pos:pos + 8])
        body = raw[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8 and ctype == 6 and interlace == 0, (depth, ctype, interlace)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    rows = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(h, 1 + 4 * w)
    out = np.zeros((h, 4 * w), np.int32)
    prev = np.zeros(4 * w, np.int32)
    for y in range(h):
        f, line = rows[y, 0], rows[y, 1:].astype(np.int32)
        if f == 0:
            cur = line
        elif f == 2:
            cur = (line + prev) & 255
        else:  # Sub, Average, Paeth depend on the pixel to the left
            cur = np.zeros_like(line)
            for x in range(4 * w):
                a = cur[x - 4] if x >= 4 else 0
                b, c = prev[x], (prev[x - 4] if x >= 4 else 0)
                if f == 1:
                    pr = a
                elif f == 3:
                    pr = (a + b) >> 1
                else:
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                cur[x] = (line[x] + pr) & 255
        out[y], prev = cur, cur
    return out.reshape(h, w, 4)[..., 3]


def _tile(grid, r0, c0):
    """Floodplain share for the TILE x TILE cells whose top-left cell is (r0, c0)."""
    west, north = grid.west + c0 * grid.res, grid.north - r0 * grid.res
    east, south = west + TILE * grid.res, north - TILE * grid.res
    px = TILE * PX
    ground_m = (east - west) * 111320 * np.cos(np.radians((north + south) / 2))
    dpi = max(1, int(SCALE * px * 0.0254 / ground_m))
    r = http("GET", EXPORT, timeout=900, params={
        "bbox": f"{west},{south},{east},{north}", "bboxSR": 4326, "imageSR": 4326, "size": f"{px},{px}", "dpi": dpi,
        "format": "png32", "transparent": "true", "layers": f"show:{LAYER}",
        "layerDefs": json.dumps({str(LAYER): "SFHA_TF = 'T'"}), "f": "json"})
    assert r["scale"] < 36111, r["scale"]
    alpha = _png_alpha(http("GET", r["href"], binary=True, timeout=300))
    return (alpha > 0).reshape(TILE, PX, TILE, PX).mean(axis=(1, 3)).astype(np.float32)


def tiles_for(grid, need):
    return sorted({(r // TILE * TILE, c // TILE * TILE) for r, c in zip(*np.nonzero(need))})


def available(grid) -> bool:
    return any(_dir(grid).glob("t_*.npy"))


def sfha_fraction(grid, need=None, fetch=False, log=print):
    """Return floodplain share [ny, nx] (NaN where no tile is cached). With fetch, first download the missing tiles
    that contain cells of `need` (bool [ny, nx]), one request at a time."""
    d = _dir(grid)
    if fetch:
        todo = [t for t in tiles_for(grid, need) if not (d / f"t_{t[0]}_{t[1]}.npy").exists()]
        for k, (r0, c0) in enumerate(todo):
            np.save(d / f"t_{r0}_{c0}.npy", _tile(grid, r0, c0))
            log(f"FEMA NFHL tile {k + 1}/{len(todo)} at row {r0}, col {c0}")
    out = np.full((grid.ny + TILE, grid.nx + TILE), np.nan, np.float32)
    for p in d.glob("t_*.npy"):
        r0, c0 = map(int, p.stem.split("_")[1:])
        out[r0:r0 + TILE, c0:c0 + TILE] = np.load(p)
    return out[:grid.ny, :grid.nx]


if __name__ == "__main__":
    from pipeline.build import module_b_land_mask
    from pipeline.config import load_region
    from engine.grid import Grid
    g = load_region()["grids"]["region"]
    rg = Grid.from_bounds(g["west"], g["east"], g["south"], g["north"], g["res_deg"])
    need = np.load(sys.argv[1]) if len(sys.argv) > 1 else module_b_land_mask(rg)
    sfha_fraction(rg, need, fetch=True, log=lambda m: print(m, flush=True))
