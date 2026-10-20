# ADR 0012: A step-versus-trend test for VIIRS change events, and an AI tab that explains the models

Status: accepted · 2026-10-19 (added on request, for the UF AI Days talk on 2026-10-27)

## Context
The first real VIIRS run ([ADR 0011](0011-viirs-first-run.md)) showed the step-change detector flagging about two
thirds of lit pixels. It took the largest Welch t between the means before and after each split year, and a steady
trend separates any two segments' means: on synthetic data it flagged all 2,000 pixels of a steady 4%/yr decline.
Jay asked for the detector to be fixed and for the app to show how its AI works.

## Decision
**Detector** (`ml/trends.py`):
- For each pixel, ln radiance is fitted with a line and with a line plus a step at each split year 2015-2022 (at
  least three years on each side). The best step's F statistic must reach the 99.9th percentile of the best-split F
  under pure noise, found by simulating 200,000 noise-only series (F ≥ 36.3 for 13 years). Choosing the best split
  inflates the plain F test, and the statistic ignores the line and the noise level, so one simulation serves every
  pixel.
- The region's shared movement (median over lit pixels of each pixel's deviation from its own mean) is removed
  first, so a pixel is flagged for a local event, not for regional growth or a sensor change.
- Only pixels lit at either end (first or last three-year mean > 1 nW) are tested, and a step must change radiance
  by at least 20%.
- Flagged pixels are grouped into events (8-connected, same direction) and ranked by radiance gained or lost; each
  carries its nearest incorporated place only.

**AI tab** (`web/src/components/AiPanel.tsx`): the four steps (data, airglow cleaning, change detection,
forecast) labelled as data, cleaning, statistics and machine learning; the airglow background by year; the
detector's numbers, its power at the real noise level, a cell inspector (click the map or an event: the 13 values,
the fitted line or line + step, and the verdict with F); the forecast's feature importance, its back-test against
"no change" and each cell's own trend, and predicted vs observed growth by tenth of cells; how the models are
checked; and what is not AI (Garstang physics, fixture rules, the weighted site ranking, unit-cost arithmetic). A
"Change events" map layer shows flagged steps. The browser repeats the step test for the clicked cell
(`web/src/engine/changes.ts`), and a test requires it to agree with the pipeline on every lit pixel.

## Result (build of 2026-10-19)
- 1,493 of 28,986 lit pixels flagged (about 29 expected by chance at 1 in 1,000), grouped into 635 events: 491
  rises, 144 drops. Before the fix, gradual declines such as Chiefland (13 -> 8 nW) and Archer (11 -> 7 nW) were
  reported as 2015 "retrofit" steps; they now read as trends.
- Year-to-year scatter around each lit pixel's line is 9.7% (median; middle half 6.9-14.8%). At that level a
  simulated +50% step is caught 10% of the time and a -30% step 6%, so the detector finds large changes such as
  new development and misses most retrofits. A rise spread over two or three years (Butler Plaza, 81 -> 148 nW
  over 2015-2018) is also missed.
- The largest event is around Celebration Pointe, Gainesville (2016 by most of its cells; Bass Pro Shops opened
  there in late 2016). The second, 46 cells west of Ocala in 2021, lies on NW 80th Avenue, the World Equestrian
  Center's address; its opening date was not confirmed. The app does not name events.
- Forecast, newly reported: the model leans on distance to urban cores (31% of gain), housing density (22%),
  elevation (21%) and current brightness (19%); by tenth of cells, observed 2018-2024 growth rises from -0.05% to
  +8.4% a year in the order predicted, every tenth above its prediction.

## Consequences
- Change events are evidence of where light changed, not of why. Retrofit detection needs either less noise (more
  years, monthly data) or ground truth (utility work orders, Gainesville's streetlight records).
- The AI tab's numbers come from `engine.json`, so they follow any rebuild.
