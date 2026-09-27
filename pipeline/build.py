"""Step 2: precompute everything the static v2.0 site needs into web/public/data/.

    python -m pipeline.build

Offline Garstang-lite pipeline (PRD 0A.2 Physics row): source fields -> fitted kernel convolution ->
per-component basis layers that the browser combines linearly for any control setting.

Seed mode (no VIIRS cached): source placement comes from Census 2020 housing units and public
inventories; the single global flux scale is anchored to the seed site magnitudes in PRD 6.5. That anchor is a
sanity fit to corpus values, not a calibration (0A.5); every output carries the "uncalibrated" badge.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy import ndimage

from engine import bortle, garstang, spectral
from engine.flux import TERMS, effective_flux
from engine.grid import Grid, convolve, distance_km_to, distance_transform_km, resample_block_mean, sample_bilinear
from ingest import census, globe_at_night, inventory, landscape
from ingest.common import RAW

from . import rasterize as R
from . import land, sanity, viirs_mode
from .config import ROOT, load_county, load_region, load_seed, p
from .encode import write_lin16, write_log16

OUT = ROOT / "web" / "public" / "data"
COUNTY_FIPS = tuple(load_region()["model_counties"])
MI_KM = 1.609344


# ---------------------------------------------------------------- grids, kernels, spectra

def make_grids(region):
    def g(key):
        d = region["grids"][key]
        return Grid.from_bounds(d["west"], d["east"], d["south"], d["north"], d["res_deg"])
    a15, rg = g("module_a"), g("region")
    a30 = Grid(a15.west, a15.south, rg.res, a15.nx // 2, a15.ny // 2)
    off = (int(round((rg.north - a30.north) / rg.res)), int(round((a30.west - rg.west) / rg.res)))
    return a15, a30, rg, off


def window(arr, off, shape):
    r0, c0 = off
    return arr[r0:r0 + shape[0], c0:c0 + shape[1]]


def build_physics(seed):
    atms = [garstang.Atmosphere(p(seed, "turbidity_summer"), p(seed, "hg_g")),
            garstang.Atmosphere(p(seed, "turbidity_winter"), p(seed, "hg_g"))]
    cutoff = p(seed, "cutoff_radius_km")
    fits = {t: garstang.fit_kernel(t, atms, d_max_km=cutoff) for t in TERMS}
    scatter = {t: spectral.band_scatter_ratios(t, atms, cutoff) for t in TERMS}
    bands = {k: np.array([float(r[b]) for b in spectral.BAND_KEYS]) for k, r in seed["spd"].items()}
    factors = spectral.skyglow_factors(bands, scatter)
    return atms, fits, scatter, factors


# ---------------------------------------------------------------- stocks and placement

def lm_per_fixture(kind: str, spd: str, seed) -> float:
    if kind == "residential":
        return p(seed, "private_residential_lm")
    if kind == "commercial":
        return p(seed, "commercial_fixture_lm")
    if kind == "sports":
        return p(seed, "sports_fixture_lm")
    hps_lm = p(seed, "typical_public_system_w_hps") * p(seed, "efficacy_hps_lm_w")
    return hps_lm if spd in ("HPS", "MH") else hps_lm * p(seed, "retrofit_lumen_ratio")


def cohorts_of(stock_def, seed):
    out = []
    for spd, f in stock_def["spd_mix"].items():
        for u, uf in stock_def["u_mix"][spd].items():
            out.append({"spd": spd, "u": int(u), "frac": f * uf, "lm": lm_per_fixture(stock_def["lm"], spd, seed)})
    return out


def placement_context(a15, rg, viirs15=None, viirs30=None):
    region = load_region()
    bbox = rg.bounds()
    bgs = census.block_groups(bbox)["rows"]
    places = census.places(bbox)["features"]
    counties = census.counties(bbox)["features"]
    roads = census.major_roads(bbox)["features"]
    fl_places = {f["properties"]["BASENAME"]: f for f in places
                 if f["properties"]["STATE"] == "12" and f["properties"]["kind"] == "incorporated"}
    county_feats = {f["properties"]["GEOID"]: f for f in counties}
    ctx = {"bgs": bgs, "places": places, "fl_places": fl_places, "county_feats": county_feats, "roads": roads,
           "region": region}
    ctx["hu15"] = R.spread_block_groups(a15, bgs, "hu")
    ctx["hu15_urban"] = R.spread_block_groups(a15, [b for b in bgs if b["urban"]], "hu")
    ctx["hu30"] = R.spread_block_groups(rg, bgs, "hu")
    # Where light sits: housing units in seed mode, 2024 VIIRS radiance in VIIRS mode (counts stay inventory/Census).
    ctx["w15"] = ctx["hu15"] if viirs15 is None else viirs15
    ctx["w15_urban"] = ctx["hu15_urban"] if viirs15 is None else viirs15 * (ctx["hu15_urban"] > 0)
    ctx["w30"] = ctx["hu30"] if viirs30 is None else viirs30
    ctx["county15"] = {f: R.polygon_mask(a15, [county_feats[f]["geometry"]]) for f in COUNTY_FIPS}
    ctx["county30"] = {f: R.polygon_mask(rg, [county_feats[f]["geometry"]]) for f in COUNTY_FIPS}
    ctx["roads15"] = R.line_length_km(a15, roads)
    ctx["places15"] = R.polygon_mask(a15, [f["geometry"] for f in fl_places.values()])
    # Expected lit road length per cell (PRD 2.2 road-network distribution): OSM lit=yes segments count fully,
    # other public roads in proportion to housing density up to lit_road_full_density_hu_km2.
    osm = inventory.osm_roads(a15.bounds())["lines"]
    to_fc = lambda lines: [{"geometry": {"type": "LineString", "coordinates": c}} for _, c in lines]
    lit_len = R.line_length_km(a15, to_fc([l for l in osm if l[0]]))
    all_len = R.line_length_km(a15, to_fc(osm))
    dens = ndimage.gaussian_filter(ctx["hu15"], sigma=1) / a15.cell_area_km2
    ctx["lit_share15"] = np.minimum(1.0, dens / p(load_seed(), "lit_road_full_density_hu_km2"))
    ctx["litw15"] = lit_len + (all_len - lit_len) * ctx["lit_share15"]
    ctx["osm_road_segments"] = len(osm)
    ctx["osm_lit_segments"] = sum(1 for l in osm if l[0])
    soc = inventory.socrata_gainesville()
    ctx["socrata"] = soc
    ctx["sports"] = sports_venues(a15, load_seed())
    from engine.grid import accumulate_points
    v = ctx["sports"]
    ctx["sports15"] = accumulate_points(a15, [x["lon"] for x in v], [x["lat"] for x in v], [x["fixtures"] for x in v])
    return ctx


def sports_venues(a15, seed):
    """OSM sports venues with expected lit fixtures = fixtures per venue type x lit probability."""
    per = {"field": p(seed, "sports_fixtures_field"), "court": p(seed, "sports_fixtures_court"),
           "track": p(seed, "sports_fixtures_track"), "stadium": p(seed, "sports_fixtures_stadium")}
    field = {"baseball", "softball", "american_football", "soccer", "lacrosse", "football"}
    out = []
    for v in inventory.osm_sports(a15.bounds()):
        if v["lit"] == "no":
            continue
        kind = ("stadium" if v["leisure"] == "stadium" else "track" if v["leisure"] == "track"
                else "field" if v["sport"] in field else "court")
        p_lit = 1.0 if (v["lit"] == "yes" or kind == "stadium") else p(seed, "sports_untagged_lit_probability")
        out.append({**v, "kind": kind, "p_lit": p_lit, "fixtures": per[kind] * p_lit})
    return out


def on_fraction(hours: str | None, window: tuple[str, str]) -> float:
    """Share of the viewing window a stock is lit (hours "HH:MM-HH:MM"; None = dusk to dawn)."""
    if not hours:
        return 1.0
    a, b = hours.split("-")
    def h(t):
        hh, mm = t.split(":")
        return int(hh) + int(mm) / 60
    def segs(x, y):
        return [(x, y)] if y > x else [(x, 24.0), (0.0, y)]
    win = segs(h(window[0]), h(window[1]))
    length = sum(e - s for s, e in win)
    ov = sum(max(0.0, min(e1, e2) - max(s1, s2)) for s1, e1 in segs(h(a), h(b)) for s2, e2 in win)
    return ov / length if length else 0.0


def place_mask(a15, ctx, names):
    m = np.zeros((a15.ny, a15.nx), dtype=bool)
    for n in names:
        m |= R.polygon_mask(a15, [ctx["fl_places"][n]["geometry"]])
    return m


def places_of(a15, ctx, names):
    return ctx["places15"] if names == "all" else place_mask(a15, ctx, names)


def stock_mask(a15, ctx, stock_def, fips):
    """Cells a public road-placed stock may occupy (used for both placement and derived counts)."""
    pl = stock_def["placement"]
    cmask = ctx["county15"][fips]
    if "roads_in_places" in pl:
        return places_of(a15, ctx, pl["roads_in_places"]) & cmask
    if "roads_outside_places" in pl:
        return cmask & ~places_of(a15, ctx, pl["roads_outside_places"])
    return cmask


def stock_weight(a15, ctx, stock_def, fips):
    """Unnormalized placement weight on the 15" grid, restricted to the county."""
    pl = stock_def["placement"]
    cmask = ctx["county15"][fips]
    hu = ctx["w15"]
    road = ctx["litw15"]
    if "roads_in_places" in pl:
        split = pl.get("split_by_place")
        if split:
            total = sum(split.values())
            w = np.zeros_like(road)
            for name, n in split.items():
                m = place_mask(a15, ctx, [name]) & cmask
                part = road * m if (road * m).sum() > 0 else m.astype(float)
                w += part / part.sum() * (n / total)
            return w
        m = stock_mask(a15, ctx, stock_def, fips)
        return road * m if (road * m).sum() > 0 else m.astype(float)
    if "roads_outside_places" in pl:
        return road * stock_mask(a15, ctx, stock_def, fips)
    if pl.get("major_roads"):
        return ctx["roads15"] * ctx["lit_share15"] * cmask
    if pl.get("osm_sports"):
        return ctx["sports15"] * cmask
    if pl.get("surveyed_points") == "socrata":
        pts = ctx["socrata"]
        from engine.grid import accumulate_points
        return accumulate_points(a15, [q["lon"] for q in pts], [q["lat"] for q in pts]) * cmask
    if pl.get("housing") == "towns":
        # Commercial lighting concentrates in towns: housing inside any incorporated place or urban block group.
        towns = place_mask(a15, ctx, [n for n, f in ctx["fl_places"].items()
                                      if a15.west <= float(f["properties"]["INTPTLON"]) <= a15.east
                                      and a15.south <= float(f["properties"]["INTPTLAT"]) <= a15.north])
        return np.maximum(ctx["w15_urban"], hu * towns) * cmask
    if pl.get("housing") == "all":
        return hu * cmask
    raise ValueError(f"unknown placement {pl}")


