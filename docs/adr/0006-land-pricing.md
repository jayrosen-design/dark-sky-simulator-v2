# ADR 0006: Land and facility pricing for observatory candidates

Status: accepted (v2.0) · 2026-09-26

## Context
Choosing an observatory site also means knowing what the land would cost, how large a parcel is available, and
whether it is public land (state, federal, county, city, water management district, university) that could be
transferred or leased instead of bought. v2.0 has no funding for commercial real-estate APIs.

## Decision
- **Source:** the Florida Department of Revenue 2025 cadastral roll (PRD 7.3, DOR NAL), read from the Florida
  Geographic Information Office's statewide parcel-centroid ArcGIS service. Each parcel carries DOR land-use code,
  just (market) value, land value, land area, owner, a public-land flag, and its last two recorded sales (price,
  year, qualification code, vacant/improved). No key is needed. Only parcels ≥ 5 acres in the 11 NCFRPC counties
  are kept (`ingest/parcels.py`); the service rejects server-side filters on land area, so each county is paged by
  OBJECTID and filtered locally.
- **Historical market price:** qualified vacant-land sales, DOR code `01`, 2021–2025. Code 01 was checked
  empirically: Levy 2021+ vacant sales at code 01 sit at 1.01–1.41× just value (median 1.18), while other codes
  scatter from 0.05× to 83×. For each 30″ cell, the price is the median $/acre of the 15 nearest such sales within
  25 km, with the interquartile range; with fewer than 5 sales in range it falls back to the county median.
- **Tax-roll price:** private just value per acre in the site's cells × the county's median sale/just-value ratio.
  The DOR land-value field is the classified agricultural-use value on greenbelt land (e.g. $125/acre on a Levy
  timber parcel), so it is not used as a market proxy; just value includes any buildings.
- **Ownership:** DOR government codes 081–089 or the public-land flag make a parcel public, and the owner name then
  sets the agency type; unambiguous agency names (State of Florida/TIITF, United States, water management districts,
  University of Florida) mark land public even when coded agricultural. Generic words like "county" in a private
  owner's name do not.
- **Facilities:** the largest parcel in the site reports its improvement value (just value − land value) as the
  value of existing buildings or facilities.
- **Scoring:** a new criterion, *Land acquisition cost* (public share scores 1; private land scores log-linearly from
  $2,000/acre = 1 to $40,000/acre = 0), with default weight 0 so the PRD 6.6 Research optical profile is unchanged.
  The existing *Land availability* criterion now uses the area-weighted DOR parcel classes (public 1.0,
  agricultural/vacant 0.6, residential/commercial 0.1) instead of the housing-density stand-in.
- **Privacy:** private owner names are not exported; public owners are shown by agency name, and every parcel by its
  public parcel ID for lookup at the county property appraiser.
- **Map:** a *Land prices* toggle on the Observatory map shows market $/acre per ~1 km cell (nearest-sales median,
  green → red on a log scale from $2,000 to $40,000/acre; cells with >= 50% public parcel area in blue) and labels
  each candidate `#rank $p25-$p75` for the target acres (plus the public share when >= 50%). Labels sit above the
  dot when there is room, else beside or below; better-ranked sites place first.

## Consequences
- Estimates are tax-roll and recorded-sale based, not appraisals; sale prices are not inflation-adjusted within the
  2021–2025 window.
- Parcels are placed at their centroids, so a large parcel counts wholly in one ~1 km cell.
- Parcels under 5 acres are ignored, which understates suburban land where an observatory would not go anyway.
- Construction cost of an observatory is not estimated (no corpus value).
