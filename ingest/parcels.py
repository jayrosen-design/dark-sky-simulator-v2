"""Florida Department of Revenue 2025 cadastral roll (PRD 7.3 "FL DOR NAL/NAP"), via the Florida Geographic
Information Office's statewide parcel-centroid service. Used by Module B for land value, parcel size, ownership
(public vs private) and historical sale prices around candidate observatory sites.

Only parcels of >= 5 acres are kept: an observatory needs tens of acres, and small-lot $/acre does not price
large rural tracts. The service rejects server-side filters on LND_SQFOOT (unindexed), so each county is paged
by OBJECTID and filtered locally.
"""
from __future__ import annotations

import time

from .common import cached_json, http

SERVICE = ("https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/"
           "Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0")
FIELDS = ("OBJECTID,DOR_UC,JV,LND_VAL,LND_SQFOOT,SALE_PRC1,SALE_YR1,QUAL_CD1,VI_CD1,"
          "SALE_PRC2,SALE_YR2,QUAL_CD2,VI_CD2,OWN_NAME,PUBLIC_LND,PARCEL_ID,ASMNT_YR")
MIN_SQFT = 217_800  # 5 acres
COLUMNS = ["lon", "lat", "dor_uc", "jv", "lnd_val", "lnd_sqft", "sale_prc1", "sale_yr1", "qual1", "vi1",
           "sale_prc2", "sale_yr2", "qual2", "vi2", "owner", "public_lnd", "parcel_id", "asmnt_yr"]


def _page(dor_county_no: int, after_oid: int, n: int, max_oid: int):
    params = {"where": f"CO_NO={dor_county_no} AND OBJECTID>{after_oid} AND OBJECTID<={max_oid}", "outFields": FIELDS,
              "orderByFields": "OBJECTID", "resultRecordCount": n, "outSR": 4326, "f": "json"}
    for attempt in range(6):
        page = http("GET", SERVICE + "/query", params=params, timeout=180)
        if "error" not in page:
            return page.get("features", [])
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"parcel query failed for county {dor_county_no} after OBJECTID {after_oid}: {page['error']}")


def _oid_range(dor_county_no: int) -> tuple[int, int]:
    stats = '[{"statisticType":"min","onStatisticField":"OBJECTID","outStatisticFieldName":"lo"},' \
            '{"statisticType":"max","onStatisticField":"OBJECTID","outStatisticFieldName":"hi"}]'
    for attempt in range(6):
        res = http("GET", SERVICE + "/query", params={"where": f"CO_NO={dor_county_no}", "outStatistics": stats,
                                                      "f": "json"}, timeout=180)
        if "error" not in res:
            a = res["features"][0]["attributes"]
            return int(a["lo"]), int(a["hi"])
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"OBJECTID range query failed for county {dor_county_no}")


def _chunk(dor_county_no: int, lo: int, hi: int):
    """Pages of OBJECTID in (lo, hi], compacted and filtered to >= 5 acres."""
    rows, after, total = [], lo, 0
    while after < hi:
        feats = _page(dor_county_no, after, 2000, hi)
        if not feats:
            break
        total += len(feats)
        for f in feats:
            a, g = f["attributes"], f.get("geometry")
            after = max(after, a["OBJECTID"])
            if not g or (a["LND_SQFOOT"] or 0) < MIN_SQFT:
                continue
            s = lambda k: (a[k] or "").strip()
            rows.append([round(g["x"], 5), round(g["y"], 5), s("DOR_UC"), a["JV"] or 0, a["LND_VAL"] or 0,
                         a["LND_SQFOOT"], a["SALE_PRC1"] or 0, a["SALE_YR1"] or 0, s("QUAL_CD1"), s("VI_CD1"),
                         a["SALE_PRC2"] or 0, a["SALE_YR2"] or 0, s("QUAL_CD2"), s("VI_CD2"), s("OWN_NAME"),
                         s("PUBLIC_LND"), s("PARCEL_ID"), a["ASMNT_YR"]])
    return rows, total


def county_parcels(dor_county_no: int, refresh=False, workers: int = 8):
    """Compact rows (see COLUMNS) for one county's parcels of >= 5 acres (DOR county number, e.g. 48 = Levy).
    The OBJECTID range is split into `workers` chunks fetched in parallel (each page takes ~20 s server-side)."""
    def fetch():
        from concurrent.futures import ThreadPoolExecutor
        lo, hi = _oid_range(dor_county_no)
        edges = [lo - 1 + round(i * (hi - lo + 1) / workers) for i in range(workers + 1)]
        with ThreadPoolExecutor(workers) as ex:
            parts = list(ex.map(lambda i: _chunk(dor_county_no, edges[i], edges[i + 1]), range(workers)))
        rows = [r for part, _ in parts for r in part]
        return {"columns": COLUMNS, "dor_county_no": dor_county_no, "min_sqft": MIN_SQFT,
                "parcels_scanned": sum(n for _, n in parts), "rows": rows}
    return cached_json(f"parcels_co{dor_county_no}.json", fetch, refresh)