def hu_split(ctx, mask):
    """(urban, rural) housing units inside a cell mask."""
    urban = float((ctx["hu15_urban"] * mask).sum())
    return urban, float((ctx["hu15"] * mask).sum()) - urban


def derive_public_rates(ctx):
    """Public streetlights per urban / rural housing unit, solved from the reference counties' seed inventories."""
    refs = load_region()["reference_counties"]
    rows, totals = [], []
    for f in refs:
        n = sum(s["n"] for s in load_county(f)["stocks"] if s["public"] and isinstance(s["n"], (int, float)))
        rows.append(hu_split(ctx, ctx["county15"][f]))
        totals.append(n)
    (urban, rural), *_ = np.linalg.lstsq(np.array(rows), np.array(totals, dtype=float), rcond=None)
    return {"urban_per_hu": float(urban), "rural_per_hu": float(rural), "reference_counties": refs,
            "reference_public_fixtures": dict(zip(refs, totals)),
            "method": "least squares of seed public fixture counts on Census 2020 urban/rural housing units"}


def build_stocks(a15, ctx, seed):
    """Every stock with its count and normalized 15" placement field."""
    stocks = []
    rates = ctx["public_rates"]
    for fips in COUNTY_FIPS:
        county = load_county(fips)
        res_flux = None
        for sd in county["stocks"]:
            w = stock_weight(a15, ctx, sd, fips)
            if w.sum() <= 0:
                raise RuntimeError(f"{fips}/{sd['id']}: empty placement")
            n = sd["n"]
            if n == "surveyed":
                n = float(w.sum())
            elif n == "derived_public":
                u, r = hu_split(ctx, stock_mask(a15, ctx, sd, fips))
                n = rates["urban_per_hu"] * u + rates["rural_per_hu"] * r
            elif n == "census_housing":
                n = float((ctx["hu15"] * ctx["county15"][fips]).sum()) * p(seed, "private_fixtures_per_hu_blended")
                res_flux = n * p(seed, "private_residential_lm")
            elif n == "commercial_flux":
                n = res_flux * p(seed, "commercial_to_residential_flux") / p(seed, "commercial_fixture_lm")
            elif n == "osm_sports":
                n = float(w.sum())
            hours = p(seed, f"{sd['hours']}_hours") if sd.get("hours") else None
            burn = p(seed, f"{sd['burn_hours']}_burn_hours_per_year") if sd.get("burn_hours") else None
            stocks.append({"id": f"{fips}:{sd['id']}", "group": sd["group"], "county": fips, "n": float(n),
                           "public": sd["public"], "confidence": sd["confidence"], "owners": sd["owners"],
                           "tariff": sd.get("tariff", {}), "cohorts": cohorts_of(sd, seed), "kind": sd["id"],
                           "hours": hours, "burn_hours": burn,
                           "spd_mix_provenance": sd.get("spd_mix_provenance"), "field": w / w.sum()})
    return stocks


