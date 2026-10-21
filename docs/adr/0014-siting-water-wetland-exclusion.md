# ADR 0014: Keep observatory candidates off water, wetland and flood-prone ground, within reach of campus

Status: accepted · 2026-10-20 (amended the same day: flooding, floodplain and drive time)

## Context
The Observatory tab's top 20 sites (Module B) clustered on the Big Bend coast of Dixie, Lafayette and Levy counties.
Plotted with readable markers, most sat in rivers, marsh or at the shoreline. Module B only removed cells where the
USGS 3DEP elevation had no data (open Gulf water); coastal marsh, swamp and partly flooded cells counted as buildable,
and the land criterion scores public conservation land (much of it wetland preserve) highest. NLCD 2021 land cover
confirmed it: 13 of the 20 candidates were more than half wetland (for example #4 near Cedar Key, 100%; #8, 98%;
#16, 91%).

A first fix (land cover and a coastal strip, below) still left a candidate near the mouth of the Suwannee River at
1.7 m above sea level, where Hurricane Idalia's 2023 surge reached 6 to 9 ft above ground, and the highest scores were
remote Lafayette and Dixie sites about 58 miles from campus. The request: account for coastal and swamp flooding over
the next 30 years, and keep the site within reach of UF.

## Decision
A cell is dropped from the siting layers when any rule below applies (`seed/mcda_defaults.yaml` → `exclusions`).
Dropped cells are blank on the suitability map and can't form candidate sites. The Observatory panel states every rule
and how many cells they removed; `engine.json` also records the count per rule (`files.mcda_b.excluded.by_rule`).

1. **Open water or wetland** (more than 50% of the cell). New connector `ingest/landcover_gee.py`: the share of each
   ~1 km region-grid cell that is NLCD 2021 open water (11) or wetland (90 woody, 95 emergent herbaceous), averaged from
   30 m with Earth Engine `reduceResolution` and pulled in 64 × 64-cell tiles (one request over the whole grid exceeds
   Earth Engine's reprojection limit). NLCD has no data over the open Gulf, so the share of a cell outside its coverage
   counts as water. Cached as `data_raw/nlcd2021_408x336.npz`.
2. **Coastal strip** (within 5 km of the Gulf). The Gulf is the open water (3DEP no-data, or more than half NLCD water)
   connected to the grid edge, so inland lakes get no buffer.
3. **Storm-surge ground** (3DEP elevation below 5 m). Idalia's surge reached 8 to 12 ft above ground from Keaton Beach
   to Steinhatchee and 6 to 9 ft from there to the Suwannee River (NHC Tropical Cyclone Report AL102023); NOAA's 2022
   sea-level report projects 14 to 18 inches of rise on the Gulf coast by 2050. 5 m (16 ft) covers the 12 ft peak plus
   that rise with about a meter of margin.
4. **Projected flooding** (WRI Aqueduct Floods V2, the 100-year event in **2080** under RCP8.5, past the 30-year window
   and conservative for a facility meant to last decades; Rosemary Hill has operated since 1967): any coastal flood
   depth (sea-level rise, surge and subsidence), or river flooding deeper than 0.3 m (mean of five climate models).
   New connector `ingest/flood_gee.py`; Aqueduct is published on the same 30-arcsecond grid, so one Earth Engine
   request fills it. Cached as `data_raw/aqueduct2080_408x336.npz`. Aqueduct is a global model on a coarse terrain
   model, so here it flags few cells beyond rules 1–3; it backs them up rather than replacing them.
5. **Mapped floodplain** (more than 50% of the cell inside FEMA's 1%-annual-chance floodplain: the National Flood
   Hazard Layer's Special Flood Hazard Areas, zones A, AE, AH, AO and VE). This is where swamps and low flatwoods flood
   from rain, which a river model misses. New connector `ingest/fema_nfhl.py`: FEMA's map service only draws the layer
   at 1:36,111 or finer, so each 0.25° tile is rendered at 4 pixels per cell with a low dpi (about 1:25,000) and the
   PNG's alpha decoded with zlib (no imaging dependency). FEMA's server takes minutes per tile, so tiles are fetched one
   at a time and only where cells pass rules 1–4 and 6; the build reports the share of those cells with FEMA data
   (`fema_coverage`). FEMA maps today's floodplain, not 2080's: rules 3 and 4 carry the projection.
6. **Too far from campus** (more than about 90 minutes' drive). New `pipeline/travel.py`: a cost-distance over the
   region grid's 8-neighbor graph from UF's campus, at 90 km/h on cells crossed by a TIGER primary road, 70 km/h on a
   secondary road and 40 km/h elsewhere on land; open water can't be crossed. It gives about 40 minutes to Rosemary
   Hill, 52 to Chiefland, 43 to Ocala and 53 to Lake City.

Drive time is also a new criterion, **"Drive time from UF"** (default weight 0.15, renormalized with the PRD 6.6
weights; score 1 within 45 minutes, 0 at 90), so among good skies the ranking prefers sites astronomers can reach for a
night's work. Its weight is editable like the others; setting it to 0 restores the PRD weights.

The land cover, flood and floodplain rules apply only when their caches exist, so a build without them keeps the
earlier behavior. `pipeline.ingest_all --viirs --ee-project <project>` pulls the two Earth Engine layers;
`python -m ingest.fema_nfhl` fetches the FEMA tiles for all land cells of the Module B counties.

## Consequences
- 20,728 of 27,072 land cells in the 11 counties are excluded. Per rule (they overlap): floodplain 13,498, too far
  9,433, wetland 8,356, below 5 m 4,881, coastal strip 3,471, projected flood 155. FEMA data covers 100% of the cells
  the other rules leave (31 tiles).
- The floodplain rule mattered most. With the other rules alone, the new top three (west of Bronson) were 94 to 100%
  inside FEMA's floodplain; with a 50% cutoff, #1 sat at Manatee Springs on the Suwannee River (5.0 m, 44% floodplain).
  The cutoff is therefore 25%, stricter than the wetland rule.
- The new top 20 lie in Levy, Gilchrist, Alachua, Dixie, Union and Lafayette counties, 26 to 70 minutes from campus,
  at least 5.8 m above sea level, at most 16% wetland and 19% floodplain, with no projected coastal flooding. #1
  (Levy, beside the Chiefland Astronomy Village) scores 0.779, 21.89 mag/arcsec² today and 21.86 in 2034, 58 minutes
  away, about $605K for 80 acres; #2 and #3, between Chiefland and Bronson, are 47 and 44 minutes away. Rosemary Hill
  itself is 40 minutes away and 6% floodplain.
- Aqueduct removes few cells beyond the elevation and floodplain rules; its value is the explicit 2080 projection.

- The thresholds (50%, 5 km, 5 m, 0.3 m, 90 minutes) and the travel speeds are design choices, not surveyed criteria.
  Drive times are an approximation for ranking, not routing (no local road network, traffic or turn costs).
- A site visit, the parcel's FEMA flood map panel and a wetland delineation still decide buildability.
- The VIIRS growth model is unchanged (it doesn't use these masks).
