# ADR 0004: Module B criteria proxies for v2.0

Status: accepted (v2.0) · 2026-09-26

| Criterion | PRD source | v2.0 input | Why |
| --- | --- | --- | --- |
| Sky brightness | Tier 1 baseline | Same model, region grid at 30″ | as specified |
| 10-yr trajectory | Sprawl model on VIIRS trend | Census housing growth 2010→2020 by county subdivision until VIIRS loads; then the LightGBM forecast | VIIRS not pulled |
| Distance to urban cores | Cost distance to places ≥ 10,000 | Euclidean distance to TIGER place polygons ≥ 10,000 people | no road-network cost surface in v2.0 |
| Atmospheric clarity | MODIS/VIIRS night cloud climatology | PRD 6.6 seed: 0.50 at the coast rising to 0.55 at ≥ 30 km inland | Earth Engine not available; MYD08_M3 is 1° anyway |
| Elevation and horizon | 3DEP, horizon ≤ 10° | 3DEP at 30″; horizon = max terrain angle within 10 km over 16 azimuths; score = 0.5 elevation + 0.5 horizon | as specified, coarse grid |
| Power and road | FDOT roads, utility maps | TIGER primary + secondary roads only | no public distribution-line map |
| Land availability | Parcels, easements, public land | Florida DOR 2025 parcels ≥ 5 acres: area-weighted class (public 1.0, agricultural/vacant 0.6, residential/commercial 0.1); FNAI conservation lands = 1.0; cells without large parcels fall back to > 50 housing units/km² = 0.1, else 0.6 | see ADR 0006 |

Access normalization: PRD 6.6 lists "access 0 → 3 km inverse", but Section 3 defines "within 3 km of both scores 1".
v2.0 follows Section 3: score 1 within 3 km, falling linearly to 0 at 15 km (the 15 km is a design choice).

Sites: the best 1% of valid cells are clustered 4-connected; clusters of ≥ 4 cells rank by mean score; the cut
relaxes (2%, 4%, 8%, 16%) until 20 sites exist.

A land acquisition cost criterion (not in PRD 6.6, default weight 0) and per-site land and facility estimates are described in ADR 0006.
