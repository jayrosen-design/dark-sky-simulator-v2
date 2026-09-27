"""Land and facility pricing for Module B (observatory siting) from the Florida DOR 2025 cadastral roll.

Per 30" region cell (parcels assigned by centroid, parcels >= 5 acres only):
  parcel_acres, public_acres, public_cat   ownership mix (public = government DOR use codes 081-089, a PUBLIC_LND flag,
                                            or a public owner name)
  assessed_usd_acre                        private just value / private acres (DOR just value, 2025 roll; includes any
                                            buildings; the DOR land-value field is the classified agricultural-use value
                                            for greenbelt land, so it is not a market proxy)
  sale_usd_acre, sale_p25, sale_p75, sale_n market price from the nearest qualified vacant-land sales (DOR sale code 01,
                                            2021-2025), median and interquartile range
  largest_acres, largest_cat                the largest parcel in the cell (details in land_parcels.json)
  land_score                               area-weighted PRD 6.6 land class (public 1.0, agricultural/vacant 0.6,
                                            residential/commercial 0.1)
Private owner names are never exported; public owners are shown by agency name.
"""
from __future__ import annotations

import re

import numpy as np
from scipy.spatial import cKDTree

from engine.grid import KM_PER_DEG_LAT, Grid
from ingest.parcels import COLUMNS, county_parcels

SQFT_PER_ACRE = 43_560.0
# Owner categories (codes stored in rasters and JSON).
CATS = {1: "Private agricultural", 2: "Private vacant/other", 3: "Private residential/commercial", 4: "County",
        5: "Municipal", 6: "State", 7: "Federal", 8: "Water management district", 9: "University", 10: "Other public"}
PUBLIC = {4, 5, 6, 7, 8, 9, 10}
# Unambiguous agency names mark land public even when its DOR use code is agricultural (e.g. leased timberland).
_STRICT_NAMES = [
    (9, r"UNIVERSITY OF FLORIDA|UF BOARD OF TRUSTEES|BOARD OF REGENTS|FLORIDA STATE UNIVERSITY"),
    (8, r"\bW\s?M\s?D\b|WATER MANAGEMENT DIST|S R W M D|SRWMD|SJRWMD"),
    (7, r"UNITED STATES OF AMERICA|\bU S A\b|\bUSA\b|U S GOVT|NATIONAL FOREST|US FOREST SERVICE|DEPT OF THE INTERIOR"),
    (6, r"STATE OF FLORIDA|TRUSTEES OF THE INTERNAL|TIITF|INTERNAL IMPROVEMENT TRUST|FLORIDA DEPT|DEPT OF ENVIRONMENTAL|"
        r"FISH AND WILDLIFE CONSERVATION|DIVISION OF FORESTRY|FLORIDA FOREST SERVICE|DEPT OF TRANSPORTATION"),
]
# Generic names only set the agency type for parcels already public by DOR use code or public-land flag.
_GENERIC_NAMES = [(4, r"\bCOUNTY\b|BOARD OF COUNTY|BOCC|SCHOOL BOARD"), (5, r"\bCITY OF\b|\bTOWN OF\b")]
_DOR_PUBLIC = {"081": 7, "082": 10, "083": 4, "084": 9, "085": 10, "086": 4, "087": 6, "088": 7, "089": 5}


def owner_category(dor_uc: str, owner: str, public_flag: str) -> int:
    code = (dor_uc or "").zfill(3)
    up = (owner or "").upper()
    for cat, pat in _STRICT_NAMES:
        if re.search(pat, up):
            return cat
    if code in _DOR_PUBLIC or public_flag:
        for cat, pat in _GENERIC_NAMES:
            if re.search(pat, up):
                return cat
        return _DOR_PUBLIC.get(code, 10)
    n = int(code) if code.isdigit() else -1
    if 50 <= n <= 69:
        return 1
    if n in (0, 10, 40, 70, 99) or 90 <= n <= 99:
        return 2
    return 3


def load_rows(region):
    rows = []
    for fips, co in region["dor_county_no"].items():
        for r in county_parcels(co)["rows"]:
            rows.append((fips, *r))
    return rows


def qualified_sales(rows, seed_lp):
    """[(lon, lat, usd_per_acre, year, price/just value, fips)] for qualified vacant sales in the window."""
    code = seed_lp["qualified_sale_code"]["value"]
    y0, y1 = seed_lp["sale_years"]["value"]
    idx = {c: i + 1 for i, c in enumerate(COLUMNS)}
    out = []
    for r in rows:
        acres = r[idx["lnd_sqft"]] / SQFT_PER_ACRE
        for k in ("1", "2"):
            price, yr = r[idx["sale_prc" + k]], r[idx["sale_yr" + k]]
            if (r[idx["qual" + k]] == code and r[idx["vi" + k]] == "V" and y0 <= yr <= y1 and price >= 1000 and acres > 0):
                jv = r[idx["jv"]]
                out.append((r[idx["lon"]], r[idx["lat"]], price / acres, yr, price / jv if jv else np.nan, r[0]))
                break
    return out


