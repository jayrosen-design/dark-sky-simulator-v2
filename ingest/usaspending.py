"""USAspending.gov award search (public API, no key; federal spending data is public domain): prime assistance
awards (grants and cooperative agreements) by awarding agency, with recipient location and amount."""
from __future__ import annotations

import time

from .common import cached_json, http

SEARCH = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
GRANT_TYPES = ["02", "03", "04", "05"]          # block, formula, project grants and cooperative agreements
CAP = 10000                                     # the search API's paging limit
FIELDS = ["Award ID", "Recipient Name", "Award Amount", "Description", "Start Date", "End Date", "CFDA Number",
          "Recipient Location", "generated_internal_id"]


def assistance_awards(agency: str, start: str, end: str, refresh=False):
    """Every grant from the agency (toptier name) with an action between start and end (ISO dates):
    {"agency", "start", "end", "rows": [result, ...]}, each award once. The search stops paging at 10,000 records, so
    it runs one federal fiscal year (Oct-Sep) at a time and fails loudly if a year reaches the cap."""
    def one(lo: str, hi: str):
        rows, page = [], 1
        while True:
            body = {"filters": {"agencies": [{"type": "awarding", "tier": "toptier", "name": agency}], "award_type_codes": GRANT_TYPES,
                                "time_period": [{"start_date": lo, "end_date": hi}]},
                    "fields": FIELDS, "page": page, "limit": 100, "sort": "Award ID", "order": "asc"}
            res = http("POST", SEARCH, json_body=body)
            rows += res.get("results", [])
            if not res.get("page_metadata", {}).get("hasNext"):
                break
            page += 1
            time.sleep(0.3)
        if len(rows) >= CAP:
            raise RuntimeError(f"{agency} {lo}..{hi}: {len(rows)} awards reached the API's {CAP}-record cap; split the period further")
        return rows

    def fetch():
        seen, rows = set(), []
        y0, y1 = int(start[:4]) + (start[5:7] >= "10"), int(end[:4]) + (end[5:7] >= "10")      # fiscal years
        for fy in range(y0, y1 + 1):
            lo, hi = max(start, f"{fy - 1}-10-01"), min(end, f"{fy}-09-30")
            for r in one(lo, hi):
                if r["generated_internal_id"] not in seen:
                    seen.add(r["generated_internal_id"])
                    rows.append(r)
        return {"agency": agency, "start": start, "end": end, "rows": rows}
    tag = agency.lower().replace(" ", "_")
    return cached_json(f"usaspending_{tag}_{start}_{end}.json", fetch, refresh)
