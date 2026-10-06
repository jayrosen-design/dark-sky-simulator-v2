# ADR 0003: Arts funding index (grants and calls to artists)

Status: accepted · 2026-10-05 (added on request)

## Context
Jay asked for a grants feature in the Public Art Policy Simulator: markers on the map, a searchable database of arts
grants pulled from online sources and cached here, covering the whole United States, with dollar amounts shown for
grants and for calls to artists.

What is available:
- **Federal awards:** USAspending.gov's public API lists every NEA, NEH and IMLS grant with amount and recipient address.
  Public domain, no key.
- **Federal opportunities:** Grants.gov's public API lists open and forecast listings with award ceilings and deadlines.
  Public domain, no key. National programs, so they have no map location.
- **Florida state awards:** the Division of Arts and Culture publishes each year's awards by county as public Google
  Sheets (organization, program, amount; no addresses). Most NEA money reaches Gainesville organizations this way:
  USAspending shows only 29 direct NEA/NEH/IMLS awards in Alachua County in FY2021-2025.
- **Calls to artists:** there is no open national feed. CaFE (callforentry.org), the main US listing, is run by
  Creative West, whose terms forbid accessing its services "through any automated means"; NYFA's listings block
  automated requests.

## Decision (Jay's choices)
- **Grants:** federal awards (NEA, NEH, IMLS; FY2021-FY2025), open federal opportunities, and Florida state awards
  (the years published as sheets, 2021-22 on). Federal awards are placed at the recipient's ZIP centre from the Census Gazetteer (else its
  county or city centre), with a deterministic offset of up to 60 m so awards sharing a ZIP can each be clicked.
  Florida awards are summed at the county centre. Listings from U.S. missions abroad are left out.
- **Calls to artists:** a curated `calls.yaml`, compiled from each commissioning body's own page (government, arts
  agency, university or nonprofit), with budget, deadline, place and a source link; nothing is read from CaFE, NYFA
  or Creative West sites. The Funding tab links out to those listings for more calls.
- **Refresh on demand:** `python -m publicart.grants [--refresh]` rebuilds `data/grants.json`; raw responses are
  cached in `data_raw/`. The app shows the date the index was pulled and hides calls whose deadline has passed.
- **App:** a Funding tab, loaded on first use. Clusters of federal awards carry their dollar total; single awards,
  Florida county totals and calls carry their amounts. The panel totals what is in the map view, lists awards largest
  first (map view or all), and lists open calls and open federal grants. Fiscal years: federal Oct-Sep; Florida's
  Jul-Jun year is filed under the year it ends.

## Result (built 2026-10-05)
- 22,104 federal awards placed (NEA 12,730 / $962M; NEH 5,063 / $1.13B; IMLS 4,311 / $1.68B): 20,805 at a ZIP centre,
  1,298 at a county centre, 1 at a city centre; 46 could not be placed, 43 went to recipients outside the US, and 579
  with a zero or negative net amount were left out. USAspending's search stops at 10,000 records, so it is queried
  one fiscal year at a time (and fails loudly if a year ever reaches the cap).
- 2,558 Florida awards, $170M: 2021-22, 2022-23, 2023-24, 2025-26 and 2026-27. The Division's site lists no 2024-25
  page; 2018-19 to 2020-21 are published as web tables in two other layouts (ranked applications with scores; or
  organization, county and award with no program) and are not parsed yet. The sheets change layout by year; the parser
  handles all four and reports rows it cannot read (none). Statewide America 250 awards are shown at Tallahassee.
- 20 federal opportunities (3 from U.S. missions abroad and 1 off-topic listing filed under Arts left out).
  Grants.gov's "2099" deadline means open-ended and is shown as no deadline.
- 31 calls to artists (8 in Florida, 23 elsewhere), 29 placed on the map (2 give no city).

## Consequences
- Federal amounts are total obligations. NEA partnership awards go to state and regional arts agencies, which regrant
  much of that money, so totals that mix them with other awards can count the same dollars twice; the panel says so.
- The calls list is small and goes stale; it needs a person to keep it current. Closed calls drop out automatically.
- Foundation and corporate grants are not included: there is no open source for them (Candid's data is licensed).
