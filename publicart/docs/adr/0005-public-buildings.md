# ADR 0005: Public buildings, their recorded construction, and the art money it would carry

Status: accepted · 2026-10-05 (added on request)

## Context
Calls to artists in Gainesville and Alachua County usually follow construction on public buildings (a courthouse,
fire station, police headquarters or state attorney's office). Jay asked to see those buildings outlined or marked,
with their value or the value of their latest expansion or renovation, and which artworks already stand on public land.

Available data (public GIS services that return data records, not documents):
- Alachua County publishes a parcel layer for every tax year 2000-2024 (2005 and 2019 missing) with owner, use, just
  value, building area, and for some years building value (2002-2012, 2023-2024) and year built.
- The Department of Revenue's 2025 statewide roll (Florida Geographic Information Office) has parcel centres with owner,
  use code, just and land value, the year's new-construction value, year built and building area; a polygon version
  exists. Statewide queries time out, so counties are read one at a time in OBJECTID windows.
- Gainesville's open building-permit data has no construction values and stopped in 2023.

## Decision (Jay's choices)
- **Scope:** outlines in Alachua County; parcel centres for the rest of Florida; every Gainesville registry work and
  Florida catalog work is tagged with the owner of the land it stands on.
- **Owners:** state (agencies, the state land trust, universities and state colleges), county, city (including GRU),
  school boards, federal, and special districts or authorities (library district, housing and airport authorities).
  Parcels are found by the government use codes (080-089) and owner names, then classed by owner name, with the use
  code as fallback; private owners with a government use code are left out and counted.
- **Recent construction:** in Alachua, years when a parcel's recorded building area grew by at least 1,000 sq ft and
  10% (seeded assumptions), confirmed where value records exist (within 3 years before and 2 after) by a rise in just
  value at least 10% beyond the median rise of all public parcels over the same years (else marked "area only"), and
  valued at the building's 2024 improvement value per square foot. The 2025 roll's new-construction value is shown when
  present. From 2023 the County's area field multiplies some parcels' area with no change in value (Gainesville High:
  221,526 -> 1,329,157 sq ft); such jumps are treated as artifacts. Elsewhere: the 2025 roll's new-construction value.
- **Art money:** only written rules are applied: Gainesville's Chapter 5.5 for City and GRU buildings (1%, capped by the
  code version chosen on the Policy tab) and s. 255.043, F.S., for state buildings (up to 0.5%, at most $100,000, only
  for original construction of a state building with public access; renovations and additions do not qualify). No
  Alachua County percent-for-art ordinance was found; other cities' and counties' programs are not modelled.
- **App:** a Buildings tab (class filters, search, "built or expanded since", values and construction for the map
  view, a card with the construction history, the art estimate, the artworks on the parcel and the Property
  Appraiser link), an overlay on the Collection tab, and a "Land" line on every artwork card.

## Result (built 2026-10-07)
- Alachua County: 746 public buildings (264 city, 214 district, 116 state, 87 county, 55 school board, 10 federal),
  745 with a site address from the state roll (the County layer's address is the owner's mailing address). 75 recorded
  expansions or new buildings; 28 parcels' 2023 area multiples and 16 area jumps without a value rise were set aside.
  Before 2017 the County layers record no building area for tax-exempt parcels (Gainesville High shows 0 sq ft until
  2017), so those zeros count as "not recorded", and the history is usable from 2017.
- Rest of Florida: 8,050 public buildings so far from 26 of 66 counties (the state's server is slow; the rest is still
  to fetch). Multi-part parcels repeat in the roll with identical values; one centre is kept so values are not counted
  twice.
- 127 Gainesville registry works and 783 Florida catalog works stand on public parcels.

## Consequences
- Assessed values are not construction budgets, and an area increase on a campus parcel may be a new building or an
  addition; the card says which rule would apply in each case.
- The estimates are only as good as the parcel records: exempt public property is assessed less carefully than taxable
  property, and missing years hide when exactly work happened.
- Refresh with `python -m publicart.facilities [--refresh]` (the statewide fetch takes about an hour cold).
