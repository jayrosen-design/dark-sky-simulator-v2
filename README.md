# Dark Sky Simulator v2.0

Static, phone-friendly demo of the Dark Sky Simulator for Alachua and Levy counties and their six neighbors
(Marion, Gilchrist, Putnam, Clay, Bradford, Union), built to the v2.0 scope in
[Dark_Sky_Simulator_v2_v3_PRD_TRD.md](Dark_Sky_Simulator_v2_v3_PRD_TRD.md) (Section 0A). It replaces v1's
multiplier heuristics with a Garstang single-scattering skyglow model computed offline, real public data,
seed economics with provenance, an observatory site-selection engine, and a browser-generated legislative brief.

**Every skyglow number is an uncalibrated planning projection.** No sky-quality meter data is used, utility
streetlight counts are modeled, and Bortle classes are labels on a computed magnitude (PRD 0A.5). The app says
so on every screen.

## Quick start

```bash
# Python 3.12 pipeline (uv or any venv)
python -m uv venv --python 3.12 .venv
python -m uv pip install --python .venv -e ".[dev,ml,viirs]"
.venv/Scripts/python -m pipeline.ingest_all      # pull public sources into data_raw/ (cached)
.venv/Scripts/python -m pipeline.build           # precompute web/public/data/ and docs/sanity_check.md
.venv/Scripts/python -m pytest                   # 49 tests

# Web client
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: requirement-ID acceptance tests
npm run build      # static site in web/dist (relative paths; host under any sub-path)
```

### Turning on VIIRS (needs you, once)

The PRD's satellite baseline (NASA Black Marble VNP46A2, 2012–2024) comes from Google Earth Engine, which needs
your Google account and a Cloud project registered for Earth Engine (free research tier). No credentials exist on
this machine, so the current package runs in **seed mode** (below).

```bash
.venv/Scripts/earthengine authenticate
.venv/Scripts/python -m pipeline.ingest_all --viirs --ee-project <your-gcp-project>
.venv/Scripts/python -m pipeline.build
```

The build then switches to VIIRS mode automatically: light placement follows 2024 radiance, per-pixel trend and
retrofit step-change maps and a 2012–2024 year slider appear, and 10-year growth comes from the LightGBM forecast
with its 2012–2018 → 2024 back-test error shown in the Observatory tab. That path is covered by a test with a
synthetic radiance cache (`tests/test_viirs_mode_build.py`); it has not yet run on real VNP46A2 data.

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
A **Budget** readout on the map (every tab but Observatory) keeps public cost, yearly savings, payback, 15-year ROI
and a cumulative cash chart in view for the current scenario; it collapses to one line and links to the Costs tab.

Also shipped: the A-06 tariff and rate date on every money line, the Groveland-style ordinance preset (A-04 is
v3.0, but the preset drives the AI Days headline), five-band spectral view with scotopic mode, a VIIRS vs visual
readout showing DNB blue-blindness, Levy dark-sky overlay rings (LZ0/LZ1 per [LEVY-OVERLAY]), a 10-year growth
toggle, shareable scenario URLs, PNG map export, and a Three.js all-sky view driven by the computed zenith value
(full-screen mode with a site picker; stars, Milky Way, Sun and Moon placed for any date and site time, with
twilight and moonlight added (Krisciunas & Schaefer 1991); compass, altitude-ring, light-dome and star-name overlays;
autoplay in full screen).

Headline projections (seed mode, uncalibrated; zenith mag/arcsec², higher is darker):

