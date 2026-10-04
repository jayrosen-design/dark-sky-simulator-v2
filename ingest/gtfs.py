"""Transit stops and weekday service from a GTFS feed (static zip, public)."""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import zipfile
from collections import defaultdict

from .common import cached_json, http


def _rows(z: zipfile.ZipFile, name: str):
    """CSV rows with whitespace stripped from keys and values (some feeds pad ids, e.g. RTS trips.txt service ids)."""
    with z.open(name) as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            yield {(k or "").strip(): (v or "").strip() for k, v in r.items()}


def weekday_stops(url: str, refresh=False):
    """Stops with departures on a representative weekday (the Wednesday with the most trips in the feed's calendar,
    so holiday and break weeks are skipped), by hour: {"service_date", "stops": [[stop_id, name, lon, lat, departures, [24 hourly]], ...]}."""
    def fetch():
        z = zipfile.ZipFile(io.BytesIO(http("GET", url, binary=True, timeout=240)))
        names = z.namelist()
        cal = list(_rows(z, "calendar.txt")) if "calendar.txt" in names else []
        exc = defaultdict(list)
        for r in (_rows(z, "calendar_dates.txt") if "calendar_dates.txt" in names else []):
            exc[r["date"]].append((r["service_id"], r["exception_type"]))
        trip_service = {r["trip_id"]: r["service_id"] for r in _rows(z, "trips.txt")}
        per_service = defaultdict(int)
        for s in trip_service.values():
            per_service[s] += 1
        ymd_of = lambda d: d.strftime("%Y%m%d")
        dates = sorted({c["start_date"] for c in cal} | {c["end_date"] for c in cal} | set(exc))
        d0 = dt.datetime.strptime(dates[0], "%Y%m%d").date()
        d1 = dt.datetime.strptime(dates[-1], "%Y%m%d").date()

        def active_on(d):
            ymd = ymd_of(d)
            s = {c["service_id"] for c in cal if c["wednesday"] == "1" and c["start_date"] <= ymd <= c["end_date"]}
            for sid, t in exc.get(ymd, []):
                (s.add if t == "1" else s.discard)(sid)
            return s
        day, best = None, -1
        d = d0 + dt.timedelta(days=(2 - d0.weekday()) % 7)
        while d <= d1:
            n = sum(per_service[s] for s in active_on(d))
            if n > best:
                day, best = d, n
            d += dt.timedelta(days=7)
        active = active_on(day)
        trips = {t for t, s in trip_service.items() if s in active}
        hourly = defaultdict(lambda: [0] * 24)
        for r in _rows(z, "stop_times.txt"):
            if r["trip_id"] in trips and r.get("departure_time"):
                h = int(r["departure_time"].split(":")[0]) % 24
                hourly[r["stop_id"]][h] += 1
        stops = []
        for s in _rows(z, "stops.txt"):
            hrs = hourly.get(s["stop_id"])
            if hrs:
                stops.append([s["stop_id"], s.get("stop_name", ""), round(float(s["stop_lon"]), 5), round(float(s["stop_lat"]), 5), sum(hrs), hrs])
        return {"url": url, "service_date": day.isoformat(), "stops": stops}
    return cached_json(f"gtfs_{hashlib.sha1(url.encode()).hexdigest()[:10]}.json", fetch, refresh)
