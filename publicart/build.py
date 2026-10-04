"""Public Art Policy Simulator data package for the City of Gainesville (plus Celebration Pointe).

    python -m publicart.build

Inputs: the artwork registry (registry.yaml, hand-compiled; registry_paa.yaml, facts imported from the Public Art
Archive, a publication of Creative West), an illustrative capital program (cip.yaml), the
assumptions (seed.yaml), and public data: OSM streets, paths, rail-trails and points of interest; FDOT traffic counts;
RTS weekday service (GTFS); 2020 Census blocks and block groups; ACS median household income; City of Gainesville
layers (GCRA boundary and priority areas, zoning, bicycle/pedestrian counters); BLS CPI-U; the Dark Sky streetlight
inventory caches. Outputs go to web/public/public-art/data/ (the browser does every scenario-dependent calculation).

The walking/biking flow on a 100 m grid uses the City's 17 bike/ped counters for what they measure: trail cells take
the nearest trail counter's count; street cells take an activity index (destinations, bus service, residents) whose
scale is fitted to the off-trail counters, with the leave-one-out error reported in meta.json.
Shared with the other apps: the connectors and raw-data cache in ingest/.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import yaml
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

from ingest import acs, bls, census, geocode, gtfs, osm, traffic
from ingest.common import cached_json
from publicart import ingest as city

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "web" / "public" / "public-art" / "data"
BBOX = (-82.47, 29.58, -82.20, 29.76)
REGION_BBOX = (-83.4, 28.9, -81.4, 30.25)        # cached Dark Sky region pulls (counties, places, streetlights)
COUNTY_VIEWBOX = (-82.66, 29.41, -82.05, 29.95)  # Alachua County, for place searches
RAIL_TRAILS = [2117060, 2117084, 2117056, 2117051, 2117065]
LAT0 = (BBOX[1] + BBOX[3]) / 2
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574.0
RES = 100.0                                      # grid cell size, m
NX, NY = math.ceil((BBOX[2] - BBOX[0]) * KX / RES), math.ceil((BBOX[3] - BBOX[1]) * KY / RES)
CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street",
           "pedestrian", "footway", "cycleway", "path"]
MOTOR = set(CLASSES[:8])
TYPES = ["figure", "sculpture", "mural", "fence", "wall", "functional"]
MATERIALS = ["bronze", "steel", "painted_steel", "glass", "mosaic", "acrylic_mural", "concrete", "stone", "digital", "mixed"]
PROVENANCE = ["municipal", "county", "cra", "uf", "private", "partner"]
STATUS = ["existing", "planned", "removed", "off_view"]
SETTINGS = ["outdoor", "indoor", "unverified"]      # unverified works are treated as indoor
REGISTRIES = ["registry.yaml", "registry_paa.yaml"]
DEFAULT_DIMS = {"figure": (2.5, 1.0), "sculpture": (3.0, 2.0), "mural": (6.0, 10.0), "fence": (2.0, 10.0), "wall": (2.4, 20.0), "functional": (1.5, 1.5)}
INDOOR_FLAT_DIMS = (1.5, 2.0)                    # a painting, print or panel hung indoors, when the record gives no size
POI_CATS = ["food", "night", "culture", "retail", "tourism"]


def to_m(lon, lat):
    return (np.asarray(lon) - BBOX[0]) * KX, (np.asarray(lat) - BBOX[1]) * KY


def cell_centres():
    ix, iy = np.meshgrid(np.arange(NX), np.arange(NY))
    return ((ix + 0.5) * RES).ravel(), ((NY - iy - 0.5) * RES).ravel()   # row 0 = north


def cell_of(x, y):
    ix, iy = np.floor(np.asarray(x) / RES).astype(int), NY - 1 - np.floor(np.asarray(y) / RES).astype(int)
    ok = (ix >= 0) & (ix < NX) & (iy >= 0) & (iy < NY)
    return np.where(ok, iy * NX + ix, -1)


def scale_of(t: str, h: float, w: float) -> str:
    if t in ("wall", "fence"):
        return "landmark" if w > 40 else "large" if w > 12 else "medium" if w > 4 else "small"
    if t == "mural":
        a = h * w
        return "landmark" if a > 150 else "large" if a > 40 else "medium" if a > 10 else "small"
    return "landmark" if h > 12 else "large" if h > 5 else "medium" if h >= 2 else "small"


def parse_mph(v: str, cls: str, defaults) -> float:
    m = re.match(r"(\d+)", v or "")
    return float(m.group(1)) if m else float(defaults[cls])


def r4(geom):
    """Round coordinates to 4-5 decimals (GeoJSON size)."""
    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]
    g = mapping(geom)
    return {"type": g["type"], "coordinates": rnd(g["coordinates"])}


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def build():
    seed = yaml.safe_load((HERE / "seed.yaml").read_text(encoding="utf-8"))
    S = lambda *k: _get(seed, k)
    registry = [a for name in REGISTRIES for a in yaml.safe_load((HERE / name).read_text(encoding="utf-8"))["artworks"]]
    assert len({a["id"] for a in registry}) == len(registry), "duplicate registry ids"
    cip = yaml.safe_load((HERE / "cip.yaml").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}

    # ---- geography: Alachua County, City of Gainesville, East Gainesville, GCRA
    counties = {f["properties"]["GEOID"]: shape(f["geometry"]) for f in census.counties(REGION_BBOX)["features"]}
    alachua = counties["12001"]
    gnv = next(shape(f["geometry"]) for f in census.places(REGION_BBOX)["features"]
               if f["properties"]["BASENAME"] == "Gainesville" and f["properties"]["STATE"] == "12")
    east = gnv.intersection(box(S("equity", "east_divide_lon"), BBOX[1], BBOX[2], BBOX[3]))
    gcra = unary_union([shape(f["geometry"]) for f in city.city_layer("gcra_boundary", max_offset=0.00005)["features"]])
    priority = []
    for key, label in (("gcra_housing", "Community enhancement & housing"), ("gcra_economic", "Economic development"),
                       ("gcra_public_space", "Public space & streetscape")):
        for f in city.city_layer(key, max_offset=0.00005)["features"]:
            if f.get("geometry"):
                priority.append({"type": "Feature", "properties": {"kind": "priority", "label": label}, "geometry": r4(shape(f["geometry"]))})
    areas = [{"type": "Feature", "properties": {"kind": "city", "label": "City of Gainesville"}, "geometry": r4(gnv)},
             {"type": "Feature", "properties": {"kind": "east", "label": "East Gainesville (east of Main St)"}, "geometry": r4(east)},
             {"type": "Feature", "properties": {"kind": "gcra", "label": "GCRA boundary"}, "geometry": r4(gcra)}] + priority
    write("areas.geojson", {"type": "FeatureCollection", "features": areas})

    # ---- artworks
    arts, unlocated = [], []
    alachua_p = prep(alachua)
    for a in registry:
        t = a.get("type") if a.get("type") in TYPES else "sculpture"
        setting = a.get("setting") if a.get("setting") in SETTINGS else "outdoor"
        h0, w0 = INDOOR_FLAT_DIMS if t == "mural" and setting != "outdoor" else DEFAULT_DIMS[t]
        h, w = a.get("height_m") or h0, a.get("width_m") or w0
        paa = "publicartarchive.org" in str(a.get("source_url"))
        lon, lat, how = a.get("lon"), a.get("lat"), "Public Art Archive coordinates" if paa else "source coordinates"
        if lon is None and a.get("address"):
            g = geocode.census_geocode(a["address"])
            if g:
                lon, lat, how = g[0], g[1], f"Census geocoder: {g[2]}"
        if lon is None and a.get("address"):
            g = geocode.nominatim(a["address"], COUNTY_VIEWBOX)
            if g:
                lon, lat, how = g[0], g[1], f"OpenStreetMap search for the address: {g[2]}"
        if lon is None and a.get("geocode_query"):
            g = geocode.nominatim(a["geocode_query"], COUNTY_VIEWBOX)
            if g:
                lon, lat, how = g[0], g[1], f"approximate, OpenStreetMap place search: {g[2]}"
        if lon is None or not alachua_p.contains(Point(lon, lat)):
            unlocated.append({"id": a["id"], "title": a.get("title"), "address": a.get("address"), "reason": "no coordinates" if lon is None else "outside Alachua County"})
            continue
        arts.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": {
            "id": a["id"], "title": a.get("title"), "artist": a.get("artist"), "year": a.get("year"),
            "status": a.get("status") if a.get("status") in STATUS else "existing", "setting": setting, "type": t,
            "material": a.get("material") if a.get("material") in MATERIALS else "mixed",
            "height": round(float(h), 2), "width": round(float(w), 2), "dims_estimated": not (a.get("height_m") and a.get("width_m")),
            "bearing": a.get("facade_bearing") if a.get("facade_bearing") is not None else 180, "bearing_estimated": a.get("facade_bearing") is None,
            "lit": bool(a.get("lit")), "provenance": a.get("provenance") if a.get("provenance") in PROVENANCE else "partner",
            "scale": scale_of(t, float(h), float(w)), "owner": a.get("owner"), "address": a.get("address"), "location_note": a.get("location_note"),
            "budget": a.get("budget_usd"), "budget_note": a.get("budget_note"), "artist_local": a.get("artist_local"),
            "source_url": a.get("source_url"), "notes": a.get("notes"), "located_by": how, "in_city": gnv.contains(Point(lon, lat))}})
    write("artworks.geojson", {"type": "FeatureCollection", "features": arts})
    report["registry"] = {"entries": len(registry), "on_map": len(arts), "unlocated": unlocated,
                          "by_provenance": dict(Counter(f["properties"]["provenance"] for f in arts)),
                          "by_status": dict(Counter(f["properties"]["status"] for f in arts)),
                          "by_setting": dict(Counter(f["properties"]["setting"] for f in arts)),
                          "from_archive": sum("publicartarchive.org" in str(a.get("source_url")) for a in registry)}

    # ---- streets: OSM ways cut into pieces, FDOT AADT joined to the major ones
    mph_def, aadt_def = S("roads", "default_mph"), S("roads", "default_aadt")
    fdot = [f for f in traffic.fdot_aadt(["Alachua", "Bradford", "Clay", "Gilchrist", "Levy", "Marion", "Putnam", "Union"])["features"]
            if f["properties"]["COUNTY"] == "Alachua" and f.get("geometry")]
    fgeom = [LineString(np.column_stack(to_m(*np.array(c).T))) for f in fdot for c in _lines(f["geometry"])]
    faadt = [float(f["properties"]["AADT"]) for f in fdot for _ in _lines(f["geometry"])]
    ftree = STRtree(fgeom)
    pieces = []                     # [cls, name, mph, aadt, aadt_src, coords]
    for cls, name, maxspeed, _lanes, coords in osm.streets(BBOX)["ways"]:
        if cls not in CLASSES or len(coords) < 2:
            continue
        mph = parse_mph(maxspeed, cls, mph_def)
        for part in _cut(coords, S("roads", "piece_m")):
            aadt, src = 0.0, 0
            if cls in MOTOR:
                aadt = float(aadt_def[cls])
                if CLASSES.index(cls) <= 4:
                    mx, my = to_m(*np.mean(np.array(part), axis=0))
                    i = ftree.query_nearest(Point(mx, my), max_distance=S("roads", "aadt_join_m"))
                    if len(i):
                        aadt, src = faadt[int(i[0])], 1
            pieces.append([CLASSES.index(cls), name, round(mph), round(aadt), src, part])
    write("roads.json", {"classes": CLASSES, "cols": ["cls", "name", "mph", "aadt", "aadt_fdot", "coords"], "rows": pieces})
    report["roads"] = {"pieces": len(pieces), "motor_pieces": sum(p[0] < 8 for p in pieces), "fdot_joined": sum(p[4] for p in pieces)}

    # Street sample points every 10 m (vehicle exposure, walkable-street presence).
    sx, sy, sp, sv, saadt, scls = [], [], [], [], [], []
    for k, (c, _n, mph, aadt, _src, coords) in enumerate(pieces):
        pts = _sample(coords, 10.0)
        x, y = to_m(pts[:, 0], pts[:, 1])
        sx.append(x); sy.append(y)
        sp.append(np.full(len(x), k)); sv.append(np.full(len(x), mph * 0.44704)); saadt.append(np.full(len(x), aadt)); scls.append(np.full(len(x), c))
    sx, sy, sp, sv, saadt, scls = map(np.concatenate, (sx, sy, sp, sv, saadt, scls))

    # ---- trails, transit, POIs, residents, counters, streetlights
    routes = osm.route_relations(RAIL_TRAILS)["routes"]
    write("trails.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": r["name"], "osm": r["id"]},
          "geometry": {"type": "MultiLineString", "coordinates": r["lines"]}} for r in routes]})
    tpts = np.concatenate([_sample(l, 20.0) for r in routes for l in r["lines"] if len(l) > 1])
    feed = gtfs.weekday_stops(city.RTS_GTFS)
    stops = [s for s in feed["stops"] if BBOX[0] <= s[2] <= BBOX[2] and BBOX[1] <= s[3] <= BBOX[3]]
    write("transit.json", {"service_date": feed["service_date"], "cols": ["name", "lon", "lat", "departures", "hourly"],
                           "rows": [[s[1], s[2], s[3], s[4], s[5]] for s in stops]})
    pois = [p for p in osm.pois(BBOX)["rows"] if p[2] in POI_CATS]
    write("pois.json", {"cats": POI_CATS, "rows": [[p[0], p[1], POI_CATS.index(p[2])] for p in pois]})
    blk = [b for b in census.blocks(BBOX)["rows"] if b[2] > 0]
    lamps = [r for r in cached_json("inv_socrata_gnv.json", lambda: []) + cached_json(f"inv_osm_m83.400_28.900_m81.400_30.250.json", lambda: [])
             if BBOX[0] <= r["lon"] <= BBOX[2] and BBOX[1] <= r["lat"] <= BBOX[3]]
    write("streetlights.json", {"source": "City of Gainesville streetlights (Socrata) + OpenStreetMap street lamps (Dark Sky inventory caches)",
                                "rows": [[round(r["lon"], 5), round(r["lat"], 5)] for r in lamps]})

    # ---- grid features
    cx, cy = cell_centres()
    px, py = to_m([p[0] for p in pois], [p[1] for p in pois])
    pcat = np.array([POI_CATS.index(p[2]) for p in pois])
    stx, sty = to_m([s[2] for s in stops], [s[3] for s in stops])
    sdep = np.array([s[4] for s in stops], float)
    bx, by = to_m([b[0] for b in blk], [b[1] for b in blk])
    bpop = np.array([b[2] for b in blk], float)
    trx, try_ = to_m(tpts[:, 0], tpts[:, 1])
    M = seed["pedestrian_model"]
    poi_tree, stop_tree, blk_tree, trail_tree = cKDTree(np.column_stack([px, py])), cKDTree(np.column_stack([stx, sty])), cKDTree(np.column_stack([bx, by])), cKDTree(np.column_stack([trx, try_]))

    E = M["elasticities"]["value"]

    def activity(x, y):
        """Street activity index and its inputs at points (destinations, bus departures, residents within 400 m)."""
        P = np.column_stack([x, y])
        npoi = np.array([len(i) for i in poi_tree.query_ball_point(P, M["poi_radius_m"]["value"])], float)
        dep = np.array([sdep[i].sum() for i in stop_tree.query_ball_point(P, M["transit_radius_m"]["value"])])
        pop = np.array([bpop[i].sum() for i in blk_tree.query_ball_point(P, M["pop_radius_m"]["value"])])
        return (1 + npoi) ** E["poi"] * (1 + dep / 100) ** E["transit"] * (1 + pop / 1000) ** E["pop"], npoi, dep, pop

    # The City's counters sit on trails, bike lanes and paths. Trail counters give trail flows directly; the others
    # fix the scale of the street index (one parameter), with a leave-one-out check.
    cnt = city.city_layer("counters")["features"]
    cxy = np.array([[f["properties"]["x_long"], f["properties"]["y_lat"]] for f in cnt])
    cdaily = np.array([float(f["properties"]["Average__d"]) for f in cnt])
    cx_m, cy_m = to_m(cxy[:, 0], cxy[:, 1])
    on_trail = trail_tree.query(np.column_stack([cx_m, cy_m]))[0] <= M["trail_radius_m"]["value"]
    Ic = activity(cx_m, cy_m)[0]
    street = ~on_trail
    lr = np.log(cdaily[street]) - np.log(Ic[street])
    scale = float(np.exp(np.median(lr)))
    loo = [abs(lr[j] - np.median(np.delete(lr, j))) for j in range(len(lr))]
    trail_counts = cdaily[on_trail]
    tct = cKDTree(np.column_stack([cx_m[on_trail], cy_m[on_trail]]))
    pred_c = np.where(on_trail, cdaily, scale * Ic)

    cell_idx = cell_of(sx, sy)
    walk_m = np.bincount(cell_idx[(cell_idx >= 0) & (scls > 1)], minlength=NX * NY) * 10.0   # no walking on motorways/trunks
    Ig = activity(cx, cy)[0]
    ped_street = scale * Ig * np.where(walk_m > 0, 1.0, M["no_street_factor"]["value"])
    near_trail = trail_tree.query(np.column_stack([cx, cy]), distance_upper_bound=M["trail_radius_m"]["value"])[0] < np.inf
    d_c, i_c = tct.query(np.column_stack([cx, cy]))
    ped_trail = np.where(d_c <= M["trail_match_m"]["value"], trail_counts[i_c], np.median(trail_counts))
    ped = np.where(near_trail, np.maximum(ped_street, ped_trail), ped_street)
    write("counters.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature",
          "geometry": {"type": "Point", "coordinates": [round(f["properties"]["x_long"], 6), round(f["properties"]["y_lat"], 6)]},
          "properties": {"site": f["properties"]["Site"], "daily": f["properties"]["Average__d"], "weekday": f["properties"]["Average__w"],
                         "weekend": f["properties"]["Average__2"], "users": f["properties"]["User_Distr"], "on_trail": bool(on_trail[k]),
                         "modeled": round(float(pred_c[k]))}} for k, f in enumerate(cnt)]})

    # Reference daily impressions (medium unlit sculpture, 60 m view radius) for the placement heatmap; the browser
    # applies the same formulas per artwork (web/src/publicart/engine/impressions.ts).
    I = seed["impressions"]
    R, tau, occ, sal = I["view_radius_m"]["value"]["medium"], I["glance_tau_s"]["value"], I["vehicle_occupancy"]["value"], I["salience"]["value"]["sculpture"]
    # A named street (both carriageways of a divided road) is one traffic stream: its pieces' exposure adds up and its
    # traffic counts once (same rule as streamKey in impressions.ts).
    keys = {}
    pstream = np.array([keys.setdefault((p[1], "hwy" if p[0] <= 1 else p[0]), len(keys)) if p[1] else -1 - k for k, p in enumerate(pieces)])
    mot = scls < 8
    mtree = cKDTree(np.column_stack([sx[mot], sy[mot]]))
    mp, mv, ma = sp[mot], sv[mot], saadt[mot]
    veh = np.zeros(NX * NY)
    active = np.flatnonzero(walk_m + np.bincount(cell_idx[cell_idx >= 0], minlength=NX * NY) > 0)
    for c, idx in zip(active, mtree.query_ball_point(np.column_stack([cx[active], cy[active]]), R)):
        if not idx:
            continue
        idx = np.asarray(idx)
        segs, first, n = np.unique(mp[idx], return_index=True, return_counts=True)
        v, a = mv[idx][first], ma[idx][first]
        _u, inv = np.unique(pstream[segs], return_inverse=True)
        t = np.bincount(inv, weights=n * 10.0 / np.maximum(v, 0.5))   # seconds of exposure on each street
        amax = np.zeros(len(t))
        np.maximum.at(amax, inv, a)
        veh[c] = (amax * occ * (1 - np.exp(-t / tau))).sum() * sal
    ped_ref = ped * sal

    # Time-of-day mix of the walking/biking flow from the local mix of destinations.
    near = poi_tree.query_ball_point(np.column_stack([cx, cy]), M["poi_radius_m"]["value"])
    cats = np.zeros((NX * NY, len(POI_CATS)))
    for c, idx in enumerate(near):
        if idx:
            cats[c] = np.bincount(pcat[idx], minlength=len(POI_CATS))
    w_night = cats[:, 1] + 0.5 * cats[:, 0]
    w_mid = cats[:, 2] + cats[:, 3] + cats[:, 4] + 0.5 * cats[:, 0]
    _, _, dep_g, pop_g = activity(cx, cy)
    w_com = 2 + dep_g / 50 + pop_g / 2000
    tot = w_night + w_mid + w_com
    mix = np.round(np.column_stack([w_com, w_mid, w_night]) / tot[:, None] * 100).astype(int)

    # Zoning (dominant code at the cell centre), city / East / GCRA flags, residents per cell.
    zfeat = [f for f in city.city_layer("zoning", out_fields="ZONINGCODE", max_offset=0.00005)["features"] if f.get("geometry")]
    zgeom = [shape(f["geometry"]) for f in zfeat]
    zcode = [str(f["properties"].get("ZONINGCODE") or "") for f in zfeat]
    codes = sorted(set(zcode))
    ztree = STRtree(zgeom)
    lon_c, lat_c = BBOX[0] + cx / KX, BBOX[1] + cy / KY
    pts = [Point(a, b) for a, b in zip(lon_c, lat_c)]
    zone = np.full(NX * NY, -1)
    for c, hits in zip(*ztree.query(pts, predicate="within")):
        zone[c] = codes.index(zcode[hits])
    flags = np.zeros(NX * NY, int)
    for bit, poly in ((1, gnv), (2, east), (4, gcra)):
        pp = prep(poly)
        flags |= np.array([bit if pp.contains(p) else 0 for p in pts])
    bc = cell_of(bx, by)
    pop_cell = np.bincount(bc[bc >= 0], weights=bpop[bc >= 0], minlength=NX * NY)

    # ---- equity: block groups with ACS income, blocks with their block group
    inc = acs.median_household_income()
    county_mhi = inc["county"][0]
    bgs = []
    for f in census.block_group_polygons(BBOX)["features"]:
        p, g = f["properties"], shape(f["geometry"])
        if not g.intersects(box(*BBOX)) or not alachua.contains(g.representative_point()):
            continue
        mhi, moe = inc["rows"].get(p["GEOID"], [None, None])
        bgs.append({"type": "Feature", "geometry": r4(g.simplify(0.0001)), "properties": {
            "geoid": p["GEOID"], "pop": int(p["POP100"] or 0), "mhi": mhi, "moe": moe,
            "low_income": bool(mhi is not None and mhi < S("equity", "low_income_ratio") * county_mhi),
            "east": bool(east.contains(g.representative_point())), "in_city": bool(gnv.contains(g.representative_point()))}})
    write("equity.geojson", {"type": "FeatureCollection", "features": bgs})
    bg_index = {f["properties"]["geoid"]: k for k, f in enumerate(bgs)}
    blocks_out = [[b[0], b[1], b[2], bg_index.get(b[4][:12], -1)] for b in blk]
    write("blocks.json", {"cols": ["lon", "lat", "pop", "bg"], "rows": blocks_out})
    flags |= np.where(_in_any([shape(f["geometry"]) for f in bgs if f["properties"]["low_income"]], pts), 8, 0)

    write("cells.json", {
        "grid": {"west": BBOX[0], "south": BBOX[1], "nx": NX, "ny": NY, "res_m": RES, "kx": KX, "ky": KY,
                 "note": "row 0 is the northern edge; cell (ix, iy) spans lon west + ix*res/kx, lat south + (ny-1-iy)*res/ky"},
        "zone_codes": codes,
        "cols": {"ped": np.round(ped).astype(int).tolist(), "veh_ref": np.round(veh).astype(int).tolist(),
                 "ped_ref": np.round(ped_ref).astype(int).tolist(), "mix_commute": mix[:, 0].tolist(), "mix_midday": mix[:, 1].tolist(),
                 "mix_night": mix[:, 2].tolist(), "zone": zone.tolist(), "flags": flags.tolist(), "pop": np.round(pop_cell).astype(int).tolist(),
                 "walk_m": np.round(walk_m).astype(int).tolist()},
        "flags": {"1": "in city", "2": "East Gainesville", "4": "GCRA", "8": "low-income block group"}})

    # ---- CPI, capital program
    cpi = bls.cpi_u()
    write("cpi.json", cpi)
    write("cip.json", cip)

    report["pedestrian_model"] = {
        "method": "Trail cells: count of the nearest counter on a trail. Street cells: activity index (destinations, bus departures, residents within 400 m; assumed elasticities) x one scale fitted to the off-trail counters.",
        "elasticities": E, "street_scale": round(scale, 2), "n_counters": int(len(cdaily)), "n_trail": int(on_trail.sum()), "n_street": int(street.sum()),
        "loo_median_factor": round(float(math.exp(np.median(loo))), 2), "loo_max_factor": round(float(math.exp(max(loo))), 2),
        "counter_vs_model": [[f["properties"]["Site"], float(cdaily[k]), round(float(pred_c[k])), bool(on_trail[k])] for k, f in enumerate(cnt)]}
    meta = {
        "built": dt.date.today().isoformat(), "seed": seed, "bbox": BBOX,
        "data": {"acs_release": inc["release"]["name"], "county_mhi": county_mhi, "gtfs_service_date": feed["service_date"],
                 "cpi_last": cpi["monthly"][-1], "zoning": "City of Gainesville Existing Zoning, Jan 5 2025",
                 "counters": "City of Gainesville Bicycle/Pedestrian Counts 2025", "streetlights": len(lamps), "pois": len(pois),
                 "transit_stops": len(stops), "blocks": len(blocks_out), "block_groups": len(bgs), "trails": [r["name"] for r in routes]},
        "report": report,
        "notes": ["Artwork registry hand-compiled from public sources plus facts from the Public Art Archive (Creative West); not the City's official inventory.",
                  "The capital program is illustrative (see cip.json for sources and estimated amounts).",
                  "Walking/biking volumes are a proxy fitted to 17 counters; see report.pedestrian_model for the error."],
    }
    write("meta.json", meta)
    for f in sorted(OUT.iterdir()):
        print(f"{f.name:22s} {f.stat().st_size / 1e6:6.2f} MB")
    print(json.dumps({k: v for k, v in report.items() if k != "registry"} | {"registry": {k: v for k, v in report["registry"].items() if k != "unlocated"}}, indent=1))
    if unlocated:
        print("unlocated:", [u["id"] for u in unlocated])


# ---------------------------------------------------------------- helpers

def _get(seed, keys):
    v = seed
    for k in keys:
        v = v[k]
    return v["value"] if isinstance(v, dict) and "value" in v else v


def _lines(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def _cut(coords, max_m):
    """Split a polyline into pieces of at most max_m metres (at vertices, plus interpolated breaks)."""
    out, cur, acc = [], [coords[0]], 0.0
    for a, b in zip(coords, coords[1:]):
        d = math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY)
        while acc + d > max_m and d > 0:
            f = (max_m - acc) / d
            m = [round(a[0] + (b[0] - a[0]) * f, 5), round(a[1] + (b[1] - a[1]) * f, 5)]
            cur.append(m)
            out.append(cur)
            cur, acc, a, d = [m], 0.0, m, d * (1 - f)
        cur.append(b)
        acc += d
    if len(cur) > 1:
        out.append(cur)
    return out


def _sample(coords, step):
    """Points every `step` metres along a polyline (lon, lat array)."""
    c = np.asarray(coords, float)
    seg = np.hypot(np.diff(c[:, 0]) * KX, np.diff(c[:, 1]) * KY)
    L = np.concatenate([[0], np.cumsum(seg)])
    if L[-1] <= 0:
        return c[:1]
    s = np.arange(step / 2, L[-1], step)
    return np.column_stack([np.interp(s, L, c[:, 0]), np.interp(s, L, c[:, 1])]) if len(s) else c[:1]


def _in_any(polys, pts):
    if not polys:
        return np.zeros(len(pts), bool)
    tree = STRtree(polys)
    out = np.zeros(len(pts), bool)
    hit, _ = tree.query(pts, predicate="within")
    out[hit] = True
    return out


if __name__ == "__main__":
    build()
