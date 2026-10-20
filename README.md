# Dark Sky Simulator v2.0

Static, phone-friendly demo of the Dark Sky Simulator for Alachua and Levy counties and their six neighbors
(Marion, Gilchrist, Putnam, Clay, Bradford, Union), built to the v2.0 scope in
[Dark_Sky_Simulator_v2_v3_PRD_TRD.md](Dark_Sky_Simulator_v2_v3_PRD_TRD.md) (Section 0A). It replaces v1's
multiplier heuristics with a Garstang single-scattering skyglow model computed offline, real public data,
seed economics with provenance, an observatory site-selection engine, and a browser-generated legislative brief.

**Every skyglow number is an uncalibrated planning projection.** No sky-quality meter data is used, utility
streetlight counts are modeled, and Bortle classes are labels on a computed magnitude (PRD 0A.5). The app says
so on every screen.

## A tour of the app

Live at [dark-sky-simulator-v2.vercel.app/dark-sky/](https://dark-sky-simulator-v2.vercel.app/dark-sky/). Screenshots are from
the 2026-10-19 build (VIIRS mode) at 1440 × 860 unless noted; they are a snapshot, so retake them after visible changes.
The left panel has seven tabs (Scenario, Sites, Costs, Observatory, Stargaze, AI, Brief); the map on the right follows
the tab, and its layer buttons switch what it shows. How it is built: [Technical architecture](#technical-architecture).

### Lighting scenarios and the map

![Scenario tab with the modeled sky](docs/screenshots/01-overview.jpg)

**Scenario tab, *Sky (scenario)* layer.** The panel builds a lighting scenario: which fixtures it applies to (by owner
and county), then the controls. The map shows the modeled zenith sky brightness for that scenario across the eight
counties (mag/arcsec²; yellow is a bright urban sky, dark is close to natural), and the reference sites carry their
magnitude and Bortle class. The amber badge in the header is on every screen: all skyglow values are uncalibrated
planning projections.

![Groveland-style ordinance on the Change layer](docs/screenshots/02-ordinance-change.jpg)

**One-click ordinance and the *Change* layer.** The *Groveland-style ordinance* preset makes every selected fixture
(public and private, Alachua + Levy) fully shielded (U0), caps color temperature at 3000 K and dims to 50% from 22:00
to 06:30. *Change* shows where the sky gets darker (blue) or brighter (red): Paynes Prairie goes from 20.98 to 21.62
mag/arcsec². The **Budget** card on the map prices the public part (here $26.6M capital, $1.43M a year saved, 18.6-year
payback) on the Scenario, Sites, Costs and Brief tabs.

![Dark-sky overlay zones around the observatories](docs/screenshots/03-overlay-zones.jpg)

**Dark-sky overlay zones.** Rings around Rosemary Hill Observatory and Chiefland Astronomy Village apply stricter
rules to every fixture inside them, public or private: an LZ0 core (U0, narrow-band amber, motion-only) and an LZ1
buffer (U0, ≤ 2700 K). Shown: the *Flagstaff LZ1 overlay* preset (3-mile core, 5-mile buffer), about $0.79M in public
retrofits.

![Growth, viewing time and spectral view](docs/screenshots/04-growth-time-spectral.jpg)

**Viewing time, growth and spectral view.** *Viewing time* switches between the late-night window used for Bortle
classes (01:00–04:00) and the evening (20:30–22:30), when sports fields are lit. *Extrapolate growth trend* adds 1–10
years of growth from the satellite-trained forecast (orange: brighter by 2034 where no ordinance applies). *Spectral
view* redraws the Change layer for one band, here scotopic (night vision), and compares the drop in upward light the
eye would see (−23.5%) with what the VIIRS satellite would record (−24.9%): the satellite barely sees the blue in white
LEDs, so a retrofit looks like a bigger drop from orbit.

![Streetlights layer over Gainesville](docs/screenshots/05-streetlights.jpg)

**Streetlights layer.** Where the model puts public streetlights: modeled fixtures per ~500 m cell, placed along
OpenStreetMap roads (roads tagged lit first), and the surveyed points that exist (Gainesville open data in amber,
OpenStreetMap in blue). Shown zoomed into Gainesville.

![Build mode with two fixture cards equipped](docs/screenshots/06-build-mode.jpg)

**Build mode.** A catalog of 17 DarkSky-compliant fixture types in six categories, each card with its spectrum,
uplight rating, lumens, watts, installed unit cost (with source) and how many existing fixtures it replaces.
Equipping a card updates the sky, the costs, the brief and the clustered install markers on the map. Shown: a
full-cutoff 2700 K cobra-head for street lights and a shoebox area light for commercial lighting ($28.0M public,
11.7-year payback; the owners' $3.1M for private fixtures is listed separately).

![3D view of downtown Gainesville](docs/screenshots/07-3d-view.jpg)

**3D view.** Terrain (×3), buildings and every modeled light source at street level under the sky-brightness map:
mapped streetlights where they stand, modeled ones spread along the roads of their cell, colored by fixture type.
Shown: downtown Gainesville.

### Sites and the night sky

![Sites tab with the all-sky view](docs/screenshots/08-sites.jpg)

**Sites tab.** Today's and the scenario's zenith brightness at ten reference sites, with Bortle class and the
DarkSky Park tier, and an all-sky view of the selected site.

<p><img src="docs/screenshots/09a-all-sky-downtown.jpg" width="49%" alt="All-sky view, downtown Gainesville"> <img src="docs/screenshots/09b-all-sky-rosemary-hill.jpg" width="49%" alt="All-sky view, Rosemary Hill Observatory"></p>

**Full-screen all-sky view**, the same moonless evening (November 9, 2026, 21:00): downtown Gainesville (18.43
mag/arcsec², Bortle 7, naked-eye limit about 4.3, with Ocala's light dome on the horizon) and Rosemary Hill Observatory
(21.69, Bortle 3, limit about 6.5). Stars, Milky Way, Sun and Moon are placed for any date and time; *Play* runs the
night, and toggles add terrain and lights, a sky-glow indicator and a false-color luminance map. Illustrative, not a
photograph.

### Costs

![Costs tab](docs/screenshots/10-costs.jpg)

**Costs tab** for the Groveland-style scenario: capital cost (retrofits × unit price + dimming nodes), yearly energy and
maintenance savings, simple payback, the 15-year cumulative cash position, and each utility's tariff with its rate
basis; lines without a loaded tariff are flagged.

### Observatory siting

![Observatory tab with the suitability map](docs/screenshots/11-observatory.jpg)

**Observatory tab.** Scores every ~1 km cell of an 11-county region for a new research observatory with a weighted sum
of criteria whose weights you set (current sky, 10-year development, clarity, distance from cities, land availability,
elevation, road access, land cost). The top 20 sites of at least four contiguous cells are listed and mapped, with
Rosemary Hill and Chiefland as reference rows. Hovering a candidate shows its score, 2024 → 2034 sky, land estimate and
strengths; here #1, in Lafayette County, on 92% state land.

![Land prices overlay](docs/screenshots/12-land-prices.jpg)

**Land prices.** Market $/acre from 1,205 qualified vacant-land sales (2021–2025) and the 2025 Florida tax roll, public
land in blue, and each candidate's price range for an 80-acre site.

### Stargazing tonight

![Stargaze tab](docs/screenshots/13-stargaze.jpg)

**Stargaze tab.** The live Open-Meteo forecast over the modeled sky: *Dark & clear* combines darkness with forecast cloud
for the hour on the slider, and *Best spots* ranks places for a use case (grab & go, star party, deep-sky imaging,
buying property).

![Spot report with the hourly forecast](docs/screenshots/14-stargaze-report.jpg)

**Spot report** (pick a spot, or click anywhere on the map): modeled sky, light domes by direction, horizon, road access,
land ownership and price, tonight's darkness and Moon, and an hourly observing forecast (darkness, cloud, transparency
and seeing proxies, dew, wind) with the best window.

### Satellite data and the AI

![VIIRS layer](docs/screenshots/15-viirs.jpg)

**VIIRS layer.** NASA Black Marble (VNP46A2) yearly median radiance of cloud-free nights, 2012–2024, with the airglow
background removed; the slider steps through the years.

![Trend 2012–24 layer](docs/screenshots/16-trend.jpg)

**Trend 2012–24.** Change in radiance from 2012–14 to 2022–24, for cells lit at either end: growth along I-75 and
around Ocala, declines in some older cores.

![AI tab overview](docs/screenshots/17-ai-overview.jpg)

**AI tab.** What is learned from data (a statistical change detector and a LightGBM forecast) and what is not, starting
with the satellite record and its airglow correction (the background glow by year). The map switches to *Change
events*. See [ADR 0011](docs/adr/0011-viirs-first-run.md) and [ADR 0012](docs/adr/0012-step-test-and-ai-tab.md).

![Change events and the cell inspector](docs/screenshots/18-ai-change-events.jpg)

**Change events and the cell inspector.** Each lit cell is tested for a sudden step on top of its trend (false alarms 1
in 1,000, calibrated by simulation). Clicking an event or any cell shows its 13 yearly values, the fitted line or step,
and why it was or was not flagged; shown: the Celebration Pointe area, +311% in 2016.

![Growth forecast back-test](docs/screenshots/19-ai-forecast.jpg)

**The growth forecast, back-tested.** What the LightGBM model relies on, its error on years it never saw next to "no
change" and each cell's own trend, and predicted vs observed growth by tenth of cells: it gets the order right but not the
amount, because lit areas fell 3.7% in 2012–18 and rose 20.6% in 2018–24.

### The brief and the fine print

![Brief tab](docs/screenshots/20-brief.jpg)

**Brief tab.** The defensibility panel lists what the numbers rest on and what is missing (calibration stations, utility
inventories). The legislative brief summarizes the scenario and downloads as a PDF that opens with "These outputs are
planning projections, not observed outcomes", with every figure linked back to the scenario field it came from.

![About and data](docs/screenshots/21-about.jpg)

**About & data.** How the model works, where the light comes from, and the fixture inventory by county and owner with
its confidence.

### On a phone

<img src="docs/screenshots/22-phone.jpg" width="300" alt="The app on a phone">

The same app on a 390 px phone screen (shown at 2×): map on top, panels below.

## Quick start

```bash
# Python 3.12 pipeline (uv or any venv)
python -m uv venv --python 3.12 .venv
python -m uv pip install --python .venv -e ".[dev,ml,viirs]"
.venv/Scripts/python -m pipeline.ingest_all      # pull public sources into data_raw/ (cached)
.venv/Scripts/python -m pipeline.build           # precompute web/public/dark-sky/data/ and docs/sanity_check.md
.venv/Scripts/python -m pytest                   # 79 tests (53 Dark Sky, 5 WildSight, 21 Public Art; 1 skips until florida_budgets.yaml exists)

# Web client
cd web
npm install
npm run dev        # http://localhost:5173 (homepage); Dark Sky at /dark-sky/, /wildsight/, /public-art/
npm test           # Vitest: requirement-ID acceptance tests
npm run build      # static site in web/dist (relative paths; host under any sub-path)
```

### VIIRS (Earth Engine)

The PRD's satellite baseline (NASA Black Marble VNP46A2, 2012–2024) comes from Google Earth Engine through Jay's
personal Cloud project `dark-sky-simulator` (noncommercial Community tier). It was first pulled on 2026-10-19, and
the current package runs in **VIIRS mode** (below). To refresh, or on a new machine:

```bash
.venv/Scripts/earthengine authenticate
.venv/Scripts/python -m pipeline.ingest_all --viirs --ee-project dark-sky-simulator
.venv/Scripts/python -m pipeline.build
```

The build switches to VIIRS mode whenever every year is cached: each year's airglow background is removed,
private light is placed by 2024 radiance, the VIIRS year slider, 2012–2024 trend map and change-event map appear,
and 10-year growth comes from the LightGBM forecast. The **AI tab** explains both models with their checks (change
events with a cell inspector, the forecast's back-test against "no change"). The first real run found a double
scaling bug, the solar-cycle airglow and a back-test that flattered the model ([ADR 0011](docs/adr/0011-viirs-first-run.md));
the step detector was then rebuilt ([ADR 0012](docs/adr/0012-step-test-and-ai-tab.md)).

## What is in the demo (PRD 0A.2 v2.0 column)

| Module | v2.0 requirement | Where | Test |
| --- | --- | --- | --- |
| A | A-01 controls apply only to an explicit fixture selection | Scenario tab, step 1 | `test_A_01_*` |
| A | A-02 every panel shows fixture count and inventory confidence | all output panels | `test_A_02_*` |
| A | A-07 Bortle never shown without its magnitude | Sites tab, map labels, brief | `test_A_07_*` |
| A | A-08 PDF opens with the planning-projection sentence and confidence | Brief tab | `test_A_08_*` |
| B | B-01 top-20 sites from ≥ 4 contiguous cells, live weights | Observatory tab | `test_B_01_*` |
| B | B-02 per-site scorecard (raw, score, weight, contribution) | Observatory tab | `test_B_02_*` |
| B | B-06 RHO and CAV always scored as reference rows | Observatory tab | `test_B_06_*` |
| B | simplified B-03: 2034 magnitude from the growth trend | Observatory tab | – |
| – | How the AI works: change events, cell inspector, forecast back-test (added on request) | AI tab | `changes.test.ts`, `test_ml.py` |
| C | C-01 every PDF figure hyperlinks to its scenario field | Brief tab / PDF | `test_C_01_*` |
| C | C-04 defensibility panel | Brief tab | `test_C_04_*` |

**Build mode** (button at the bottom of the map): a SimCity-style tray with 17 DarkSky-compliant fixture types in
six categories (street, decorative & pedestrian, commercial & parking, residential, sports & stadium,
wildlife-friendly). Each card shows a drawn thumbnail, spectrum, U-rating, lumens, watts, an installed unit cost
with its source, how many existing fixtures it replaces in the selected counties, and the total. Equipping a card
updates the sky, costs and brief, and puts clustered install markers on the map ([ADR 0007](docs/adr/0007-build-mode-catalog-sports.md)).
A **viewing-time** switch shows the late-night SQM window (default) or the evening (20:30–22:30), when the new
**sports-lighting source** (OSM fields, courts and stadiums, ~9,200 modeled fixtures) is on.
The **Observatory** tab prices land for every candidate from the Florida DOR 2025 tax roll and recorded sales:
market and tax-roll estimates for a chosen site size, public/private ownership, the largest parcel and the value of
existing buildings ([ADR 0006](docs/adr/0006-land-pricing.md)). A *Land prices* map toggle swaps the suitability
heatmap for a market $/acre surface (mostly-public land in blue) and labels each candidate with its price range;
hovering a candidate shows its score, sky, land and location.
**Stargaze** tab for astronomers, astrophotographers, campers and land buyers: pick a use (grab & go, camp /
star party, deep-sky imaging, buy property) for ranked spots; a live cloud forecast (or a labeled simulation) and a
"dark & clear" layer on the map with an hour slider; click anywhere for a spot report (sky, light domes, horizon,
access, ownership, land price, tonight's darkness and Moon, an hourly Clear-Sky-Chart-style forecast with
transparency/seeing proxies and dew risk), a sky view at that spot, saved spots and directions ([ADR 0008](docs/adr/0008-stargaze-mode.md)).
**3D** (button on the map): terrain, extruded buildings and the light sources as poles with glowing, color-coded
heads and light pools: mapped streetlights where they stand, modeled ones spread along the roads of their cell,
sports towers at real venues; equipped cards recolor their share. In the Sites sky view, **Terrain & lights** puts the
same scene under the stars (eye height 2 m to 600 m), and **Indicators** / **Luminance map** add a sky-glow curve,
a luminance readout (mag/arcsec², mcd/m²) and a false-color sky ([ADR 0009](docs/adr/0009-3d-terrain-lights-skyglow.md)).
A **Budget** readout on the map (Scenario, Sites, Costs and Brief tabs) keeps public cost, yearly savings, payback, 15-year ROI
and a cumulative cash chart in view for the current scenario; it collapses to one line and links to the Costs tab.

Also shipped: the A-06 tariff and rate date on every money line, the Groveland-style ordinance preset (A-04 is
v3.0, but the preset drives the AI Days headline), five-band spectral view with scotopic mode, a VIIRS vs visual
readout showing DNB blue-blindness, Levy dark-sky overlay rings (LZ0/LZ1 per [LEVY-OVERLAY]), a 10-year growth
toggle, shareable scenario URLs, PNG map export, and a Three.js all-sky view driven by the computed zenith value
(full-screen mode with a site picker; stars, Milky Way, Sun and Moon placed for any date and site time, with
twilight and moonlight added (Krisciunas & Schaefer 1991); compass, altitude-ring, light-dome and star-name overlays;
autoplay in full screen).

Headline projections (VIIRS mode, build of 2026-10-19, uncalibrated; zenith mag/arcsec², higher is darker):

| Scenario (Alachua + Levy unless noted) | Paynes Prairie | RHO | CAV | Public CAPEX | Payback |
| --- | --- | --- | --- | --- | --- |
| Today (model, late night) | 20.98 | 21.69 | 21.86 | – | – |
| All public fixtures U0 + 3000K | 21.20 | 21.77 | 21.89 | $17.2M | 7.4 yr |
| Groveland-style, public only | 21.30 | 21.80 | 21.89 | $26.6M | 18.6 yr |
| Groveland-style, public + private | 21.62 | 21.88 | 21.94 | $26.6M (public) | 18.6 yr |
| Groveland-style, public + private, all 8 counties | 21.65 | 21.91 | 21.96 | $98.9M (public) | 17.0 yr |
| Levy overlays (LZ0 2 mi, LZ1 5 mi) around RHO and CAV | 20.98 | 21.77 | 21.88 | $0.75M | 13.6 yr |
| Marion public fixtures U0 + 3000K (alone) | 20.98 | 21.70 | 21.86 | $30.8M | 9.2 yr |
| Today, evening (20:30–22:30) | 20.56 | 21.58 | 21.79 | – | – |
| Evening, all sports fixtures → LED 3000K with visors, 8 counties | 20.76 | 21.65 | 21.83 | $75.8M | – |

Cross-checks against the corpus: the public-only retrofit gives Paynes Prairie +0.22 mag (the Gainesville
assessment [GNV-ASSESS] predicted +0.2 to +0.4), and the Levy public retrofit CAPEX of $1.88M matches
[ECON-RETRO]'s median. The Groveland payback is long because dimming needs a $202 smart node on every public
fixture, and Clay/CFEC deemed tariffs earn nothing from dimming.

## How it works

```
data_raw/ (cached public pulls) ─┐
seed/  (PRD 6 constants)        ─┼─> pipeline/build.py ──> web/public/dark-sky/data/ ──> web/ (static React + MapLibre)
counties/ (data packages)       ─┘        │
engine/ (pure physics) ◄──────────────────┘
```

- **engine/**: Garstang single-scattering integral (Rayleigh + Henyey-Greenstein aerosol, slant extinction,
  Earth curvature, summer/winter turbidity), separate direct-uplight (θ⁴) and ground-reflected kernels fitted
  within 7.4% of the numeric curve, five-band spectral factors from the seed SPD table, Bortle mapping, MCDA
  normalizations. No I/O, no county imports (enforced by `test_engine_imports_nothing_county_specific`).
- **ingest/**: connectors for Census TIGERweb (block groups, places, county subdivisions, roads), Gainesville
  Socrata, OSM Overpass, FDOT RCI (layer discovery), Alachua Cityworks, USGS 3DEP, FNAI conservation lands,
  Globe at Night, and Earth Engine VNP46A2.
- **pipeline/build.py**: places fixture stocks, splits them into 38 components (group × county outside the
  overlays, 6 rings each around RHO and CAV, and external sources), convolves each with both kernels, and writes
  per-unit basis layers. The browser multiplies each layer by the scenario's effective flux, so any control
  combination renders in about 55 ms (measured in the dev build).
- **web/**: Vite + React 18 + TypeScript + Tailwind, MapLibre GL on OpenFreeMap tiles, Zustand, Recharts, jsPDF,
  Three.js.

### VIIRS mode (current package)

Public streetlights are placed on the OpenStreetMap road network (roads tagged `lit=yes` count fully; other roads
in proportion to Census housing density), using the PRD 6.5 counts by owner for Alachua and Levy. The six neighbors
have no public inventory anywhere, so their public counts come from rates derived from Alachua and Levy (0.464
fixtures per urban home, 0.148 per rural home, confidence 0.2). Private light, and light from outside the eight
counties, follows 2024 VIIRS radiance (Census 2020 housing in seed mode, used when the VIIRS cache is absent). One
global flux scale is fitted to the ten corpus site magnitudes (RMSE 0.46 mag; 0.52 in seed mode); that is a sanity
fit, not calibration. Against 53 public Globe at Night **SQM** readings never used in any fit, the median
model − observed residual is +0.52 mag (±0.45; seed mode +0.48): the model reads somewhat dark. For the 11 readings
taken after midnight it is +0.21 mag. See
[docs/sanity_check.md](docs/sanity_check.md).

## Technical architecture

Two halves: an offline Python pipeline turns public data into a static data package, and a browser app recombines
that package for any scenario without a server. The diagrams follow the code in `ingest/`, `engine/`, `pipeline/`,
`ml/` and `web/src/`; each section ends with the math it uses, with the values of this build (2026-10-19). Symbols are
defined under each block; *x* is a map cell, *t* a year.

### 1. System overview

```mermaid
flowchart LR
  subgraph SRC["Public data"]
    direction TB
    EE["Google Earth Engine<br/>NASA VIIRS VNP46A2"]
    CEN["Census TIGERweb<br/>block groups, places, roads"]
    OSM["OpenStreetMap<br/>roads, lamps, sports venues"]
    INV["Streetlight inventories<br/>Gainesville open data, county seeds"]
    LND["FGIO / DOR parcels, FNAI lands,<br/>USGS 3DEP elevation"]
    GAN["Globe at Night<br/>sky-quality readings"]
  EE ~~~ CEN ~~~ OSM ~~~ INV ~~~ LND ~~~ GAN
  end
  SEED["seed/ and counties/<br/>assumptions with provenance"]
  subgraph PIPE["Offline pipeline, Python 3.12"]
    direction TB
    ING["pipeline.ingest_all<br/>cached in data_raw/"]
    BLD["pipeline.build<br/>physics, placement, AI, site layers"]
  end
  PKG[("Static data package<br/>web/public/dark-sky/data<br/>engine.json, 16-bit grids, GeoJSON")]
  subgraph WEB["Browser app: React, Vite, MapLibre, Three.js"]
    APP["Scenario engine, map, panels,<br/>all-sky view, PDF brief"]
  end
  LIVE["Live in the browser<br/>Open-Meteo forecast, OpenFreeMap tiles,<br/>AWS terrain tiles"]
  HOST["Vercel static hosting<br/>deploys from main"]
  SRC --> PIPE
  SEED --> PIPE
  ING --> BLD
  PIPE --> PKG --> WEB
  LIVE --> WEB
  HOST -.-> WEB
```

Everything heavy (scattering integrals, convolutions, satellite processing, model training) runs once offline. The
browser only loads the package and does weighted sums, so a phone can explore any scenario instantly.

### 2. Build pipeline (`python -m pipeline.build`)

```mermaid
flowchart TD
  RAW[("data_raw/ cache")] --> CTX
  SEED["seed/ and counties/ manifests<br/>fixture stocks, spectra, costs, sites"] --> STK
  subgraph PHY["Physics, engine/"]
    GF["garstang.fit_kernel<br/>single scattering, summer and winter, 100 km"] --> GK["kernel images<br/>direct uplight and ground-reflected"]
    SF["spectral.skyglow_factors<br/>five bands per lamp type"]
  end
  VM["viirs_mode<br/>see How the AI works"]
  CTX["placement_context<br/>housing, roads, places, lit-road share,<br/>2024 VIIRS radiance when cached"] --> STK["build_stocks<br/>fixtures per owner and county,<br/>a placement field for each stock"]
  VM --> CTX
  STK --> CMP["build_components<br/>group × county, overlay rings<br/>around RHO and CAV, external light"]
  CMP --> FLX["flux.effective_flux<br/>per component and kernel term"]
  SF --> FLX
  FLX --> CONV["convolve source fields with kernels<br/>15-arcsec baseline, 30-arcsec basis layers"]
  GK --> CONV
  CONV --> ANC["anchor: one global scale α<br/>least squares on 10 corpus sites"]
  ANC --> MAPS["baseline sky maps<br/>Module A and the 11-county region"]
  VM --> GROW["10-year growth per cell"]
  MAPS --> GROW --> MB["build_module_b<br/>sky, 2034 sky, growth, clarity, distance to cores,<br/>land, elevation, road access"]
  LP["pipeline.land<br/>DOR parcels and qualified sales"] --> MB
  MAPS --> SAN["sanity check<br/>Globe at Night SQM, never fitted"]
  MAPS --> OUT[("engine.json, baseline_a15, basis_a30,<br/>growth_a30, mcda_b, viirs_a15, viirs_trend_a15")]
  MB --> OUT
  SAN --> OUT
```

Each component (a fixture group in one county, a ring of an overlay zone, or the light from outside the eight
counties) gets one basis layer per kernel term. Controls in the browser change only how much flux each component
emits, so the sky for any scenario is a weighted sum of these precomputed layers.

**The math.** Streetlights are spread along roads: OpenStreetMap roads tagged lit count fully, other public roads in
proportion to the housing density around them.

```math
w_{\text{road}}(x) = \ell_{\text{lit}}(x) + \big(\ell_{\text{all}}(x) - \ell_{\text{lit}}(x)\big)\,\min\!\left(1,\ \frac{\rho(x)}{\rho_{\text{full}}}\right)
```

*ℓ* is road length in the cell (km), *ρ* the housing density smoothed with a one-cell Gaussian, and *ρ*<sub>full</sub> the
density at which every road counts as lit (seed). Counties without a public inventory get fixtures per home from a
least-squares fit to the two that have one:

```math
(\hat a_u, \hat a_r) = \arg\min_{a_u,\,a_r} \sum_{c\,\in\,\{\text{Alachua},\ \text{Levy}\}} \big(N_c - a_u U_c - a_r R_c\big)^2
```

*N*<sub>c</sub> is the county's public fixture count and *U*<sub>c</sub>, *R*<sub>c</sub> its urban and rural housing units
(â<sub>u</sub> = 0.464 and â<sub>r</sub> = 0.148 fixtures per home in this build). Each stock *s* of *n*<sub>s</sub>
fixtures is spread by a placement field that sums to one, and each component *c* (a group in a county, an overlay
ring, or outside light) is convolved once per kernel term:

```math
P_s(x) = \frac{w_s(x)}{\sum_{x'} w_s(x')}, \qquad
P_c = \frac{\sum_{s\in c} \Phi_{s,t}\, P_s}{\sum_{s\in c} \Phi_{s,t}}, \qquad
B_{c,t}(x) = \big(K_t * P_c\big)(x)
```

*w*<sub>s</sub> is the road weight for streetlights, Census housing or 2024 VIIRS radiance for private light, and venue
points for sports; *Φ* is a stock's effective flux (section 3) and *K*<sub>t</sub> the kernel for term
*t* ∈ {direct, reflected}. The one global scale is the value that best reproduces the ten corpus site magnitudes:

```math
\alpha^{*} = \arg\min_{\alpha}\ \sqrt{\frac{1}{10}\sum_{i=1}^{10}\Big( m\big(\alpha\,\textstyle\sum_{c,t}\Phi_{c,t}\,B_{c,t}(x_i)\big) - m_i^{\text{corpus}} \Big)^2}
```

searched over 4,000 log-spaced values between 10<sup>−3</sup> and 10<sup>2</sup> (α\* = 0.460, RMSE 0.46 mag). Growth
multiplies the emissions before they scatter, so the exported growth factor is a ratio of convolved fields:

```math
G(x) = \frac{L_{2034}(x)}{L_{2024}(x)} = \frac{\sum_t \big(K_t * (E_t\, e^{10\,\hat r})\big)(x)}{\sum_t \big(K_t * E_t\big)(x)}
```

*E*<sub>t</sub> is the region's emission field and *r̂* the growth rate per cell (section 8).

### 3. Skyglow physics: from a fixture to a magnitude

```mermaid
flowchart TD
  F["Fixture cohort<br/>count, lumens, lamp type, U-rating"] --> D["Direct uplight<br/>lm × ULOR(U)"]
  F --> R["Ground-reflected<br/>lm × (1 − ULOR) × albedo"]
  D --> SD["× spectral factor<br/>lamp type and band"]
  R --> SR["× spectral factor"]
  SD --> KD["convolve with the direct kernel<br/>θ⁴ emission near the horizon"]
  SR --> KR["convolve with the reflected kernel<br/>cos θ emission"]
  KD --> SUM["α × sum over components<br/>+ natural sky"]
  KR --> SUM
  SUM --> MAG["zenith luminance → mag/arcsec²<br/>→ Bortle label"]
```

The kernels come from a Garstang single-scattering integral (Rayleigh and Henyey-Greenstein aerosol scattering,
slant-path extinction, Earth curvature), fitted to an analytic curve. Direct uplight leaves mostly near the horizon
(the θ⁴ term) and travels far, which is why shielding matters most for distant skies. The global scale α is a sanity
fit to ten corpus site values, not a calibration.

**The math.** Each fixture emits upward in two ways (Garstang 1986), with *θ* the zenith angle of emission:

```math
I_{\text{dir}}(\theta) = \frac{0.554\,\theta^{4}}{2\pi}, \qquad I_{\text{refl}}(\theta) = \frac{\cos\theta}{\pi} \qquad [\text{cd per lm}]
```

The zenith luminance at an observer a horizontal distance *D* from 1 lm of source is a single-scattering integral up the
vertical line of sight (altitude *h* from 5 m to 40 km):

```math
K_t(D) = \int_{h_{\min}}^{h_{\max}} \frac{I_t(\theta)\, e^{-\tau(h)\, r/h'}}{r^{2}}
\Big[\beta_R\, e^{-h/H_R}\, P_R(\psi) + \beta_M\, e^{-h/H_M}\, P_{HG}(\psi)\Big]\, e^{-\tau(h)}\ dh
```

```math
h' = h + \frac{D^{2}}{2R_{\oplus}}, \quad r = \sqrt{D^{2} + h'^{2}}, \quad \cos\theta = \frac{h'}{r}, \quad \cos\psi = -\cos\theta
```

```math
\tau(h) = \beta_R H_R\big(1 - e^{-h/H_R}\big) + \beta_M H_M\big(1 - e^{-h/H_M}\big), \qquad
P_R(\psi) = \frac{3}{16\pi}\big(1 + \cos^{2}\psi\big), \qquad
P_{HG}(\psi) = \frac{1 - g^{2}}{4\pi\,\big(1 + g^{2} - 2g\cos\psi\big)^{3/2}}
```

The first factor is the light reaching altitude *h* along the slant path (inverse square, extinction along the air mass
*r/h′*), the bracket is molecular (Rayleigh) plus aerosol (Henyey-Greenstein) scattering, and the last factor is
extinction on the way down to the observer. *h′* drops the source below the observer's horizon for Earth's curvature
(*R*<sub>⊕</sub> = 6,371 km). Rayleigh: *τ*<sub>R</sub> = 0.097 at 555 nm, *H*<sub>R</sub> = 8 km,
*β*<sub>R</sub> = *τ*<sub>R</sub>/*H*<sub>R</sub>. Aerosol: *β*<sub>M</sub> = (*T* − 1) *τ*<sub>R</sub>/*H*<sub>M</sub>
with Linke turbidity *T* = 3.5 (summer) and 2.5 (winter), *H*<sub>M</sub> = 1.5 km, asymmetry *g* = 0.80; optical depth
scales as *λ*<sup>−4</sup> (Rayleigh) and *λ*<sup>−1.3</sup> (aerosol). The integral is averaged over the two seasons
and fitted, by least squares on 120 log-spaced distances from 0.05 to 100 km, to

```math
\ln K_t(D) \approx c_0 + c_1 \ln D + c_2 (\ln D)^{2} + c_3 (\ln D)^{3} + c_4 D, \qquad K_t(D > 100\ \text{km}) = 0
```

(largest error 7.4% for the direct term, 5.3% for the reflected term). Lamp spectra enter through a factor per photopic
lumen, from each lamp type's power fractions *p*<sub>b</sub> in five bands (415, 480, 555, 590, 680 nm):

```math
S_{t,\text{mode}}(q) = \frac{\sum_b p_b\, s_{t,b}\, W_{\text{mode},b}}{\sum_b p_b\, \bar V_b}, \qquad
s_{t,b} = \frac{\int K_t^{(\lambda_b)}(D)\, 2\pi D\, dD}{\int K_t^{(555)}(D)\, 2\pi D\, dD}
```

*W* is the band-mean photopic (*V̄*) or scotopic (*V̄′*) sensitivity, or one band alone. A stock of *n* fixtures in
cohorts *k* (share *f*, lumens *ℓ*, U-rating *u*, lamp type *q*, lit share of the viewing window *o*) emits

```math
\Phi_{\text{dir}} = n \sum_k f_k\, \ell_k\, \mathrm{ULOR}(u_k)\, S_{\text{dir}}(q_k)\, o_k, \qquad
\Phi_{\text{refl}} = n \sum_k f_k\, \ell_k\, \big(1 - \mathrm{ULOR}(u_k)\big)\, a\, S_{\text{refl}}(q_k)\, o_k
```

ULOR is the uplight ratio of the U-rating (U0 = 0, U1 = 0.003, U2 = 0.012, U3 = 0.06, U4 = 0.18, U5 = 0.30) and
*a* = 0.15 the effective ground albedo. Luminance becomes a sky magnitude, and Bortle is a label on that magnitude:

```math
m = 12.6 - 2.5 \log_{10}\big(L_{\text{art}} + L_{\text{nat}}\big), \qquad L_{\text{nat}} = 10^{(12.6 - 22.0)/2.5} = 1.74\times 10^{-4}\ \text{cd m}^{-2}
```

```math
\text{Bortle}(m) = \min\{\,b : m \ge m_b^{\min}\,\}, \qquad \text{e.g. class 3 for } 21.69 \le m < 21.89
```

### 4. Browser runtime: what happens when you move a control

```mermaid
sequenceDiagram
  actor U as User
  participant P as Panels and Build mode
  participant S as Zustand store and URL hash
  participant M as computeModel
  participant E as scenario.ts
  participant F as field.ts
  participant V as Map, sites, budget, brief
  U->>P: move a control or equip a fixture card
  P->>S: setParams(patch)
  S->>M: new scenario parameters
  M->>E: evaluateComponents
  Note over E: selection, shielding, CCT cap, intensity,<br/>curfew and viewing window, overlay zones, cards
  E-->>M: flux per component and term, baseline and scenario
  M->>F: combine basis layers, α × Σ flux × layer
  F-->>M: sky fields, 15-arcsec baseline × 30-arcsec ratio × growth
  M-->>V: magnitudes, change map, site values, costs, VIIRS vs visual
  V-->>U: everything updates with no server call
```

The same pure functions run in the tests: a Vitest case checks that the browser's baseline flux equals the
pipeline's `engine/flux.py` for every component, and the scenario lives in the URL so any view can be shared or
linked from the PDF brief.

**The math.** Each control rewrites the fixture cohorts of the selected stocks, then the flux formula of section 3 runs
again. The lit share of the viewing window *W* (late night 01:00–04:00 or evening 20:30–22:30) for operating hours *H*,
and the effect of a curfew window *C* dimmed to level *d* (or motion-only, *d*<sub>m</sub> = 0.30 all night):

```math
o = \frac{|H \cap W|}{|W|}, \qquad
o' = o\left(1 - (1 - d)\,\frac{|C \cap W|}{|W|}\right), \qquad
e' = e\left(1 - (1 - d)\,\frac{\min(|C|,\ T_{\text{night}})}{T_{\text{night}}}\right), \qquad
o'_{\text{motion}} = d_m\, o
```

*o* scales sky brightness and *e* scales energy (*T*<sub>night</sub> = 11.5 h). Shielding converts a share *p* of the
cohorts worse than the target rating: *f*<sub>k</sub> becomes (1 − *p*) *f*<sub>k</sub> at the old rating plus
*p f*<sub>k</sub> at the target; sodium and metal-halide lamps become LED at *ℓ′* = 0.5 *ℓ* (derived from the seed energy saving per retrofit and
the lamp efficacies);
the CCT cap moves warmer-than-allowed lamps to the cap; intensity scales *ℓ′* = (1 − *i*) *ℓ*; a Build-mode card replaces
its share with the card's lumens, watts and rating; overlay rings force U0 with amber, motion-only light (LZ0) or U0 at
≤ 2700 K (LZ1). The map then recombines the basis layers:

```math
L^{\text{scn}}_{30}(x) = \alpha \sum_{c,t} \Phi^{\text{scn}}_{c,t}\, B_{c,t}(x), \qquad
m^{\text{scn}}_{15}(x) = 12.6 - 2.5 \log_{10}\!\Big( L^{\text{base}}_{15}(x)\ \mathcal{U}\!\left[\frac{L^{\text{scn}}_{30}\, G^{\,y/10}}{L^{\text{base}}_{30}}\right]\!(x) + L_{\text{nat}} \Big)
```

The fine 15-arcsec baseline keeps its detail and the 30-arcsec layers carry the change; 𝒰 is bilinear upsampling,
*G*<sup>y/10</sup> adds *y* years of growth, and the Change layer shows Δ*m* = *m*<sup>scn</sup> − *m*<sup>base</sup>
(positive = darker). The VIIRS readout repeats the flux without scattering, at the 01:30 satellite overpass, with each lamp
type's correction factor for the sensor's blindness to blue:

```math
V = n \sum_k f_k\, \ell_k\, \big(\mathrm{ULOR}_k + (1 - \mathrm{ULOR}_k)\, a\big)\, \frac{o_k^{\,01{:}30}}{\mathrm{CF}(q_k)}
```

Costs follow the public fixtures that change:

```math
E = \frac{n \sum_k f_k\, W_k\, e_k\, T_{\text{burn}}}{1000}\ \ \text{kWh/yr}, \qquad W_k = \frac{\ell_k}{\eta(q_k)}\ \text{(or the card's watts)}, \qquad T_{\text{burn}} = 4{,}100\ \text{h}
```

```math
\text{CAPEX} = \sum_{\text{replaced}} n f_k\, c_{\text{unit}} + N_{\text{nodes}}\, c_{\text{node}}, \qquad
B = \sum_{\text{tariffs}} \sigma \big(\Delta E_{\text{retrofit}} + \delta\, \Delta E_{\text{dimming}}\big)\, r + M_{\text{avoided}} - N_{\text{nodes}}\big(c_{\text{CMS}} + c_{\text{reserve}}\big)
```

```math
\text{payback} = \frac{\text{CAPEX}}{B}, \qquad \text{cash}(y) = -\,\text{CAPEX} + y\,B, \qquad \text{ROI}_{15} = \frac{15\,B - \text{CAPEX}}{\text{CAPEX}}
```

*η* is the lamp type's efficacy (lm/W), *N*<sub>nodes</sub> the dimmed fixtures (each needs a control node), *σ* a
stock's share on each tariff, *r* the tariff's $/kWh, *δ* = 1 only if the tariff pays for dimming (flat-rate "deemed"
tariffs value the retrofit at the generic rate and dimming at $0), and *M*<sub>avoided</sub> the maintenance no longer
spent on replaced sodium and metal-halide lamps.

### 5. Observatory siting and Stargaze

```mermaid
flowchart LR
  MB[("mcda_b layers<br/>about 1 km region grid")] --> N["normalize each criterion<br/>engine/mcda.ts"]
  W["weights you set"] --> WLC["weighted linear combination"]
  N --> WLC --> CL["cluster the best cells<br/>at least 4 contiguous"] --> TOP["top 20 sites<br/>plus RHO and CAV reference rows"]
  LPJ[("land_parcels.json<br/>2025 DOR roll, 1,205 sales")] --> LE["land estimate per site"]
  TOP --> LE
  MB --> SP["spot ranking by use case<br/>engine/spots.ts"]
  OM["Open-Meteo hourly forecast<br/>fetched live"] --> WX["cloud, transparency and seeing proxies,<br/>dew, wind, engine/weather.ts"]
  WX --> SP --> REP["spot report and hourly forecast"]
```

Site ranking is a transparent weighted sum, not machine learning; its development-trajectory criterion and its
2034 sky column come from the growth forecast below.

**The math.** Every criterion is scaled to 0–1 per ~1 km cell and combined with the weights *w* you set:

```math
S(x) = \frac{\sum_k w_k\, n_k(x)}{\sum_k w_k}
```

```math
\begin{aligned}
n_{\text{sky}} &= \mathrm{clip}\!\left(\frac{m_{2024} - 20.5}{22.0 - 20.5}\right) \\
n_{\text{trajectory}} &= 1 - \mathrm{clip}\!\left(\frac{g}{50}\right), \qquad g = 100\,(e^{10\hat r} - 1) \\
n_{\text{clarity}} &= \mathrm{clip}\!\left(\frac{c - 0.40}{0.75 - 0.40}\right), \qquad c = 0.50 + 0.05\mathrm{clip}\!\left(\frac{d_{\text{coast}}}{30\ \text{km}}\right) \\
n_{\text{urban}} &= \frac{1}{1 + e^{-(d_{\text{urban}} - 30)/8}} \\
n_{\text{land}} &= \text{area-weighted class: public 1.0, agricultural 0.6, residential 0.1} \\
n_{\text{elevation}} &= \tfrac12\,\frac{z - z_{\min}}{z_{\max} - z_{\min}} + \tfrac12\left(1 - \mathrm{clip}\!\left(\frac{h_{\text{horizon}}}{10^{\circ}}\right)\right) \\
n_{\text{access}} &= \mathrm{clip}\!\left(\frac{15 - d_{\text{road}}}{15 - 3}\right) \\
n_{\text{land cost}} &= \pi + (1 - \pi)\mathrm{clip}\!\left(\frac{\ln 40{,}000 - \ln v}{\ln 40{,}000 - \ln 2{,}000}\right)
\end{aligned}
```

clip limits to [0, 1]; *d* are distances in km (urban cores are places of 10,000 people or more); *h*<sub>horizon</sub> is
the highest terrain angle within 10 km over 16 directions; *π* is the cell's public share of parcel area and *v* the
market price ($/acre). Sites are the 4-connected clusters of at least four cells among the best-scoring 1%, 2%, 4%, 8% or
16% of cells (the first cut that yields 20 sites), ranked by their mean score. Land prices are the median and
interquartile range of up to the 15 nearest qualified vacant-land sales within 25 km (county median if fewer than 5):

```math
\text{cost} = \tilde v \cdot A, \qquad \text{range} = \big[v_{25}\, A,\ v_{75}\, A\big], \qquad A = 80\ \text{acres by default}
```

Stargaze ranks cells with the same layers plus the forecast, as a weighted mean of factors whose weights depend on the
use case (grab & go: dark 0.40, clear 0.35, access 0.25):

```math
f_{\text{dark}} = \mathrm{clip}\!\left(\frac{m - 20}{2}\right), \quad
f_{\text{clear}} = 1 - \frac{\overline{\text{cloud}}}{100}, \quad
f_{\text{access}} = \mathrm{clip}\!\left(1 - \frac{d_{\text{road}} - d_{\text{full}}}{d_{\text{zero}} - d_{\text{full}}}\right), \quad
\text{score} = \frac{\sum_j w_j f_j}{\sum_j w_j}
```

The hourly "go" score multiplies clear sky by usable darkness, which falls in twilight and under the Moon (*φ* is the
Moon's illuminated fraction); transparency and seeing are 1–5 proxies stepped on aerosol optical depth, humidity, high
cloud and the 250 hPa jet-stream wind, and dew risk on the temperature–dew point spread (≤ 2 °C high, ≤ 4 °C moderate):

```math
\text{go} = 100\,\max\!\left(0,\ 1 - \frac{\text{cloud}}{100}\right) D, \qquad
D = \begin{cases}
0 & \text{Sun above the horizon} \\
0.15 & \text{civil and nautical twilight} \\
0.5 & \text{astronomical twilight} \\
1 - 0.7\,\varphi & \text{dark, Moon up} \\
1 & \text{dark, Moon down}
\end{cases}
```

### 6. How the AI works: satellite data to models

```mermaid
flowchart TD
  EE["Earth Engine: NASA/VIIRS/002/VNP46A2<br/>daily DNB_BRDF_Corrected_NTL"] --> Q["keep Mandatory_Quality_Flag = 0<br/>cloud-free, high quality"]
  Q --> MED["annual median per pixel, 2012–2024<br/>computePixels onto both grids"]
  MED --> NPZ[("data_raw/viirs_*.npz")]
  NPZ --> BG["remove the airglow background<br/>median of the darkest fifth, per year"]
  BG --> ST["corrected stacks<br/>13 years × 2 grids"]
  ST --> PL["2024 radiance → placement weight<br/>for private and outside light"]
  ST --> TR["trend raster<br/>% change, first vs last 3 years"]
  ST --> STEP["step test on every lit pixel<br/>diagram 7"]
  STEP --> EV["change events<br/>8-connected groups, nearest town"]
  ST --> GB["LightGBM growth model<br/>diagram 8"]
  GB --> RATE["growth rate per ~1 km cell"]
  RATE --> G34["2034 sky: growth toggle,<br/>Observatory 2034 column and trajectory criterion"]
  TR --> PKG[("engine.json, viirs_a15, viirs_trend_a15")]
  EV --> PKG
  PKG --> UI["AI tab, Change events and Trend layers<br/>the inspector reruns the step test in the browser"]
```

Two models learn from data: a statistical change detector and a LightGBM forecast. Airglow, the faint light of the
upper atmosphere, follows the solar cycle (0.10 nW at the 2019–20 minimum, 0.33 nW in 2023); removing it first keeps
forests and wetlands from appearing to brighten ([ADR 0011](docs/adr/0011-viirs-first-run.md)).

**The math.** Each year's value is the median of the high-quality nights, then the airglow background is removed:

```math
L_t(x) = \mathrm{median}_{\text{nights in year } t,\ \mathrm{QF} = 0} R(x), \qquad
b_t = \mathrm{median}_{x \in \mathcal{D}} L_t(x), \qquad
\tilde L_t(x) = \max\big(L_t(x) - b_t,\ 0\big)
```

*R* is the daily BRDF-corrected radiance (nW cm<sup>−2</sup> sr<sup>−1</sup>) and 𝒟 the darkest fifth of the grid by
2012–2024 median radiance (b<sub>2020</sub> = 0.10, b<sub>2023</sub> = 0.33 on the region grid). Analysis uses log
radiance with a floor, the region's shared movement, and a cell is tested only if lit at either end:

```math
y_t(x) = \ln \max\big(\tilde L_t(x),\ 0.05\big), \qquad
c_t = \mathrm{median}_{x\ \text{lit}} \big(y_t(x) - \bar y(x)\big), \qquad
\text{lit}(x) \iff \max\big(\bar{\tilde L}_{2012\text{-}14}(x),\ \bar{\tilde L}_{2022\text{-}24}(x)\big) > 1\ \text{nW}
```

The trend map and the growth-rate fallback (used if fewer than 500 cells are lit) are

```math
\Delta\%(x) = 100\left(\frac{\max\big(\bar{\tilde L}_{2022\text{-}24}(x),\ 0.05\big)}{\max\big(\bar{\tilde L}_{2012\text{-}14}(x),\ 0.05\big)} - 1\right), \qquad
\hat r_{\text{TS}}(x) = \mathrm{median}_{i < j} \frac{y_j(x) - y_i(x)}{t_j - t_i}
```

the second being the Theil-Sen slope, robust to a few bad years.

### 7. The step test for one pixel (`ml/trends.py`)

```mermaid
flowchart TD
  A["13 yearly values of one cell"] --> L{"lit?<br/>first or last 3-year mean above 1 nW"}
  L -- no --> N1["not tested: too dim"]
  L -- yes --> C["ln radiance minus the region's<br/>shared movement"]
  C --> F1["fit a straight line"]
  C --> F2["fit a line plus a step<br/>at each split year 2015–2022"]
  F1 --> FS["F statistic for adding the step<br/>keep the best split"]
  F2 --> FS
  FS --> T{"F at least 36.3?<br/>1 in 1,000 under pure noise,<br/>from 200,000 simulated cells"}
  T -- no --> N2["no step: a trend fits as well"]
  T -- yes --> SZ{"step at least 20%?"}
  SZ -- no --> N3["real but small step"]
  SZ -- yes --> Y["flagged: step year and size"]
```

Choosing the best of eight split years inflates an ordinary F test, so the cutoff comes from simulating noise-only
series; the statistic does not depend on the line or the noise level, so one simulation serves every pixel. At the
real year-to-year scatter (about 10%), large new lighting is found and most 20–40% retrofit drops are not
([ADR 0012](docs/adr/0012-step-test-and-ai-tab.md)).

**The math.** With the region's movement removed, *z*<sub>t</sub> = *y*<sub>t</sub> − *c*<sub>t</sub>, two models are
fitted by least squares to the 13 years (*n* = 13):

```math
\text{M}_1:\ z_t = a + b\,t + \varepsilon_t, \qquad
\text{M}_2^{(k)}:\ z_t = a + b\,t + d\,\mathbf{1}[\,t \ge k\,] + \varepsilon_t, \qquad k \in \{2015, \dots, 2022\}
```

```math
F_k = \frac{\mathrm{RSS}_1 - \mathrm{RSS}_2^{(k)}}{\mathrm{RSS}_2^{(k)} / (n - 3)}, \qquad F^{*} = \max_k F_k, \qquad \hat k = \arg\max_k F_k
```

Taking the best of eight splits makes *F*\* larger than an ordinary *F* statistic, so its cutoff comes from simulation.
*F*\* does not change if the series is shifted, tilted or rescaled, so one simulation of pure noise serves every cell:

```math
F_{\text{crit}} = Q_{1 - \alpha}\!\left( F^{*} \ \middle|\ z_t \overset{\text{iid}}{\sim} \mathcal{N}(0, 1) \right) = 36.3, \qquad \alpha = 0.001,\ \ 200{,}000\ \text{simulated series}
```

```math
\text{flagged}(x) \iff \text{lit}(x)\ \wedge\ F^{*}(x) \ge F_{\text{crit}}\ \wedge\ \big|e^{\hat d} - 1\big| \ge 0.20, \qquad
\text{step} = 100\,\big(e^{\hat d} - 1\big)\%\ \text{in year } \hat k
```

The expected number of chance flags is *α N*<sub>lit</sub> = 0.001 × 28,986 ≈ 29. Each lit cell's noise is
*σ̂* = √(RSS<sub>1</sub>/(*n* − 2)) (median 9.7%), and the detection rates in the AI tab are the shares flagged among
20,000 simulated series with that noise and a step of the given size in 2019. Flagged cells are grouped into 8-connected
events of one direction, ranked by the radiance they gained or lost:

```math
\Delta_{\text{event}} = \sum_{x \in \text{event}} \Big(\bar{\tilde L}_{2022\text{-}24}(x) - \bar{\tilde L}_{2012\text{-}14}(x)\Big)
```

### 8. The growth forecast and its back-test (`ml/growth.py`)

```mermaid
flowchart TD
  subgraph BT["Back-test: scored on years the model never saw"]
    direction LR
    X12["each cell in 2012<br/>distance to cores and roads, housing,<br/>elevation, conservation land, radiance"] --> FIT["fit LightGBM<br/>state → growth 2012–2018"]
    FIT --> PRED["apply to the 2018 state<br/>→ predicted 2024"]
    PRED --> SC["score against observed 2024<br/>beside no change and each cell's own trend"]
    SC --> REP["shown in the AI tab: median and log error,<br/>rate correlation, spatial-block CV,<br/>feature importance, predicted vs observed by tenth"]
  end
  subgraph FC["Forecast"]
    direction LR
    X18["each cell in 2018"] --> FIT2["refit: state → growth 2018–2024"]
    FIT2 --> APP2["apply to the 2024 state<br/>→ growth to 2034, assuming the 2018–24 pace"]
  end
  BT -- "then refit the same way on the latest window" --> FC
```

In this build the model matches "no change" on total brightness (21.2% median error each) because lit areas fell
3.7% in 2012–18 and rose 20.6% in 2018–24, a reversal nothing in the earlier years predicted. It does rank where
growth concentrates (correlation 0.35), the part that matters when comparing candidate sites.

**The math.** The target is a cell's average yearly growth in log radiance, and the inputs are its state at the start of
the window:

```math
r_{a \to b}(x) = \frac{\ln \max(L_b, 0.05) - \ln \max(L_a, 0.05)}{b - a}, \qquad
\mathbf{s}_a(x) = \big(d_{\text{road}},\ d_{\text{urban}},\ \rho_{\text{HU}},\ z,\ \mathbf{1}_{\text{conservation}},\ \ln \max(L_a, 0.05)\big)
```

LightGBM builds the model as a sum of small regression trees, each fitted to what the previous ones still get wrong
(squared loss):

```math
F_0 = \bar r, \qquad F_m(\mathbf{s}) = F_{m-1}(\mathbf{s}) + \eta\, f_m(\mathbf{s}), \qquad
f_m = \arg\min_{f \in \text{trees}} \sum_i \big(r_i - F_{m-1}(\mathbf{s}_i) - f(\mathbf{s}_i)\big)^2
```

with 300 trees, learning rate *η* = 0.05, at most 31 leaves, at least 40 cells per leaf, and 80% of rows and 90% of
inputs sampled per tree. The back-test and its scores:

```math
\hat F = \text{fit}\big(\mathbf{s}_{2012} \mapsto r_{2012 \to 2018}\big), \qquad
\hat L_{2024} = L_{2018}\, e^{6\, \hat F(\mathbf{s}_{2018})}
```

```math
\text{MdAPE} = \mathrm{median}_{L_{2024} > 0.5} \left| \frac{\hat L_{2024}}{L_{2024}} - 1 \right|, \qquad
\text{RMSE}_{\ln} = \sqrt{\overline{\big(\ln \hat L_{2024} - \ln L_{2024}\big)^{2}}}, \qquad
\rho = \mathrm{corr}\big(\hat F(\mathbf{s}_{2018}),\ r_{2018 \to 2024}\big)
```

The baselines replace the model's rate with 0 ("no change") or with each cell's own *r*<sub>2012→2018</sub>. Results in
this build: MdAPE 21.2% (no change 21.2%, own trend 25.4%), RMSE<sub>ln</sub> 0.449 (0.467), *ρ* = 0.35. The spatial check
assigns 16 × 16-cell blocks at random to five folds and predicts each fold from a model that never saw it:

```math
R^{2}_{\text{CV}} = 1 - \frac{\sum_i \big(r_i - \hat r_i^{(-\text{fold}(i))}\big)^{2}}{\sum_i \big(r_i - \bar r\big)^{2}} = 0.18
```

Feature importance is each input's share of the total loss reduction (split gain) across all trees. The forecast refits
on the latest window and carries that pace forward ten years:

```math
\hat F' = \text{fit}\big(\mathbf{s}_{2018} \mapsto r_{2018 \to 2024}\big), \qquad
\hat r(x) = \mathrm{clip}\big(\hat F'(\mathbf{s}_{2024}(x)),\ -0.01,\ 0.06\big), \qquad
L_{2034}(x) = L_{2024}(x)\, e^{10\, \hat r(x)}
```

Without the VIIRS cache, the rate falls back to Census housing growth by county subdivision,
*r* = ln(HU<sub>2020</sub>/HU<sub>2010</sub>)/10.

### 9. How the models are checked

```mermaid
flowchart TD
  subgraph PY["pytest"]
    T1["synthetic data: steady trends are not steps,<br/>false alarms near 1 in 1,000,<br/>a region-wide jump is not a local event"]
    T2["leakage: a back-test that saw 2018–2024<br/>would fail the test"]
    T3["the full VIIRS-mode build<br/>on a synthetic radiance cache"]
  end
  subgraph VT["vitest"]
    T4["browser step test = pipeline<br/>on every lit pixel"]
    T5["browser flux = engine/flux.py<br/>for every component"]
  end
  subgraph OBS["Against observations"]
    T6["10 corpus sites<br/>set the one global scale"]
    T7["53 Globe at Night SQM readings<br/>never fitted"]
    T8["NOAA EOG monthly composites<br/>one-off cross-check of the 2021–24 rise"]
  end
  PY ~~~ VT ~~~ OBS
```

**The math.** Naked-eye Globe at Night reports (limiting magnitude) are converted to sky brightness by inverting the
standard relation, and model-minus-observed residuals *e* are summarized with robust statistics:

```math
m_{\text{SQM}} = 5\Big(4.316 - \log_{10}\big(10^{(7.93 - \text{NELM})/5} - 1\big)\Big), \qquad
\tilde e = \mathrm{median}(e), \qquad \text{MAD} = \mathrm{median}\big|\,e - \tilde e\,\big|
```

For the 53 meter readings, *ẽ* = +0.52 mag and MAD = 0.45 mag (positive: the model is darker than observed).

## Data reality check (2026-09-26)

| Source (PRD 7) | Status |
| --- | --- |
| VIIRS VNP46A2 via Earth Engine | pulled 2026-10-19: 2012–2024 annual medians on both grids, 180+ clear nights per pixel per year; airglow background removed ([ADR 0011](docs/adr/0011-viirs-first-run.md)) |
| FDOT RCI Feature 341, District 2 | **no longer published** at the PRD endpoint; the statewide lighting points cover District 5 only. The FDOT count is spread along TIGER state roads (confidence 0.3) |
| Gainesville Socrata `tk33-9jw3` | 267 points |
| Alachua Cityworks test layer | endpoint timed out on every attempt |
| OSM street lamps | 744 nodes across the eight-county grid (PRD expected 20–40k for Alachua alone) |
| OSM roads | 88,957 public road segments, 2,494 tagged `lit=yes`; used to place modeled streetlights |
| Neighbor-county inventories | none public (no county/city streetlight service found; FDOT's public lighting layer covers two Orlando-area counties) |
| OSM sports venues | 2,304 candidates; 1,229 modeled inside the eight counties (lit-tagged, stadiums, untagged at 50%) |
| Florida DOR 2025 parcels (FGIO statewide centroids) | 91,929 parcels ≥ 5 acres in the 11 region counties; 1,205 qualified vacant-land sales 2021–2025 |
| DarkSky Approved luminaires | searchable list only, no prices or data feed; cards are generic types that link to it |
| AWS Terrain Tiles (3D terrain, live in the browser) | Terrarium DEM tiles (USGS 3DEP and other public DEMs), no key |
| OpenFreeMap / OpenMapTiles buildings and roads (3D, live) | building heights (`render_height`); roads carry modeled lamp positions |
| Open-Meteo forecast + air quality (Stargaze, live in the browser) | hourly cloud (0.2° grid), humidity, dew point, wind, 250 hPa wind, aerosol optical depth; CC BY 4.0, free for non-commercial use |
| Census | TIGERweb 2020 counts (the ACS API now needs a key, so the private stock uses the Alachua structure blend, 1.379 fixtures per housing unit) |
| 3DEP, FNAI, Globe at Night | pulled |

## Deviations from the PRD (with reasons)

See [docs/adr/](docs/adr/). In short:
1. Raster layers ship as compact 16-bit binary grids, not PMTiles, because the browser needs numeric values to combine basis layers. Surveyed fixtures ship as GeoJSON (fewer than 700 points). ([ADR 0001](docs/adr/0001-basis-layers-as-binary-grids.md))
2. Seed-mode emission: streetlights on the OSM road network, private light on Census housing, neighbor counts from derived rates, anchored to corpus site values. ([ADR 0002](docs/adr/0002-seed-mode-emission.md))
3. Band fractions stand for spectral chunks; spectral effects are per-SPD scalars on one spatial kernel. ([ADR 0003](docs/adr/0003-spectral-chunks.md))
4. Module B proxies until parcels, MODIS and VIIRS load; Section 3's "within 3 km scores 1" wins over the 6.6 access anchor. ([ADR 0004](docs/adr/0004-module-b-proxies.md))
5. Lighter Python stack: NumPy/SciPy/Shapely/tifffile instead of GeoPandas/rasterio/rio-pmtiles/tippecanoe. ([ADR 0005](docs/adr/0005-python-stack.md))
6. Land and facility pricing from the DOR tax roll and recorded sales; land-cost criterion at weight 0 by default. ([ADR 0006](docs/adr/0006-land-pricing.md))
7. Build mode catalog, sports lighting source, and evening viewing time (not PRD requirements; added on request). ([ADR 0007](docs/adr/0007-build-mode-catalog-sports.md))
8. Stargaze mode with live Open-Meteo weather (not a PRD requirement; added on request). ([ADR 0008](docs/adr/0008-stargaze-mode.md))
9. 3D terrain, light-source structures, Sites ground view and sky-glow indicators (added on request). ([ADR 0009](docs/adr/0009-3d-terrain-lights-skyglow.md))
10. WildSight Planner, a separate app on the same platform (added on request): see [wildsight/README.md](wildsight/README.md).
11. Public Art Policy Simulator, a third app on the same platform (added on request): see [publicart/README.md](publicart/README.md).
12. A homepage at the site root for the three apps; the Dark Sky Simulator moved to `/dark-sky/`, and old `/#s=…` links are forwarded. ([ADR 0010](docs/adr/0010-homepage-and-dark-sky-path.md))
13. VIIRS first run: no double scaling, a per-year airglow background removed, and a growth back-test scored against "no change". ([ADR 0011](docs/adr/0011-viirs-first-run.md))
14. Change events from a step-versus-trend test calibrated by simulation, and an AI tab that explains both models (added on request). ([ADR 0012](docs/adr/0012-step-test-and-ai-tab.md))

Not built (v2.0 stretch): the YOLOv8 luminaire detector on Mapillary imagery for US 441.

## Open items that need Jay (PRD 0B, plus new ones)

- The County's +19% Alachua radiance growth (2012–2024) [AC-EPAC] is not reproduced by VNP46A2 (+3.0%, first vs last three years); find out which product and method the County used before quoting it.
- The step test finds large new lighting but, at about 10% year-to-year noise, misses most retrofits; detecting those needs monthly data or utility work-order records ([ADR 0012](docs/adr/0012-step-test-and-ai-tab.md)).
- Confirm RHO's county and verify every approximate coordinate in 6.5 (they drive the sanity fit).
- Census API key (free) would restore the ACS structure-type split for the private stock.
- Ask FDOT District 2 where Feature 341 now lives, and Alachua County GIS about the Cityworks endpoint.
- Levy owner split for the 2,850 unincorporated fixtures (tariffs currently split equally).
- Choose the host path (jayrosen.design/dark-sky/v2 or GitHub Pages). The build is static with relative paths; `.github/workflows/pages.yml` deploys `web/dist` once this folder is a GitHub repository.

## Layout

A homepage (`/`, `web/index.html`) and three apps share this repository, build and deployment: the Dark Sky
Simulator (`/dark-sky/`), [WildSight](wildsight/README.md) (`/wildsight/`, roadside wildlife-detection planning) and
the [Public Art Policy Simulator](publicart/README.md) (`/public-art/`, Chapter 5.5 Art in Public Places planning).
They share the mapping core, astronomy and UI (`web/src/shared`) and the backend plumbing (`ingest/`,
`counties/region`); no app imports another's code.

```
engine/    pure physics (Garstang kernel, spectral, Bortle, MCDA, flux)
ingest/    public-data connectors, shared by the apps (cache to data_raw/, git-ignored)
pipeline/  ingest_all, build, VIIRS mode, sanity check, encoders
ml/        VIIRS trend + step-change detector, LightGBM growth model
seed/      PRD Section 6 constants with provenance
counties/  12001 and 12075 data packages, region + grids
web/       homepage and React clients; web/public/<app>/data are the data packages, web/src/shared the shared platform
wildsight/ WildSight Planner pipeline, config, tests and docs (its web app is web/src/wildsight)
publicart/ Public Art Policy Simulator pipeline, registry, capital program, assumptions, tests and docs (web/src/publicart)
tests/     pytest (engine, contracts, ML, VIIRS-mode build)
docs/      ADRs, sanity check, demo script, v3.0 funding one-pager
```
