// Florida public art catalog (publicart/florida.py -> data/florida.json): every Florida work in the Public Art Archive,
// facts only, with budgets where a commissioning body's document states one. Identification only: the Gainesville
// models (impressions, equity, conservation) do not run on it. Pure functions.
import { inBounds, matcher, norm, type Bounds } from "./grants";

/** [id, title, artist, year, medium, work types, placement, collection, owner, building, city, county, lon, lat,
 *  off view, archive url, budget, budget kind, budget source] */
export type WorkRow = [string, string, string | null, number | null, string | null, string | null, string | null, string | null, string | null,
  string | null, string | null, string | null, number, number, boolean, string, number | null, string | null, string | null];

export interface FloridaPkg {
  built: string; fetched: string; source: { name: string; url: string; note: string };
  works: { cols: string[]; rows: WorkRow[] };
  report: { florida: number; with_year: number; with_medium: number; with_budget: number; off_view: number; by_county: Record<string, number>; by_collection: Record<string, number> };
}

/** A work can belong to more than one collection: they are joined with "; " (names themselves may contain commas). */
export interface Work {
  id: string; title: string; artist: string | null; year: number | null; medium: string | null; types: string | null; placement: string | null;
  collection: string | null; owner: string | null; building: string | null; city: string | null; county: string | null; lon: number; lat: number;
  offView: boolean; url: string; budget: number | null; budgetKind: string | null; budgetSource: string | null; hay: string;
}

const cache = new WeakMap<FloridaPkg, Work[]>();

export function allWorks(pkg: FloridaPkg): Work[] {
  let out = cache.get(pkg);
  if (out) return out;
  out = pkg.works.rows.map(([id, title, artist, year, medium, types, placement, collection, owner, building, city, county, lon, lat, offView, url,
    budget, budgetKind, budgetSource]) => ({ id, title, artist, year, medium, types, placement, collection, owner, building, city, county, lon, lat,
    offView, url, budget, budgetKind, budgetSource,
    hay: norm(`${title} ${artist ?? ""} ${medium ?? ""} ${types ?? ""} ${collection ?? ""} ${city ?? ""} ${county ?? ""} ${county ? "county" : ""} ${building ?? ""}`) }));
  cache.set(pkg, out);
  return out;
}

export interface CatalogFilter { q: string; county: string | null; collection: string | null; budgetOnly: boolean; bounds: Bounds | null }

export function filterWorks(works: Work[], f: CatalogFilter): Work[] {
  const match = matcher(f.q);
  return works.filter((w) => (!f.county || w.county === f.county) && (!f.collection || (w.collection ?? "").split("; ").includes(f.collection))
    && (!f.budgetOnly || w.budget != null) && inBounds(f.bounds, w.lon, w.lat) && match(w.hay));
}

/** Most common values first, for the county and collection pickers. */
export function tally(works: Work[], pick: (w: Work) => string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const w of works) for (const v of pick(w)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
