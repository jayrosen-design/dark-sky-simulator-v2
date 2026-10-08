// Publicly owned buildings (publicart/facilities.py -> data/facilities.json): Alachua County outlines with building-area
// history, statewide parcel centres from the 2025 roll, and the parcel each artwork stands on. The art estimate applies
// only rules that are written down: Gainesville's Chapter 5.5 for City/GRU buildings and s. 255.043, F.S., for new state
// buildings. Planning estimates; pure functions.
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { inBounds, matcher, norm, type Bounds } from "./grants";
import type { Seed } from "../types";

export type FacClass = "state" | "county" | "city" | "school" | "federal" | "district";
export const CLASS_LABEL: Record<FacClass, string> = { state: "State", county: "County", city: "City", school: "School board", federal: "Federal", district: "District / authority" };
export const CLASS_COLOR: Record<FacClass, string> = { state: "#7cc4ff", county: "#5fd6c4", city: "#f6b44b", school: "#8fe38f", federal: "#f08ab8", district: "#a79f88" };

/** [year, area before, area after, estimated value of the added area, new building (area was 0), evidence: "area and value" | "area only"] */
export type Expansion = [number, number, number, number | null, boolean, string];
export interface AlachuaProps {
  id: string; cls: FacClass; owner: string; address: string | null; city: string | null; yb: number | null; nc: number | null;
  use: string | null; jv: number | null; bv: number | null; sqft: number | null;
  quality: string | null; acpa: string | null; ev: Expansion[]; area: Record<string, number>; jvh: Record<string, number>;
}
/** [id, class, owner, address, city, county, DOR use, just value, building value, new construction (2025 roll), year built,
 *  effective year, building area, lon, lat] */
export type FlFacRow = [string, FacClass, string, string | null, string | null, string | null, string | null, number, number, number,
  number | null, number | null, number | null, number, number];
export interface FacilitiesPkg {
  built: string; classes: FacClass[]; sources: { name: string; url: string }[];
  alachua: FeatureCollection<Polygon | MultiPolygon, AlachuaProps>;
  florida: { cols: string[]; rows: FlFacRow[] };
  /** registry art id -> Alachua facility id; catalog work id -> ["alachua", facility id] or ["parcel", class, owner, DOR use, just value, parcel id] */
  tags: { registry: Record<string, string | null>; catalog: Record<string, (string | number | null)[]> };
  report: Record<string, unknown>;
}

export interface Facility {
  id: string; source: "alachua" | "florida"; cls: FacClass; owner: string; address: string | null; city: string | null; county: string | null;
  use: string | null; jv: number | null; bv: number | null; sqft: number | null; yearBuilt: number | null; lon: number; lat: number;
  /** The latest construction this simulator can see: an Alachua area expansion, or the 2025 roll's new-construction value. */
  latest: { year: number; value: number | null; added: number | null; isNew: boolean } | null;
  events: Expansion[]; acpa: string | null; hay: string;
}

function centre(g: Polygon | MultiPolygon): [number, number] {
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0];
  let x = 0, y = 0;
  for (const [a, b] of ring) { x += a; y += b; }
  return [x / ring.length, y / ring.length];
}

const cache = new WeakMap<FacilitiesPkg, Facility[]>();

export function allFacilities(pkg: FacilitiesPkg): Facility[] {
  let out = cache.get(pkg);
  if (out) return out;
  out = [];
  for (const f of pkg.alachua.features) {
    const p = f.properties, [lon, lat] = centre(f.geometry), last = p.ev[p.ev.length - 1];
    // The latest construction: the 2025 roll's new-construction value, else the latest recorded area increase.
    const latest = p.nc && p.nc > 0 ? { year: 2025, value: p.nc, added: null, isNew: p.yb != null && p.yb >= 2024 }
      : last ? { year: last[0], value: last[3], added: last[2] - last[1], isNew: last[4] } : null;
    out.push({ id: p.id, source: "alachua", cls: p.cls, owner: p.owner, address: p.address, city: p.city, county: "Alachua", use: p.use, jv: p.jv, bv: p.bv,
      sqft: p.sqft, yearBuilt: p.yb, lon, lat, latest, events: p.ev, acpa: p.acpa,
      hay: norm(`${p.owner} ${p.address ?? ""} ${p.city ?? ""} ${p.use ?? ""} alachua county ${CLASS_LABEL[p.cls]}`) });
  }
  for (const [id, cls, owner, address, city, county, , jv, bv, nc, yb, , area, lon, lat] of pkg.florida.rows) {
    out.push({ id, source: "florida", cls, owner, address, city, county, use: null, jv, bv, sqft: area, yearBuilt: yb, lon, lat,
      latest: nc > 0 ? { year: 2025, value: nc, added: null, isNew: yb != null && yb >= 2024 } : null, events: [], acpa: null,
      hay: norm(`${owner} ${address ?? ""} ${city ?? ""} ${county ?? ""} county ${CLASS_LABEL[cls]}`) });
  }
  cache.set(pkg, out);
  return out;
}

export interface FacFilter { q: string; classes: FacClass[]; since: number | null; bounds: Bounds | null }

