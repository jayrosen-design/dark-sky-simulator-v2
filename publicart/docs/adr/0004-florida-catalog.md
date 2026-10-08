# ADR 0004: A statewide Florida catalog of public art

Status: accepted · 2026-10-05 (added on request)

## Context
Jay asked to expand the Public Art Policy Simulator to all of Florida, at least to identify the public artworks, with
artist, title, medium, budget and year for each, using the Public Art Archive (as for Alachua County, ADR 0002).

The archive's public search lists 1,354 Florida works, all with coordinates. Every record has a title and an artist
field; 1,308 have a year and 1,289 list materials. Coverage is uneven: Broward County Public Art & Design (283),
UF's Art in State Buildings program (182), Sarasota (105), Tampa (97), Dunedin (90) and St. Petersburg (90) are well
represented, while Miami-Dade County's Art in Public Places program has 13 records. The archive has **no budget
field**, and only 6 Florida descriptions mention a dollar amount, none of them a reliable figure for the artwork.

The Gainesville models (impressions from the street and walking network, equity by block group, conservation of the
City's works) rest on data that covers only the city, so they cannot run statewide.

## Decision
- **Catalog, not model:** the Collection tab gains a scope switch, "Gainesville registry" (the modelled registry, as
  before) and "All of Florida" (identification only). In Florida scope the map shows the catalog clustered by count,
  the registry markers, key figures and time bar are hidden, and the panel searches artist, title, medium, collection,
  city and county (whole words), filters by county, collection and stated budget, and counts what is in the map view.
- **Facts only, linked** (as ADR 0002): `publicart/florida.py` requests only fact fields from the archive (no
  descriptions or images, not even in the raw cache) and writes `data/florida.json` with title, artist, year,
  materials, work type, placement, collection, owner, building, city, county (from the coordinates and 2020 Census
  county polygons), the archive's coordinates, on/off view, and the record link.
- **Budgets from the commissioning bodies:** `publicart/florida_budgets.yaml` is where amounts found in official
  documents go (collection inventories, agenda items and minutes, press releases), each with its source and kind
  (commission, purchase, appraised value, or a project total), matched to catalog works by title and artist surname.
  Works without a match say "not published in the sources used". Nothing is estimated. The file does not exist yet:
  the first research pass bulk-downloaded city meeting minutes, one download was quarantined by Jay's antivirus, and
  the pass was stopped and its draft discarded. A later pass must read single pages, without bulk downloads.
- Refresh on demand: `python -m publicart.florida [--refresh]`.

## Consequences
- Absence from the catalog does not mean a work does not exist; the panel says which programs are thin.
- The Alachua County works appear both in the Gainesville registry (modelled, with a hand-coded indoor/outdoor
  setting) and in the catalog (as listed); the two scopes never show at once.
- This copies a larger share of the archive's Florida listings than ADR 0002 did. The same basis applies (facts,
  each cited, no descriptions or images); if Creative West objects, delete `florida.json` and stop running the script.
