// Buildings: publicly owned buildings (state, county, city, school board, federal, districts) with their values, the
// construction the parcel records show, the public-art money that construction would carry under the written rules,
// and the artworks that already stand on each parcel.
import { useEffect, useMemo, useState } from "react";
import { Card } from "../../shared/ui";
import { Mini } from "./ArtCard";
import { allFacilities, artEstimate, CLASS_COLOR, CLASS_LABEL, filterFacilities, type FacClass, type Facility } from "../engine/facilities";
import { allWorks } from "../engine/catalog";
import { fmtMoney } from "../engine/grants";
import { useBuildings } from "../buildings";
import { useCatalog } from "../catalog";
import type { Model } from "../model";
import { usePaps } from "../state";

const CLASSES: FacClass[] = ["state", "county", "city", "school", "federal", "district"];
const VIEWS = [{ label: "Gainesville", lon: -82.33, lat: 29.65, zoom: 12.5 }, { label: "Alachua County", lon: -82.36, lat: 29.68, zoom: 9.6 }, { label: "Florida", lon: -83.6, lat: 27.9, zoom: 5.6 }];

export default function BuildingsPanel({ m }: { m: Model }) {
  const b = useBuildings(), cat = useCatalog();
  const [more, setMore] = useState(1);
  useEffect(() => { b.load(); cat.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (b.sel) document.getElementById("building-sel")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [b.sel]);
  const all = useMemo(() => (b.pkg ? allFacilities(b.pkg) : []), [b.pkg]);
  const inView = useMemo(() => filterFacilities(all, { q: b.q, classes: b.classes, since: b.since, bounds: b.view }), [all, b.q, b.classes, b.since, b.view]);
  if (b.error) return <p className="text-xs text-red-300">Could not load the public buildings: {b.error}</p>;
  if (!b.pkg) return <p className="text-xs text-star-500">Loading public buildings…</p>;
  const sel = all.find((f) => f.id === b.sel);
  const recent = inView.filter((f) => f.latest && f.latest.year >= 2015);
  const shown = inView.slice().sort((x, y) => (y.latest?.value ?? -1) - (x.latest?.value ?? -1) || (y.bv ?? 0) - (x.bv ?? 0)).slice(0, 60 * more);
  const toggle = (c: FacClass) => b.set({ classes: b.classes.includes(c) ? b.classes.filter((x) => x !== c) : [...b.classes, c] });
  return (
    <div className="space-y-3">
      <div id="building-sel" className="scroll-mt-2">{sel && <FacilityCard f={sel} m={m} onClose={() => b.set({ sel: null })} />}</div>
      <Card title="Public buildings">
        <p className="text-xs text-star-300">Buildings on land owned by the state, counties, cities, school boards, federal agencies and special districts:
          outlined in Alachua County (County parcel layers, tax years 2001–2024), marked elsewhere in Florida (2025 state parcel roll). Expansions and new
          construction come from the parcel records; their art money uses only written rules. Planning estimates.</p>
        <div className="mt-2 grid grid-cols-2 gap-1 text-center">
          <Mini label={`Buildings in view · ${inView.length.toLocaleString()}`} value={fmtMoney(inView.reduce((s, f) => s + (f.bv ?? 0), 0))} />
          <Mini label={`Built or expanded since 2015 · ${recent.length}`} value={fmtMoney(recent.reduce((s, f) => s + (f.latest?.value ?? 0), 0))} />
        </div>
        {(() => { const r = (b.pkg!.report as { florida?: { dor_counties_included?: number; dor_counties_total?: number } }).florida;
          return r && r.dor_counties_included! < r.dor_counties_total! ? <p className="mt-1 text-[11px] text-amber-300">Outside Alachua County, {r.dor_counties_included} of the
            other {r.dor_counties_total} counties are loaded so far; the rest of the state's parcel roll is still being read.</p> : null; })()}
        <p className="mt-1 text-[10px] text-star-500">Values: assessed building value (just value minus land) and the value of recorded construction; owners'
          exempt property is still assessed. Assessed values are not construction budgets.</p>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-star-500">Zoom to</span>
          {VIEWS.map((v) => <button key={v.label} onClick={() => b.fly(v.lon, v.lat, v.zoom)} className="rounded bg-ink-800 px-2 py-0.5 text-star-300 hover:text-star-100">{v.label}</button>)}
        </div>
      </Card>

      <Card title="Find buildings" right={<input value={b.q} onChange={(e) => { b.set({ q: e.target.value }); setMore(1); }} placeholder="owner, address, use"
        aria-label="Search public buildings" className="w-40 rounded bg-ink-800 px-1 py-0.5 text-xs text-star-100" />}>
        <div className="flex flex-wrap gap-1 text-[11px]">
          {CLASSES.map((c) => (
            <button key={c} onClick={() => toggle(c)} aria-pressed={b.classes.includes(c)}
              className={`rounded px-2 py-0.5 ${b.classes.includes(c) ? "bg-ink-700 text-star-100" : "bg-ink-900 text-star-500 line-through"}`}>
              <span style={{ color: CLASS_COLOR[c] }}>■</span> {CLASS_LABEL[c]}</button>
          ))}
          <select value={b.since ?? ""} onChange={(e) => b.set({ since: e.target.value ? Number(e.target.value) : null })} aria-label="Construction since" className="rounded bg-ink-800 px-1 text-star-300">
            <option value="">Any buildings</option><option value="2010">Built or expanded since 2010</option>
            <option value="2015">… since 2015</option><option value="2020">… since 2020</option><option value="2025">New construction, 2025 roll</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-star-300">{inView.length.toLocaleString()} buildings in the map view; most recent recorded construction value first.</p>
        <ul className="mt-1 max-h-[42vh] divide-y divide-ink-700 overflow-y-auto text-xs">
          {shown.map((f) => (
            <li key={f.id}>
              <button onClick={() => { b.set({ sel: f.id }); b.fly(f.lon, f.lat, f.source === "alachua" ? 16.5 : 15); }}
                className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-ink-800 ${b.sel === f.id ? "bg-ink-800" : ""}`}>
                <span style={{ color: CLASS_COLOR[f.cls] }}>■</span>
                <span className="flex-1 text-star-100">{f.address ?? f.owner}<span className="text-star-500"> · {f.owner}{f.city ? `, ${f.city}` : ""}</span></span>
                <span className="text-right tabular-nums text-star-300">{f.latest ? <>{fmtMoney(f.latest.value)}<span className="text-star-500"> {f.latest.year}</span></> : fmtMoney(f.bv)}</span>
              </button>
            </li>
          ))}
        </ul>
        {inView.length > shown.length && <button onClick={() => setMore(more + 1)} className="mt-1 text-[11px] text-glow-400 underline">Show 60 more</button>}
      </Card>
    </div>
  );
}

function FacilityCard({ f, m, onClose }: { f: Facility; m: Model; onClose: () => void }) {
  const b = useBuildings(), cat = useCatalog();
  const seed = m.data.meta.seed;
  const policyCode = usePaps((s) => s.policy?.code) ?? "draft";          // the code version chosen on the Policy tab
  const tags = b.pkg?.tags;
  const regArt = m.data.art.filter((a) => tags?.registry[a.id] === f.id);
  const catWorks = cat.pkg ? allWorks(cat.pkg).filter((w) => { const t = tags?.catalog[w.id]; return t && (t[0] === "alachua" ? t[1] === f.id : t[5] === f.id); }) : [];
  const latest = f.latest;
  const est = latest ? artEstimate(f, latest.value, latest.isNew, seed, policyCode) : null;
  const money = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
  return (
    <Card title={<span><span className="mr-1" style={{ color: CLASS_COLOR[f.cls] }}>■</span>{f.address ?? f.owner}</span>}
      right={<button className="text-[11px] text-star-500 hover:text-star-300" onClick={onClose} aria-label="Close details">✕</button>}>
      <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1 text-xs text-star-300">
        <dt className="text-star-500">Owner</dt><dd>{f.owner} <span className="text-star-500">· {CLASS_LABEL[f.cls]}</span></dd>
        {f.use && <><dt className="text-star-500">Use</dt><dd>{f.use}</dd></>}
        <dt className="text-star-500">Where</dt><dd>{[f.address, f.city, f.county ? `${f.county} County` : null].filter(Boolean).join(", ")}</dd>
        <dt className="text-star-500">Just value</dt><dd>{money(f.jv)}</dd>
        <dt className="text-star-500">Building value</dt><dd>{money(f.bv)}{f.sqft ? <span className="text-star-500"> · {f.sqft.toLocaleString()} sq ft</span> : null}</dd>
        {f.yearBuilt && <><dt className="text-star-500">Year built</dt><dd>{f.yearBuilt}</dd></>}
        <dt className="text-star-500">Construction</dt>
        <dd>{f.source === "alachua"
          ? (f.events.length ? <ul>{f.events.slice().reverse().map(([y, a0, a1, v, isNew, basis]) => (
              <li key={y}>{y}: {isNew ? "new building" : "more building area"}, {a0 ? `${a0.toLocaleString()} → ` : ""}{a1.toLocaleString()} sq ft
                {v != null ? <span className="text-star-500"> · about {money(v)} at today's value per sq ft</span> : null}
                <span className="text-star-500"> ({basis === "area only" ? "area records only; no value records that year" : "area and just value both rose"})</span></li>))}</ul>
            : <span className="text-star-500">no increase in building area recorded since 2001</span>)
          : latest ? <>{money(latest.value)} of new construction on the 2025 roll</> : <span className="text-star-500">none on the 2025 roll</span>}</dd>
        {est && <><dt className="text-star-500">Art money</dt><dd>{est.amount != null ? <b className="text-star-100">{money(est.amount)}</b> : null}{est.amount != null ? " · " : ""}
          {est.program} <span className="text-star-500">— {est.note}</span></dd></>}
        <dt className="text-star-500">Artworks here</dt>
        <dd>{regArt.length + catWorks.length ? <ul>{regArt.map((a) => <li key={a.id}>{a.title}{a.artist ? <span className="text-star-500"> · {a.artist}</span> : null}</li>)}
          {catWorks.filter((w) => !regArt.some((a) => a.id === `paa-${w.id}`)).map((w) => <li key={w.id}>{w.title}{w.artist ? <span className="text-star-500"> · {w.artist}</span> : null}</li>)}</ul>
          : <span className="text-star-500">none listed in the registry or the Florida catalog</span>}</dd>
      </dl>
      {f.acpa && <p className="mt-2 text-xs"><a className="text-glow-400 underline" href={f.acpa} target="_blank" rel="noreferrer">Alachua County Property Appraiser record ↗</a></p>}
    </Card>
  );
}
