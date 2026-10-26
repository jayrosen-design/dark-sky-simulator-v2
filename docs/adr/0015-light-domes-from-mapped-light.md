# ADR 0015: Light domes in the all-sky view come from the mapped light

Status: accepted · 2026-10-25

## Context
The all-sky view's zenith brightness is the model's, but its spread over the sky was a stand-in (ADR 0009): up to eight
Gaussian domes toward the five towns in `light_domes`, sized by population ÷ distance^2.5 and scaled with the site's
zenith change. The visible sky drew them as fixed orange blobs. So the domes did not follow where the light actually
is, did not respond to a scenario town by town, and most horizons looked clean: from Paynes Prairie Overlook facing
east or southeast there was almost no glow, unlike photographs from the same spot.

## Decision
- **Sources:** every 15" cell's VIIRS 2024 upward radiance (airglow removed), times 1 + the scenario's change in that
  cell's sky (`relChange15`), so a scenario dims the domes of the places it covers and leaves the rest. Cities
  outside the grid (Jacksonville, Tampa, Tallahassee from `light_domes`) are point sources at the light per resident
  measured within 10 km of Gainesville.
- **Spread (`engine/horizon.ts`):** a single-scattering estimate in an exponential atmosphere (scale height H = 3 km)
  for a source at distance d: zenith brightness B_z ≈ 1 / (d²/H + 2d/π); toward it at altitude h and azimuth offset Δφ,
  B_h ≈ π e^(−d cosΔφ tan h / H) / (d √(sin²Δφ + cos²Δφ tan²h)); both × e^(−d/40 km). A near town makes a tall, wide
  dome (height ≈ atan(H/d)), a far city a low, narrow one. The view keeps a 120 × 16 table (azimuth × √altitude) of
  Σ E·B_h / Σ E·B_z, the glow relative to the zenith artificial glow, so the modeled zenith value is unchanged.
- **Display:** the table is a half-float texture read by the luminance shader (false-color map, readouts) and by the
  visible sky, whose glow color and level now follow each direction's modeled brightness; the Milky Way fades
  into the domes. About 60 ms per site and scenario.

## Results (late-night window, today)
| Site (zenith) | 5° toward the brightest direction | 5°, darkest direction |
| --- | --- | --- |
| Paynes Prairie Overlook (20.98) | 17.7, NW-N (Gainesville 8 km) | 19.6, SE |
| Rosemary Hill Observatory (21.69) | 19.2, NE (Gainesville 38 km) | 20.5, SW-W |
| Chiefland Astronomy Village (21.86) | 19.9, N | 20.9, SW |
| Downtown Gainesville (18.43) | 15.8, W | 16.9, SE |

## Consequences
- Brightness away from the zenith is still an estimate, not a model output or a calibration: one scale height, no
  phase function, no terrain. Checking it needs all-sky photometry (an all-sky camera or SQM scans), a v3 item.
- VIIRS is blind to much of the blue in white LEDs and is a 2024 snapshot; the scenario factor is the change in each
  cell's sky (smoothed by the scattering kernel), so domes near county lines change gradually.
- The Stargaze spot report still names the strongest town domes with the population formula (`engine/spots.ts`).
