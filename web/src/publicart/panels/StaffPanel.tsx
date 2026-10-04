// Staff study (exploratory): what the Trust handout leaves to staff and legal review. Hypothetical parameters,
// no legal conclusions, and nothing here feeds the main figures.
import { useState } from "react";
import { Card, fmtUsd, Seg, Slider, Toggle } from "../../shared/ui";
import { ch30Program, ch30Site, gruAccount, interlocal, type Ch30Option } from "../engine/exploratory";
import { capFor } from "../engine/ledger";
import type { Model } from "../model";
import { usePaps } from "../state";

export default function StaffPanel({ m }: { m: Model }) {
  const { localTarget, setLocalTarget, policy } = usePaps();
  const seed = m.data.meta.seed, T = seed.staff_study;
  const [site, setSite] = useState({ valuation: 40_000_000, gfaSf: 150_000, option: "A" as Ch30Option, farBonus: 0.25, extraStory: true, parkingReduction: 0.2 });
  const [uptake, setUptake] = useState(T.ch30_uptake.value);
  const [construction, setConstruction] = useState(T.ch30_private_construction.value);
  const [uses, setUses] = useState<Record<string, number | null>>({});
  const [split, setSplit] = useState<"population" | "even">("population");
  const s = ch30Site(site, seed), prog = ch30Program(uptake, construction, { A: 1, B: 1, C: 1 }, seed);
  const gru = gruAccount(m.data.cip.projects, seed.policy.allocation_rate.value, capFor(m.data.cip.projects[0]?.fy ?? 2027, { ...policy, code: "draft" }, seed, m.data.cpi.monthly), uses);
  const il = interlocal(seed, split);
  const known = m.data.art.filter((a) => a.artist_local !== null && a.artist_local !== undefined);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-2 text-xs text-amber-400">
        Exploratory, for staff and legal study. The Trust handout leaves these items to the City Attorney, budget, procurement, Sustainable Development and GRU. Every number is a
        hypothetical or an assumption; nothing here is a legal conclusion, and none of it feeds the main figures.
      </div>
      <Card title="Chapter 30: voluntary private-development incentive">
        <Seg label="Option" value={site.option} onChange={(option) => setSite({ ...site, option })}
          options={(["A", "B", "C"] as const).map((k) => ({ value: k, label: `${T.ch30_options.value[k].label} (${(T.ch30_options.value[k].rate * 100).toFixed(2)}%)` }))} />
        <Slider label="Declared construction value" value={site.valuation / 1e6} min={1} max={200} step={1} unit=" $M" onChange={(v) => setSite({ ...site, valuation: v * 1e6 })} />
        <Slider label="Gross floor area" value={site.gfaSf / 1000} min={5} max={600} step={5} unit="k sf" onChange={(v) => setSite({ ...site, gfaSf: v * 1000 })} />
        <Slider label="Density / FAR bonus" value={Math.round(site.farBonus * 100)} min={0} max={Math.round(T.ch30_bonus_caps.value.far * 100)} unit="%" onChange={(v) => setSite({ ...site, farBonus: v / 100 })} />
        <Slider label="Parking reduction" value={Math.round(site.parkingReduction * 100)} min={0} max={Math.round(T.ch30_bonus_caps.value.parking * 100)} unit="%" onChange={(v) => setSite({ ...site, parkingReduction: v / 100 })} />
        <Toggle label={`+${T.ch30_bonus_caps.value.stories} story height bonus`} checked={site.extraStory} onChange={(extraStory) => setSite({ ...site, extraStory })} />
        <p className="mt-1 text-xs text-star-300">Pledge {fmtUsd(s.pledge)} ({site.option === "C" ? "cash to the trust fund" : site.option === "B" ? "art on public property within 1 mile" : "art on site"});
          bonus {Math.round(s.bonusSf).toLocaleString("en-US")} sf worth about {fmtUsd(s.bonusValue)} at ${T.ch30_land_value_per_buildable_sf.value}/buildable sf (assumption).
          Participation is voluntary in this model by construction.</p>
        <Slider label="Share of eligible projects opting in" value={Math.round(uptake * 100)} min={0} max={80} unit="%" onChange={(v) => setUptake(v / 100)} />
        <Slider label="Eligible private construction per year" value={construction / 1e6} min={50} max={800} step={10} unit=" $M" onChange={(v) => setConstruction(v * 1e6)} hint="Assumption; replace with permit data" />
        <p className="text-xs text-star-300">With an even mix of options: {fmtUsd(prog.onsite + prog.offsite)}/yr in privately funded art and {fmtUsd(prog.inLieu)}/yr in in-lieu payments.</p>
      </Card>
      <Card title="GRU / enterprise-funded projects">
        {gru.rows.length ? <>
          <p className="text-xs text-star-300">If Chapter 5.5 applied to GRU capital projects, allocations would sit in a restricted sub-account ({fmtUsd(gru.total)} here), usable only
            where a nexus to the utility exists. Pick each project's planned use; unassigned ones are flagged.</p>
          {gru.rows.map((r) => (
            <label key={r.id} className="mt-1 block text-[11px]">
              <span className={r.flagged ? "text-amber-400" : "text-star-300"}>{r.name} · {fmtUsd(r.alloc)}</span>
              <select value={r.use ?? ""} onChange={(ev) => setUses({ ...uses, [r.id]: ev.target.value === "" ? null : Number(ev.target.value) })}
                className="ml-1 rounded bg-ink-800 px-1 text-star-100"><option value="">no nexus chosen</option>{T.gru_nexus.value.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
            </label>
          ))}
        </> : <p className="text-xs text-star-500">The capital program has no GRU-funded projects.</p>}
      </Card>
      <Card title="City-County shared services">
        <Seg label="Cost split" value={split} onChange={setSplit} options={[{ value: "population", label: "By population" }, { value: "even", label: "50 / 50" }]} />
        <p className="mt-1 text-xs text-star-300">Two programs: {fmtUsd(il.separate)}/yr. One shared program manager and conservator: {fmtUsd(il.shared)}/yr
          (City {fmtUsd(il.city)}, County {fmtUsd(il.county)}), saving about {fmtUsd(il.savings)}/yr. Staff costs and overheads are assumptions.</p>
      </Card>
      <Card title="Local artist participation">
        <Slider label="Target share of commissions to local artists" value={Math.round(localTarget * 100)} min={0} max={30} unit="%" onChange={(v) => setLocalTarget(v / 100)}
          hint="The draft lets the Public Art Master Plan set local-participation goals (Sec. 5.5-4(1)(f)) without a number; 15-20% follows the TRD" />
        <p className="text-xs text-star-300">{known.length ? `${known.filter((a) => a.artist_local).length} of ${known.length} works with a known artist base are by Gainesville/Alachua artists in the registry.` : ""}</p>
      </Card>
    </div>
  );
}