| Scenario (Alachua + Levy unless noted) | Paynes Prairie | RHO | CAV | Public CAPEX | Payback |
| --- | --- | --- | --- | --- | --- |
| Today (model, late night) | 20.98 | 21.66 | 21.85 | – | – |
| All public fixtures U0 + 3000K | 21.20 | 21.74 | 21.87 | $17.2M | 7.4 yr |
| Groveland-style, public only | 21.31 | 21.77 | 21.88 | $26.6M | 18.6 yr |
| Groveland-style, public + private | 21.62 | 21.86 | 21.93 | $26.6M (public) | 18.6 yr |
| Groveland-style, public + private, all 8 counties | 21.65 | 21.89 | 21.94 | $98.9M (public) | 17.0 yr |
| Levy overlays (LZ0 2 mi, LZ1 5 mi) around RHO and CAV | 20.98 | 21.76 | 21.87 | $0.75M | 13.6 yr |
| Marion public fixtures U0 + 3000K (alone) | 20.99 | 21.67 | 21.85 | $30.8M | 9.2 yr |
| Today, evening (20:30–22:30) | 20.56 | 21.55 | 21.78 | – | – |
| Evening, all sports fixtures → LED 3000K with visors, 8 counties | 20.76 | 21.62 | 21.82 | $75.8M | – |

Cross-checks against the corpus: the public-only retrofit gives Paynes Prairie +0.22 mag (the Gainesville
assessment [GNV-ASSESS] predicted +0.2 to +0.4), and the Levy public retrofit CAPEX of $1.88M matches
[ECON-RETRO]'s median. The Groveland payback is long because dimming needs a $202 smart node on every public
fixture, and Clay/CFEC deemed tariffs earn nothing from dimming.

## How it works

```
data_raw/ (cached public pulls) ─┐
seed/  (PRD 6 constants)        ─┼─> pipeline/build.py ──> web/public/data/ ──> web/ (static React + MapLibre)
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

### Seed mode (current package)

Until VIIRS is loaded, public streetlights are placed on the OpenStreetMap road network (roads tagged `lit=yes`
count fully; other roads in proportion to Census housing density), using the PRD 6.5 counts by owner for Alachua
and Levy. The six neighbors have no public inventory anywhere, so their public counts come from rates derived from
Alachua and Levy (0.464 fixtures per urban home, 0.148 per rural home, confidence 0.2). Private light follows
Census 2020 housing. One global flux scale is fitted to the ten corpus site magnitudes (RMSE 0.52 mag); that is a
sanity fit, not calibration. Against 53 public Globe at Night **SQM** readings never used in any fit, the median
model − observed residual is +0.48 mag (±0.45): the model reads somewhat dark. For the 11 readings taken after
midnight it is +0.15 mag. See
[docs/sanity_check.md](docs/sanity_check.md).

## Data reality check (2026-09-26)

| Source (PRD 7) | Status |
| --- | --- |
| VIIRS VNP46A2 via Earth Engine | code ready, **not pulled** (needs your credentials) |
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

Not built (v2.0 stretch): the YOLOv8 luminaire detector on Mapillary imagery for US 441.

## Open items that need Jay (PRD 0B, plus new ones)

- Run `earthengine authenticate` so the VIIRS series, trend maps and growth back-test can be generated.
- Confirm RHO's county and verify every approximate coordinate in 6.5 (they drive the sanity fit).
- Census API key (free) would restore the ACS structure-type split for the private stock.
- Ask FDOT District 2 where Feature 341 now lives, and Alachua County GIS about the Cityworks endpoint.
- Levy owner split for the 2,850 unincorporated fixtures (tariffs currently split equally).
- Choose the host path (jayrosen.design/dark-sky/v2 or GitHub Pages). The build is static with relative paths; `.github/workflows/pages.yml` deploys `web/dist` once this folder is a GitHub repository.

## Layout

```
engine/    pure physics (Garstang kernel, spectral, Bortle, MCDA, flux)
ingest/    public-data connectors (cache to data_raw/, git-ignored)
pipeline/  ingest_all, build, VIIRS mode, sanity check, encoders
ml/        VIIRS trend + step-change detector, LightGBM growth model
seed/      PRD Section 6 constants with provenance
counties/  12001 and 12075 data packages, region + grids
web/       React client; web/public/data is the published package
tests/     pytest (engine, contracts, ML, VIIRS-mode build)
docs/      ADRs, sanity check, demo script, v3.0 funding one-pager
```
