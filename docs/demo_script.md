# Demo scripts

Numbers below are from the VIIRS-mode package built 2026-10-19 (commit 28716ec); re-read them after any rebuild.
The site is static, so nothing in the demo depends on Earth Engine or any server being up.

## UF AI Days talk, October 27, 2026 (15 minutes)

Suggested running order; the AI segment is the core of the talk.

| Time | Segment | Where |
| --- | --- | --- |
| 0:00–1:30 | The problem: skyglow over North Central Florida, the two observatories, the counties' dark-sky policy work | slides |
| 1:30–4:00 | The simulator in one scenario: steps 1–4 of the two-minute path below | Scenario tab |
| 4:00–10:00 | **AI segment** (below) | AI tab |
| 10:00–11:30 | The forecast in use: where UF should build | Observatory tab |
| 11:30–13:00 | What is missing and the ask: defensibility panel, PDF brief | Brief tab |
| 13:00–15:00 | Questions (prepared answers below) | |

### AI segment (4:00–10:00, live)

Use a laptop on the projector for this part (the inspector chart needs the width). Open the **AI** tab; the map
switches to *Change events* on its own.

1. **4:00 – What is AI here, and what is not.** Point at the four numbered steps and their tags.
   "Two models learn from data: a statistical change detector and a machine-learning forecast. They read 13 years of
   NASA Black Marble satellite images, one median per year of the cloud-free nights, about 500 m per cell, pulled
   through Google Earth Engine's free noncommercial tier in about 12 minutes. The sky brightness itself is physics,
   and the site ranking and costs are explicit rules you can see and change."

2. **4:30 – The data before the models.** Point at the airglow bars in card 1.
   "The first pull came back ten times too dark: Earth Engine had already applied a scale factor, and we applied it
   again. Then forests and wetlands seemed to brighten 70 to 120% between 2020 and 2023. They didn't. That is airglow,
   light from the upper atmosphere that follows the solar cycle: 0.10 nanowatts at the 2019–20 minimum, 0.33 in 2023.
   We remove it every year before any model sees the data. After that, lit areas still move together: down 10% by
   2015, up 14% by 2024, and NOAA's separately processed product shows the same rise. The most important AI work in
   this project was checking the data."

3. **5:30 – Finding where lighting changed.** Card 2: 28,986 lit cells tested, 1,493 flagged, about 29 expected by chance.
   "Our first detector flagged two thirds of all lit cells. In a simulation it flagged 2,000 out of 2,000 cells that
   had nothing but a steady trend. A detector that flags everything tells you nothing. So now each cell gets two
   explanations, a steady trend or a trend with a sudden step, and the bar is set by simulating 200,000 cells of pure
   noise: a false alarm 1 time in 1,000. The region's shared movement is taken out first, so a cell is flagged for
   what happened there."

4. **6:30 – Click the top event** (2016, +149%, 7 km from Gainesville). The map flies to I-75 and Archer Road.
   Inspector: 28.1 → 91.1 nW, "Step in 2016: +311% on top of the cell's trend (F = 176.8, needs 36.3)."
   "Nobody told the model where to look. This is Celebration Pointe; Bass Pro Shops opened there in November 2016."

5. **7:00 – Click the second event** (2021, +222%, 46 cells, 11 km from Ocala). Inspector: 0.5 → 53.5 nW, a step in
   2021 (F = 97.1). "Dark land west of Ocala, on NW 80th Avenue, lit up in 2021." Do not name the site (see below).

6. **7:20 – A cell that is not flagged.** Zoom the map to Chiefland and click the town center.
   Inspector: 13.1 → 8.2 nW, "No step: the best split (2018, −9%) scores F = 3.7, below the 36.3 needed. A steady trend
   fits as well." "The first detector called this a 2015 retrofit. It is a slow decline." (None of the eight cells
   around the center are flagged, so a slightly-off click gives the same answer.)