# ---------------------------------------------------------------- overlay rings and components

def ring_index(a15, sites, edges_mi):
    """Per cell: (site id or None, ring index); ring k spans edges[k-1]..edges[k] (edges[-1] = 0)."""
    dists = {s["id"]: distance_km_to(a15, s["lon"], s["lat"]) / MI_KM for s in sites}
    ids = list(dists)
    stack = np.stack([dists[i] for i in ids])
    near = np.argmin(stack, axis=0)
    dmin = stack.min(axis=0)
    ring = np.searchsorted(np.asarray(edges_mi, dtype=float), dmin, side="left")  # 0..len(edges)
    ring[dmin > edges_mi[-1]] = -1
    return near, ring, ids


def build_components(stocks, near, ring, site_ids, edges_mi):
    comps = {}

    def add(key, meta, stock, part_field):
        n_part = stock["n"] * part_field.sum()
        if n_part <= 1e-3:
            return
        c = comps.setdefault(key, {**meta, "stocks": [], "fields": []})
        s = {k: v for k, v in stock.items() if k != "field"}
        s["n"] = float(n_part)
        c["stocks"].append(s)
        c["fields"].append(part_field / part_field.sum())

    outside = ring < 0
    for s in stocks:
        add(f"{s['group']}|{s['county']}", {"kind": "group", "group": s["group"], "county": s["county"]},
            s, s["field"] * outside)
        for si, sid in enumerate(site_ids):
            for k in range(len(edges_mi)):
                m = (near == si) & (ring == k)
                inner = 0 if k == 0 else edges_mi[k - 1]
                add(f"ring|{sid}|{k}", {"kind": "ring", "site": sid, "ring": k, "r0_mi": inner, "r1_mi": edges_mi[k]},
                    s, s["field"] * m)
    return comps


