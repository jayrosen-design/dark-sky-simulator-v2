// Always-visible budget readout over the map (SimCity-style): public CAPEX, yearly savings, payback, 15-year ROI and a
// cumulative cash chart for the current scenario. Collapses to one line; "Details" opens the Costs tab.
import { useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useModel } from "../state/model";
import { useStore } from "../state/store";
import { cashflow } from "../engine/econ";
import { fmtUsd } from "./ui";

const YEARS = 15;
const axisUsd = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  return a >= 1e6 ? `${s}$${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}K` : `${s}$${Math.round(a)}`;
};

export default function CostHud() {
  const m = useModel();
  const r = m.econ;
  const setTab = useStore((s) => s.setTab);
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.matchMedia?.("(min-width: 768px)").matches !== false);
  const data = cashflow(r, YEARS);
  const none = r.capex === 0 && r.annualBenefit === 0;
  const roi = r.capex > 0 ? (data[YEARS].net / r.capex) * 100 : null;
  const payback = r.paybackYears ? `${r.paybackYears.toFixed(1)} yr` : "none";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-expanded={false} aria-label="Show budget"
        className="absolute right-2 top-[4.5rem] z-20 rounded-lg border border-ink-600 bg-ink-950/90 px-2 py-1 text-[11px] text-star-300 shadow-lg backdrop-blur hover:border-amber-400">
        <span className="font-semibold text-amber-400">Budget</span>{" "}
        {none ? "no public changes" : <span className="tabular-nums">{fmtUsd(r.capex)} · payback {payback}</span>} ▾
      </button>
    );
  }

  return (
    <section aria-label="Budget for the current scenario"
      className="absolute right-2 top-[4.5rem] z-20 w-64 rounded-xl border border-ink-600 bg-ink-950/90 p-2 text-[11px] text-star-300 shadow-lg backdrop-blur">
      <header className="flex items-center gap-2">
        <span className="font-semibold text-amber-400">Budget</span>
        <span className="text-star-500">public fixtures</span>
        <button onClick={() => setTab("economics")} className="ml-auto text-glow-400 hover:underline">Details</button>
        <button onClick={() => setOpen(false)} aria-expanded={true} aria-label="Collapse budget" className="rounded px-1 text-star-500 hover:bg-ink-800 hover:text-star-100">▴</button>
      </header>
      {none ? (
        <p className="mt-1 text-star-500">No public fixtures change yet. Pick controls in Scenario or equip fixtures in Build mode.</p>
      ) : (
        <>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
            <Kpi label="Cost (CAPEX)" value={fmtUsd(r.capex)} />
            <Kpi label="Savings / yr" value={fmtUsd(r.annualBenefit)} tone={r.annualBenefit > 0 ? "good" : "bad"} />
            <Kpi label="Payback" value={payback} />
            <Kpi label={`ROI ${YEARS} yr`} value={roi === null ? "–" : `${roi >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(0)}%`} tone={roi !== null && roi >= 0 ? "good" : "bad"} />
          </div>
          <div className="mt-1 h-20" aria-label={`Cumulative net cash position over ${YEARS} years`}>
            <ResponsiveContainer>
              <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="year" stroke="#a79f88" fontSize={9} tickLine={false} interval={4} />
                <YAxis stroke="#a79f88" fontSize={9} width={44} tickLine={false} tickFormatter={axisUsd} />
                <Tooltip formatter={(v) => fmtUsd(Number(v))} labelFormatter={(l) => `Year ${l}`}
                  contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60", fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#f6b44b" />
                {!!r.paybackYears && r.paybackYears <= YEARS && <ReferenceLine x={Math.ceil(r.paybackYears)} stroke="#f6b44b" strokeDasharray="3 2" />}
                <Area dataKey="net" stroke="#7cc4ff" fill="#7cc4ff33" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {r.privateCost > 0 && <div className="mt-1 text-star-500">Owners (private fixtures): <span className="tabular-nums text-star-300">{fmtUsd(r.privateCost)}</span>, not in payback</div>}
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-star-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone === "good" ? "text-glow-400" : tone === "bad" ? "text-red-400" : "text-star-100"}`}>{value}</div>
    </div>
  );
}