7. **7:40 – What it cannot do.** Point at the noise sentence in card 2.
   "A lit cell's yearly values scatter about 10% around its trend. At that noise, a simulated +50% step is caught 10% of
   the time and a −30% step 6%. So it finds large new lighting. It misses most LED retrofits, which are 20 to 40% drops.
   Seeing those needs monthly data or the utilities' work orders."

8. **8:00 – The growth forecast.** Scroll to card 3, the importance bars.
   "LightGBM, gradient-boosted trees, on six open inputs. It leans on distance to urban cores (31%), housing density
   (22%), elevation (21%) and current brightness (19%)."

9. **8:30 – The back-test table.**
   "Our first back-test said LightGBM beat the baseline, 21% error against 25%. But we had picked a weak baseline: each
   cell's own past trend. Against 'no change', it ties, 21.2% and 21.2%. Lit areas fell 3.7% from 2012 to 2018 and rose
   20.6% from 2018 to 2024. Nothing in the earlier years announced that reversal, and no model trained on them could
   have seen it coming."

10. **9:15 – The predicted-vs-observed chart.**
    "What it does learn is the order. Sort the cells into tenths by predicted growth: the ones it expected to grow
    fastest did grow fastest, correlation 0.35, and 0.18 R² on areas held out of training. Every dot sits above the
    line: it got the order right, not the amount."

11. **9:40 – How we keep it honest.** Point at the card.
    "The forecast is scored only on years it never saw, and a test fails if those years leak into training. The
    detector's false-alarm rate is checked on simulated noise. And this page re-runs the detector for any cell you
    click; a test requires it to agree with the pipeline on every lit cell."

12. **10:00 – Hand-off.** "The order is what matters for choosing a site." Open the Observatory tab: #1 is in Lafayette
    County, score 0.879, on 92% state land; its development-trajectory criterion and 2034 sky column come from this
    forecast.

### Do not claim

- **The January 2026 EPAC vote.** It is cited in the PRD [AC-EPAC]; confirm the wording before it goes on a slide.
- **Alachua +19% radiance growth.** The County's +19% and 16% → 21% [AC-EPAC] came from map screenshots covering a
  212 × 131 km region, not the county (ADR 0013). Say "about 20% across the region around Alachua County, 3 to 6% in
  the county itself" (NOAA +6.1%, NASA +2.9%, 2013–2024).
- **That the detector finds retrofits.** It finds large new lighting; most retrofit-sized drops are below its noise.
- **The World Equestrian Center.** The 2021 event west of Ocala lies on its street, but its opening date is not confirmed
  in any source found (a "2021 Ocala International Horse Show debuts new World Equestrian Center" article exists but
  could not be read). Say "west of Ocala" unless you confirm it.
- **"Calibrated" or "measured" sky brightness.** Skyglow values are uncalibrated projections; only the satellite
  radiance is measured.
- **A predicted 2034 sky.** It is the 2018–2024 pace carried forward, not a prediction of what will happen.
- **Rosemary Hill's Bortle class.** The model gives 21.69, Bortle 3 by 0.002 mag; the PRD rates it Bortle 4.

### Questions you may get

- **Why LightGBM and not deep learning?** About 30,000 cells, six tabular inputs, one six-year target per cell:
  gradient-boosted trees fit that well, train in seconds, report what they rely on, and do not need a GPU.
- **How do you know the change events are real without ground truth?** The false-alarm rate is set by simulation and
  checked in tests; known openings line up (Celebration Pointe, November 2016). The next step is ground truth:
  utility work orders and Gainesville's streetlight records.
- **Isn't the satellite blind to LEDs?** Partly: VIIRS sees 500–900 nm and misses most of a white LED's blue. The
  Scenario tab's spectral view shows it: for the Groveland preset the satellite would record −24.9% where the eye
  sees −23.5%.
- **Data leakage?** The back-test trains on 2012 conditions and 2012–2018 growth, then predicts 2024 from 2018; a test
  feeds it a 2018–2024 jump and fails if the model could see it.
- **Cost?** The satellite pull runs on Earth Engine's free noncommercial tier, a small share of its 150 EECU-hours a
  month; the app is static files on free hosting.
