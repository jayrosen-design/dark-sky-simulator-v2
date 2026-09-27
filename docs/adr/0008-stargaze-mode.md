# ADR 0008: Stargaze mode (everyday observing, weather, dark-sky property)

Status: accepted (v2.0) · 2026-09-26

## Context
The simulator served planners (lighting scenarios) and the observatory siting study. Amateur astronomers,
astrophotographers, campers and people shopping for land asked a simpler question: where is it dark, will it be
clear tonight, can I get there, and can I be there? Astronomy weather services (Astrospheric, Clear Sky Chart,
7Timer) answer the weather half; none combine it with a modeled light-pollution map, land ownership and prices.

## Decision
- **Stargaze tab** with four uses, each a weighted score over Module B layers plus weather:
  - Grab & go: darkness 0.40, tonight's clear sky 0.35, road access 0.25 (full within 1 km, zero at 10 km).
  - Camp / star party: darkness 0.35, clear 0.30, public land 0.25, open views 0.10.
  - Deep-sky imaging: darkness 0.50, clear 0.35, open views 0.15.
  - Buy property: darkness 0.35, 2034 darkness 0.20, price 0.30 (log scale $2,000-$40,000/acre), open views 0.15;
    only cells with >= 10 private acres in parcels; weather is not used.
  Darkness is the modeled zenith magnitude scaled 20 -> 22. Top spots are the best cells at least 10 km apart.
- **Open views** = terrain horizon (Module B, 16 azimuths within 10 km) and the share of 16 directions with open
  water within 3 km (lakeshore and coast give low horizons). Trees and buildings are not modeled.
- **Weather:** Open-Meteo forecast API (no key; CC BY 4.0; free for non-commercial use): hourly total cloud on a
  0.2° grid over the region for the map (one multi-location request), and per spot hourly low/mid/high cloud,
  humidity, temperature, dew point, wind, gusts, visibility and 250 hPa wind, plus aerosol optical depth from the
  Open-Meteo air-quality API. Responses are cached for 30 minutes in memory. If the live call fails, the app falls
  back to **simulated** weather (a deterministic synthetic pattern) and says so; users can also pick simulated.
- **Observing indices:** transparency proxy (AOD, humidity > 85%, high cloud > 30%), seeing proxy (250 hPa jet
  speed, gusts > 8 m/s), dew risk (temperature - dew point <= 2 °C high, <= 4 °C moderate), usable darkness from
  Sun and Moon (0 in daylight, 0.15 civil/nautical, 0.5 astronomical twilight, 1 - 0.7 x Moon illumination when the
  Moon is up), and a go score = clear fraction x usable darkness. All labeled proxies.
- **Map:** modeled sky over the 11-county region, with a forecast cloud layer (bilinear 8x upsample) or a
  "dark & clear" layer, a forecast-hour slider, numbered best spots, and click-anywhere spot reports.
- **Spot report:** modeled sky, Bortle and naked-eye limit, 2034 trend, strongest light domes with direction and
  distance, horizon, road distance, ownership (public agency class) with a rules reminder, typical vacant-land
  price, tonight's darkness window and Moon, the hourly chart (Clear-Sky-Chart colors), "Sky view here" (the all-sky
  view at that spot and hour), save (browser storage), and directions.

## Consequences
- Seeing and transparency are not numerical seeing forecasts; the chart marks them with an asterisk.
- Public land is not the same as open for night use or camping; the report tells users to check agency rules.
- The free Open-Meteo tier is non-commercial; a commercial deployment needs an Open-Meteo subscription or another
  provider.
- Sky values are the uncalibrated model; Stargaze is only as good as Module B outside Alachua and Levy.
