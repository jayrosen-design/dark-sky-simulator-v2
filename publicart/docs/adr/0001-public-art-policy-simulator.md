# Public Art ADR 0001: a third app for Chapter 5.5 planning on the Dark Sky / WildSight platform

Status: accepted · 2026-10-03 (added on request)

## Context
Jay asked for a Public Art Policy Simulator (PAPS) built from a technical requirements document (TRD) that was
written without knowledge of the Dark Sky and WildSight engines, and from the Art in Public Places Trust's discussion
handout of Aug 31 2026 (Priorities for Modernizing Chapter 5.5). The handout proposes a $300,000 cap indexed to CPI-U
from Oct 1 2027 and a 15% conservation reserve, and leaves GRU/enterprise funds, a Chapter 30 developer incentive and
City-County coordination to staff and legal study. The TRD treats those as rules and quotes figures that do not all
check out (AEP6 "total tax" is the federal line only; Common Light is not built yet; there is no U1 transect).

## Decision
- **A separate app** (`/public-art/`, `web/src/publicart`, `publicart/` pipeline) on the shared platform: dark
  basemap, shared astronomy (`web/src/shared/sky.ts`), terrain and buildings (`shared/map/terrain3d.ts`), share URLs
  and PDF writer. Panel left, map right, like the other apps.
- **Scope:** all four TRD modules at planning grade. The main switch compares the 1989 code with the Trust draft
  only; the deferred items live in a **Staff study** tab whose outputs carry `exploratory: true` and
  `legalConclusion: null` and never feed the headline figures.
- **Ledger semantics:** both versions retain allocations not used on site for art at other public places (the 1989
  code already allows it, Sec. 5.5-3(d)). The draft differs in the cap and its indexing, the wider exclusions, the
  15% reserve on unrestricted allocations, and separate accounting of restricted money.
- **Restricted money:** the illustrative capital program shows most City buildings paid from the County
  infrastructure surtax, bonds, GCRA money or grants. Treating the surtax as restricted (the default) leaves the
  reserve nearly empty; a switch shows the other reading. Whether the surtax may pay for art is a legal question.
- **Inventory:** no machine-readable City or County inventory exists, so the registry is hand-compiled from public
  sources (`registry.yaml`, a source per entry), geocoded with the Census geocoder, then OpenStreetMap search.
  Works listed in the Public Art Archive were added later (`registry_paa.yaml`, ADR 0002).
- **3D:** a Three.js custom layer on the MapLibre context draws procedural works (figure, sculpture, mural, fence,
  wall) lit by the Sun for the chosen date and hour, with ground shadows; works do not receive shadows (shadow acne
  at street scale), frustum culling is off (MapLibre's combined matrix defeats it), and murals snap to the nearest
  building wall from the basemap footprints. A `model_url` can later swap in a glTF model.
- **Impressions:** vehicles from traffic counts and speeds with a glance probability per street stream (a street is
  counted once however many pieces it is cut into); people on foot or bike from a 100 m grid: trail cells take the
  nearest trail counter's count, street cells an activity index whose scale is fitted to the off-trail counters
  (leave-one-out error shown). The animated agents are an illustration of the same flows.
- **Economics:** built bottom-up from stops and per-visitor AEP6 spending with a realisation factor; AEP6 sector
  totals are shown as context only and cannot enter project estimates.

## Consequences
- Every headline figure rests on hand-compiled or assumed inputs; the app and the brief say so.
- The walking model is rough (typically about a factor of 2.5 off at the counters); placement guidance is relative.
- Replacing `registry.yaml` with the City's inventory, `cip.yaml` with the adopted CIP, and the conservation rates
  with a conservator's survey would turn most assumptions into data.