def component_field(comp, term, seed, factors, mode="V"):
    """Flux-weighted normalized field of a component for one kernel term, and its baseline flux."""
    ulor = {u: p(seed, f"ulor_u{u}") for u in range(6)}
    alb = p(seed, "albedo_effective_v2")
    fl = [effective_flux(s, term, mode, ulor, alb, factors) for s in comp["stocks"]]
    total = sum(fl)
    if total <= 0:
        return np.zeros_like(comp["fields"][0]), 0.0
    return sum(f * w for f, w in zip(fl, comp["fields"])) / total, total


# ---------------------------------------------------------------- main build

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    seed = load_seed()
    region = load_region()
    a15, a30, rg, off = make_grids(region)
    print("grids", a15.nx, a15.ny, "|", a30.nx, a30.ny, "|", rg.nx, rg.ny, "offset", off)

    atms, fits, scatter, factors = build_physics(seed)
    k15 = {t: garstang.kernel_image(fits[t], a15.dx_km, a15.dy_km) for t in TERMS}
    k30 = {t: garstang.kernel_image(fits[t], rg.dx_km, rg.dy_km) for t in TERMS}
    ulor = {u: p(seed, f"ulor_u{u}") for u in range(6)}
    alb = p(seed, "albedo_effective_v2")
    L_nat = float(bortle.luminance_from_mag(p(seed, "natural_zenith_mag")))
    thresholds = [(int(r["bortle"]), float(r["min_mag"]) if r["min_mag"] else None) for r in seed["bortle"]]

    viirs_on = viirs_mode.available(a15, rg)
    stack15 = stack_rg = None
    if viirs_on:
        stack15, stack_rg = viirs_mode.stacks(a15, rg)
    ctx = placement_context(a15, rg, stack15[2024] if viirs_on else None, stack_rg[2024] if viirs_on else None)
    late_window = (p(seed, "sqm_window_start"), p(seed, "sqm_window_end"))
    for f in COUNTY_FIPS:  # the county must not touch the Module A grid edge
        m = ctx["county15"][f]
        assert not (m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any()), f"{f} touches grid edge"
    ctx["public_rates"] = derive_public_rates(ctx)
    print("derived public rates", ctx["public_rates"])
    stocks = build_stocks(a15, ctx, seed)

    sites = [s | {"county": f} for f in COUNTY_FIPS for s in load_county(f)["sites"]]
    overlay_sites = [s for s in sites if s["id"] in ("RHO-Dome1", "CAV-BillyDodd")]
    edges = seed["overlay"]["ring_edges_mi"]
    near, ring, site_ids = ring_index(a15, overlay_sites, edges)
    comps = build_components(stocks, near, ring, site_ids, edges)

    # External sources: everything outside Alachua and Levy, at the Alachua lumens-per-housing-unit rate.
    alachua = [s for s in stocks if s["county"] == "12001"]
    hu_alachua = float((ctx["hu15"] * ctx["county15"]["12001"]).sum())
    n_alachua = sum(s["n"] for s in alachua)
    inside30 = np.logical_or.reduce([ctx["county30"][f] for f in COUNTY_FIPS])
    ext_hu = ctx["hu30"] * ~inside30
    ext_cohorts = []
    for s in alachua:
        for c in s["cohorts"]:
            ext_cohorts.append({**c, "frac": c["frac"] * s["n"] / n_alachua})
    ext_stock = {"id": "external", "group": "External", "county": "other", "n": float(ext_hu.sum()) * n_alachua / hu_alachua,
                 "public": False, "confidence": 0.2, "owners": {"outside Alachua and Levy": "modeled"},
                 "tariff": {}, "cohorts": ext_cohorts}
    ext_w = ctx["w30"] * ~inside30
    ext_field30 = ext_w / ext_w.sum()

    # ---- basis layers on the 30" Module A window, per component per kernel (unit: cd m^-2 per effective lm)
    comp_list = []
    basis_layers = []
    site_contrib = {s["id"]: {} for s in sites}
    site_cells15 = {s["id"]: a15.index(s["lon"], s["lat"]) for s in sites}
    base15 = {t: np.zeros((a15.ny, a15.nx)) for t in TERMS}
    e30_region = {t: np.zeros((rg.ny, rg.nx)) for t in TERMS}
    for key in sorted(comps):
        comp = comps[key]
        entry = {k: v for k, v in comp.items() if k not in ("stocks", "fields")}
        entry["id"] = key
        entry["stocks"] = comp["stocks"]
        entry["baseline_flux_V"] = {}
        entry["layers"] = {}
        for t in TERMS:
            f15, _ = component_field(comp, t, seed, factors)
            # Baseline, anchor and baseline maps use the SQM window, where evening-only stocks (sports) are off.
            total = sum(effective_flux(s, t, "V", ulor, alb, factors) * on_fraction(s.get("hours"), late_window)
                        for s in comp["stocks"])
            entry["baseline_flux_V"][t] = total
            conv15 = convolve(f15, k15[t])
            base15[t] += total * conv15
            f30 = resample_block_mean(f15, 2) * 4.0
            conv30 = convolve(f30, k30[t])
            entry["layers"][t] = len(basis_layers)
            basis_layers.append(np.maximum(conv30, 0.0))
            e30_region[t][off[0]:off[0] + a30.ny, off[1]:off[1] + a30.nx] += total * f30
            for sid, (r, c) in site_cells15.items():
                site_contrib[sid].setdefault(key, {})[t] = float(max(conv15[r, c], 0.0))
        comp_list.append(entry)

    ext_entry = {"id": "external", "kind": "external", "stocks": [ext_stock], "baseline_flux_V": {}, "layers": {}}
    ext_conv_rg = {}
    for t in TERMS:
        total = effective_flux(ext_stock, t, "V", ulor, alb, factors)
        ext_entry["baseline_flux_V"][t] = total
        conv = np.maximum(convolve(ext_field30, k30[t]), 0.0)
        ext_conv_rg[t] = conv
        ext_entry["layers"][t] = len(basis_layers)
        basis_layers.append(window(conv, off, (a30.ny, a30.nx)).copy())
        e30_region[t] += total * ext_field30
        up = ndimage.zoom(window(conv, off, (a30.ny, a30.nx)), 2, order=1)[: a15.ny, : a15.nx]
        base15[t] += total * up
        for s in sites:
            site_contrib[s["id"]].setdefault("external", {})[t] = float(sample_bilinear(rg, conv, s["lon"], s["lat"])[0])
    comp_list.append(ext_entry)

    # ---- anchor: one global flux scale fitted to the seed site magnitudes (sanity fit, not calibration)
    def site_art(sid, alpha):
        return alpha * sum(c["baseline_flux_V"][t] * site_contrib[sid][c["id"]][t] for c in comp_list for t in TERMS)

    seeds = np.array([s["seed_mag"] for s in sites])
    alphas = np.geomspace(1e-3, 1e2, 4000)
    nat = p(seed, "natural_zenith_mag")
    rmse = [np.sqrt(np.mean((bortle.total_mag([site_art(s["id"], a) for s in sites], nat) - seeds) ** 2)) for a in alphas]
    alpha = float(alphas[int(np.argmin(rmse))])
    site_rows = []
    for s in sites:
        m = float(bortle.total_mag(site_art(s["id"], alpha), p(seed, "natural_zenith_mag")))
        site_rows.append({**s, "model_mag": round(m, 3), "residual": round(m - s["seed_mag"], 3),
                          "model_bortle": bortle.bortle_class(m, thresholds), "contrib": site_contrib[s["id"]]})
    anchor = {"alpha": alpha, "rmse_mag": float(min(rmse)), "n_sites": len(sites),
              "method": "single global flux scale, least squares on magnitude vs PRD 6.5 seed site values",
              "is_calibration": False}
    print("anchor", anchor)
    for r in site_rows:
        print(f"  {r['name']:<36} seed {r['seed_mag']:.2f} model {r['model_mag']:.2f} ({r['residual']:+.2f})")

    # ---- baseline maps
    L15 = alpha * (base15["direct"] + base15["reflected"])
    L_region = alpha * sum(convolve(e30_region[t], k30[t]) for t in TERMS)
    L_region = np.maximum(L_region, 0.0)

    # ---- growth (10-yr) from county-subdivision housing growth 2010->2020 (proxy until VIIRS trends load)
    ccd = census.county_subdivisions(rg.bounds())["features"]
    rates = []
    for f in ccd:
        pr = f["properties"]
        h10, h20 = pr.get("hu2010"), pr.get("hu2020")
        r_ = math.log(h20 / h10) / 10 if h10 and h20 else p(seed, "seed_growth_rate_per_yr")
        pr["rate"] = float(np.clip(r_, -0.01, 0.06))
        rates.append(pr["rate"])
    lab, vals = R.label_raster(rg, ccd, "rate")
    r_rg = np.where(lab >= 0, np.asarray(vals + [0.0])[lab], p(seed, "seed_growth_rate_per_yr"))
    growth_meta = {"method": "census_housing_proxy", "source": "Census HU 2010->2020 by county subdivision (TIGERweb)"}
    cov = region_covariates(rg, ctx)
    if viirs_on:
        r_rg, growth_meta = viirs_mode.growth_rates(stack_rg, cov, cov["valid"])
    grow = np.exp(10 * r_rg)
    L_region_2034 = np.maximum(alpha * sum(convolve(e30_region[t] * grow, k30[t]) for t in TERMS), 0.0)
    G_region = np.where(L_region > 0, L_region_2034 / np.maximum(L_region, 1e-30), 1.0)
    G_a30 = window(G_region, off, (a30.ny, a30.nx))

    # ---- sanity check against public points (never fitted)
    gan = globe_at_night.observations(a15.bounds())
    gan_rows, gan_summary = sanity.globe_at_night(a15, L15, p(seed, "natural_zenith_mag"), gan["rows"])
    if OUT == ROOT / "web" / "public" / "data":
        sanity.write_markdown(ROOT / "docs" / "sanity_check.md", site_rows, anchor, gan_rows, gan_summary, gan["files"])

    # ---- files: Module A
    meta = {}
    meta["baseline_a15"] = write_log16(OUT / "baseline_a15.bin", [L15])
    meta["basis_a30"] = write_log16(OUT / "basis_a30.bin", basis_layers)
    meta["growth_a30"] = write_lin16(OUT / "growth_a30.bin", [G_a30])
    slot = lambda s: ("sports" if s["group"] == "Sports" else "residential" if s["kind"] == "private_residential"
                      else "commercial" if s["kind"] == "private_commercial" else "street")
    cats = ["street", "commercial", "residential", "sports"]
    cat15 = [sum((s["n"] * s["field"] for s in stocks if slot(s) == c), np.zeros((a15.ny, a15.nx))) for c in cats]
    meta["fixtures_cat_a15"] = write_lin16(OUT / "fixtures_cat_a15.bin", cat15)
    meta["fixtures_cat_a15"]["names"] = cats
    county_idx = np.full((a15.ny, a15.nx), -1, dtype=np.int8)
    for i, f in enumerate(COUNTY_FIPS):
        county_idx[ctx["county15"][f]] = i
    (OUT / "county_a15.bin").write_bytes(county_idx.tobytes())
    meta["county_a15"] = {"file": "county_a15.bin", "values": list(COUNTY_FIPS), "shape": [a15.ny, a15.nx]}
    venues = []
    for v in ctx["sports"]:
        r, c = a15.index(v["lon"], v["lat"])
        if r < 0 or county_idx[r, c] < 0:
            continue  # only venues inside the eight model counties are modeled stocks
        venues.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [v["lon"], v["lat"]]},
                       "properties": {"kind": v["kind"], "sport": v["sport"], "lit": v["lit"] or "untagged",
                                      "p_lit": v["p_lit"], "fixtures": round(v["fixtures"], 1), "name": v.get("name"),
                                      "county": COUNTY_FIPS[county_idx[r, c]]}})
    (OUT / "sports_venues.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": venues}, separators=(",", ":")))

    viirs_meta = None
    if viirs_on:
        arr, tr = viirs_mode.trend_layers(stack15)
        meta["viirs_a15"] = write_log16(OUT / "viirs_a15.bin", list(arr))
        meta["viirs_trend_a15"] = write_lin16(OUT / "viirs_trend_a15.bin", [tr["pct_change"], tr["step_year"].astype(float), tr["step_pct"]])
        meta["viirs_trend_a15"]["names"] = ["pct_change", "step_year", "step_pct"]
        viirs_meta = {"years": viirs_mode.YEARS, "county_pct_change": {
            f: float((arr[-3:].mean(0)[ctx["county15"][f]].sum() / max(arr[:3].mean(0)[ctx["county15"][f]].sum(), 1e-9) - 1) * 100)
            for f in COUNTY_FIPS}}

    # ---- Module B
    mcda_meta, mcda_extra = build_module_b(rg, ctx, seed, L_region, L_region_2034, r_rg, cov)
    meta.update(mcda_meta)

    # ---- vector layers
    n_surveyed = export_vectors(ctx, a15, rg, mcda_extra)

    # ---- inventory report (A-02 inputs)
    inv = inventory_report(stocks, n_surveyed)

    engine_json = {
        "version": "2.0.0",
        "built": __import__("datetime").date.today().isoformat(),
        "mode": "viirs" if viirs_on else "seed",
        "data_status": data_status(viirs_on),
        "grids": {"a15": a15.to_dict(), "a30": a30.to_dict(), "region": rg.to_dict(), "b": mcda_extra["grid"]},
        "files": meta,
        "physics": {
            "kernel_fits": {t: {"coeffs": fits[t].coeffs, "d_min_km": fits[t].d_min_km, "d_max_km": fits[t].d_max_km,
                                "max_rel_error": fits[t].max_rel_error} for t in TERMS},
            "kernel_profile": kernel_profile(fits, atms),
            "atmospheres": [{"turbidity": a.turbidity, "hg_g": a.hg_g} for a in atms],
            "band_scatter_ratios": {t: scatter[t].tolist() for t in TERMS},
            "spectral_factors": factors,
            "ulor": ulor, "albedo": alb, "L_nat": L_nat,
        },
        "anchor": anchor,
        "public_rates": ctx["public_rates"],
        "osm_roads": {"segments": ctx["osm_road_segments"], "lit_yes": ctx["osm_lit_segments"]},
        "sanity": {"globe_at_night": gan_summary},
        "land": mcda_extra["land"],
        "viirs": viirs_meta,
        "growth_model": growth_meta,
        "components": [{k: v for k, v in c.items()} for c in comp_list],
        "sites": site_rows,
        "overlay_sites": site_ids,
        "light_domes": region["light_domes"],
        "inventory": inv,
        "trend_seed": {f: load_county(f).get("trend_seed") for f in COUNTY_FIPS},
        "ordinance_seed": {f: load_county(f).get("ordinance_seed") for f in COUNTY_FIPS},
        "county_names": {f: load_county(f)["name"] for f in COUNTY_FIPS},
        "region_county_names": {f: ctx["county_feats"][f]["properties"]["BASENAME"] for f in region["region_fips"]},
        "seed": seed_for_client(seed),
    }
    (OUT / "engine.json").write_text(json.dumps(engine_json, separators=(",", ":"), default=_json_default))
    print("wrote", OUT)


