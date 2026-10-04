// Place: drop proposed works on the map (type, scale, lighting, funding) and see what each adds. The heatmap shows
// where a medium sculpture would be seen most (vehicles + people on foot or bike, from the pipeline).
import { Card, fmtInt, fmtUsd, Seg, Slider, Toggle } from "../../shared/ui";
import type { Model } from "../model";
import { usePaps, type Proposal } from "../state";
import type { ArtTypeName, Scale } from "../types";
import { Mini } from "./ArtCard";

const TYPES: { value: ArtTypeName; label: string }[] = [{ value: "sculpture", label: "Sculpture" }, { value: "figure", label: "Figure" }, { value: "mural", label: "Mural" },
  { value: "wall", label: "Mosaic wall" }, { value: "fence", label: "Fence/screen" }, { value: "functional", label: "Functional" }];
const SCALES: { value: Scale; label: string }[] = [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "landmark", label: "Landmark" }];
const FUNDING: { value: Proposal["funding"]; label: string }[] = [{ value: "pooled", label: "Pooled trust funds" }, { value: "onsite", label: "Project 1%" },
  { value: "private", label: "Private (Ch. 30 study)" }, { value: "grant", label: "Grant" }];
const MATERIAL_FOR: Record<ArtTypeName, string> = { sculpture: "painted_steel", figure: "bronze", mural: "acrylic_mural", wall: "mosaic", fence: "glass", functional: "steel" };

function Editor({ p, onChange }: { p: Omit<Proposal, "id" | "lon" | "lat">; onChange: (v: Partial<Proposal>) => void }) {
  return (
    <div className="space-y-2">
      <Seg label="Type" value={p.type} onChange={(type) => onChange({ type, material: MATERIAL_FOR[type] })} options={TYPES} />
      <Seg label="Scale" value={p.scale} onChange={(scale) => onChange({ scale })} options={SCALES} />
      <div className="flex flex-wrap gap-x-4">
        <Toggle label="Lit at night" checked={p.lit} onChange={(lit) => onChange({ lit })} hint="Shielded, warm (≤ 3000 K) art lighting" />
        <Toggle label="Shaded seating" checked={p.seating} onChange={(seating) => onChange({ seating })} />
      </div>
      {(p.type === "mural" || p.type === "wall" || p.type === "fence") && <Slider label="Faces (compass bearing)" value={p.bearing} min={0} max={345} step={15} unit="°" onChange={(bearing) => onChange({ bearing })} />}
      <Seg label="Funding" value={p.funding} onChange={(funding) => onChange({ funding })} options={FUNDING} />
    </div>
  );
}

export default function PlacePanel({ m }: { m: Model }) {
  const { placing, setPlacing, template, setTemplate, proposals, updateProposal, removeProposal, select, selected } = usePaps();
  const dEast = m.eq.east.share - m.eqBase.east.share, dCity = m.eq.city.share - m.eqBase.city.share;
  return (
    <div className="space-y-3">
      <Card title="Place a proposed work">
        <p className="mb-2 text-xs text-star-300">The heatmap is the daily impressions a medium sculpture would get at each spot: drivers and passengers on nearby streets
          (traffic counts and speeds) plus people on foot or bike (a model fitted to the City's counters). Brighter is more seen.</p>
        <button onClick={() => setPlacing(!placing)} aria-pressed={placing}
          className={`mb-2 w-full rounded-md px-2 py-1.5 text-sm font-semibold ${placing ? "bg-[#b79cff] text-ink-950" : "bg-ink-800 text-star-100 hover:bg-ink-700"}`}>
          {placing ? "Click the map to place… (click here to stop)" : "Place on the map"}</button>
        <Editor p={template} onChange={setTemplate} />
      </Card>
      {proposals.length > 0 && (
        <Card title={`Proposed works (${proposals.length})`} right={<span className="text-[11px] text-star-500">East Gainesville coverage {dEast >= 0 ? "+" : ""}{(dEast * 100).toFixed(1)} pts · city {dCity >= 0 ? "+" : ""}{(dCity * 100).toFixed(1)} pts</span>}>
          <div className="space-y-2">
            {proposals.map((p) => {
              const i = m.imp.get(p.id), e = m.econ.get(p.id);
              return (
                <div key={p.id} className={`rounded-lg border p-2 ${selected === p.id ? "border-[#b79cff]" : "border-ink-700"}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <button className="flex-1 text-left font-semibold text-star-100" onClick={() => select(p.id, true)}>{p.title}</button>
                    <button className="text-[11px] text-red-300 hover:underline" onClick={() => removeProposal(p.id)}>Remove</button>
                  </div>
                  {i && <div className="mt-1 grid grid-cols-3 gap-1 text-center">
                    <Mini label="Impressions / day" value={fmtInt(i.dvi)} /><Mini label="Stops / day" value={i.stops.toFixed(1)} /><Mini label="Spending / yr" value={e ? fmtUsd(e.spending) : "—"} />
                  </div>}
                  {selected === p.id && <div className="mt-2"><Editor p={p} onChange={(v) => updateProposal(p.id, v)} /></div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
