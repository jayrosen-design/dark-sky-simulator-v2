// Equity: who lives within a half-mile walk of public art, and where pooled funds would close the biggest gaps.
import { useState } from "react";
import { Card, fmtInt, fmtUsd, Slider, Stat } from "../../shared/ui";
import { suggestSites, type Suggestion } from "../engine/equity";
import { contextOf, type Model } from "../model";
import { usePaps } from "../state";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function EquityPanel({ m, onSuggest }: { m: Model; onSuggest: (s: Suggestion[]) => void }) {
  const { addProposal, highlightField } = usePaps();
  const seed = m.data.meta.seed;
  const pooled = m.led.totals.pooledIn;
  const avg = seed.policy.avg_commission.value;
  const [k, setK] = useState(Math.max(1, Math.min(6, Math.floor(pooled / avg) || 3)));
  const [sugs, setSugs] = useState<Suggestion[] | null>(null);
  const run = () => {
    const { bgs } = contextOf(m.data);
    const s = suggestSites(m.data.cells, m.data.blocks, bgs, m.eq.covered, seed, k);
    setSugs(s);
    onSuggest(s);
  };
  const row = (label: string, now: number, base: number) => (
    <tr className="border-t border-ink-700"><td className="text-star-300">{label}</td><td className="text-right tabular-nums">{pct(base)}</td><td className="text-right tabular-nums text-star-100">{pct(now)}</td></tr>
  );
  return (
    <div className="space-y-3">
      <Card title="Walk access to public art">
        <p className="text-xs text-star-300">Share of residents (2020 Census blocks) within half a mile, straight line, of a work on the map. Low-income: block groups with median household
          income under {Math.round(seed.equity.low_income_ratio.value * 100)}% of Alachua County's ({fmtUsd(m.data.meta.data.county_mhi)}, {m.data.meta.data.acs_release}). East Gainesville: inside city limits, east of Main Street.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat id="kpi.east" highlight={highlightField === "kpi.east"} label="East Gainesville" value={pct(m.eq.east.share)} sub={`${fmtInt(m.eq.east.covered)} of ${fmtInt(m.eq.east.pop)} residents`} />
          <Stat label="Parity with citywide" value={m.eq.parity.toFixed(2)} sub="1.00 = same access as the city overall" />
        </div>
        <table className="mt-2 w-full text-[11px]"><thead className="text-star-500"><tr><th className="text-left font-normal">Residents</th><th className="text-right font-normal">Collection</th><th className="text-right font-normal">With proposals</th></tr></thead>
          <tbody>{row("Citywide", m.eq.city.share, m.eqBase.city.share)}{row("Low-income block groups", m.eq.low.share, m.eqBase.low.share)}{row("East Gainesville", m.eq.east.share, m.eqBase.east.share)}</tbody></table>
      </Card>
      <Card title="Where pooled funds could go">
        <p className="text-xs text-star-300">The draft lets the Trust weigh visibility, access and geographic distribution (Sec. 5.5-4(1)(e)). This ranks places people pass by how many
          residents without nearby art they would reach (low-income and East Gainesville residents count double by default), with visibility as a tiebreaker.
          The pool holds {fmtUsd(pooled)} over the horizon, about {Math.floor(pooled / avg)} commission{Math.floor(pooled / avg) === 1 ? "" : "s"} at {fmtUsd(avg)}.</p>
        <Slider label="Places to suggest" value={k} min={1} max={10} onChange={setK} />
        <button onClick={run} className="w-full rounded-md bg-ink-800 px-2 py-1.5 text-sm text-star-100 hover:bg-ink-700">Suggest places</button>
        {sugs && (
          <ol className="mt-2 space-y-1 text-xs">
            {sugs.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-5 text-right text-[#b79cff]">{i + 1}.</span>
                <span className="flex-1 text-star-300">reaches {fmtInt(s.gain)} weighted residents · {fmtInt(s.vis)} reference impressions/day</span>
                <button className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] hover:bg-ink-700" onClick={() => addProposal(s.lon, s.lat)}>Add work</button>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