def kernel_profile(fits, atms):
    d = np.geomspace(0.1, 100, 40)
    num = {t: np.mean([garstang.zenith_luminance_per_lm(d * 1000, a, t) for a in atms], axis=0) for t in TERMS}
    return {"d_km": d.tolist(), **{f"{t}_numeric": num[t].tolist() for t in TERMS},
            **{f"{t}_fit": fits[t](d).tolist() for t in TERMS}}


# ---------------------------------------------------------------- Module B

def region_covariates(rg, ctx):
    """Open covariates on the region grid, shared by Module B and the VIIRS growth model."""
    dem = landscape.dem_3dep(rg.bounds(), rg.nx, rg.ny)
    water = ~np.isfinite(dem)
    cores = [f for f in ctx["places"] if (f["properties"]["POP100"] or 0) >= load_seed()["mcda"]["urban_core_min_population"]["value"]]
    cons = landscape.conservation_lands(rg.bounds())["features"]
    cons_mask = R.polygon_mask(rg, [f["geometry"] for f in cons if f.get("geometry")])
    return {
        "d_road_km": distance_transform_km(rg, R.line_length_km(rg, ctx["roads"]) > 0),
        "d_urban_km": distance_transform_km(rg, R.polygon_mask(rg, [f["geometry"] for f in cores])),
        "hu_density": ctx["hu30"] / rg.cell_area_km2,
        "elevation": np.where(water, 0.0, dem),
        "conservation": cons_mask.astype(float),
        "water": water, "dem": dem, "valid": ~water,
    }


