"""Shared connector plumbing: cached HTTP, ArcGIS REST paging, raw-data cache directory."""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data_raw"
USER_AGENT = "dark-sky-simulator/2.0 (+https://jayrosen.design/dark-sky)"


def cache_path(name: str) -> Path:
    RAW.mkdir(exist_ok=True)
    return RAW / name


def http(method: str, url: str, *, params=None, data=None, json_body=None, timeout=120, retries=5, binary=False):
    last = None
    for attempt in range(retries):
        try:
            r = requests.request(method, url, params=params, data=data, json=json_body, timeout=timeout,
                                 headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            return r.content if binary else r.json()
        except (requests.RequestException, ValueError) as e:  # ValueError: bad JSON
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{method} {url} failed after {retries} attempts: {last}")


def cached_json(name: str, fetch, refresh: bool = False):
    """Return JSON from data_raw/<name>, calling fetch() and caching on miss."""
    p = cache_path(name)
    if p.exists() and not refresh:
        return json.loads(p.read_text(encoding="utf-8"))
    obj = fetch()
    p.write_text(json.dumps(obj), encoding="utf-8")
    return obj


def arcgis_query(layer_url: str, *, where="1=1", out_fields="*", bbox=None, geometry=True,
                 max_offset=None, page_size=2000, out_sr=4326):
    """All features of an ArcGIS REST layer as a GeoJSON FeatureCollection (pages with resultOffset)."""
    feats, offset = [], 0
    while True:
        params = {"where": where, "outFields": out_fields, "f": "geojson", "outSR": out_sr,
                  "returnGeometry": "true" if geometry else "false",
                  "resultOffset": offset, "resultRecordCount": page_size}
        if bbox:
            params.update({"geometry": ",".join(map(str, bbox)), "geometryType": "esriGeometryEnvelope",
                           "inSR": 4326, "spatialRel": "esriSpatialRelIntersects"})
        if max_offset:
            params["maxAllowableOffset"] = max_offset
        page = http("POST", layer_url.rstrip("/") + "/query", data=params)
        if "error" in page:
            raise RuntimeError(f"{layer_url}: {page['error']}")
        batch = page.get("features", [])
        feats.extend(batch)
        exceeded = page.get("exceededTransferLimit") or page.get("properties", {}).get("exceededTransferLimit")
        if not batch or (len(batch) < page_size and not exceeded):
            break
        offset += len(batch)
    return {"type": "FeatureCollection", "features": feats}


def bbox_tag(bbox) -> str:
    """Short cache-name suffix for bbox-dependent pulls."""
    return "_".join(f"{v:.3f}" for v in bbox).replace("-", "m")


def sha256_of(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:16]
