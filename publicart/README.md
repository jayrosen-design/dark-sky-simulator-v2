# Public Art Policy Simulator

What modernizing Gainesville's Chapter 5.5 (Art in Public Places) would fund, protect and reach: the public art
collection on a 3D map lit by the Sun for any date and hour, the 1989 code against the Art in Public Places Trust's
discussion draft (Aug 31 2026), conservation, visibility, walk access and equity, and visitor spending. A separate app
on the same mapping and backend platform as the Dark Sky Simulator and WildSight.

Live: `/public-art/` on the same deployment. **Every figure is a planning estimate**; the draft and the staff-study
items are not law, and the app draws no legal conclusions.

## What it does
- **Collection:** 171 registry entries (not the City's official inventory): 42 hand-compiled with a source link
  each, and 129 imported from the Public Art Archive (Creative West), facts only, each linked to its record. 154
  existing and 2 planned works on the map; 4 removed and 10 off-view works listed but not drawn; 1 not located.
  Works indoors, or whose setting is not yet checked, are drawn small and get no street impressions or 3D model.
  Markers by funding source; planned works (Common Light, 2027) can be shown or hidden.
- **3D:** buildings plus procedural artworks (figure, sculpture, mural, fence, mosaic wall) in a Three.js layer lit
  by the Sun for the chosen date and time, with ground shadows; lit works keep spotlights at night. Murals snap onto
  the nearest building wall.
- **Place:** click the map to propose a work (type, scale, lighting, funding); a heatmap shows where a medium
  sculpture would be seen most.
- **Activity:** impressions by hour for the chosen date (drivers and passengers from traffic counts; people on foot or
  bike from the walking model), stops and dwell, moving people and vehicles (illustration), the City's counters.
- **Policy:** the Chapter 5.5 ledger on an illustrative 5-year capital program: 1% of the eligible construction
  budget, the $100,000 (1989) or $300,000 + CPI-U cap (draft, from FY2028, rounded to $5,000), the 15% conservation
  reserve on unrestricted money, restricted sub-accounts, and money retained for other sites.
- **Conservation:** condition of the City's works year by year (assumed decay by material, faster in North Florida)
  against the reserve.
- **Equity:** residents within half a mile of public art, citywide, in low-income block groups and in East
  Gainesville, and a ranking of places for pooled funds.
- **Economics:** visitor spending and 5% tourist-tax revenue induced by proposed works, built from stops and AEP6
  per-visitor spending; AEP6 Alachua sector figures as context.
- **Staff study (exploratory):** a voluntary Chapter 30 incentive (options A/B/C, bonuses), GRU/enterprise
  sub-accounts with a nexus checklist, City-County shared services, the local-artist target.
- **Brief:** a PDF whose figures link back to the scenario.
- Design record: [docs/adr/0001-public-art-policy-simulator.md](docs/adr/0001-public-art-policy-simulator.md).

## Where everything lives
```
publicart/                     this folder
  registry.yaml                hand-compiled artworks, a source per entry (edit to add works)
  registry_paa.yaml            works listed in the Public Art Archive (facts only, a record link per entry;
                               setting outdoor/indoor/unverified coded by hand; ADR 0002)
  cip.yaml                     illustrative 5-year capital program (FY2026-2030) with sources
  seed.yaml                    every assumption with its source or an "assumption" label
  ingest.py                    City of Gainesville ArcGIS layers (GCRA, zoning, counters), RTS feed URL
  build.py                     data package            (python -m publicart.build, ~15 s with a warm cache)
  tests/test_build.py          inputs and data-package tests
  docs/adr/                    design records
web/public-art/index.html      app page (/public-art/)
web/src/publicart/             app: App, MapView, map/ (Three.js layer, meshes), engine/ (ledger, conservation,
                               impressions, equity, economics, exploratory), panels/, state, model, test/
web/public/public-art/data/    data package (roads, cells, artworks, equity, areas, counters, transit, cpi, meta, ...)
```
Shared platform used here: `web/src/shared` (map core, terrain and buildings, astronomy, UI, share URLs, PDF writer)
and `ingest/` (ArcGIS, OSM, Census, ACS via Census Reporter, BLS CPI-U, GTFS, geocoding, FDOT traffic).

## Commands
```
python -m publicart.build                     # rebuild the data package
python -m pytest publicart/tests              # pipeline tests
cd web && npx vitest run src/publicart        # model tests
cd web && npm run dev                         # http://localhost:5173/public-art/
```

## Data sources
| Data | Use |
| --- | --- |
| Hand-compiled registry (City and County releases, news, OpenStreetMap artworks) | the collection |
| Public Art Archive, a publication of Creative West (publicartarchive.org), imported Oct 4 2026, facts only | the collection (mostly UF's Art in State Buildings works) |
| City of Gainesville ArcGIS: GCRA boundary and priority areas, zoning (Jan 2025), bike/ped counters (2025) | equity overlays, zoning, walking-model calibration |
| OpenStreetMap (ODbL): streets, paths, rail-trails, points of interest | streets, trails, destinations |
| FDOT annual average daily traffic | vehicle volumes on state roads (class defaults elsewhere) |
| RTS GTFS, Fall 2026 (representative weekday) | bus departures near each place |
| 2020 Census blocks and block groups; ACS 2020-2024 median household income (Census Reporter) | residents, low-income block groups |
| BLS CPI-U (CUUR0000SA0) | cap indexing |
| Americans for the Arts AEP6, Alachua County (2023) | per-visitor spending; sector context |
| Visit Gainesville; Alachua County Tax Collector | room-night rate (derived), 5% tourist tax |
| Dark Sky streetlight inventory (City of Gainesville, OSM) | night visibility of unlit works |

## Caveats
- The registry is incomplete (most murals' current status is unchecked); 1 entry could not be located. Of the
  archive's works, 35 have no stated setting and are treated as indoor until someone checks them; the archive does
  not warrant its records. The capital program is illustrative, with estimated amounts marked.
- With the surtax treated as restricted (default), almost every qualifying project's allocation goes to restricted
  sub-accounts and the reserve gets little; the Policy tab has a switch for the other reading.
- The walking model is rough: trail counts are used as measured; street flows are typically about ×2.5 off at the
  off-trail counters (worst ×12).
- Conservation rates, attraction, dwell and visitor-spending factors are assumptions to replace with local data.
