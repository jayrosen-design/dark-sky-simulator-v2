# ADR 0002: Import the Public Art Archive's Alachua County records, facts only

Status: accepted · 2026-10-04 (added on request)

## Context
Jay asked to fill out the collection from the Public Art Archive (publicartarchive.org, a publication of Creative
West). Its public search lists 133 works in Alachua County: 123 from UF's Art in State Buildings program, plus a few
City, County, GRU, 352walls and private works. Many of the UF works hang inside buildings. The archive's terms of use
allow non-commercial research use with citation, but grant no license to compile its records into another service
for the public; its descriptions and images are copyrighted. The simulator is public.

## Decision
- **Facts only, cited** (Jay's choice): `registry_paa.yaml` holds title, artist, year, building, address, the
  archive's coordinates and collection, each entry linked to its archive record and credited to the Public Art
  Archive (Creative West). No descriptions or images are copied. This relies on fair use for facts and on the terms'
  research allowance, not on Creative West's permission.
- **All works, indoor flagged** (Jay's choice): a hand-coded `setting` per entry. `outdoor` or `indoor` only when the
  record states or clearly implies it, or OpenStreetMap maps the work outdoors; otherwise `unverified`, treated as
  indoor. Indoor and unverified works count for the collection and walking access, but get no street impressions
  and no 3D model; the Florida weathering factor in the conservation model applies to outdoor works only. They are
  drawn as smaller markers.
- Three records duplicate hand-compiled entries (Alachua, Moses, The Tonic of Wildness): those entries now cite the
  archive record instead of being repeated. One umbrella record (Light Abacus 1, 2 and 3) is skipped because its
  parts have their own records. Works the archive marks off view get status `off_view` (listed, not drawn).
- The import was a one-time pull on 2026-10-04; `registry_paa.yaml` is edited by hand from here.

## Consequences
- Of 129 entries: 18 outdoor, 76 indoor, 35 unverified. The unverified works (mostly UF sculptures) undercount
  impressions until someone checks them on site and changes `setting` to `outdoor`.
- If Creative West objects, delete `registry_paa.yaml` and the three archive links in `registry.yaml`, then rebuild.
- The archive does not warrant its records; nor does the simulator.