def build_module_b(rg, ctx, seed, L_region, L_region_2034, r_rg, cov):
    region = ctx["region"]
    mc = seed["mcda"]
    feats = [ctx["county_feats"][f] for f in region["region_fips"]]
    in_region = R.polygon_mask(rg, [f["geometry"] for f in feats])
    rows = np.where(in_region.any(axis=1))[0]
    cols = np.where(in_region.any(axis=0))[0]
    r0, r1, c0, c1 = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
    bgrid = Grid(rg.west + c0 * rg.res, rg.north - r1 * rg.res, rg.res, c1 - c0, r1 - r0)
    w = lambda a: a[r0:r1, c0:c1]

    dem, water = cov["dem"], cov["water"]
    sky_mag = bortle.total_mag(L_region, p(seed, "natural_zenith_mag"))
    mag_2034 = bortle.total_mag(L_region_2034, p(seed, "natural_zenith_mag"))
    growth_pct = (np.exp(10 * r_rg) - 1) * 100

    # Distance to urban cores (places >= 10,000 people), km.
    d_urban = cov["d_urban_km"]

    # Photometric-night fraction seed: 0.50 at the coast rising linearly to 0.55 at >= 30 km inland (6.6 seed).
    pn = mc["anchors"]["photometric_nights_seed"]
    d_coast = distance_transform_km(rg, water)
    clarity = pn["coastal"] + (pn["inland"] - pn["coastal"]) * np.clip(d_coast / 30.0, 0, 1)

    # Horizon obstruction: max terrain elevation angle within 10 km over 16 azimuths.
    demf = np.where(water, 0.0, dem)
    horizon = np.zeros_like(demf)
    for az in np.linspace(0, 2 * np.pi, 16, endpoint=False):
        for dist_km in (1, 2, 3, 5, 7, 10):
            dy = -np.cos(az) * dist_km / rg.dy_km
            dx = np.sin(az) * dist_km / rg.dx_km
            shifted = ndimage.shift(demf, (dy, dx), order=1, mode="nearest")
            ang = np.degrees(np.arctan((shifted - demf) / (dist_km * 1000)))
            horizon = np.maximum(horizon, ang)

    d_road, cons_mask, hu_density = cov["d_road_km"], cov["conservation"] > 0, cov["hu_density"]
    county_lab, county_vals = R.label_raster(rg, feats, "GEOID")
    land_layers, big_parcels, land_meta = land.build(rg, region, mc, county_lab, county_vals)
    # Land class (PRD 6.6): area-weighted DOR parcel classes where parcels >= 5 acres exist; FNAI conservation land
    # scores public; cells with no large parcels fall back to the housing-density proxy (docs/adr/0004).
    cls = mc["anchors"]["land_classes"]
    proxy = np.where(hu_density > 50, cls["residential_pud"], cls["agricultural"])
    land_score = np.where(np.isfinite(land_layers["land_score"]), land_layers["land_score"], proxy)
    land_score = np.where(cons_mask, cls["public_conservation"], land_score)

    raw = {"sky": sky_mag, "sprawl": growth_pct, "clarity": clarity, "urban": d_urban,
           "land": land_score, "elevation": np.where(water, np.nan, dem), "horizon": horizon,
           "access": d_road, "mag_2034": mag_2034,
           **{k: v for k, v in land_layers.items() if k != "land_score"}}
    order = list(raw)
    valid = w(in_region & ~water)
    layers = [np.where(valid, w(raw[k]), np.nan) for k in order]
    meta = {"mcda_b": write_lin16(OUT / "mcda_b.bin", layers)}
    meta["mcda_b"]["names"] = order
    lab = np.where(valid, w(county_lab), -1)
    meta["mcda_b_county"] = {"file": "mcda_b_county.bin", "values": county_vals, "shape": list(lab.shape)}
    (OUT / "mcda_b_county.bin").write_bytes(lab.astype(np.int8).tobytes())
    (OUT / "land_parcels.json").write_text(json.dumps(big_parcels, separators=(",", ":")))
    return meta, {"grid": bgrid.to_dict(), "land": {**land_meta, "parcels_file": "land_parcels.json"}}


