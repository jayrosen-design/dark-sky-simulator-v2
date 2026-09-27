# From projection to evidence: Dark Sky Simulator v3.0

*Drawn from PRD/TRD Sections 5–8. v2.0 shows what the model can say with public data; v3.0 makes it defensible
for a county attorney, an ESPC lender, and UF Astronomy.*

## What v2.0 already shows (uncalibrated)
- Groveland-style ordinance in Alachua and Levy: Paynes Prairie 20.98 → 21.62 mag/arcsec² (clears the 21.2 DarkSky
  Park threshold), RHO 21.66 → 21.86, CAV 21.85 → 21.93 (Bortle 3 → 2).
- Public-only retrofit gives Paynes Prairie +0.22 mag, inside the +0.2 to +0.4 the Gainesville assessment predicted.
- Six neighboring counties are modeled too, but with no public inventory at all (confidence 0.2): utility data
  agreements matter beyond Alachua and Levy.
- A first ranked list of 20 candidate observatory sites across the 11-county region, each with a land-cost
  estimate from the 2025 tax roll and recorded sales (e.g. the top site is 93% water-management-district land).
- Alachua's measured +19% VIIRS radiance growth, 2012–2024 [AC-EPAC].

## What is missing, and what it costs (Phase 1, through 2027-03-31)
| Gap | v3.0 fix | Cost or dependency (PRD) |
| --- | --- | --- |
| No ground truth | 5 SQM stations per county + 50-node NightSky Ledger LoRaWAN pilot (2 SQM-LR, 48 TSL2591 nodes, 3 gateways) | ≈ $5,942 hardware (6.7) |
| Utility counts are modeled (confidence 0.3–0.5) | Data-sharing agreements with GRU, Duke, Clay, CFEC (research prompt D1) | staff time; ESPC partners have leverage |
| Fixture attributes unknown | Street-level CV pass (YOLOv8 + classifier) | ≈ $210 per 10,000 poles at list price (2.3) |
| VIIRS LED correction is literature-only | Fit CF locally on GRU's phased 3000K conversion pixels | Earth Engine access (free research tier) |
| Single-scattering preview only | ILLUMINA v2 Tier 2 runs; Tier 1 must agree within 0.15 mag | HiPerGator or cloud compute |
| Static site | FastAPI + PostGIS + job queue, forkable scenarios (A-03–A-06) | one research software engineer |

Exit gate: RMSE ≤ 0.25 mag and R² ≥ 0.85 at ≥ 5 stations per county; ≥ 90% of billed public fixtures inventoried
for one utility per county; one briefing sheet each to Alachua EPAC and Levy Planning & Zoning.

## Phases 2–3 (2027–2028)
UF site-selection validation with Dr. Lada's department (blind test on RHO/CAV vs poor controls, a 3-site field
campaign within ±0.20 mag), then the statewide onboarding CLI (≤ 10 working days per county with a public
streetlight layer), with Lake (Groveland) and Okeechobee (Kissimmee Prairie) as validation counties.

## Funding fits (Section 5)
SS4A planning (Levy holds a $120k FY23 grant; plan adoption due 2028-01-30), the Alachua Nature & Culture Destination
Enhancement Grant ($1.6M/yr TDT pool), and FEMA BRIC when the next NOFO opens. FWC Sea Turtle Grants do not fit
inland counties.
