"""Traffic volumes shared by the apps: FDOT annual average daily traffic (AADT) on state-highway sections.
Public, no key (FDOT Transportation Data and Analytics)."""
from __future__ import annotations

from .common import arcgis_query, cached_json

FDOT_AADT = "https://services1.arcgis.com/O1JpcwDW8sjYuddV/arcgis/rest/services/Annual_Average_Daily_Traffic_TDA/FeatureServer/0"


def fdot_aadt(county_names, refresh=False):
    """FDOT AADT polylines in the named counties (e.g. "Alachua"). The cache file carries no county tag, so a call
    asking for a county the cache lacks fails loudly instead of silently returning another call's subset."""
    where = "COUNTY IN (" + ",".join(f"'{c}'" for c in county_names) + ")"
    fc = cached_json("fdot_aadt.json", lambda: arcgis_query(
        FDOT_AADT, where=where, out_fields="YEAR_,ROADWAY,DESC_FRM,DESC_TO,AADT,TFCTR,COUNTY"), refresh)
    have = {f["properties"].get("COUNTY") for f in fc["features"]}
    missing = [c for c in county_names if c not in have]
    if missing:
        raise RuntimeError(f"data_raw/fdot_aadt.json has no sections for {missing}; refetch with refresh=True and every county needed")
    return fc
