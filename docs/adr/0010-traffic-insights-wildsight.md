# ADR 0010: Traffic Insights (WildSight roadside AI wildlife detection)

Status: accepted (v2.0) · 2026-09-27

## Context
WildSight (github.com/jayrosen-design/wildsight, UF Engineering Innovation Team 7) is a solar roadside unit that
wakes on motion (PIR, 15-20 m), identifies the animal on-device, flashes an amber beacon to drivers and plays a
species-tuned tone, with a planned LoRa corridor mesh and solar gateways. The request: a tab that recreates its
roadside-safety simulations on this map range and estimates how many units and networks a scaled-out service needs
and what it costs.

## Decision
- **Data (pipeline/wildsight.py, ingest/traffic.py):**
  - Roads: OpenStreetMap motorway to unclassified in the eight model counties, split into ~1 km segments
    (15,747 segments, 8,555 km) with class, name/ref, maxspeed and lanes (class defaults where untagged).
  - Traffic: FDOT 2025 AADT sections within 40 m (73% of segment-km); class defaults elsewhere.
  - Habitat: FNAI conservation land within 300 m and housing density from the nearest 2020 block group.
  - Crashes: UF Center for Landscape Conservation Planning's species-coded Signal Four animal-crash reports
    2014-2024 (6,917 in the eight counties; 6,399 within 100 m of a modeled segment) and UF's Gi* hotspots for FDOT.
- **Risk model:** negative-binomial (NB2) safety performance function, offset ln(km x years), covariates ln AADT and
  its square (risk peaks near 6,700 vehicles/day), habitat, speed and two-lane; Empirical Bayes blend with each
  segment's record (HSM). Back-test: fit on 2014-2019, rank, score on 2020-2024: the riskiest 10% of miles carry
  28% of test crashes (random 10%, model alone 21%, observed record alone 28%); top 20%: 47% vs 44% for the record.
- **Deployment sizing (web/src/engine/wildsight.ts):** riskiest-miles, UF-hotspot or all-candidate strategies,
  two-lane filter (FHWA: 89% of large-animal collisions), counties. Units = ceil(length / spacing) x sides, default
  40 m (two 17 m PIR zones) on both shoulders; gateways by greedy radio cover (every segment wholly within the LoRa
  range, default 3 km, of a gateway).
- **Costs and benefits:** every price is an editable design assumption with a range (the WildSight repo lists
  none): unit hardware and install, gateway, backhaul, cloud, maintenance, 5-year life with replacement. Benefits =
  expected reported crashes on the deployment x effectiveness (default 40%; FHWA's Swiss detection-and-warning sites
  averaged 82%) x roadside coverage share x unreported multiplier, at $10,300 per crash (Huijser et al. 2009 deer
  collision cost, CPI-adjusted). Present values at 3.1% (USDOT BCA guidance real rate), payback, break-even
  installed unit price, and a scaling table (10 to 500 miles, hotspots, all candidate roads).
- **Simulation:** a 2D recreation of the WildSight pitch site's "With WildSight / Today" run using its SIM_CONFIG
  (17 m PIR, 0.45 s wake, 0.9 s classify, 82% tone turn rate as a hypothesis, 75 m beacon slow zone to 8 m/s, 26 m vs
  5 m driver notice distance, 11 m/s collision threshold), on the selected road's speed and traffic, same animals and
  cars in both runs, optional corridor mesh; plus WildSight's beacon stopping-distance demo (1.5 s, 0.7 g, 60 m / 150 m).

## Consequences
- With WildSight's 17 m sensor the default deployment needs ~82 units per mile, and at default prices running costs
  alone exceed the reported-crash costs avoided (B/C 0.1-0.2 on the riskiest miles). The panel shows the levers:
  detection range and spacing, unit and O&M prices, effectiveness, unreported crashes.
- Reported crashes undercount collisions; crash locations are geocoded to roughly 100 m.
- WildSight's effect on animals and drivers is unproven until piloted; all benefits are planning estimates.
- The crash layer is public but its license is not stated; it is credited to UF CLCP and Signal Four Analytics.
