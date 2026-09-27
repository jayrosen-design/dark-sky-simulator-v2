# ADR 0009: 3D terrain, light-source structures, ground view and sky-glow indicators

Status: accepted (v2.0) · 2026-09-26

## Context
Planners wanted to see, in Build mode, the terrain, the buildings and the fixtures that emit the light, with a
streetlight shown roughly where it stands, and to use the same scene under the stars in the Sites sky view, with
indicators for how sky glow varies across the sky.

## Decision
- **3D map (planner tabs, "3D" button):** MapLibre terrain from AWS Terrain Tiles (Terrarium PNG; USGS 3DEP and
  other public DEMs; no key) at ×3 exaggeration (north Florida relief is tens of meters), hillshade, and
  fill-extrusion buildings from the OpenFreeMap/OpenMapTiles `building` layer (`render_height`). Tilt/rotate are
  enabled only in 3D. The 450 m sky-brightness raster fades out as you zoom in so streets stay readable.
- **Light sources:** poles (dark extrusions) with glowing heads colored by lamp type (SPD) and a ground light pool
  sized in meters (tighter for U0, wider for uplight-heavy fixtures).
  - Mapped streetlights (Gainesville Socrata, OSM) at their surveyed positions and SPD.
  - Modeled fixtures at street level (zoom ≥ 14): each ~450 m cell's expected count (the Module A fixture layers)
    is spread along the mapped roads inside the cell, streetlights on the road, business lights set back ~28 m and
    porch lights ~16 m on alternating sides. Surveyed lamps in a cell are subtracted from its modeled count. Cells are
    filled nearest-first under a lamp budget (6,000 on the map, 5,000 in the ground view).
  - Sports: four towers per OSM venue (24 m fields, 12 m courts), lit only in the evening viewing window.
  - An equipped catalog card recolors its share (%) of the slot in the selected counties.
  Building footprints from the tiles were not usable for placement (`querySourceFeatures` returned only a few
  dozen of the drawn buildings), so roads carry all modeled positions.
- **Sites ground view ("Terrain & lights"):** a second MapLibre map, non-interactive, stacked over the Three.js
  dome with no sky, so stars show above the horizon and buildings occlude them. It follows the dome camera
  (bearing, field of view); eye height 2 / 30 / 150 / 600 m. MapLibre misdraws the ground when pitched above the
  horizon (pitch > 90° is experimental), so for upward views its camera stays at pitch 89° and a lens shift
  (`padding`) places its horizon where the dome's horizon is; the ground layer hides when the horizon leaves the
  frame. Looking down is allowed only with the ground on.
- **Indicators:** a directional luminance model (`engine/skyglow.ts`, with a GLSL twin): each component (artificial,
  natural, twilight, moonlight) is normalized so the zenith equals the modeled value; the spread is illustrative
  (brightening toward the horizon, Gaussian light domes toward the regional towns, forward scattering near the Sun
  and Moon). Shown as a sky-glow curve (10° altitude by azimuth) drawn along the horizon and as a chart, a
  crosshair readout in mag/arcsec² and mcd/m² (L = 10.8e4 · 10^(-0.4 m) cd/m²), and a false-color luminance map.

## Consequences
- Modeled lamp positions are plausible, not surveyed; only Gainesville's mapped lamps are exact.
- Angular sky-glow values away from the zenith are not model outputs; the chart and legend say so.
- The ground view needs the basemap and terrain tiles online.
