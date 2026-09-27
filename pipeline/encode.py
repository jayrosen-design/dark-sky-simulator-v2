"""Compact binary layer files for the static site.

log16: uint16 codes of log10(value); 0 encodes 0. Per-file lo/hi go in the JSON index.
lin16: uint16 linear codes between per-layer lo/hi; 65535 encodes NaN.
Layers are row-major (row 0 = north), little-endian, concatenated. Each row is stored as successive differences
(mod 65536) and the whole file is gzip-compressed: skyglow fields are smooth, so this shrinks them several-fold.
The file keeps a .bin name (not .gz) so static hosts do not add their own Content-Encoding.
"""
from __future__ import annotations

import gzip
from pathlib import Path

import numpy as np

ENCODING = {"compression": "gzip", "delta": "row"}


def _pack(codes: np.ndarray) -> bytes:
    """codes: uint16 array (..., ny, nx) -> gzip(row deltas)."""
    c = codes.astype(np.uint16)
    d = c.copy()
    d[..., 1:] = c[..., 1:] - c[..., :-1]   # uint16 arithmetic wraps mod 65536
    return gzip.compress(d.astype("<u2").tobytes(), compresslevel=9, mtime=0)


def read_codes(path: Path, shape) -> np.ndarray:
    """Inverse of _pack for tests and tools: returns uint16 codes reshaped to (-1, ny, nx)."""
    d = np.frombuffer(gzip.decompress(Path(path).read_bytes()), "<u2").reshape(-1, *shape)
    return np.cumsum(d, axis=-1, dtype=np.uint16)


def write_log16(path: Path, layers: list[np.ndarray]) -> dict:
    stack = np.stack([np.asarray(a, dtype=np.float64) for a in layers])
    pos = stack[stack > 0]
    lo, hi = (float(np.log10(pos.min())), float(np.log10(pos.max()))) if pos.size else (0.0, 1.0)
    hi = max(hi, lo + 1e-6)
    codes = np.zeros(stack.shape, dtype=np.uint16)
    m = stack > 0
    codes[m] = 1 + np.round((np.log10(stack[m]) - lo) / (hi - lo) * 65534).astype(np.uint16)
    path.write_bytes(_pack(codes))
    return {"file": path.name, "encoding": "log16", **ENCODING, "lo": lo, "hi": hi, "count": len(layers),
            "shape": list(stack.shape[1:])}


def decode_log16(codes: np.ndarray, lo: float, hi: float) -> np.ndarray:
    out = np.zeros(codes.shape)
    m = codes > 0
    out[m] = 10 ** (lo + (codes[m].astype(float) - 1) / 65534 * (hi - lo))
    return out


def write_lin16(path: Path, layers: list[np.ndarray]) -> dict:
    meta, stack = [], []
    for a in layers:
        a = np.asarray(a, dtype=np.float64)
        fin = np.isfinite(a)
        lo, hi = (float(a[fin].min()), float(a[fin].max())) if fin.any() else (0.0, 1.0)
        hi = max(hi, lo + 1e-9)
        c = np.full(a.shape, 65535, dtype=np.uint16)
        c[fin] = np.round((a[fin] - lo) / (hi - lo) * 65534).astype(np.uint16)
        stack.append(c)
        meta.append({"lo": lo, "hi": hi})
    path.write_bytes(_pack(np.stack(stack)))
    return {"file": path.name, "encoding": "lin16", **ENCODING, "layers": meta, "shape": list(np.shape(layers[0]))}
