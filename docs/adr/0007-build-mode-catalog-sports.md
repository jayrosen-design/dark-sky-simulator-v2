# ADR 0007: Build mode, fixture catalog, sports lighting, viewing time

Status: accepted (v2.0) · 2026-09-26

## Context
Planners asked for a SimCity-style way to pick which lighting solution replaces existing fixtures, with a
thumbnail, a per-unit cost, how many lamps it replaces, and where they go on the map, grouped by category
(street, commercial, residential, stadium). DarkSky International's approved-luminaire search is a third-party
(Lighting Exchange) widget that lists no prices; its photos are manufacturers' copyright.

## Decision
- **Catalog** (`seed/fixture_catalog.yaml`): 17 generic fixture *types* meeting DarkSky Approved criteria
  (fully shielded or visor-controlled, ≤ 3000K), in six categories (Street lights, Decorative & pedestrian,
  Commercial & parking, Residential, Sports & stadium, Wildlife-friendly). Each card has spectrum, U-rating,
  lumens, watts and an installed unit cost with provenance: corpus (PRD 6.4) where it exists, else a 2026-09-26
  web price survey plus the corpus $200 truck-roll install allowance, else a labeled design assumption. Thumbnails
  are drawn SVGs; each card links to the official DarkSky search. Cards are not products.
- **Slots:** a card replaces one slot (street = public streetlights; commercial; residential; sports) in the
  counties selected in step 1, one-for-one, with the card's lumens and watts, at a chosen share (10–100%).
  Catalog cohorts are exempt from the step-2 shielding/CCT rules; intensity, curfew and overlays still apply.
  Public card costs go into CAPEX and payback; private card costs are reported as owner-borne.
- **Cohort-level time factors:** every fixture cohort carries its lit share of the viewing window (operating
  hours × curfew/dimming × motion sensors), its share at the VIIRS overpass, and its energy share, so cards with
  dimming, motion sensors or earlier shut-off mix correctly with the rest of a stock.
- **Sports source:** OSM stadiums, lit pitches and tracks, and untagged main-sport pitches (baseball, softball,
  football, soccer, lacrosse, tennis, pickleball, basketball) in the eight model counties. Expected fixtures =
  per-venue count (field 20, court 6, track 12, stadium 60) × lit probability (1 if lit=yes or a stadium, 0.5 if
  untagged, dropped if lit=no). 157,500 lm per fixture (3.15M lm per high-school field / 20). Mix 60% metal halide
  / 40% LED 4000K, mostly U3–U4 (design assumptions). Hours 18:00–22:30, 1,000 burn hours/yr. Confidence 0.3.
- **Viewing time:** late night (the 01:00–04:00 SQM window, default; used for Bortle, certification and the
  anchor fit) or evening (20:30–22:30, star-party time). Sports lights count only in the evening. The late-night
  15″ baseline map is scaled by the evening/late baseline ratio for evening views.
- **UI:** a bottom "Build mode" tray over the map (category buttons, horizontally scrolling card strip, loadout
  with per-slot cost and share, sky change at RHO/CAV/Paynes Prairie) and clustered install markers on the map
  (modeled fixture locations; sports at real OSM venues).

## Consequences
- Prices outside the corpus are low-confidence estimates, flagged per card.
- Install markers show *modeled* fixture positions (road network and housing), not real poles.
- One card per slot: a mixed commercial retrofit (area lights + wall packs + canopies) is approximated by one type;
  the card's light-vs-existing percentage flags large lumen changes.
- OSM under-tags lighting; the sports source is an order-of-magnitude estimate (~9,200 fixtures at ~1,230 venues).
