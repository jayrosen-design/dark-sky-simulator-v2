"""American Community Survey 5-year estimates through Census Reporter's public API (no key; the Census Bureau's own
data API now requires one)."""
from __future__ import annotations

from .common import cached_json, http

CENSUS_REPORTER = "https://api.censusreporter.org/1.0/data/show/latest"


def median_household_income(county_geoid="05000US12001", refresh=False):
    """B19013 median household income for every block group in a county and for the county:
    {"release", "county": [estimate, moe], "rows": {block-group GEOID: [estimate, moe]}}."""
    def fetch():
        bg = http("GET", CENSUS_REPORTER, params={"table_ids": "B19013", "geo_ids": f"150|{county_geoid}"})
        cty = http("GET", CENSUS_REPORTER, params={"table_ids": "B19013", "geo_ids": county_geoid})
        val = lambda d: [d["B19013"]["estimate"]["B19013001"], d["B19013"]["error"]["B19013001"]]
        return {"release": bg["release"], "county": val(cty["data"][county_geoid]),
                "rows": {k.split("US", 1)[1]: val(v) for k, v in bg["data"].items()}}
    return cached_json(f"acs_b19013_{county_geoid}.json", fetch, refresh)