def build(rg: Grid, region, seed_mcda, county_label: np.ndarray, county_values: list[str]):
    lp = seed_mcda["land_pricing"]
    classes = seed_mcda["anchors"]["land_classes"]
    rows = load_rows(region)
    idx = {c: i + 1 for i, c in enumerate(COLUMNS)}
    shape = (rg.ny, rg.nx)
    parcel_acres = np.zeros(shape)
    public_acres = np.zeros(shape)
    class_x_acres = np.zeros(shape)
    priv_val = np.zeros(shape)
    priv_acres = np.zeros(shape)
    cat_acres = np.zeros((11, *shape))
    largest = np.zeros(shape)
    largest_i = np.full(shape, -1)
    lons = np.array([r[idx["lon"]] for r in rows])
    lats = np.array([r[idx["lat"]] for r in rows])
    rr, cc = rg.index(lons, lats)
    cats = np.array([owner_category(r[idx["dor_uc"]], r[idx["owner"]], r[idx["public_lnd"]]) for r in rows])
    class_score = {c: (classes["public_conservation"] if c in PUBLIC else classes["agricultural"] if c in (1, 2)
                       else classes["residential_pud"]) for c in CATS}
    for i, r in enumerate(rows):
        y, x = rr[i], cc[i]
        if y < 0:
            continue
        acres = r[idx["lnd_sqft"]] / SQFT_PER_ACRE
        c = cats[i]
        parcel_acres[y, x] += acres
        cat_acres[c, y, x] += acres
        class_x_acres[y, x] += acres * class_score[c]
        if c in PUBLIC:
            public_acres[y, x] += acres
        else:
            priv_val[y, x] += r[idx["jv"]]
            priv_acres[y, x] += acres
        if acres > largest[y, x]:
            largest[y, x], largest_i[y, x] = acres, i

    with np.errstate(invalid="ignore", divide="ignore"):
        assessed = np.where(priv_acres > 0, priv_val / priv_acres, np.nan)
        land_score = np.where(parcel_acres > 0, class_x_acres / parcel_acres, np.nan)
    public_cat = np.argmax(cat_acres[4:], axis=0) + 4
    public_cat = np.where(public_acres > 0, public_cat, 0)
    largest_cat = np.where(largest_i >= 0, cats[np.clip(largest_i, 0, None)], 0)

    # Market price from nearest qualified vacant sales (km coordinates).
    sales = qualified_sales(rows, lp)
    kx = KM_PER_DEG_LAT * np.cos(np.radians(rg.lat0))
    s_xy = np.array([[s[0] * kx, s[1] * KM_PER_DEG_LAT] for s in sales])
    s_usd = np.array([s[2] for s in sales])
    tree = cKDTree(s_xy)
    glon, glat = rg.mesh()
    q = np.column_stack([glon.ravel() * kx, glat.ravel() * KM_PER_DEG_LAT])
    k = lp["comps_k"]["value"]
    dist, nn = tree.query(q, k=k, distance_upper_bound=lp["comps_radius_km"]["value"])
    valid = np.isfinite(dist)
    n_ok = valid.sum(axis=1)
    vals = np.where(valid, s_usd[np.clip(nn, 0, len(s_usd) - 1)], np.nan)
    with np.errstate(all="ignore"):
        med = np.nanmedian(vals, axis=1)
        p25 = np.nanpercentile(vals, 25, axis=1)
        p75 = np.nanpercentile(vals, 75, axis=1)
    # County fallback where fewer than comps_min sales lie within the radius.
    county = {}
    for fips in region["dor_county_no"]:
        cs = [s for s in sales if s[5] == fips]
        v = np.array([s[2] for s in cs])
        ratio = np.array([s[4] for s in cs if np.isfinite(s[4])])
        county[fips] = {"n_sales": len(cs), "median_usd_acre": float(np.median(v)) if len(v) else None,
                        "p25": float(np.percentile(v, 25)) if len(v) else None, "p75": float(np.percentile(v, 75)) if len(v) else None,
                        "sale_to_just_value": float(np.median(ratio)) if len(ratio) else None,
                        "median_sale_year": float(np.median([s[3] for s in cs])) if cs else None}
    lab = county_label.ravel()
    few = n_ok < lp["comps_min"]["value"]
    for j, fips in enumerate(county_values):
        c = county.get(fips)
        if not c or c["median_usd_acre"] is None:
            continue
        m = few & (lab == j)
        med[m], p25[m], p75[m] = c["median_usd_acre"], c["p25"], c["p75"]
    sale_n = np.where(few, 0, n_ok).astype(float)

    # Largest parcels (>= threshold) for scorecards; private owner names withheld.
    big = []
    cell_ref = np.full(shape, -1)
    thr = lp["largest_parcel_min_acres"]["value"]
    for y, x in zip(*np.where(largest >= thr)):
        r = rows[largest_i[y, x]]
        c = int(cats[largest_i[y, x]])
        cell_ref[y, x] = len(big)
        big.append({"parcel_id": r[idx["parcel_id"]], "county": r[0], "acres": round(r[idx["lnd_sqft"]] / SQFT_PER_ACRE, 1),
                    "cat": c, "owner": r[idx["owner"]] if c in PUBLIC else None, "dor_uc": r[idx["dor_uc"]],
                    "just_value": r[idx["jv"]], "land_value": r[idx["lnd_val"]],
                    "improvement_value": max(0, r[idx["jv"]] - r[idx["lnd_val"]])})

    layers = {"parcel_acres": parcel_acres, "public_acres": public_acres, "public_cat": public_cat.astype(float),
              "assessed_usd_acre": assessed, "sale_usd_acre": med.reshape(shape), "sale_p25": p25.reshape(shape),
              "sale_p75": p75.reshape(shape), "sale_n": sale_n.reshape(shape), "largest_acres": largest,
              "largest_cat": largest_cat.astype(float), "largest_ref": cell_ref.astype(float), "land_score": land_score}
    meta = {"source": "Florida DOR 2025 cadastral roll via FGIO statewide parcel centroids (parcels >= 5 acres)",
            "parcels": len(rows), "qualified_vacant_sales": len(sales), "sale_years": lp["sale_years"]["value"],
            "categories": {str(k): v for k, v in CATS.items()}, "public_categories": sorted(PUBLIC), "county": county,
            "assessment_year": int(np.median([r[idx["asmnt_yr"]] for r in rows])) if rows else None}
    return layers, big, meta
