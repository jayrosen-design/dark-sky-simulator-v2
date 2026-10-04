// Activity: who passes a work hour by hour on the chosen date (vehicles vs people on foot or bike), the most-seen
// works, and how well the walking/biking model matches the City's counters.
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, fmtInt, Toggle } from "../../shared/ui";
import type { Model } from "../model";
import { sunByHour } from "../model";
import { usePaps } from "../state";
import { artTitle, Mini } from "./ArtCard";

export default function ActivityPanel({ m, agents, setAgents }: { m: Model; agents: boolean; setAgents: (v: boolean) => void }) {
  const { selected, select, date } = usePaps();
  const a = m.arts.find((x) => x.id === selected) ?? [...m.arts].sort((p, q) => (m.imp.get(q.id)?.dvi ?? 0) - (m.imp.get(p.id)?.dvi ?? 0))[0];
  const i = a ? m.imp.get(a.id) : undefined;
  const sun = sunByHour(date.y, date.mo, date.d);
  const rows = i ? i.veh.map((v, h) => ({ h: `${h}`, vehicles: Math.round(v), people: Math.round(i.ped[h]), dark: sun[h] < -0.83 })) : [];
  const top = [...m.arts].map((x) => ({ x, d: m.imp.get(x.id)?.dvi ?? 0 })).sort((p, q) => q.d - p.d).slice(0, 10);
  const maxD = top[0]?.d || 1;
  const pm = m.data.meta.report.pedestrian_model;
  return (
    <div className="space-y-3">
      <Card title="Impressions through the day" right={<span className="text-[11px] text-star-500">{date.mo}/{date.d}/{date.y}</span>}>
        {a && i ? <>
          <p className="text-xs text-star-300"><b className="text-star-100">{artTitle(a)}</b>: {fmtInt(i.dvi)} impressions a day. Drivers and passengers on {i.streetPieces} street
            pieces within {i.radius} m; people on foot or bike from the modeled flow. After dark it keeps {Math.round(i.night * 100)}% of its daytime visibility
            ({a.lit ? "lit" : `unlit, ${i.lamps} streetlight${i.lamps === 1 ? "" : "s"} within 40 m`}).</p>
          <div className="mt-2 h-36" aria-label="Impressions by hour">
            <ResponsiveContainer>
              <AreaChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1a2642" strokeDasharray="2 3" />
                <XAxis dataKey="h" tick={{ fontSize: 10, fill: "#a79f88" }} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "#a79f88" }} />
                <Tooltip contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60", fontSize: 11 }} labelFormatter={(h) => `${h}:00`} />
                <Area type="monotone" dataKey="vehicles" stackId="1" stroke="#f6b44b" fill="#f6b44b" fillOpacity={0.35} />
                <Area type="monotone" dataKey="people" stackId="1" stroke="#5fd6c4" fill="#5fd6c4" fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-center">
            <Mini label="Stops / day" value={i.stops.toFixed(1)} /><Mini label="Dwell minutes" value={fmtInt(i.dwellMin)} /><Mini label="Attraction" value={i.attraction.toFixed(2)} />
          </div>
        </> : <p className="text-xs text-star-500">Select a work on the map.</p>}
        <Toggle label="Show moving people and vehicles" checked={agents} onChange={setAgents} hint="An illustration driven by the same hourly flows near the view; the numbers come from the model, not the animation" />
      </Card>
      <Card title="Most-seen works on this date">
        <ul className="space-y-1 text-xs">
          {top.map(({ x, d }) => (
            <li key={x.id}><button className="w-full text-left" onClick={() => select(x.id, true)}>
              <div className="flex justify-between"><span className="truncate text-star-100">{artTitle(x)}</span><span className="tabular-nums text-star-300">{fmtInt(d)}</span></div>
              <div className="h-1 rounded bg-ink-800"><div className="h-1 rounded bg-[#b79cff]" style={{ width: `${(d / maxD) * 100}%` }} /></div>
            </button></li>
          ))}
        </ul>
      </Card>
      <Card title="Walking and biking model">
        <p className="text-xs text-star-300">People on foot or bike per day are a proxy from nearby destinations, transit service, rail-trails and residents, with one fit to the City's
          {` ${pm.n_counters}`} 2025 bike/ped counters (fit R² {pm.r2_log} on a log scale; leave-one-out error: typically ×{pm.loo_median_factor}, worst ×{pm.loo_max_factor}).
          Treat the walking numbers as rough.</p>
        <table className="mt-1 w-full text-[11px]"><thead className="text-star-500"><tr><th className="text-left font-normal">Counter</th><th className="text-right font-normal">Counted</th><th className="text-right font-normal">Model</th></tr></thead>
          <tbody>{pm.counter_vs_model.map(([s, c, mo]) => <tr key={s} className="border-t border-ink-700"><td className="pr-1 text-star-300">{s}</td><td className="text-right tabular-nums">{fmtInt(c)}</td><td className="text-right tabular-nums">{fmtInt(mo)}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}