/** Matching facilities; `since` keeps those with construction in or after that year. */
export function filterFacilities(fs: Facility[], f: FacFilter): Facility[] {
  const match = matcher(f.q), cls = new Set(f.classes);
  return fs.filter((x) => cls.has(x.cls) && (f.since == null || (x.latest?.year ?? 0) >= f.since) && inBounds(f.bounds, x.lon, x.lat) && match(x.hay));
}

export interface ArtRule { program: string; amount: number | null; note: string }

/** The public-art money a construction value would carry under the rules that apply to this owner. */
export function artEstimate(fac: Facility, value: number | null, isNew: boolean, seed: Seed, code: "1989" | "draft"): ArtRule {
  const P = seed.policy, F = seed.facilities;
  if (value == null || value <= 0) return { program: "—", amount: null, note: "No construction value to apply a rule to." };
  if (fac.cls === "city") {
    if (!/GAINESVILLE/.test(fac.owner.toUpperCase())) return { program: "Local program", amount: null, note: "This city's own public-art rules are not modelled." };
    const cap = code === "draft" ? P.cap_draft.value : P.cap_1989.value;
    const amount = Math.min(value * P.allocation_rate.value, cap);
    return { program: "Gainesville Ch. 5.5", amount, note: `${(P.allocation_rate.value * 100).toFixed(0)}% of the construction budget, capped at $${cap.toLocaleString()} (${code === "draft" ? "Trust draft" : "1989 code"}).` };
  }
  if (fac.cls === "state") {
    const r = F.state_rule.value, amount = Math.min(value * r.rate, r.cap);
    const rule = `up to ${r.rate * 100}% of the construction appropriation, at most $${r.cap.toLocaleString()}, for original construction of a state building with public access`;
    return isNew ? { program: "s. 255.043, F.S.", amount, note: `New building: ${rule}.` }
      : { program: "s. 255.043, F.S. (if a new building)", amount, note: `Only if the added space is a new building (common on campuses, where one parcel holds many): ${rule}. An addition to or renovation of an existing building does not qualify.` };
  }
  if (fac.cls === "county") return { program: "County", amount: fac.county === "Alachua" ? 0 : null, note: fac.county === "Alachua"
    ? "No Alachua County percent-for-art rule was found; County art is budgeted project by project." : "This county's own public-art rules are not modelled." };
  return { program: "—", amount: null, note: "No public-art requirement is modelled for this owner." };
}

/** "private": a private owner's parcel; "none": no parcel under the point (streets, water); "other": in Alachua County,
 * not on a public parcel with a building (could be a park, a street or private land: only public buildings are loaded). */
export interface LandOwner { cls: FacClass | "private" | "none" | "other"; owner: string | null; facilityId: string | null }
export const LAND_LABEL: Record<LandOwner["cls"], string> = { ...CLASS_LABEL, private: "Private owner", none: "No parcel (street or water)",
  other: "Not on a public building parcel" };

const byId = new WeakMap<FacilitiesPkg, Map<string, Facility>>();
function index(pkg: FacilitiesPkg) {
  let m = byId.get(pkg);
  if (!m) { m = new Map(allFacilities(pkg).map((f) => [f.id, f])); byId.set(pkg, m); }
  return m;
}

/** Who owns the land under a Florida catalog work: a public class (with the building, if it is in this package), a
 * private owner, or "none" when no parcel lies under the point (streets, water). */
export function landOwnerOfWork(pkg: FacilitiesPkg, workId: string): LandOwner | null {
  const t = pkg.tags.catalog[workId];
  if (!t) return null;
  if (t[0] === "alachua") {
    const f = t[1] ? index(pkg).get(String(t[1])) : undefined;
    return f ? { cls: f.cls, owner: f.owner, facilityId: f.id } : { cls: "other", owner: null, facilityId: null };
  }
  const [, cls, owner, , , parcel] = t;
  if (!owner) return { cls: "none", owner: null, facilityId: null };
  return { cls: (cls as FacClass | null) ?? "private", owner: String(owner), facilityId: parcel && index(pkg).has(String(parcel)) ? String(parcel) : null };
}

/** Catalog works on the chosen kind of land: "public" (any public class), one class, "private", "other" or "none". */
export function onLand<T extends { id: string }>(works: T[], land: string, pkg: FacilitiesPkg | null): T[] {
  if (!land || !pkg) return works;
  return works.filter((w) => {
    const cls = landOwnerOfWork(pkg, w.id)?.cls;
    return land === "public" ? !!cls && !["private", "none", "other"].includes(cls) : cls === land;
  });
}

/** The public building a Gainesville registry work stands on, if any. */
export function landOwnerOfArt(pkg: FacilitiesPkg, artId: string): LandOwner | null {
  if (!(artId in pkg.tags.registry)) return null;
  const f = pkg.tags.registry[artId] ? index(pkg).get(String(pkg.tags.registry[artId])) : undefined;
  return f ? { cls: f.cls, owner: f.owner, facilityId: f.id } : { cls: "other", owner: null, facilityId: null };
}