- **Didn't the County find +19%?** That figure came from two map screenshots and covers the whole map view, from
  Perry to the St. Johns River; NOAA's radiance for that region rose about 20%. Measured on the county boundary,
  radiance rose 3 to 6%, and about 5% around Gainesville.
- **How good is the sky model?** One brightness scale is fitted to 10 reference site values from Clear Dark Sky and IDA
  (RMSE 0.46 mag). Against 53
  Globe at Night meter readings never used in any fit, readings are a median 0.52 mag brighter than the model (0.21
  after midnight).

### Before the talk

- Open https://dark-sky-simulator-v2.vercel.app/dark-sky/ on the laptop and the phone; open the AI tab once so the
  satellite layers (about 3.4 MB) are cached.
- Practice the zoom to Chiefland and the click on its town center.
- Fallbacks if the network fails: the screenshots in `docs/screenshots/` (17–19 are the AI tab) and the 30-second trailer.

Sources for the two named places: Bass Pro Shops at Celebration Pointe, construction scheduled to finish November 2016
([EMJ Construction, September 1, 2016](https://www.emjcorp.com/two-new-florida-bass-pro-locations-underway/)) and opened
November 2016 ([SponsorPitch](https://app.sponsorpitch.com/deals/celebration-pointe-sponsors-florida-gators)); World
Equestrian Center address 1750 NW 80th Avenue, Ocala ([WEC FAQ](https://worldequestriancenter.com/faq/ocala-fl-faq/)).

## Two-minute demo path (2026-10-21)

Open the site on a phone.

1. **0:00 – The badge.** Point at "Uncalibrated planning projection". "Everything here is modeled from public data
   and literature physics. The point of the next phase is to turn it into measurement."
2. **0:15 – Today's sky.** Map on *Sky (today)*. Gainesville's dome, Ocala to the southeast, dark western Levy.
   Tap Rosemary Hill: 21.69 mag/arcsec², Bortle 3 (on the 3/4 line; the PRD rates it Bortle 4). Tap Chiefland Astronomy Village: 21.86, Bortle 3.
3. **0:35 – One tap, a Groveland-style ordinance.** Scenario → *Groveland-style ordinance*. Switch the map to
   *Change*: blue over both counties, reaching beyond the county lines. Sites tab: Paynes Prairie 20.98 → 21.62,
   RHO 21.69 → 21.88, CAV 21.86 → 21.94 (Bortle 3 → 2).
4. **0:55 – Only the streetlights.** Untick *Private*. Paynes Prairie is now 21.30: public lighting alone gets about
   half way. Costs tab: $26.6M CAPEX, most of it retrofits, with smart nodes for dimming; each tariff line shows its rate basis.
5. **1:15 – Protect the observatories.** Reset, untick every group, turn on the RHO and CAV overlays (LZ0 2 mi,
   LZ1 5 mi). RHO 21.69 → 21.77 for about $0.75M in public retrofits (including sports fields inside the zones).
   (Optional: *All 8* counties with the Groveland preset shows what regional adoption adds: RHO 21.91.)
   Optional Build-mode beat: open *Build mode*, equip "Cobra-head LED, full cutoff, 2700K" for street lights and watch
   the install markers and the $28M total appear.
6. **1:30 – Where UF should build.** Observatory tab: the heatmap and top-20 sites; open #1's scorecard. RHO and
   CAV are always shown as reference rows. Drag *Current sky brightness* up and watch the ranking move.
7. **1:45 – The ask.** Brief tab: download the PDF (first line: "These outputs are planning projections, not
   observed outcomes"). The defensibility panel lists what is missing: SQM stations, utility inventories, VIIRS
   calibration. That list is the v3.0 budget.

Backup lines: "Why not just VIIRS?" → switch Spectral view and show VIIRS recording a bigger drop than visible light
for an LED retrofit (it is blind below 500 nm). "How good is it?" → the 53 public SQM readings sit a median 0.52 mag
brighter than the model (0.21 after midnight).
