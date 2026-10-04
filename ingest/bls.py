"""Consumer Price Index from the BLS public API v1 (no key; 25 queries a day, 10 years per query)."""
from __future__ import annotations

import datetime as dt

import requests

from .common import USER_AGENT, cached_json

BLS_V1 = "https://api.bls.gov/publicAPI/v1/timeseries/data/"


def cpi_u(series="CUUR0000SA0", start_year=1989, refresh=False):
    """Monthly CPI-U (U.S. city average, all items, not seasonally adjusted): {"series", "monthly": [["YYYY-MM", value]], "fetched"}."""
    def fetch():
        this_year, out = dt.date.today().year, {}
        for y0 in range(start_year, this_year + 1, 10):
            r = requests.post(BLS_V1, json={"seriesid": [series], "startyear": str(y0), "endyear": str(min(y0 + 9, this_year))},
                              headers={"User-Agent": USER_AGENT}, timeout=120)
            r.raise_for_status()
            j = r.json()
            if j.get("status") != "REQUEST_SUCCEEDED":
                raise RuntimeError(f"BLS {series} from {y0}: {j.get('message')}")
            for d in j["Results"]["series"][0]["data"]:
                if d["period"].startswith("M") and d["period"] != "M13":
                    try:
                        out[f'{d["year"]}-{d["period"][1:]}'] = float(d["value"])
                    except ValueError:  # BLS marks months it did not publish with "-"
                        pass
        return {"series": series, "monthly": sorted(out.items()), "fetched": dt.date.today().isoformat()}
    return cached_json(f"bls_{series}_{start_year}.json", fetch, refresh)
