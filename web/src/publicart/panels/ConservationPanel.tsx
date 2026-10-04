// Conservation: what keeping the City's works in good condition would cost over the horizon, and whether the
// draft's 15% reserve covers it (the 1989 code has no reserve).
import { ComposedChart, Bar, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, fmtUsd, Stat } from "../../shared/ui";
import { replacementValue } from "../engine/conservation";
import type { Model } from "../model";
import { cityOwned } from "../model";
import { usePaps } from "../state";
import { artTitle } from "./ArtCard";

const axisUsd = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);

export default function ConservationPanel({ m }: { m: Model }) {
  const { policy, select, highlightField } = usePaps();
  const seed = m.data.meta.seed, draft = policy.code === "draft";
  const C = draft ? m.cons : m.cons89;
  const rows = C.years.map((y) => ({ fy: `FY${String(y.fy).slice(2)}`, "Care needed": Math.round(y.required), "Reserve balance": Math.round(y.balance), Unfunded: Math.round(y.shortfall) }));
  const owned = m.arts.filter(cityOwned);
  const mats = seed.conservation.materials.value;
  return (
    <div className="space-y-3">
      <Card title="Conservation reserve">
        <p className="text-xs text-star-300">{owned.length} City-owned or City-commissioned works (and proposals) age year by year; each material loses condition at an assumed rate,
          {` ${seed.conservation.florida_factor.value}`}× faster in North Florida sun and humidity. When a work drops below its threshold it needs conservation; routine care recurs.
          {draft ? ` Under the draft, ${Math.round(policy.reserveShare * 100)}% of each unrestricted allocation funds the reserve and balances carry forward.` : " The 1989 code has no reserve, so care depends on department budgets."}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="Care needed" value={fmtUsd(C.totalRequired)} sub={`${policy.horizon} years`} />
          <Stat id="kpi.reserve" highlight={highlightField === "kpi.reserve"} label="Reserve at the end" value={draft ? fmtUsd(C.endBalance) : "no reserve"} />
          <Stat label="Unfunded care" value={fmtUsd(C.totalShortfall)} sub={draft ? "needed beyond the reserve" : "all care falls to department budgets"} />
          <Stat label="Reserve inflow" value={fmtUsd(C.years.reduce((s, y) => s + y.reserveIn, 0))} />
        </div>
        <div className="mt-2 h-40" aria-label="Care needed versus reserve balance by fiscal year">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 4, right: 4, left: -6, bottom: 0 }}>
              <CartesianGrid stroke="#1a2642" strokeDasharray="2 3" />
              <XAxis dataKey="fy" tick={{ fontSize: 10, fill: "#a79f88" }} />
              <YAxis tickFormatter={axisUsd} tick={{ fontSize: 10, fill: "#a79f88" }} />
              <Tooltip formatter={(v) => fmtUsd(Number(v))} contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Care needed" fill="#f6b44b" fillOpacity={0.7} />
              <Bar dataKey="Unfunded" fill="#e0453a" fillOpacity={0.7} />
              <Line dataKey="Reserve balance" stroke="#5fd6c4" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Works in the City's care">
        <table className="w-full text-[11px]">
          <thead className="text-star-500"><tr><th className="text-left font-normal">Work</th><th className="text-left font-normal">Material</th><th className="text-right font-normal">Value</th><th className="text-right font-normal">Condition</th></tr></thead>
          <tbody>{owned.map((a) => { const c = C.conds.find((x) => x.id === a.id); return (
            <tr key={a.id} className="border-t border-ink-700"><td className="pr-1"><button className="text-left text-star-300 hover:text-star-100" onClick={() => select(a.id, true)}>{artTitle(a)}</button></td>
              <td className="text-star-500">{a.material.replace("_", " ")}</td><td className="text-right tabular-nums">{fmtUsd(replacementValue(a, seed))}</td>
              <td className="text-right tabular-nums">{c ? `${Math.round(c.path[0])} → ${Math.round(c.path[c.path.length - 1])}${c.interventions.length ? " ●" : ""}` : "—"}</td></tr>); })}</tbody>
        </table>
        <p className="mt-1 text-[11px] text-star-500">● conservation due within the horizon. Values are published budgets where known, else assumed by scale (murals by area).</p>
      </Card>
      <Card title="Assumptions (replace with a conservator's survey)">
        <table className="w-full text-[11px]"><thead className="text-star-500"><tr><th className="text-left font-normal">Material</th><th className="text-right font-normal">Loss/yr</th><th className="text-right font-normal">Treat below</th><th className="text-right font-normal">Treatment</th><th className="text-right font-normal">Routine</th></tr></thead>
          <tbody>{Object.entries(mats).map(([k, v]) => <tr key={k} className="border-t border-ink-700"><td>{k.replace("_", " ")}</td><td className="text-right">{v.decay}</td><td className="text-right">{v.threshold}</td>
            <td className="text-right">{Math.round(v.intervention * 100)}% of value</td><td className="text-right">{(v.routine * 100).toFixed(1)}% / {v.routine_every} yr</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
