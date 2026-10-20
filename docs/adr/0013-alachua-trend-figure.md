# ADR 0013: What the County's +19% measures, and the figures the app quotes instead

Status: accepted · 2026-10-19

## Context
The January 13, 2026 EPAC presentation [AC-EPAC] reported, from 2012 and 2024 night-lights imagery: Alachua County
+19%, lit area 16% → 21%, Gainesville +6%, City of Alachua +10% and Paynes Prairie vicinity +15%. The app, the brief,
the PRD and the funding one-pager quoted the +19% as Alachua's measured countywide radiance growth. The calibrated
VIIRS series in this package measures about +3% for the county (ADR 0011), so the figure needed tracing.

The original 2025 analysis code is lost. Jay supplied the two screenshots from EPAC slide 5 and a reconstruction that
reproduced +19% and 16% → 21% with a large crop and a gray threshold chosen after the fact. The screenshots are
Google Maps views of NOAA's Earth Observation Group (EOG) annual night-lights composites (credited in the footer).

## What was measured (October 19, 2026)
The screenshots were georeferenced (Web Mercator fitted to nine town labels; median residual about 0.3 km) and
measured inside real boundaries (Census 2020 county and city limits, FNAI Paynes Prairie Preserve) and inside
rectangles. Screenshot grayscale change, 2012 → 2024:

| Area | Published | Boundary | Rectangle |
|---|---|---|---|
| Alachua County | +19% | +11.4% | +12.8% (bounding box) |
| Gainesville | +6% | +1.5% | +7.4% (bounding box) |
| City of Alachua | +10% | +12.7% | +10.7% (bounding box) |
| Paynes Prairie vicinity | +15% | +9% to +22% (park + 0–10 km) | +13.8% (bounding box) |
| Whole map view, 212 × 131 km | | | +18.6%, lit 16.2% → 20.7% |

The whole map view (Perry to the St. Johns River, Lake City to Belleview) plus a bounding box around each place
reproduces all four published numbers (RMS error 1.0 point); the county itself does not reach +19% under any of 24
pre-declared metric variants. Calibrated radiance over the same areas, 2013 → 2024 (EOG's Earth Engine collection
starts in 2013):

| Area | NOAA EOG annual (`average_masked`) | NASA Black Marble (airglow removed) |
|---|---|---|
| Whole map view | +20.5% | +12.8% |
| Alachua County (boundary) | +6.1% | +2.9% |
| Gainesville (bounding box) | +5.0% | +4.8% |
| City of Alachua (bounding box) | −0.1% | −7.5% |
| Paynes Prairie Preserve (bounding box) | +21.8% | +27.5% |

The scripts, boundaries and results are in [analysis/epac_reconstruction](../../analysis/epac_reconstruction/README.md):
`alachua_screenshot_regions.py` measures the screenshots and `radiance_comparison.py` produces the radiance table.
The slide images themselves (Google Maps views) are not in the repository.

## Decision
- The +19% and 16% → 21% are described as what they are: grayscale change across the whole screenshot map view,
  about 20% in NOAA's radiance for that region. They are not quoted as Alachua County's growth.
- The app (About panel, PDF brief) quotes calibrated county radiance, +2.9% (Black Marble) to +6.1% (EOG), and about
  +5% around Gainesville, and keeps the County's figure with its scope. The PRD, the funding one-pager, the demo
  script and the README follow.
- The seed-mode fallback growth rate (1.5%/yr, from +19% over 12 years) keeps its value; its source note now says
  what the 19% covers. It applies only to cells without Census housing data when the VIIRS cache is absent.

## Consequences
- The headline trend for Alachua becomes smaller (3–6%), and the regional figure (about 20%) carries the growth
  story: the region around Alachua is brightening faster than the county.
- Gainesville's +6% is consistent with calibrated radiance; the City of Alachua's +10% is not; the Paynes Prairie area
  did brighten, by an amount that depends on the product and the area drawn.
- This is a reconstruction, not the recovered method; if the original analysis used other images, its numbers could
  differ.
