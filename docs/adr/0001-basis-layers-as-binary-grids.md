# ADR 0001: Basis layers ship as 16-bit binary grids, not PMTiles

Status: accepted (v2.0) · 2026-09-26

## Context
PRD 0A.2/0A.3 asks for precomputed scenario basis layers combined client-side, published as PMTiles. The browser
has to multiply each layer by a scenario coefficient and sum them, which needs the numeric values, not rendered
tiles. The Module A grid is small (240 × 162 cells at 30″ for basis layers, 480 × 324 at 15″ for the baseline, covering eight counties).

## Decision
Write each raster as row-major little-endian uint16: `log16` (log10 of luminance, 0 = zero) for skyglow and
`lin16` (linear, 65535 = NaN) for criteria. Each row is stored as successive differences and the file is gzipped
(still named `.bin`, so hosts do not add their own Content-Encoding); the browser inflates it with
DecompressionStream. `engine.json` indexes files, shapes and scales. The browser decodes
once into Float32Array and paints canvases into MapLibre image sources. Surveyed fixtures (979 points after 5 m deduplication)
ship as GeoJSON.

## Consequences
- After the eight-county extension: 76 basis layers (38 components × 2 kernels) are 2.5 MB compressed (about 5.9 MB
  raw), loaded after first paint; the 15″ baseline is 227 KB. A control change repainted in about 55 ms on the
  earlier two-county grid; the eight-county grid is about 1.8× larger.
- No tippecanoe or PMTiles tooling is needed on Windows.
- Moving to PMTiles/COG later (v3.0 TiTiler) only changes the publish step; field names stay those of PRD 4.3.
- Layers are 30″ (~1 km); the delta map is upsampled to 15″ for display, and site metrics use exact 15″ contributions.
