# ADR 0002: Seed-mode light sources and the global anchor

Status: accepted (v2.0) · 2026-09-26

## Context
PRD 0A.2 builds the baseline from VIIRS VNP46A2 via Google Earth Engine. No Earth Engine credentials exist on the
build machine, and PRD 6 requires every engine function to return a result before county data loads, with a
"seed values" badge.

## Decision
Until VIIRS is cached:
- Fixture counts come from the PRD 6.5 owner table (GRU 30,000; Duke 4,000; Clay 5,000; FDOT 1,500; Newberry
  1,000; City of Alachua 1,750; Levy 3,135) plus 267 Gainesville Socrata points.
- Private stock = Census 2020 housing units × 1.379 fixtures/unit (the Alachua structure blend from [GNV-ASSESS])
  at 800 lm, plus commercial flux equal to residential flux at 20,000 lm/fixture, both from [GNV-ASSESS].
- Placement (PRD 2.2 "along the served road network"): public stocks sit on expected lit road length per cell =
  OSM `lit=yes` length + other OSM road length × min(1, housing density / 500 per km²), inside or outside their
  places; FDOT follows TIGER state roads × the same density share; private residential follows housing; commercial
  follows housing in incorporated places or urban block groups.
- Six neighbors (Marion, Gilchrist, Putnam, Clay, Bradford, Union) are adjustable county packages. No public
  inventory exists for them, so public counts = 0.464 per urban + 0.148 per rural housing unit, solved from the
  Alachua (43,250) and Levy (3,135) seed counts; confidence 0.2; generic tariff. The Municipal/Utility split for
  neighbors only reflects whether a road cell falls inside an incorporated place, not real ownership.
- Beyond the eight counties, sources use Alachua's lumens per housing unit (fixed, not controllable).
- One global flux scale alpha is fitted, in magnitude space, to the ten PRD 6.5 corpus site values. It is labeled
  `is_calibration: false` everywhere.

In VIIRS mode, 2024 radiance replaces housing as the placement weight for private light; public streetlights stay
on the road network, and counts and the anchor method stay the same.

## Consequences
- RMSE 0.52 mag on the ten corpus values. Globe at Night SQM readings (53, never fitted) show a +0.48 mag median
  residual (model darker), +0.15 mag after midnight.
- Known misses: San Felasco entrance (model 1.01 mag too bright: suburban housing disks spill into the park) and
  Bronson (1.04 mag too dark).
- Tech-mix assumptions for private and most public stocks are `design_assumption` in the county manifests.