# ---------------------------------------------------------------- vectors, inventory, status

def _simplify_fc(features, tol, props):
    from shapely.geometry import mapping, shape
    out = []
    for f in features:
        if not f.get("geometry"):
            continue
        g = shape(f["geometry"]).simplify(tol, preserve_topology=True)
        if g.is_empty:
            continue
        out.append({"type": "Feature", "properties": {k: f["properties"].get(k) for k in props},
                    "geometry": json.loads(json.dumps(mapping(g), default=float), parse_float=lambda x: round(float(x), 4))})
    return {"type": "FeatureCollection", "features": out}


def export_vectors(ctx, a15, rg, extra):
    cf = ctx["county_feats"]
    counties = _simplify_fc([cf[f] for f in sorted(set(COUNTY_FIPS) | set(ctx["region"]["region_fips"]))], 0.002,
                            ["GEOID", "BASENAME"])
    (OUT / "counties.geojson").write_text(json.dumps(counties, separators=(",", ":")))
    towns = [f for f in ctx["places"] if f["properties"]["STATE"] == "12" and f["properties"]["kind"] == "incorporated"
             and a15.west <= float(f["properties"]["INTPTLON"]) <= a15.east
             and a15.south <= float(f["properties"]["INTPTLAT"]) <= a15.north]
    pts = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": f["properties"]["BASENAME"], "pop": f["properties"]["POP100"]},
         "geometry": {"type": "Point", "coordinates": [round(float(f["properties"]["INTPTLON"]), 4),
                                                       round(float(f["properties"]["INTPTLAT"]), 4)]}} for f in towns]}
    (OUT / "towns.geojson").write_text(json.dumps(pts, separators=(",", ":")))
    # Surveyed fixtures (Socrata + OSM), deduplicated at 5 m.
    recs = list(ctx["socrata"]) + list(inventory.osm_street_lamps(a15.bounds()))
    kept, merged = inventory.dedup(recs)
    feats = [{"type": "Feature", "properties": {k: r.get(k) for k in ("source", "owner", "spd_class", "pole_height_m",
                                                                         "install_year", "confidence")},
              "geometry": {"type": "Point", "coordinates": [round(r["lon"], 5), round(r["lat"], 5)]}} for r in kept]
    (OUT / "fixtures_surveyed.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats,
                                                                "dedup_merged": merged}, separators=(",", ":")))
    return len(kept)


