// Collection tab, Florida scope: every Florida work in the Public Art Archive, searchable, with artist, title, year,
// medium and (where a commissioning body's document states one) budget. Identification only; facts linked to records.
import { useEffect, useMemo, useState } from "react";
import { Card } from "../../shared/ui";
import { Mini } from "./ArtCard";
import { allWorks, filterWorks, tally, type Work } from "../engine/catalog";
import { fmtMoney } from "../engine/grants";
import { useCatalog } from "../catalog";
import { CATALOG_COLOR } from "../map/catalogLayers";
import LandLine from "./LandLine";
import { useBuildings } from "../buildings";
import { LAND_LABEL, onLand } from "../engine/facilities";

const VIEWS = [{ label: "Florida", lon: -83.6, lat: 27.9, zoom: 5.6 }, { label: "Gainesville", lon: -82.33, lat: 29.66, zoom: 11 }];
/** Titles sort without their leading quotes or punctuation (a quoted "Great Blue Heron" files under G). */
const sortKey = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, "");
const KIND: Record<string, string> = { commission: "commission budget", purchase: "purchase price", appraised: "appraised value", project: "project total incl. more than the art" };

export default function FloridaCatalog() {
  const c = useCatalog(), b = useBuildings();
  const [more, setMore] = useState(1);
  useEffect(() => { c.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (c.sel) document.getElementById("catalog-sel")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [c.sel]);
  const works = useMemo(() => (c.pkg ? allWorks(c.pkg) : []), [c.pkg]);
  const counties = useMemo(() => tally(works, (w) => [w.county ?? ""]), [works]);
  const collections = useMemo(() => tally(works, (w) => (w.collection ?? "").split("; ")), [works]);
  const base = { q: c.q, county: c.county, collection: c.collection, budgetOnly: c.budgetOnly };
  const inViewAll = useMemo(() => filterWorks(works, { ...base, bounds: c.view }), [works, c.q, c.county, c.collection, c.budgetOnly, c.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const inView = useMemo(() => onLand(inViewAll, c.land, b.pkg), [inViewAll, c.land, b.pkg]);
  const sel = works.find((w) => w.id === c.sel);
  if (c.error) return <p className="text-xs text-red-300">Could not load the Florida catalog: {c.error}</p>;
  if (!c.pkg) return <p className="text-xs text-star-500">Loading the Florida public art catalog…</p>;
  const r = c.pkg.report;
  const shown = inView.slice().sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1) || sortKey(a.title).localeCompare(sortKey(b.title))).slice(0, 60 * more);
  const budgeted = inView.filter((w) => w.budget != null);
  return (
    <div className="space-y-3">
      <div id="catalog-sel" className="scroll-mt-2">{sel && <WorkCard w={sel} onClose={() => c.set({ sel: null })} />}</div>
      <Card title="Public art across Florida">
        <p className="text-xs text-star-300">
          {r.florida.toLocaleString()} works listed in the{" "}
          <a className="text-glow-400 underline" href={c.pkg.source.url} target="_blank" rel="noreferrer">Public Art Archive</a> (Creative West) in{" "}
          {counties.filter(([k]) => k).length} counties, pulled {c.pkg.fetched}: facts only, each linked to its archive record. Identification only: the
          impressions, equity and conservation models run on the Gainesville registry.
        </p>
        <p className="mt-1 text-[11px] text-star-500">The archive covers some programs well (Broward, UF, Sarasota, Tampa, St. Petersburg, Dunedin, Orange County) and
          others barely (Miami-Dade County's Art in Public Places program has 13 records), so absence here does not mean absence on the ground. It has no budget field: budgets shown come from
          the commissioning bodies' own documents ({r.with_budget} works).</p>
        <div className="mt-2 grid grid-cols-2 gap-1 text-center">
          <Mini label="Works in the map view" value={inView.length.toLocaleString()} />
          <Mini label={`With a stated budget · ${budgeted.length}`} value={budgeted.length ? fmtMoney(budgeted.reduce((s, w) => s + (w.budget ?? 0), 0)) : "—"} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-star-500">Zoom to</span>
          {VIEWS.map((v) => <button key={v.label} onClick={() => c.fly(v.lon, v.lat, v.zoom)} className="rounded bg-ink-800 px-2 py-0.5 text-star-300 hover:text-star-100">{v.label}</button>)}
        </div>
      </Card>

      <Card title="Find works" right={<input value={c.q} onChange={(e) => { c.set({ q: e.target.value }); setMore(1); }} placeholder="artist, title, medium, city"
        aria-label="Search Florida works" className="w-44 rounded bg-ink-800 px-1 py-0.5 text-xs text-star-100" />}>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <select value={c.county ?? ""} onChange={(e) => c.set({ county: e.target.value || null })} aria-label="County" className="max-w-[45%] rounded bg-ink-800 px-1 text-star-300">
            <option value="">All counties</option>
            {counties.filter(([k]) => k).map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>
          <select value={c.collection ?? ""} onChange={(e) => c.set({ collection: e.target.value || null })} aria-label="Collection" className="max-w-[52%] rounded bg-ink-800 px-1 text-star-300">
            <option value="">All collections</option>
            {collections.filter(([k]) => k).map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>
          <select value={c.land} onChange={(e) => { c.set({ land: e.target.value }); if (e.target.value) b.load(); }} aria-label="Land owner" className="rounded bg-ink-800 px-1 text-star-300">
            <option value="">Any land</option><option value="public">On public land</option>
            {(["state", "county", "city", "school", "federal", "district", "private", "other", "none"] as const).map((k) => <option key={k} value={k}>{LAND_LABEL[k]}</option>)}
          </select>
          {c.land && !b.pkg && <span className="text-star-500">loading land owners…</span>}
          <label className="flex items-center gap-1 text-star-300"><input type="checkbox" checked={c.budgetOnly} onChange={(e) => c.set({ budgetOnly: e.target.checked })} /> with a budget</label>
        </div>
        <p className="mt-2 text-[11px] text-star-300">{inView.length.toLocaleString()} works in the map view; budgeted works first. Move or zoom the map to change the list.</p>
        <ul className="mt-1 max-h-[44vh] divide-y divide-ink-700 overflow-y-auto text-xs">
          {shown.map((w) => (
            <li key={w.id}>
              <button onClick={() => { c.set({ sel: w.id }); c.fly(w.lon, w.lat, 15); }}
                className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-ink-800 ${c.sel === w.id ? "bg-ink-800" : ""}`}>
                <span style={{ color: w.budget != null ? "#f6b44b" : CATALOG_COLOR }}>●</span>
                <span className="flex-1 text-star-100">{w.title}<span className="text-star-500">{w.artist ? ` · ${w.artist}` : ""} · {w.city ?? w.county ?? ""}{w.year ? ` · ${w.year}` : ""}</span></span>
                <span className="tabular-nums text-star-300">{w.budget != null ? fmtMoney(w.budget) : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {inView.length > shown.length && <button onClick={() => setMore(more + 1)} className="mt-1 text-[11px] text-glow-400 underline">Show 60 more</button>}
      </Card>
    </div>
  );
}

function WorkCard({ w, onClose }: { w: Work; onClose: () => void }) {
  return (
    <Card title={<span><span className="mr-1" style={{ color: w.budget != null ? "#f6b44b" : CATALOG_COLOR }}>●</span>{w.title}</span>}
      right={<button className="text-[11px] text-star-500 hover:text-star-300" onClick={onClose} aria-label="Close details">✕</button>}>
      <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-xs text-star-300">
        <dt className="text-star-500">Artist</dt><dd>{w.artist ?? "not listed"}</dd>
        <dt className="text-star-500">Year</dt><dd>{w.year ?? "not listed"}</dd>
        <dt className="text-star-500">Medium</dt><dd>{w.medium ?? "not listed"}{w.types ? <span className="text-star-500"> · {w.types}</span> : null}</dd>
        <dt className="text-star-500">Budget</dt>
        <dd>{w.budget != null ? <>{w.budget.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          <span className="text-star-500"> · {KIND[w.budgetKind ?? ""] ?? w.budgetKind}</span>
          {w.budgetSource && <> · <a className="text-glow-400 underline" href={w.budgetSource} target="_blank" rel="noreferrer">source ↗</a></>}</>
          : <span className="text-star-500">not published in the sources used</span>}</dd>
        <dt className="text-star-500">Collection</dt><dd>{w.collection ?? "not listed"}{w.owner && w.owner !== w.collection ? <span className="text-star-500"> · owner {w.owner}</span> : null}</dd>
        <dt className="text-star-500">Where</dt><dd>{[w.building, w.city, w.county ? `${w.county} County` : null].filter(Boolean).join(", ")}{w.placement ? <span className="text-star-500"> · {w.placement}</span> : null}</dd>
        {w.offView && <><dt className="text-star-500">Status</dt><dd>off view (the archive marks it not on display)</dd></>}
      </dl>
      <div className="mt-1"><LandLine workId={w.id} /></div>
      <p className="mt-2 text-xs"><a className="text-glow-400 underline" href={w.url} target="_blank" rel="noreferrer">Public Art Archive record (Creative West) ↗</a></p>
    </Card>
  );
}
