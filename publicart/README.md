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
- **All of Florida (Collection tab):** a statewide catalog of the 1,354 Florida works listed in the Public Art Archive
  (facts only, each linked to its record): title, artist, year, medium, work type, collection, building, city and
  county, with budgets where a commissioning body's own document states one. Search, county and collection filters,
  counts for the map view. Identification only; the models run on the Gainesville registry. ADR 0004.
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
- **Funding:** arts grants and calls to artists across the US, searchable and on the map with dollar amounts:
  22,104 NEA, NEH and IMLS awards with activity in FY2021-FY2025 (USAspending.gov, at the recipient's ZIP centre;
  clusters show their dollar total), 2,558 Florida Division of Arts and Culture awards (2021-22 to 2026-27 except 2024-25, by
  county), 20 federal grants open now (Grants.gov), and 31 curated calls to artists (budget and deadline, closed ones
  hidden). Totals follow the map view; links go to each award record, listing or call. ADR 0003.
- **Buildings:** publicly owned buildings (state, county, city, school board, federal, districts): outlined in Alachua
  County with each parcel's building-area history (usable from 2017), marked elsewhere in Florida from the 2025 state
  roll (26 of the other 66 counties loaded so far; `python -m publicart.facilities` fetches the rest).
  Shows just and building value, recorded expansions or new construction and their estimated value, the art money the
  written rules would attach (Gainesville Ch. 5.5 for City/GRU buildings; s. 255.043, F.S., for new state buildings),
  and the artworks already on each parcel. Every artwork card says who owns the land it stands on. ADR 0005.
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
  grants.py                    arts funding index      (python -m publicart.grants; ~20 min cold, seconds cached)
  calls.yaml                   curated calls to artists, a source per call (edit to add calls), and link-outs
  florida.py                   Florida catalog         (python -m publicart.florida; ~1 min cold)
  florida_budgets.yaml         artwork budgets from commissioning bodies' documents, a source per amount (none yet)
  facilities.py                public buildings        (python -m publicart.facilities; ~1 h cold for the statewide roll)
  tests/test_build.py          inputs and data-package tests
  tests/test_grants.py         funding index: parsers, curated calls, built index
  tests/test_florida.py        Florida catalog: term cleaning, budget matching, budgets file, built catalog
  tests/test_facilities.py     public buildings: owner classes, expansion detection and the 2023 area artifact, rules
  docs/adr/                    design records
web/public-art/index.html      app page (/public-art/)
web/src/publicart/             app: App, MapView, map/ (Three.js layer, meshes, grant layers), engine/ (ledger,
                               conservation, impressions, equity, economics, exploratory, grants), panels/, state,
                               funding (Funding tab store), model, test/
web/public/public-art/data/    data package (roads, cells, artworks, equity, areas, counters, transit, cpi, meta, ...)
                               and grants.json (the funding index, loaded when the Funding tab opens) and
                               florida.json (the statewide catalog, loaded when "All of Florida" is chosen) and
                               facilities.json (public buildings and land owners, loaded by the Buildings tab or overlay)
```
Shared platform used here: `web/src/shared` (map core, terrain and buildings, astronomy, UI, share URLs, PDF writer)
and `ingest/` (ArcGIS, OSM, Census and its Gazetteer, ACS via Census Reporter, BLS CPI-U, GTFS, geocoding, FDOT
traffic, USAspending.gov, Grants.gov).

## Commands
```
python -m publicart.build                     # rebuild the data package
python -m publicart.grants [--refresh]        # rebuild the funding index (--refresh refetches every source)
python -m publicart.florida [--refresh]       # rebuild the Florida catalog (--refresh refetches the archive)
python -m publicart.facilities [--refresh]    # rebuild public buildings (after florida; tags its works with land owners)
python -m pytest publicart/tests              # pipeline tests
cd web && npx vitest run src/publicart        # model tests
cd web && npm run dev                         # http://localhost:5173/public-art/
```

## Data sources
| Data | Use |
| --- | --- |
| Hand-compiled registry (City and County releases, news, OpenStreetMap artworks) | the collection |
| Public Art Archive, a publication of Creative West (publicartarchive.org), imported Oct 4 2026, facts only | the collection (mostly UF's Art in State Buildings works) |
| Public Art Archive, all Florida records, pulled Oct 5 2026, facts only | the Florida catalog |
| 2020 Census county polygons (TIGERweb) | the Florida catalog's counties |
| Commissioning bodies' documents (florida_budgets.yaml) | Florida catalog budgets |
| Alachua County parcel layers, tax years 2001-2024 (maps.alachuacounty.us) | Buildings: outlines, values, area history |
| FL Department of Revenue 2025 parcel roll, centres and outlines (Florida Geographic Information Office) | Buildings statewide; land owner under each catalog work |
| Section 255.043, Florida Statutes (Art in State Buildings) | Buildings: state art rule |
| City of Gainesville ArcGIS: GCRA boundary and priority areas, zoning (Jan 2025), bike/ped counters (2025) | equity overlays, zoning, walking-model calibration |
| OpenStreetMap (ODbL): streets, paths, rail-trails, points of interest | streets, trails, destinations |
| FDOT annual average daily traffic | vehicle volumes on state roads (class defaults elsewhere) |
| RTS GTFS, Fall 2026 (representative weekday) | bus departures near each place |
| 2020 Census blocks and block groups; ACS 2020-2024 median household income (Census Reporter) | residents, low-income block groups |
| BLS CPI-U (CUUR0000SA0) | cap indexing |
| Americans for the Arts AEP6, Alachua County (2023) | per-visitor spending; sector context |
| Visit Gainesville; Alachua County Tax Collector | room-night rate (derived), 5% tourist tax |
| Dark Sky streetlight inventory (City of Gainesville, OSM) | night visibility of unlit works |
| USAspending.gov award search: NEA, NEH, IMLS prime grants (public domain) | Funding: federal awards |
| Grants.gov opportunity listings (public domain) | Funding: federal grants open now |
| Florida Division of Arts and Culture, awards by county (published sheets) | Funding: Florida state awards |
| Census Gazetteer 2024: ZCTA, county and place centres | Funding: award and call locations |
| Curated calls to artists (commissioning bodies' own pages; calls.yaml) | Funding: calls to artists |

## Caveats
- The Florida catalog is only as complete as the Public Art Archive, which covers some programs well and others
  barely (Miami-Dade County's program has 13 records); budgets are shown only where an official document states one.
- The registry is incomplete (most murals' current status is unchecked); 1 entry could not be located. Of the
  archive's works, 35 have no stated setting and are treated as indoor until someone checks them; the archive does
  not warrant its records. The capital program is illustrative, with estimated amounts marked.
- With the surtax treated as restricted (default), almost every qualifying project's allocation goes to restricted
  sub-accounts and the reserve gets little; the Policy tab has a switch for the other reading.
- The walking model is rough: trail counts are used as measured; street flows are typically about ×2.5 off at the
  off-trail counters (worst ×12).
- Conservation rates, attraction, dwell and visitor-spending factors are assumptions to replace with local data.
