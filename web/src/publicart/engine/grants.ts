// Arts funding index (publicart/grants.py -> data/grants.json): federal arts awards, Florida state arts awards, open
// federal opportunities and curated calls to artists, with search, filters and dollar totals. Pure functions.

export type AgencyCode = "NEA" | "NEH" | "IMLS";
export type Source = AgencyCode | "FL";
/** [id, agency, fiscal year, amount, recipient, city, state, lon, lat, location precision, assistance listing, description] */
export type AwardRow = [string, AgencyCode, number | null, number, string, string | null, string | null, number, number, "zip" | "county" | "city", string | null, string | null];
/** [state fiscal year "2025-26", county, organization, program code, amount] */
export type FlRow = [string, string, string, string, number];

export interface Opportunity {
  id: string; number: string; title: string; agency: string; agency_code: string; status: string; posted: string | null; close: string | null;
  ceiling: number | null; floor: number | null; estimated_total: number | null; awards_expected: number | null; applicants: string[];
  summary: string | null; url: string;
}
export interface Call {
  id: string; title: string; organization: string; kind: string; city: string | null; state: string | null; budget_usd: number | null;
  budget_note: string | null; deadline: string | null; rolling: boolean | null; eligibility: string | null; source_url: string; retrieved: string;
  notes: string | null; lon: number | null; lat: number | null; located_by: string | null;
}
export interface GrantsPkg {
  built: string; period: { federal: string }; sources: { name: string; url: string | null; note?: string }[];
  awards: { cols: string[]; rows: AwardRow[] };
  florida: { cols: string[]; rows: FlRow[]; counties: Record<string, [number, number]>; pages: Record<string, string>; programs: Record<string, string> };
  opportunities: Opportunity[]; calls: Call[]; linkouts: { label: string; url: string; note?: string }[];
  report: Record<string, unknown>;
}

/** One award (federal or Florida) in a common shape for lists, search and the map. */
export interface Item {
  id: string; source: Source; year: number | null; yearLabel: string; amount: number; name: string; place: string;
  lon: number; lat: number; precision: string; desc: string | null; url: string | null; hay: string;
}

export const SOURCE_LABEL: Record<Source, string> = {
  NEA: "National Endowment for the Arts", NEH: "National Endowment for the Humanities", IMLS: "Institute of Museum and Library Services",
  FL: "Florida Division of Arts and Culture",
};
export const SOURCE_COLOR: Record<Source, string> = { NEA: "#b79cff", NEH: "#5fd6c4", IMLS: "#7cc4ff", FL: "#f6b44b" };
export const CALL_COLOR = "#f08ab8";

/** $950 · $45K · $1.2M · $3.4B */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** Lower case, accents and punctuation removed, padded with spaces so whole words can be found as " art ". */
export const norm = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Every word of the query must appear as a whole word, singular or plural ("art" finds art and arts, not
 * artificial or department); "quoted phrases" must appear as written. */
export function matcher(q: string): (text: string) => boolean {
  const terms = [...q.matchAll(/"([^"]+)"|(\S+)/g)].map((m) => norm(m[1] ?? m[2]).trimEnd()).filter((t) => t.trim());
  return (text) => terms.every((t) => text.includes(`${t} `) || text.includes(`${t}s `) || text.includes(`${t}es `));
}

const cache = new WeakMap<GrantsPkg, Item[]>();

/** Every award as an Item (memoised per package). Florida awards sit at their county's centre. */
export function allItems(pkg: GrantsPkg): Item[] {
  let out = cache.get(pkg);
  if (out) return out;
  out = [];
  for (const [id, agency, fy, amount, recipient, city, state, lon, lat, precision, cfda, desc] of pkg.awards.rows) {
    const place = [city, state].filter(Boolean).join(", ");
    out.push({ id, source: agency, year: fy, yearLabel: fy ? `began FY${fy}` : "", amount, name: recipient, place, lon, lat, precision, desc,
      url: `https://www.usaspending.gov/award/${id}`, hay: norm(`${recipient} ${place} ${desc ?? ""} ${agency} ${cfda ?? ""}`) });
  }
  pkg.florida.rows.forEach(([fy, county, org, program, amount], i) => {
    const c = pkg.florida.counties[county];
    if (!c) return;
    const end = 2000 + Number(fy.slice(-2));
    const prog = pkg.florida.programs[program] ?? program;
    const place = county === "Statewide" ? "Statewide, FL (shown at Tallahassee)" : `${county} County, FL`;
    out!.push({ id: `fl-${i}`, source: "FL", year: end, yearLabel: `FY${fy}`, amount, name: org, place, lon: c[0], lat: c[1],
      precision: "county", desc: prog, url: pkg.florida.pages[fy] ?? null, hay: norm(`${org} ${county} county fl florida ${prog} ${program}`) });
  });
  cache.set(pkg, out);
  return out;
}

export type Bounds = [number, number, number, number];   // west, south, east, north
export const inBounds = (b: Bounds | null, lon: number, lat: number) => !b || (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]);

export interface Filter { q: string; sources: Source[]; year: number | null; bounds: Bounds | null }

/** Items matching every word of the query, the chosen sources and year, and (if given) the map view. */
export function filterItems(items: Item[], f: Filter): Item[] {
  const match = matcher(f.q), src = new Set(f.sources);
  return items.filter((it) => src.has(it.source) && (f.year == null || it.year === f.year) && inBounds(f.bounds, it.lon, it.lat) && match(it.hay));
}

export const totalOf = (items: { amount: number }[]) => items.reduce((s, x) => s + x.amount, 0);

/** Florida awards summed per county (the sheets give no addresses). */
export function byCounty(items: Item[]) {
  const m = new Map<string, { place: string; lon: number; lat: number; total: number; n: number }>();
  for (const it of items) {
    if (it.source !== "FL") continue;
    const k = it.place, e = m.get(k) ?? { place: k, lon: it.lon, lat: it.lat, total: 0, n: 0 };
    e.total += it.amount; e.n += 1;
    m.set(k, e);
  }
  return [...m.values()];
}

/** Calls still open on `today` (ISO date): a deadline on or after today, or rolling. */
export const isOpen = (c: Call, today: string) => (c.deadline ? c.deadline >= today : !!c.rolling);

export function daysLeft(deadline: string | null, today: string): number | null {
  if (!deadline) return null;
  return Math.round((Date.parse(deadline) - Date.parse(today)) / 86400000);
}

export function filterCalls(calls: Call[], q: string, today: string, bounds: Bounds | null) {
  const match = matcher(q);
  return calls.filter((c) => isOpen(c, today) && (!bounds || (c.lon != null && c.lat != null && inBounds(bounds, c.lon, c.lat)))
    && match(norm(`${c.title} ${c.organization} ${c.city ?? ""} ${c.state ?? ""} ${c.kind} ${c.eligibility ?? ""}`)))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
}

/** Federal opportunities still accepting applications (or forecast), soonest deadline first. */
export function openOpportunities(opps: Opportunity[], q: string, today: string) {
  const match = matcher(q);
  const iso = (s: string | null) => { const t = s ? Date.parse(s) : NaN; return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); };
  return opps.map((o) => ({ ...o, closeIso: iso(o.close) }))
    .filter((o) => (!o.closeIso || o.closeIso >= today) && match(norm(`${o.title} ${o.agency} ${o.summary ?? ""}`)))
    .sort((a, b) => (a.closeIso ?? "9999").localeCompare(b.closeIso ?? "9999"));
}
