"""WildSight planner: animal-vehicle crash risk on the road network of the eight model counties.

Road segments (~1 km, OSM) get traffic (FDOT AADT where counted), speed, lanes, habitat (conservation lands within
300 m, housing density) and the reported animal crashes within 100 m (2014-2024). A negative-binomial safety
performance function (Highway Safety Manual style) predicts crashes from those covariates, and the Empirical Bayes
estimate blends it with each segment's own record. Back-test: fit on 2014-2019, rank segments, count how many of the
2020-2024 crashes fall on the top-ranked miles.

    python -m wildsight.build

Shared with the Dark Sky Simulator: the region manifest (counties/region), the raw-data cache and the census,
conservation-land and HTTP connectors in ingest/. Everything WildSight-specific lives in wildsight/.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.spatial import cKDTree
from scipy.special import gammaln
from shapely.geometry import LineString, Point, mapping, shape
from shapely.prepared import prep
from shapely.ops import substring, transform
from shapely.strtree import STRtree

import yaml

from ingest import census, landscape
from pipeline.config import load_region
from wildsight import ingest as traffic

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "wildsight" / "data"
SEED = Path(__file__).resolve().parent / "seed.yaml"
CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified"]
GROUPS = ["Deer", "Bear", "Other wildlife", "Dogs and cats", "Livestock", "Other / multiple"]
LAT0 = 29.6
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574.0  # local equirectangular meters


def to_m(lon, lat):
    return lon * KX, lat * KY


def proj(geom):
    return transform(lambda x, y, z=None: (np.asarray(x) * KX, np.asarray(y) * KY), geom)


def group_of(p) -> int:
    sp = (p.get("Species_ID") or "").lower()
    if sp == "deer":
        return 0
    if sp == "bear":
        return 1
    if p.get("Species_Class") == "Wildlife":
        return 2
    if sp in ("dog", "cat"):
        return 3
    if p.get("Species_Class") == "Livestock":
        return 4
    return 5


def parse_speed(v: str) -> float | None:
    m = re.match(r"\s*(\d+)\s*(mph|km/h|kmh)?", v or "")
    if not m:
        return None
    s = float(m.group(1))
    return s / 1.609 if m.group(2) and m.group(2).startswith("km") else s


def parse_lanes(v: str) -> int | None:
    m = re.match(r"\s*(\d+)", v or "")
    return int(m.group(1)) if m else None


def nb_nll(params, X, y, offset):
    """Negative-binomial (NB2) negative log-likelihood; var = mu + alpha mu^2."""
    beta, log_alpha = params[:-1], params[-1]
    mu = np.exp(np.clip(X @ beta + offset, -30, 30))
    a = math.exp(log_alpha)
    inv = 1 / a
    ll = gammaln(y + inv) - gammaln(inv) - gammaln(y + 1) + inv * np.log(inv / (inv + mu)) + y * np.log(mu / (inv + mu))
    return -ll.sum()


def fit_nb(X, y, offset):
    x0 = np.zeros(X.shape[1] + 1)
    x0[0] = math.log(max(y.sum(), 1) / np.exp(offset).sum())
    res = minimize(nb_nll, x0, args=(X, y, offset), method="L-BFGS-B")
    return res.x[:-1], math.exp(res.x[-1]), res


def eb(mu, y, alpha):
    """Empirical Bayes expected crashes (HSM): weight on the prediction w = 1 / (1 + alpha mu)."""
    w = 1 / (1 + alpha * mu)
    return w * mu + (1 - w) * y


def captured(score, length, test, share):
    """Share of test crashes on the top `share` of network length ranked by score."""
    order = np.argsort(-score)
    cum = np.cumsum(length[order])
    k = np.searchsorted(cum, share * cum[-1]) + 1
    return float(test[order[:k]].sum() / max(test.sum(), 1))


def build():
    seed = yaml.safe_load(SEED.read_text(encoding="utf-8"))
    M = {k: v["value"] for k, v in seed["model"].items()}
    region = load_region()
    g = region["grids"]["module_a"]
    bbox = (g["west"], g["south"], g["east"], g["north"])
    fips_list = region["model_counties"]

    counties = {f["properties"]["GEOID"]: f for f in census.counties(bbox)["features"] if f["properties"]["GEOID"] in fips_list}
    county_names = {k: v["properties"]["BASENAME"] for k, v in counties.items()}
    cpoly = [(k, proj(shape(v["geometry"]))) for k, v in counties.items()]
    cprep = [prep(p) for _, p in cpoly]
    ctree = STRtree([p for _, p in cpoly])

    ways = traffic.osm_roads_tagged(bbox)["ways"]
    aadt_fc = traffic.fdot_aadt(list(county_names.values()))["features"]
    crashes = traffic.avc_crashes(bbox)["features"]
    hot = [f for f in traffic.avc_hotspots(bbox)["features"] if (f["properties"].get("Gi_Bin") or 0) > 0]
    cons = [proj(shape(f["geometry"])) for f in landscape.conservation_lands(bbox)["features"] if f.get("geometry")]
    bgs = census.block_groups(bbox)["rows"]

    # ---- segments
    seg_km = M["segment_km"]
    segs = []
    for cls, name, maxspeed, lanes, coords in ways:
        if len(coords) < 2 or cls not in CLASSES:
            continue
        line = LineString([to_m(*c) for c in coords])
        L = line.length
        n = max(1, round(L / (seg_km * 1000)))
        for k in range(n):
            part = substring(line, k * L / n, (k + 1) * L / n) if n > 1 else line
            if part.length < 20:
                continue
            mid = part.interpolate(0.5, normalized=True)
            hit = [cpoly[i][0] for i in ctree.query(mid) if cprep[i].contains(mid)]
            if not hit:
                continue
            segs.append({"geom": part, "mid": mid, "cls": cls, "name": name, "county": hit[0],
                         "speed": parse_speed(maxspeed), "lanes": parse_lanes(lanes)})
    print(f"{len(segs)} segments")

    # ---- traffic volume (FDOT sections within 40 m), speed and lanes (OSM, else class defaults)
    ageom = [proj(shape(f["geometry"])) for f in aadt_fc]
    atree = STRtree(ageom)
    for s in segs:
        i = atree.query_nearest(s["mid"], max_distance=M["aadt_join_m"])
        if len(i):
            s["aadt"], s["aadt_src"] = float(aadt_fc[int(i[0])]["properties"]["AADT"]), 1
        else:
            s["aadt"], s["aadt_src"] = float(M["default_aadt"][s["cls"]]), 0
        s["speed"] = s["speed"] or float(M["default_speed_mph"][s["cls"]])
        s["lanes"] = s["lanes"] or int(M["default_lanes"][s["cls"]])

    # ---- habitat: conservation land within 300 m; housing density from the nearest block-group centroid
    ctree2 = STRtree(cons)
    bxy = np.array([to_m(b["lon"], b["lat"]) for b in bgs])
    bden = np.array([b["hu"] / max(b["aland_m2"] / 1e6, 0.05) for b in bgs])
    kd = cKDTree(bxy)
    mids = np.array([[s["mid"].x, s["mid"].y] for s in segs])
    _, bi = kd.query(mids)
    for s, j in zip(segs, bi):
        s["cons"] = 1 if len(ctree2.query_nearest(s["mid"], max_distance=300)) else 0
        s["hu_km2"] = float(bden[j])
        rural = min(1.0, max(0.0, 1 - math.log10(1 + s["hu_km2"]) / math.log10(1 + 1000)))
        s["habitat"] = 0.5 * s["cons"] + 0.5 * rural

    # ---- UF hotspot tier (Gi_Bin 1-3 = 90/95/99% confidence)
    hgeom = [proj(shape(f["geometry"])) for f in hot]
    htree = STRtree(hgeom)
    for s in segs:
        tiers = [hot[i]["properties"]["Gi_Bin"] for i in htree.query(s["mid"]) if hgeom[i].contains(s["mid"])]
        s["hot"] = max(tiers) if tiers else 0

    # ---- crashes snapped to the nearest segment within 100 m
    stree = STRtree([s["geom"] for s in segs])
    years = list(range(2014, 2025))
    Y = np.zeros((len(segs), len(years)))
    G = np.zeros((len(segs), len(GROUPS)), dtype=int)
    points, off = [], 0
    for f in crashes:
        lon, lat = f["geometry"]["coordinates"][:2]
        p = f["properties"]
        yr, gi = int(p["Record_Year"]), group_of(p)
        pt = Point(*to_m(lon, lat))
        i = stree.query_nearest(pt, max_distance=M["crash_snap_m"])
        on = len(i) > 0
        if on:
            Y[int(i[0]), yr - 2014] += 1
            G[int(i[0]), gi] += 1
        else:
            off += 1
        points.append([round(lon, 4), round(lat, 4), yr, gi, 1 if on else 0])
    in_region = sum(1 for q in points if any(cp.contains(Point(*to_m(q[0], q[1]))) for cp in cprep))
    print(f"{len(crashes)} crashes in bbox, {in_region} in the eight counties, {int(Y.sum())} on the modeled network")

    # ---- safety performance function (negative binomial) and Empirical Bayes
    L = np.array([s["geom"].length / 1000 for s in segs])
    lnA = np.log(np.array([s["aadt"] for s in segs]) / 1000)
    X = np.column_stack([
        np.ones(len(segs)), lnA, lnA ** 2,
        np.array([s["habitat"] for s in segs]), (np.array([s["speed"] for s in segs]) - 45) / 10,
        np.array([1.0 if s["lanes"] <= 2 and s["cls"] != "motorway" else 0.0 for s in segs]),
    ])
    names = ["intercept", "ln(AADT/1000)", "ln(AADT/1000)^2", "habitat", "(speed-45)/10 mph", "two-lane"]
    t0, t1 = M["train_years"]
    v0, v1 = M["test_years"]
    ytr = Y[:, t0 - 2014:t1 - 2014 + 1].sum(1)
    yte = Y[:, v0 - 2014:v1 - 2014 + 1].sum(1)
    btr, atr, _ = fit_nb(X, ytr, np.log(L * (t1 - t0 + 1)))
    mu_tr = np.exp(X @ btr + np.log(L * (t1 - t0 + 1)))
    scores = {"eb": eb(mu_tr, ytr, atr) / L, "observed": ytr / L, "model": mu_tr / L, "length": np.ones(len(L))}
    backtest = {k: {f"top{int(sh * 100)}": round(captured(v, L, yte, sh), 3) for sh in (0.05, 0.1, 0.2)} for k, v in scores.items()}
    yall = Y.sum(1)
    b, alpha, res = fit_nb(X, yall, np.log(L * len(years)))
    mu = np.exp(X @ b + np.log(L * len(years)))
    ebr = eb(mu, yall, alpha) / len(years)
    print("coefficients", dict(zip(names, np.round(b, 3))), "alpha", round(alpha, 3))
    print("back-test (share of 2020-24 crashes on the top x% of miles):", backtest)

    # ---- outputs: compact rows (the browser builds GeoJSON), crash points, hotspot polygons, meta
    fidx = {f: i for i, f in enumerate(fips_list)}
    rows = []
    for k, s in enumerate(segs):
        geo = s["geom"].simplify(12)
        coords = [c for x, y in geo.coords for c in (round(x / KX, 5), round(y / KY, 5))]
        rows.append([CLASSES.index(s["cls"]), s["name"], round(L[k], 3), round(s["speed"]), s["lanes"], round(s["aadt"]), s["aadt_src"],
                     round(s["habitat"], 2), s["cons"], s["hot"], int(yall[k]), G[k].tolist(), round(float(ebr[k]), 4),
                     fidx[s["county"]], coords])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "roads.json").write_text(json.dumps({
        "cols": ["cls", "name", "km", "mph", "lanes", "aadt", "aadt_fdot", "habitat", "conservation", "hotspot", "crashes", "groups", "eb_per_year", "county", "coords"],
        "rows": rows}, separators=(",", ":")), encoding="utf-8")
    (OUT / "crashes.json").write_text(json.dumps({"cols": ["lon", "lat", "year", "group", "on_network"], "rows": points}, separators=(",", ":")), encoding="utf-8")
    def light(geom):  # 30 m simplification, 4-decimal coordinates
        m = mapping(transform(lambda x, y, z=None: (np.round(np.asarray(x) / KX, 4), np.round(np.asarray(y) / KY, 4)), geom.simplify(30)))
        return json.loads(json.dumps(m))
    hot_fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"tier": f["properties"]["Gi_Bin"], "level": f["properties"]["Confidence_Level"],
              "name": f["properties"]["NAME"], "wvc": f["properties"]["WVC_Total"]}, "geometry": light(hgeom[i])} for i, f in enumerate(hot)]}
    (OUT / "hotspots.geojson").write_text(json.dumps(hot_fc, separators=(",", ":")), encoding="utf-8")
    cty_fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"fips": f, "name": county_names[f]},
              "geometry": light(poly)} for f, poly in cpoly]}
    (OUT / "counties.geojson").write_text(json.dumps(cty_fc, separators=(",", ":")), encoding="utf-8")
    by_class = {c: round(float(L[[s["cls"] == c for s in segs]].sum()), 1) for c in CLASSES}
    meta = {
        "built": "2026-09-27", "classes": CLASSES, "groups": GROUPS, "years": [years[0], years[-1]],
        "counties": {f: county_names[f] for f in fips_list},
        "network_km": round(float(L.sum()), 1), "network_km_by_class": by_class,
        "crashes": {"bbox": len(crashes), "eight_counties": in_region, "on_network": int(Y.sum()), "by_year": dict(zip(years, Y.sum(0).astype(int).tolist())),
                    "by_group": dict(zip(GROUPS, G.sum(0).tolist()))},
        "aadt_fdot_share_km": round(float(L[[s["aadt_src"] == 1 for s in segs]].sum() / L.sum()), 3),
        "model": {"form": "negative binomial NB2, offset ln(km x years)", "coefficients": dict(zip(names, np.round(b, 4).tolist())), "alpha": round(alpha, 4),
                  "converged": bool(res.success), "eb_total_per_year": round(float(ebr.sum()), 1)},
        "backtest": {"train": [t0, t1], "test": [v0, v1], "share_of_test_crashes_on_top_miles": backtest},
        "seed": seed,
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    for f in ("roads.json", "crashes.json", "hotspots.geojson", "counties.geojson", "meta.json"):
        print(f, f"{(OUT / f).stat().st_size / 1e6:.2f} MB")
    return meta


if __name__ == "__main__":
    build()
