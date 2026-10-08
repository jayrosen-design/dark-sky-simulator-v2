// Collection: the registry on the map (hand-compiled, plus facts from the Public Art Archive), filters, and the list of works.
import { useMemo, useState } from "react";
import { Card, Toggle } from "../../shared/ui";
import { PROVENANCE_COLOR, PROVENANCE_LABEL } from "../constants";
import type { Model } from "../model";
import { usePaps } from "../state";
import ArtCard, { artTitle } from "./ArtCard";
import FloridaCatalog from "./FloridaCatalog";
import { useCatalog } from "../catalog";
import { useBuildings } from "../buildings";

/** Collection: the Gainesville registry (which the models use) or the statewide Florida catalog (identification only). */
export default function CollectionPanel({ m }: { m: Model }) {
  const { scope, set } = useCatalog();
  const { overlay, set: setB } = useBuildings();
  return (
    <div className="space-y-3">
      <div className="flex overflow-hidden rounded-lg border border-ink-700 text-xs" role="radiogroup" aria-label="Collection scope">
        {([["gainesville", "Gainesville registry"], ["florida", "All of Florida"]] as const).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={scope === k} onClick={() => set({ scope: k })}
            className={`flex-1 px-2 py-1 ${scope === k ? "bg-ink-700 text-star-100" : "bg-ink-900 text-star-500 hover:text-star-300"}`}>{label}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-star-300"><input type="checkbox" checked={overlay} onChange={(e) => setB({ overlay: e.target.checked })} />
        Show public buildings (state, county, city, school board, federal) to see which works stand on public land</label>
      {scope === "florida" ? <FloridaCatalog /> : <GainesvilleRegistry m={m} />}
    </div>
  );
}

function GainesvilleRegistry({ m }: { m: Model }) {
  const { selected, select, showPlanned, setShowPlanned } = usePaps();
  const [q, setQ] = useState("");
  const r = m.data.meta.report.registry;
  const count = (s: string) => m.data.art.filter((a) => a.status === s).length;
  const drawn = (setting: string) => m.data.art.filter((a) => (a.status === "existing" || a.status === "planned") && a.setting === setting).length;
  const sel = m.arts.find((a) => a.id === selected);
  const list = useMemo(() => m.arts.filter((a) => !q || `${a.title} ${a.artist ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => artTitle(a).localeCompare(artTitle(b))), [m.arts, q]);
  return (
    <div className="space-y-3">
      {sel && <ArtCard m={m} a={sel} />}
      <Card title="Public art in Gainesville and Alachua County">
        <p className="text-xs text-star-300">
          {r.entries} registry entries: {r.entries - r.from_archive} hand-compiled from public sources and {r.from_archive} from the{" "}
          <a className="text-glow-400 underline" href="https://publicartarchive.org" target="_blank" rel="noreferrer">Public Art Archive</a> (Creative West; facts only,
          each linked to its record). {count("existing")} existing and {count("planned")} planned works on the map
          {count("removed") ? `, ${count("removed")} removed` : ""}{count("off_view") ? `, ${count("off_view")} off view` : ""}
          {count("removed") || count("off_view") ? " (listed, not drawn)" : ""}{r.unlocated.length ? `, ${r.unlocated.length} not located` : ""}.{" "}
          Of the works on the map, {drawn("indoor")} are indoors and {drawn("unverified")} not yet checked: both are drawn small and get no street impressions.{" "}
          <b className="text-star-100">Not the City's official inventory</b>: the draft asks the City to publish one (Sec. 5.5-5(c)).
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {Object.entries(r.by_provenance).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
            <span key={p}><span style={{ color: PROVENANCE_COLOR[p] }}>●</span> {PROVENANCE_LABEL[p] ?? p} {n}</span>
          ))}
          {m.proposals.length > 0 && <span><span style={{ color: PROVENANCE_COLOR.proposed }}>●</span> Proposed {m.proposals.length}</span>}
        </div>
        <Toggle label="Include planned works" checked={showPlanned} onChange={setShowPlanned} hint="e.g. Common Light (GPD Property & Evidence, 6th Street Rail-Trail), unveiling expected 2027" />
      </Card>
      <Card title="Works" right={<input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search" aria-label="Search works"
        className="w-28 rounded bg-ink-800 px-1 py-0.5 text-xs text-star-100" />}>
        <ul className="max-h-[48vh] divide-y divide-ink-700 overflow-y-auto text-xs">
          {list.map((a) => (
            <li key={a.id}>
              <button onClick={() => select(a.id, true)} className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-ink-800 ${a.id === selected ? "bg-ink-800" : ""}`}>
                <span style={{ color: PROVENANCE_COLOR[a.provenance] }}>●</span>
                <span className="flex-1 text-star-100">{artTitle(a)}<span className="text-star-500">{a.artist ? ` · ${a.artist}` : ""}</span></span>
                <span className="text-[10px] text-star-500">{a.status === "existing" ? a.year ?? "" : a.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {r.unlocated.length > 0 && (
        <Card title="Not on the map">
          <ul className="text-[11px] text-star-500">{r.unlocated.map((u) => <li key={u.id}>{u.title ?? u.id}: {u.reason}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
