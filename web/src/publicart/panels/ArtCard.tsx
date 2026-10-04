// Details of one artwork: registry facts with the source, and its modeled impressions for the chosen date.
import { Card, fmtInt, fmtUsd } from "../../shared/ui";
import { PROVENANCE_COLOR, PROVENANCE_LABEL } from "../constants";
import type { Model } from "../model";
import { usePaps } from "../state";
import { isOutdoor } from "../engine/impressions";
import type { Artwork } from "../types";

const SETTING_NOTE: Record<string, string> = { indoor: "Indoors: not seen from the street, so no impressions are modeled.",
  unverified: "Indoors or outdoors not yet checked: treated as indoors, so no impressions are modeled." };
const TYPE_LABEL: Record<string, string> = { figure: "Figure / statue", sculpture: "Sculpture", mural: "Mural", fence: "Fence / screen", wall: "Wall / mosaic", functional: "Functional art" };

export function artTitle(a: Artwork) { return a.title || "Untitled"; }

export default function ArtCard({ m, a }: { m: Model; a: Artwork }) {
  const { select } = usePaps();
  const i = m.imp.get(a.id);
  const cond = m.cons.conds.find((c) => c.id === a.id);
  return (
    <Card title={<span><span className="mr-1" style={{ color: PROVENANCE_COLOR[a.provenance] }}>●</span>{artTitle(a)}</span>}
      right={<button className="text-[11px] text-star-500 hover:text-star-300" onClick={() => select(null)} aria-label="Close details">✕</button>}>
      <div className="space-y-1 text-xs text-star-300">
        <p>{[a.artist, a.year, TYPE_LABEL[a.type]].filter(Boolean).join(" · ")}{a.status !== "existing" && <span className="ml-1 rounded bg-ink-800 px-1 text-[10px] uppercase text-[#b79cff]">{a.status.replace("_", " ")}</span>}</p>
        <p className="text-star-500">{PROVENANCE_LABEL[a.provenance]}{a.owner ? ` · ${a.owner}` : ""}</p>
        {(a.location_note || a.address) && <p>{a.location_note || a.address}</p>}
        <p className="text-star-500">{a.material.replace("_", " ")} · about {a.height} m high{a.width ? `, ${a.width} m wide` : ""}{a.dims_estimated ? " (estimated)" : ""} · {a.lit ? "lit at night" : "not lit"}</p>
        {a.budget ? <p>Budget {fmtUsd(a.budget)}{a.budget_note ? ` · ${a.budget_note}` : ""}</p> : null}
        {a.notes && <p className="text-[11px] text-star-500">{a.notes}</p>}
        {a.source_url && <p><a className="text-glow-400 underline" href={a.source_url} target="_blank" rel="noreferrer">
          {a.source_url.includes("publicartarchive.org") ? "Public Art Archive record (Creative West) ↗" : "Source ↗"}</a>{a.located_by ? <span className="ml-2 text-[10px] text-star-500">location: {a.located_by}</span> : null}</p>}
      </div>
      {!isOutdoor(a) && <p className="mt-2 text-[11px] text-star-500">{SETTING_NOTE[a.setting ?? ""]}</p>}
      {i && isOutdoor(a) && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <Mini label="Impressions / day" value={fmtInt(i.dvi)} />
          <Mini label="Vehicles · on foot" value={`${fmtInt(i.veh.reduce((s, v) => s + v, 0))} · ${fmtInt(i.ped.reduce((s, v) => s + v, 0))}`} />
          <Mini label="Stops / day" value={i.stops.toFixed(1)} />
        </div>
      )}
      {cond && <p className="mt-1 text-[11px] text-star-500">Condition index {Math.round(cond.path[0] ?? 0)} → {Math.round(cond.path[cond.path.length - 1] ?? 0)} over the horizon{cond.interventions.length ? `; conservation due FY${cond.interventions.join(", FY")}` : ""} (assumed decay rates).</p>}
    </Card>
  );
}

export function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-ink-800/80 px-1 py-1">
      <div className="text-[10px] text-star-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-star-100">{value}</div>
    </div>
  );
}
