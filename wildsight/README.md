# WildSight Planner

Where roadside AI wildlife-detection units ([WildSight](https://github.com/jayrosen-design/wildsight), UF Engineering
Innovation Team 7) would prevent the most animal-vehicle crashes in the eight-county North Central Florida map range,
how many units and LoRa gateways that takes, and what scaling the service costs. A separate app from the Dark Sky
Simulator that runs on the same mapping and backend platform.

Live: `/wildsight/` on the same deployment (e.g. https://dark-sky-simulator-v2.vercel.app/wildsight/) is the WildSight
homepage, the 3D animated pitch and simulation site, with the planner embedded right below its hero simulation. The
planner on its own: `/wildsight/planner.html`. Its WildSight links lead to the homepage.

## What it does
- Roads colored by expected animal-crash risk: a negative-binomial crash model (traffic, speed, habitat, two-lane)
  blended with each road's own 2014-2024 record (Empirical Bayes, Highway Safety Manual), back-tested on 2020-2024.
- Deployment planner: riskiest miles, UF hotspots or all candidate roads; units at 40 m on both shoulders (17 m PIR),
  gateways by LoRa radio cover; CAPEX, running cost, crashes avoided, benefit/cost, payback, break-even unit price and
  a scaling table. Every price is an editable, sourced assumption (`seed.yaml`).
- A recreation of the WildSight pitch site's "With WildSight / Today" corridor simulation and its beacon
  stopping-distance demo, on the selected road.
- Design record: [docs/adr/0001-roadside-planner.md](docs/adr/0001-roadside-planner.md).

## Where everything lives
WildSight-only code and data:
```
wildsight/                     this folder: offline pipeline, config, tests, docs
  ingest.py                    roads (OSM), FDOT AADT, UF crash reports and hotspots
  build.py                     segments, crash model, back-test, data package  (python -m wildsight.build)
  seed.yaml                    device, network, cost and benefit assumptions with sources
  tests/test_build.py          model and data-package tests
  docs/adr/                    design records
web/wildsight/index.html       homepage (/wildsight/): the WildSight repo's index.html plus a Planner section
web/wildsight/planner.html     planner page (/wildsight/planner.html; embedded in the homepage, where the map's
                               wheel scrolls the page and Ctrl + wheel / pinch zooms)
web/src/wildsight/             app code: App, MapView, TrafficPanel, CorridorSim, engine, state, tests
web/public/wildsight/data/     data package: roads.json, crashes.json, hotspots.geojson, counties.geojson, meta.json
```
Shared with the Dark Sky Simulator (the platform):
```
web/src/shared/map/            MapLibre setup and basemap, meter-sized symbols, trackpad navigation, camera buttons
web/src/shared/ui.tsx          UI primitives (cards, sliders, segmented controls, number formats)
web/src/shared/data.ts         data loader (each app reads data/ next to its own page)
web/src/shared/ErrorBoundary.tsx, staleBuild.ts   error panels and reload-after-redeploy
ingest/common.py, census.py, landscape.py, inventory.py   HTTP, ArcGIS paging, raw-data cache, census and FNAI connectors
counties/region/manifest.yaml  the region: model counties and grids
web/ (Vite, Tailwind, Vitest), vercel.json                one build and one deployment for all the apps
```
Nothing in the Dark Sky Simulator imports WildSight code, and WildSight imports only `shared/` and the backend
plumbing above. To split it into its own repository later, copy the WildSight paths plus `web/src/shared` and
`ingest/` and point a new Vite config at `web/wildsight/index.html` and `web/wildsight/planner.html`.

## Commands
```
python -m wildsight.build                     # rebuild the data package (~15 s; downloads are cached in data_raw/)
python -m pytest wildsight/tests              # pipeline tests
cd web && npm test                            # includes web/src/wildsight/test
cd web && npm run dev                         # http://localhost:5173/wildsight/
```

## Data sources
| Data | Use |
| --- | --- |
| Animal-Related Vehicle Collisions 2014-2024, UF Center for Landscape Conservation Planning, from Signal Four Analytics | 6,917 species-coded crash reports in the eight counties |
| Large Animal-Vehicle Collision Hotspots 2014-2024 (Gi*), UF CLCP for FDOT | 179 hotspot zones |
| FDOT Annual Average Daily Traffic (2025) | traffic on 73% of segment-km |
| OpenStreetMap (ODbL) | 19,037 roads, 15,747 segments, 8,555 km |
| FNAI conservation lands; 2020 Census block groups | habitat |

Caveats: reported crashes undercount collisions; prices are design assumptions (the WildSight repo lists none);
WildSight's effect on animals and drivers is unproven until piloted. The crash layer is public but states no license;
it is credited to UF CLCP and Signal Four Analytics.
