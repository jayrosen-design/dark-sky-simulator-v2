"""Grants.gov public API (no key; federal opportunity listings are public domain): search opportunities and fetch
each one's synopsis or forecast (award ceiling and floor, estimated funding, deadline, eligible applicants)."""
from __future__ import annotations

import time

from .common import cached_json, http

API = "https://api.grants.gov/v1/api"


def search(*, agencies: str = "", categories: str = "", statuses: str = "forecasted|posted", refresh=False):
    """Opportunity hits for '|'-joined agency codes and/or funding categories: {"hits": [...]}."""
    def fetch():
        hits, start = [], 0
        while True:
            res = http("POST", f"{API}/search2", json_body={"agencies": agencies, "fundingCategories": categories,
                                                            "oppStatuses": statuses, "rows": 100, "startRecordNum": start})["data"]
            hits += res.get("oppHits", [])
            start += 100
            if start >= res.get("hitCount", 0):
                break
        return {"hits": hits}
    tag = "_".join(x for x in (agencies, categories, statuses) if x).replace("|", "-")
    return cached_json(f"grantsgov_search_{tag}.json", fetch, refresh)


def opportunity(opp_id: str, refresh=False):
    """The full record of one opportunity (synopsis for posted, forecast for forecasted)."""
    def fetch():
        time.sleep(0.3)
        return http("POST", f"{API}/fetchOpportunity", json_body={"opportunityId": int(opp_id)})["data"]
    return cached_json(f"grantsgov_opp_{opp_id}.json", fetch, refresh)
