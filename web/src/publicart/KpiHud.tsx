// The six headline figures (TRD 3.1 KPI cards) over the map; each opens the tab that explains it. Collapsible.
import { useState } from "react";
import { fmtInt, fmtUsd } from "../shared/ui";
import type { Model } from "./model";
import { usePaps, type Tab } from "./state";

export default function KpiHud({ m }: { m: Model }) {
  const [open, setOpen] = useState(true);
  const { setTab, policy } = usePaps();
  const k = m.kpi, horizon = policy.horizon;
  const cards: { label: string; value: string; sub: string; tab: Tab; id: string }[] = [
    { label: "Capital capturable", value: fmtUsd(k.capital), sub: `${horizon}-yr CIP · ${k.capital >= k.capital89 ? "+" : ""}${fmtUsd(k.capital - k.capital89)} vs 1989`, tab: "policy", id: "kpi.capital" },
    { label: "Conservation reserve", value: policy.code === "draft" ? fmtUsd(k.reserve) : "none", sub: k.shortfall > 0 ? `unfunded care ${fmtUsd(k.shortfall)}` : "care fully funded", tab: "conservation", id: "kpi.reserve" },
    { label: "Daily visual impressions", value: fmtInt(k.dvi), sub: k.dviProposed ? `+${fmtInt(k.dviProposed)} from proposals` : "collection, this date", tab: "activity", id: "kpi.dvi" },
    { label: "Visitor spending", value: m.proposals.length ? `${fmtUsd(k.visitorRevenue)}/yr` : "—", sub: m.proposals.length ? "induced by proposed works" : "place a work to estimate", tab: "economics", id: "kpi.visitor" },
    { label: "Local artist target", value: `${Math.round(k.localTarget * 100)}%`, sub: k.localShare !== null ? `${Math.round(k.localShare * 100)}% of known works today` : "", tab: "staff", id: "kpi.local" },
    { label: "East Gainesville coverage", value: `${Math.round(k.eastCoverage * 100)}%`, sub: `residents ≤ ½ mi · parity ${k.eastParity.toFixed(2)}`, tab: "equity", id: "kpi.east" },
  ];
  return (
    <div className="pointer-events-auto rounded-lg bg-ink-950/85 p-2 text-star-300 backdrop-blur" role="region" aria-label="Key figures for the current scenario">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#b79cff]">{policy.code === "draft" ? "Trust draft" : "1989 code"}</span>
        <span className="text-[10px] text-star-500">planning estimates</span>
        <button onClick={() => setOpen(!open)} className="ml-auto rounded px-1 text-xs text-star-500 hover:bg-ink-800" aria-label={open ? "Collapse key figures" : "Show key figures"}>{open ? "▴" : "▾"}</button>
      </div>
      {open && (
        <div className="mt-1 grid grid-cols-3 gap-1">
          {cards.map((c) => (
            <button key={c.id} id={c.id} onClick={() => setTab(c.tab)} className="rounded bg-ink-800/80 px-1.5 py-1 text-left hover:bg-ink-700" title={c.sub}>
              <div className="truncate text-[9px] uppercase tracking-wide text-star-500">{c.label}</div>
              <div className="text-[13px] font-semibold leading-tight tabular-nums text-star-100">{c.value}</div>
              <div className="truncate text-[9px] text-star-500">{c.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