def inventory_report(stocks, n_surveyed):
    ing = json.loads((RAW / "ingest_report.json").read_text()) if (RAW / "ingest_report.json").exists() else {}
    by = {}
    for s in stocks:
        k = f"{s['county']}|{s['group']}"
        d = by.setdefault(k, {"county": s["county"], "group": s["group"], "n": 0.0, "conf_x_n": 0.0})
        d["n"] += s["n"]
        d["conf_x_n"] += s["n"] * s["confidence"]
    rows = [{**d, "confidence": d["conf_x_n"] / d["n"]} for d in by.values()]
    return {"by_group": rows, "ingest_report": ing,
            "surveyed_points": n_surveyed}


def data_status(viirs_on):
    fd = json.loads((RAW / "inv_fdot_rci341.json").read_text())
    cw = json.loads((RAW / "inv_cityworks.json").read_text())
    return {
        "viirs": {"loaded": viirs_on,
                  "note": "VNP46A2 annual medians need Earth Engine credentials: run `earthengine authenticate`, then "
                          "`python -m pipeline.ingest_all --viirs --ee-project <project>` and rebuild."},
        "fdot_rci341": {"status": fd["status"]},
        "cityworks": {"loaded": bool(cw["records"]), "error": cw["error"]},
        "calibration": {"sqm_stations": 0, "rmse_mag": None, "tier2": None},
    }


def seed_for_client(seed):
    return {"engine": {k: v["value"] for k, v in seed["engine"]["params"].items()},
            "engine_provenance": {k: v.get("provenance") for k, v in seed["engine"]["params"].items()},
            "econ": seed["econ"], "spd": seed["spd"], "bortle": seed["bortle"], "certification": seed["certification"],
            "mcda": seed["mcda"], "overlay": seed["overlay"], "presets": seed["presets"], "catalog": seed["catalog"]}


def _json_default(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


if __name__ == "__main__":
    main()
