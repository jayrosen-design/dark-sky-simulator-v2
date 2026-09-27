"""Step 1: pull every public source into data_raw/ (idempotent; --refresh re-downloads).

    python -m pipeline.ingest_all [--refresh] [--viirs --ee-project <gcp-project>]
"""
from __future__ import annotations

import argparse
import json

from engine.grid import Grid
from ingest import census, globe_at_night, inventory, landscape, viirs_gee
from ingest.common import cache_path

from .config import load_region


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--viirs", action="store_true", help="pull VNP46A2 annual medians from Earth Engine")
    ap.add_argument("--ee-project", default=None)
    a = ap.parse_args(argv)
    region = load_region()
    rg = Grid.from_bounds(**{k: region["grids"]["region"][k] for k in ("west", "east", "south", "north")},
                          res=region["grids"]["region"]["res_deg"])
    ag = Grid.from_bounds(**{k: region["grids"]["module_a"][k] for k in ("west", "east", "south", "north")},
                          res=region["grids"]["module_a"]["res_deg"])
    bbox = rg.bounds()
    report = {}
    report["block_groups"] = len(census.block_groups(bbox, a.refresh)["rows"])
    report["places"] = len(census.places(bbox, a.refresh)["features"])
    report["county_subdivisions"] = len(census.county_subdivisions(bbox, a.refresh)["features"])
    report["counties"] = len(census.counties(bbox, a.refresh)["features"])
    report["major_roads"] = len(census.major_roads(bbox, a.refresh)["features"])
    report["fnai_conservation_lands"] = len(landscape.conservation_lands(bbox, a.refresh)["features"])
    report["dem_3dep"] = list(landscape.dem_3dep(rg.bounds(), rg.nx, rg.ny, a.refresh).shape)
    report["socrata_gnv"] = len(inventory.socrata_gainesville(a.refresh))
    cw = inventory.cityworks_alachua(a.refresh)
    report["cityworks"] = {"records": len(cw["records"]), "error": cw["error"]}
    report["osm_street_lamps"] = len(inventory.osm_street_lamps(ag.bounds(), a.refresh))
    roads = inventory.osm_roads(ag.bounds(), refresh=a.refresh)["lines"]
    report["osm_roads"] = {"segments": len(roads), "lit_yes": sum(1 for l in roads if l[0])}
    report["globe_at_night"] = len(globe_at_night.observations(ag.bounds(), a.refresh)["rows"])
    fd = inventory.fdot_lighting_district2(a.refresh)
    report["fdot_rci341"] = {"status": fd["status"], "segments": len(fd["segments"])}
    if a.viirs:
        for g in (ag, rg):
            viirs_gee.annual_medians(g, project=a.ee_project, refresh=a.refresh)
    report["viirs_cached"] = {"module_a": viirs_gee.available(ag), "region": viirs_gee.available(rg)}
    cache_path("ingest_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
