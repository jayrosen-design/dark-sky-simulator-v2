// Funding: arts grants and calls to artists from public sources, searchable, with dollar totals for the map view.
import { useEffect, useMemo, useState } from "react";
import { Card } from "../../shared/ui";
import { Mini } from "./ArtCard";
import { allItems, CALL_COLOR, daysLeft, filterCalls, filterItems, fmtMoney, openOpportunities, SOURCE_COLOR, SOURCE_LABEL, totalOf,
  type Item, type Source } from "../engine/grants";
import { todayIso, useFunding } from "../funding";

const SOURCES: { id: Source; label: string }[] = [{ id: "NEA", label: "NEA" }, { id: "NEH", label: "NEH" }, { id: "IMLS", label: "IMLS" }, { id: "FL", label: "Florida" }];
const YEARS = [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];
const VIEWS: { label: string; lon: number; lat: number; zoom: number }[] = [
  { label: "Gainesville", lon: -82.33, lat: 29.66, zoom: 10.5 }, { label: "Florida", lon: -83.6, lat: 27.9, zoom: 5.6 }, { label: "United States", lon: -96.5, lat: 38.5, zoom: 3.2 },
];

export default function FundingPanel() {
  const f = useFunding();
  const [more, setMore] = useState(1);
  useEffect(() => { f.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (f.sel) document.getElementById("funding-sel")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [f.sel]);
  const today = todayIso();
  const items = useMemo(() => (f.pkg ? allItems(f.pkg) : []), [f.pkg]);
  const base = { q: f.q, sources: f.sources, year: f.year };
  const inView = useMemo(() => filterItems(items, { ...base, bounds: f.view }), [items, f.q, f.sources, f.year, f.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const listed = useMemo(() => (f.scope === "view" ? inView : filterItems(items, { ...base, bounds: null })).slice().sort((a, b) => b.amount - a.amount),
    [items, inView, f.scope, f.q, f.sources, f.year]); // eslint-disable-line react-hooks/exhaustive-deps
  const calls = useMemo(() => (f.pkg ? filterCalls(f.pkg.calls, f.q, today, f.scope === "view" ? f.view : null) : []), [f.pkg, f.q, f.scope, f.view, today]);
  const callsInView = useMemo(() => (f.pkg ? filterCalls(f.pkg.calls, f.q, today, f.view) : []), [f.pkg, f.q, f.view, today]);
  const opps = useMemo(() => (f.pkg ? openOpportunities(f.pkg.opportunities, f.q, today) : []), [f.pkg, f.q, today]);
  const sel = f.sel?.kind === "item" ? items.find((x) => x.id === f.sel!.id) : null;
  const selCall = f.sel?.kind === "call" ? f.pkg?.calls.find((c) => c.id === f.sel!.id) : null;

  if (f.error) return <p className="text-xs text-red-300">Could not load the funding index: {f.error}</p>;
  if (!f.pkg) return <p className="text-xs text-star-500">Loading the arts funding index…</p>;
  const fed = inView.filter((x) => x.source !== "FL"), fl = inView.filter((x) => x.source === "FL");
  const toggle = (s: Source) => f.set({ sources: f.sources.includes(s) ? f.sources.filter((x) => x !== s) : [...f.sources, s] });
  const shown = listed.slice(0, 50 * more);
  return (
    <div className="space-y-3">
      <div id="funding-sel" className="scroll-mt-2">
        {sel && <ItemCard it={sel} onClose={() => f.set({ sel: null })} />}
        {selCall && <CallRow c={selCall} today={today} open onClose={() => f.set({ sel: null })} />}
      </div>
      <Card title="Arts funding">
        <p className="text-xs text-star-300">Federal arts awards (NEA, NEH, IMLS) with any activity in {f.pkg.period.federal}, Florida state arts awards, grants open now,
          and calls to artists.
          Search, filter, then move the map: the figures count what is in view. Pulled {f.pkg.built}.</p>
        <div className="mt-2 grid grid-cols-2 gap-1 text-center">
          <Mini label={`Federal awards in view · ${fed.length.toLocaleString()}`} value={fmtMoney(totalOf(fed))} />
          <Mini label={`Florida state awards in view · ${fl.length.toLocaleString()}`} value={fmtMoney(totalOf(fl))} />
          <Mini label={`Open calls in view · ${callsInView.length} · largest budget`}
            value={callsInView.some((c) => c.budget_usd) ? fmtMoney(Math.max(...callsInView.map((c) => c.budget_usd ?? 0))) : "—"} />
          <Mini label="Federal grants open now (national)" value={String(opps.length)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-star-500">Zoom to</span>
          {VIEWS.map((v) => <button key={v.label} onClick={() => f.fly(v.lon, v.lat, v.zoom)} className="rounded bg-ink-800 px-2 py-0.5 text-star-300 hover:text-star-100">{v.label}</button>)}
        </div>
      </Card>

      <Card title="Search" right={<input value={f.q} onChange={(e) => { f.set({ q: e.target.value }); setMore(1); }} placeholder="e.g. mural, public art, Gainesville"
        aria-label="Search grants and calls" className="w-44 rounded bg-ink-800 px-1 py-0.5 text-xs text-star-100" />}>
        <div className="flex flex-wrap gap-1 text-[11px]">
          {SOURCES.map((s) => (
            <button key={s.id} onClick={() => toggle(s.id)} aria-pressed={f.sources.includes(s.id)} title={SOURCE_LABEL[s.id]}
              className={`rounded px-2 py-0.5 ${f.sources.includes(s.id) ? "bg-ink-700 text-star-100" : "bg-ink-900 text-star-500 line-through"}`}>
              <span style={{ color: SOURCE_COLOR[s.id] }}>●</span> {s.label}</button>
          ))}
          <select value={f.year ?? ""} onChange={(e) => f.set({ year: e.target.value ? Number(e.target.value) : null })} aria-label="Fiscal year"
            className="rounded bg-ink-800 px-1 text-star-300">
            <option value="">All years</option>
            {YEARS.map((y) => <option key={y} value={y}>FY{y}</option>)}
          </select>
          <span className="ml-auto flex overflow-hidden rounded border border-ink-700" role="radiogroup" aria-label="List scope">
            {(["view", "usa"] as const).map((s) => (
              <button key={s} role="radio" aria-checked={f.scope === s} onClick={() => f.set({ scope: s })}
                className={`px-2 py-0.5 ${f.scope === s ? "bg-ink-700 text-star-100" : "text-star-500"}`}>{s === "view" ? "Map view" : "All"}</button>
            ))}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-star-500">Year: a federal award's fiscal year (Oct–Sep) is the one it began in; Florida's Jul–Jun year is filed under the
          year it ends.</p>
        <p className="mt-2 text-[11px] text-star-300">{listed.length.toLocaleString()} awards, {fmtMoney(totalOf(listed))}{f.scope === "view" ? " in the map view" : " in all"}; largest first.</p>
        <ul className="mt-1 max-h-[38vh] divide-y divide-ink-700 overflow-y-auto text-xs">
          {shown.map((it) => (
            <li key={it.id}>
              <button onClick={() => { f.set({ sel: { kind: "item", id: it.id } }); f.fly(it.lon, it.lat, Math.max(9, it.source === "FL" ? 8 : 12)); }}
                className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-ink-800 ${f.sel?.id === it.id ? "bg-ink-800" : ""}`}>
                <span style={{ color: SOURCE_COLOR[it.source] }}>●</span>
                <span className="flex-1 text-star-100">{it.name}<span className="text-star-500"> · {it.place} · {it.yearLabel}</span></span>
                <span className="tabular-nums text-star-300">{fmtMoney(it.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
        {listed.length > shown.length && <button onClick={() => setMore(more + 1)} className="mt-1 text-[11px] text-glow-400 underline">Show 50 more</button>}
      </Card>

      <Card title={`Calls to artists · ${calls.length} open`}>
        <p className="text-[11px] text-star-500">Curated by hand from each commissioning body's own page (retrieved dates shown); budgets as published. Check the
          source before applying. <span style={{ color: CALL_COLOR }}>○</span> on the map, labelled with the budget.</p>
        <ul className="mt-1 max-h-[34vh] divide-y divide-ink-700 overflow-y-auto">{calls.map((c) => <CallRow key={c.id} c={c} today={today}
          onPick={() => { f.set({ sel: { kind: "call", id: c.id } }); if (c.lon != null && c.lat != null) f.fly(c.lon, c.lat, 11); }} />)}</ul>
        {!calls.length && <p className="text-[11px] text-star-500">No open calls match{f.scope === "view" ? " in the map view" : ""}.</p>}
        {f.pkg.linkouts.length > 0 && (
          <p className="mt-2 text-[11px] text-star-300">More calls: {f.pkg.linkouts.map((l, i) => (
            <span key={l.url}>{i ? " · " : ""}<a className="text-glow-400 underline" href={l.url} target="_blank" rel="noreferrer" title={l.note}>{l.label} ↗</a></span>))}</p>
        )}
      </Card>

      <Card title={`Federal grants open now · ${opps.length}`}>
        <p className="text-[11px] text-star-500">Grants.gov listings from the NEA, NEH and IMLS and the Arts category, posted or forecast. National, so not on the map.</p>
        <ul className="mt-1 max-h-[34vh] divide-y divide-ink-700 overflow-y-auto text-xs">
          {opps.map((o) => (
            <li key={o.id} className="py-1">
              <a className="text-star-100 hover:underline" href={o.url} target="_blank" rel="noreferrer">{o.title} ↗</a>
              <div className="text-[11px] text-star-500">{o.agency_code} · {o.status}{o.closeIso ? ` · closes ${o.closeIso}` : o.status === "posted" ? " · no deadline listed" : ""}
                {o.ceiling ? ` · up to ${fmtMoney(o.ceiling)}` : ""}{o.floor ? ` (from ${fmtMoney(o.floor)})` : ""}{o.estimated_total ? ` · ${fmtMoney(o.estimated_total)} total` : ""}</div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-[10px] text-star-500">Sources: {f.pkg.sources.map((s, i) => <span key={s.name}>{i ? "; " : ""}{s.url
        ? <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</span>)}. Federal awards sit at the recipient's ZIP centre (else
        county or city), Florida awards at the county centre. Federal amounts are total obligations. NEA partnership awards go to state and regional arts agencies, which
        regrant much of that money, so adding them to other awards can count the same dollars twice.</p>
    </div>
  );
}

function ItemCard({ it, onClose }: { it: Item; onClose: () => void }) {
  return (
    <Card title={<span><span className="mr-1" style={{ color: SOURCE_COLOR[it.source] }}>●</span>{it.name}</span>}
      right={<button className="text-[11px] text-star-500 hover:text-star-300" onClick={onClose} aria-label="Close details">✕</button>}>
      <div className="space-y-1 text-xs text-star-300">
        <p className="text-base font-semibold text-star-100">{fmtMoney(it.amount)} <span className="text-xs font-normal text-star-500">{it.amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span></p>
        <p>{SOURCE_LABEL[it.source]} · {it.yearLabel} · {it.place}</p>
        {it.desc && <p className="text-star-500">{it.desc}</p>}
        <p className="text-[10px] text-star-500">Placed at the {it.precision === "zip" ? "recipient's ZIP centre" : it.precision === "county" ? "county centre" : "city centre"}.</p>
        {it.url && <a className="text-glow-400 underline" href={it.url} target="_blank" rel="noreferrer">{it.source === "FL" ? "Florida award list ↗" : "USAspending award record ↗"}</a>}
      </div>
    </Card>
  );
}

function CallRow({ c, today, open, onPick, onClose }: { c: import("../engine/grants").Call; today: string; open?: boolean; onPick?: () => void; onClose?: () => void }) {
  const d = daysLeft(c.deadline, today);
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-star-100">{c.title}</span>
        <span className="tabular-nums" style={{ color: CALL_COLOR }}>{c.budget_usd ? fmtMoney(c.budget_usd) : ""}</span>
      </div>
      <div className="text-[11px] text-star-500">{c.organization} · {[c.city, c.state].filter(Boolean).join(", ")} · {c.rolling && !c.deadline ? "rolling" : `due ${c.deadline}${d != null ? ` (${d} days)` : ""}`}</div>
      {open && (
        <div className="mt-1 space-y-1 text-[11px] text-star-300">
          {c.budget_note && <p>{c.budget_note}</p>}
          {c.eligibility && <p>Eligibility: {c.eligibility}</p>}
          {c.notes && <p className="text-star-500">{c.notes}</p>}
          <p><a className="text-glow-400 underline" href={c.source_url} target="_blank" rel="noreferrer">Call details ↗</a> <span className="text-star-500">retrieved {c.retrieved}</span></p>
        </div>
      )}
    </>
  );
  if (open) return <Card title="Call to artists" right={<button className="text-[11px] text-star-500 hover:text-star-300" onClick={onClose} aria-label="Close details">✕</button>}><div className="text-xs">{body}</div></Card>;
  return <li><button onClick={onPick} className="w-full py-1 text-left text-xs hover:bg-ink-800">{body}</button></li>;
}
