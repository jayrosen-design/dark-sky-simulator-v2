# EPAC slide 5 screenshots, measured inside real boundaries and rectangles

Background and decision: [ADR 0013](../../docs/adr/0013-alachua-trend-figure.md). The app quotes the calibrated
county figures from `radiance_comparison.py`, not the screenshot numbers.

`alachua_screenshot_regions.py` refactors `first_reconstruction/alachua_screenshot_reconstruction.py` (October 2026,
kept with its output for reference). The first
reconstruction reproduced the published figures only by measuring a 212 × 131 km rectangle (Perry to the St. Johns
River, Lake City to Belleview), with a crop and threshold chosen after the published numbers were known. This version
measures the places the published figures name, both inside real boundaries (`boundaries.geojson`) and inside
rectangles: each place's bounding box and the rectangles the 2025 Dark Sky Simulator drew on its map. The boundaries:

- **Alachua County**: Census TIGER 2020 county boundary
- **Gainesville** and **City of Alachua**: 2020 city limits (Census incorporated places)
- **Paynes Prairie vicinity**: Paynes Prairie Preserve State Park (Florida Natural Areas Inventory), alone and with
  2, 5 and 10 km rings, since "vicinity" was never defined

The screenshots are Google Maps tiles (Web Mercator), so pixel x is linear in longitude and y in Mercator northing.
Both are fitted to nine town labels on the 2012 image (median residual 1.9 px, about 0.3 km; 0.17 km per pixel). The
2024 image is registered onto the 2012 image by the same integer-shift search as before (3 px left, 1 px up), and the
result is identical to the first package's registered image.

## Results (screenshot grayscale, 2012 → 2024)

| Area | Published | Measured here |
|---|---|---|
| Alachua County | +19% | **+11.4%** |
| Gainesville (city limits) | +6% | **+1.5%** |
| City of Alachua (city limits) | +10% | **+12.7%** |
| Paynes Prairie vicinity | +15% | park only +22.0%, +2 km +13.7%, +5 km +10.6%, +10 km +9.2%, +5 km outside Gainesville +16.0% |
| Lit share of the county | 16% → 21% | 26.1% → 31.8% at threshold 38; no threshold gives 16% → 21% (closest: 60 gives 19.3% → 20.9%) |
| First reconstruction's rectangle | +19%, 16% → 21% | +18.6%, 16.2% → 20.7% |

**Can any one method reproduce all four published numbers?** `--variants` scores 24 variants declared before
looking: 4 color channels (gray, max of R/G/B, mean of R/G/B, a yellowness index) × the boundary or its bounding box
× 3 statistics (mean, sum above 38, count above 38), with Paynes Prairie fixed at park + 5 km. The best has an RMS
error of 4.9 points (gray mean over bounding boxes: county +12.8%, Gainesville +7.4%, City of Alachua +10.7%,
Paynes Prairie +7.7%). None comes close on the county and Paynes Prairie at the same time. With 24 tries, even a
good match could happen by chance. See `region_results/metric_variants.csv`.

## Rectangles reproduce the published set

The original analysis may have used rectangles rather than boundaries. Rectangles reproduce all four published
numbers closely: the whole map view for the "county" figure and a bounding box around each named place (RMS error
1.0 point). Calibrated satellite radiance over the same rectangles, 2013 → 2024, is shown beside each
(`radiance_comparison.py`: Black Marble with its airglow background removed; EOG annual `average_masked`, version 2.1
for 2013 and 2.2 for 2024):

| Rectangle | Published | Screenshot gray | NOAA EOG radiance | NASA Black Marble radiance |
|---|---|---|---|---|
| Whole map view (212 × 131 km) | +19% ("county") | **+18.6%**, lit 16.2% → 20.7% | +20.5% | +12.8% |
| Alachua County, bounding box | | +12.8% | +6.6% | +2.2% |
| Gainesville, bounding box | +6% | **+7.4%** | +5.0% | +4.8% |
| City of Alachua, bounding box | +10% | **+10.7%** | −0.1% | −7.5% |
| Paynes Prairie Preserve, bounding box | +15% | **+13.8%** | +21.8% | +27.5% |
| Paynes Prairie, 2025 app rectangle (29.55–29.62 N, 82.35–82.25 W) | +15% | +16.7% | +25.2% | +5.7% |
| Gainesville Downtown, 2025 app rectangle | | −2.7% | | |
| Suburban Gainesville, 2025 app rectangle | | +3.1% | | |

The whole-map rectangle was chosen after the fact in the first reconstruction; the place boxes are plain bounding
boxes of the boundaries, not tuned. See `region_results/rectangle_stats.csv`.

## What this means

- The published set is consistent with a whole-map measurement labeled "Alachua County" plus a rectangle around each
  place. The county itself, measured on the same screenshots, gives about +11% (boundary) to +13% (bounding box), not
  +19%; the +19% and the 16% → 21% describe the region around the county, which grew faster.
- Against calibrated radiance: Gainesville's +6% holds up (+5% in both products); the Paynes Prairie area did brighten
  (by more than 15% in most measures, though the products disagree on the 2025 app's rectangle); the City of
  Alachua's +10% does not appear in radiance (−0.1% EOG, −7.5% Black Marble); and the county rose about 2–7%.
- Screenshot grayscale is a rendered color ramp with road lines and labels, not radiance. On the real county
  boundary, calibrated radiance rose **+6.1%** (EOG) and **+2.9%** (Black Marble) from 2013 to 2024.

A defensible way to state it: *"In NOAA's annual night-lights data, total radiance across the 212 × 131 km region
around Alachua County rose about 20% from 2013 to 2024; in Alachua County itself it rose about 6% (NASA's Black
Marble: about 3%), and around Gainesville about 5%."*

## Run

The slide screenshots are not in this repository: they are Google Maps views (map tiles and labels under Google's
terms) of the EOG imagery. Extract them from the January 13, 2026 EPAC presentation, "Preserving Natural Skies in
Alachua County", with `--pptx`, or pass the two PNGs:

```bash
python alachua_screenshot_regions.py --pptx "EPAC.pptx" --variants
python alachua_screenshot_regions.py --images EPAC_slide5_2012_original.png EPAC_slide5_2024_original.png --variants
```

`--pptx` needs python-pptx. Only numpy is required; Pillow reads PNGs faster, and matplotlib adds
`measured_areas.png` with the measured outlines (white county, cyan Gainesville, magenta City of Alachua, green
Paynes Prairie and its 5 km ring; git-ignored, since it shows the screenshots). Outputs go to `region_results/`:
`region_stats.csv`, `rectangle_stats.csv`, `county_threshold_sweep.csv` and, with `--variants`, `metric_variants.csv`.

The radiance comparison runs from the repository root, with the VIIRS cache and Earth Engine access:

```bash
python -m analysis.epac_reconstruction.radiance_comparison --ee-project dark-sky-simulator
```

It writes `region_results/radiance_comparison.csv`.

## Limits

- Control points are label centers read off the image; a 2 px error moves a boundary about 0.3 km.
- Boundaries are 2020 limits, simplified to 30 m (a pixel is 170 m).
- Only these two screenshots are measured. If the original analysis used other images (another zoom or crop), its
  numbers could differ.
- The rectangle match is a reconstruction, not a recovered method: the original code and crops are lost, and the
  2025 paper's text could not be read here to confirm them.
- Radiance comparisons use 2013, not 2012: Earth Engine's EOG annual collection starts in 2013.
