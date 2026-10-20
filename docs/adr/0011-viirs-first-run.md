# ADR 0011: First real VIIRS run: scale fix, airglow background, and an honest back-test

Status: accepted · 2026-10-19

## Context
Jay set up a personal Google Cloud project (`dark-sky-simulator`, Earth Engine noncommercial Community tier) and
signed in, so the VIIRS path ran on real NASA Black Marble VNP46A2 data for the first time: 13 annual medians
(2012-2024) on both grids, about 25 s per year and grid, every pixel with 180+ clear nights a year. Three problems
showed up that the synthetic test data could not reveal.

1. **Double scaling.** The catalog lists a 0.1 scale for `DNB_BRDF_Corrected_NTL`, but Earth Engine serves the band
   already scaled (double). The code multiplied again, so everything read 10x too dark. Checked at known places
   (2024 median): downtown Gainesville 73, Butler Plaza 121, Paynes Prairie 0.57 nW cm^-2 sr^-1.
2. **Airglow.** VNP46A2 keeps the airglow background, which follows the solar cycle: the darkest fifth of the region
   grid reads 0.26 nW in 2012, 0.10 in 2020 and 0.33 in 2023. Uncorrected, unlit forests and wetlands "brighten"
   70-120% from 2020 to 2023, and the background alone is 11-15% of each grid's 2024 total, which radiance-based
   placement would spread over unlit land.
3. **The growth back-test flattered the model.** It fit 2012-2018 growth on 2018 radiance (the end of the window),
   applied the same in-sample predictions to 2018-2024, and compared only with each cell's own trend carried
   forward. Lit-area radiance fell 3.7% over 2012-2018 and rose 20.6% over 2018-2024; plain "no change" scored as
   well as the model.

## Decision
- Drop the extra 0.1 multiplication (`ingest/viirs_gee.py`).
- Subtract a per-year background from each grid before any use: the median radiance of the grid's darkest fifth
  of pixels (by 2012-2024 median), clipped at zero (`pipeline/viirs_mode.background`). The offsets are written to
  `engine.json` (`viirs.background_nw`).
- Cross-check against an independent product: NOAA EOG monthly VIIRS composites (one processing version,
  2014-2025) show the same rise in lit areas after 2021 once the same background is removed (2021 -> 2024: rural
  +15%, suburban +13%, urban +13%; Black Marble +16%, +12%, +9%). Both use the same sensor, so a sensor-level change
  cannot be ruled out without NOAA-20 data.
- Back-test as a forecast: fit each cell's 2012 state -> 2012-2018 growth, apply to the 2018 state, score 2024
  against no change and against trend persistence; report the correlation of predicted and observed 2018-2024
  growth and a spatial-block CV R^2. The forecasting model is refit on 2018 state -> 2018-2024 growth and assumes
  that pace continues. A test (`test_backtest_cannot_see_the_held_out_years`) fails if the hold-out leaks.
- Trend map: only cells lit at either end (> 1 nW); dimmer cells swing +-50% from noise.

## Result (build of 2026-10-19)
- Back-test over 30,689 lit region cells: median error 21.2% for LightGBM and 21.2% for no change (25.4% for trend
  persistence); log RMSE 0.449 vs 0.467; predicted vs observed growth correlation 0.35; spatial-block CV R^2 0.18.
  The model adds a modest signal about where growth concentrates, none about how much.
- Sanity checks: the fit to the ten corpus sites improved (RMSE 0.52 -> 0.46 mag); the independent Globe at Night
  SQM residual did not (+0.48 -> +0.52 mag median, spread 0.45 both times).
- Measured change, first vs last three years: Alachua +3.0%, Levy +17.4% (+11.4% counting only cells lit
  throughout). The corpus figure for Alachua, +19% for 2012-2024 [AC-EPAC], is not reproduced by this product;
  the About panel shows both.
- Headline sites move by at most 0.03 mag and costs are unchanged; Rosemary Hill reads 21.69 (21.66 before), which
  is Bortle 3 by 0.002 mag (the PRD rates it Bortle 4). The Observatory ranking moves west: the old top two were in
  Levy near Chiefland (score 0.850); the top three are now in Lafayette (0.879, 92% state land), Dixie (0.877, 93%
  water-management-district land) and Levy (0.867).
- The step-change detector flags about two thirds of lit pixels because a steady trend also produces a large
  before/after difference; it needs a step-versus-trend test before its output is presented as retrofit detection.
  Spot checks are plausible: Celebration Pointe +315% (2017), Butler Plaza +76% (2016), Chiefland -28% and
  Archer -27% (2015).

## Consequences
- The package now runs in VIIRS mode; the seed-mode path stays for machines without the cache.
- Refresh with `python -m pipeline.ingest_all --viirs --ee-project dark-sky-simulator` (add `--refresh` to re-pull)
  and `python -m pipeline.build`. A full pull takes about 12 minutes and a small share of the Community tier's
  150 EECU-hours a month.
