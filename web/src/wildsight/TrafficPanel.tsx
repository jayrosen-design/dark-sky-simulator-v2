// Traffic Insights: where roadside WildSight units would prevent the most animal-vehicle crashes, how many units and
// gateways that takes, and what it costs to scale across the eight counties.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTraffic } from "./state";
import { deploy, KM_PER_MI, selectSegments, stopping, type DeployParams, type SeedValue } from "./engine";
import { Card, fmtInt, fmtUsd, Seg, Slider } from "../shared/ui";

const CorridorSim = lazy(() => import("./CorridorSim"));
const CLASS_LABEL: Record<string, string> = { motorway: "Interstate", trunk: "US / state highway", primary: "Primary highway", secondary: "Secondary road", tertiary: "Collector road", unclassified: "Rural road" };
const roadName = (n: string) => (n || "Unnamed road").replace(/;/g, " / ");
const axisUsd = (v: number) => (Math.abs(v) >= 1e6 ? `${v < 0 ? "−" : ""}$${+(Math.abs(v) / 1e6).toFixed(1)}M` : `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / 1e3)}K`);

export default function TrafficPanel() {
  const t = useTraffic();
  useEffect(() => { t.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (t.error) return <Card title="Traffic Insights"><p className="text-xs text-red-300">Could not load the traffic data package: {t.error}</p></Card>;
  if (!t.meta || !t.p || !t.derived || !t.segs) return <Card title="Traffic Insights"><p className="text-xs text-star-500">Loading road network, crash records and hotspots…</p></Card>;
  return <Loaded />;
}

function Loaded() {
  const { meta, p, derived, segs, setP, resetP, selected, select, layers, setLayers } = useTraffic();
  const m = meta!, P = p!, D = derived!, dep = D.dep;
  const bt = m.backtest.share_of_test_crashes_on_top_miles;
  const seg = selected !== null ? segs![selected] : D.sel[0] ?? D.cand[0];
  const [showAssume, setShowAssume] = useState(false);

  // Scaling scenarios on the same filters.
  const scale = useMemo(() => {
    const net = D.cand.reduce((a, s) => a + s.eb, 0);
    const rows: { label: string; p: DeployParams }[] = [
      ...[10, 25, 50, 100, 250, 500].filter((mi) => mi < D.candMiles).map((mi) => ({ label: `Riskiest ${mi} mi`, p: { ...P, strategy: "top_miles" as const, miles: mi } })),
      { label: "UF hotspots (90%+)", p: { ...P, strategy: "hotspots" as const, hotspotTier: 1 as const } },
      { label: "All candidate roads", p: { ...P, strategy: "all" as const } },
    ];
    return rows.map((r) => ({ label: r.label, d: deploy(selectSegments(segs!, r.p), r.p, net) }));
  }, [P, D, segs]);

  // Top corridors in the deployment: by road name and county.
  const corridorsTable = useMemo(() => {
    const g = new Map<string, { name: string; county: string; km: number; crashes: number; eb: number; first: number }>();
    for (const s of D.sel) {
      const k = `${s.name || "(unnamed)"}|${s.county}`;
      const r = g.get(k) ?? { name: roadName(s.name), county: m.counties[s.county], km: 0, crashes: 0, eb: 0, first: s.id };
      r.km += s.km; r.crashes += s.crashes; r.eb += s.eb;
      g.set(k, r);
    }
    return [...g.values()].sort((a, b) => b.eb - a.eb).slice(0, 12);
  }, [D.sel, m.counties]);

  const num = (key: keyof DeployParams, sv: SeedValue | undefined, label: string, step = 1, scaleBy = 1) => (
    <label className="flex items-center justify-between gap-2 border-t border-ink-700 py-1" title={sv?.provenance}>
      <span className="text-star-300">{label}{sv?.low !== undefined && <span className="text-star-500"> ({sv.low * scaleBy}–{sv.high! * scaleBy})</span>}</span>
      <input type="number" step={step} value={+(Number(P[key]) * scaleBy).toFixed(3)} onChange={(ev) => setP({ [key]: Number(ev.target.value) / scaleBy } as Partial<DeployParams>)}
        className="w-24 rounded bg-ink-800 px-1 py-0.5 text-right tabular-nums text-star-100" />
    </label>
  );
  const S = m.seed;

  return (
    <div className="space-y-3">
      <Card title="Traffic Insights · WildSight" right={<a className="text-[11px] text-glow-400 hover:underline" href="https://github.com/jayrosen-design/wildsight" target="_blank" rel="noreferrer">WildSight ↗</a>}>
        <p className="text-xs text-star-300">
          Where roadside AI wildlife-detection units would prevent the most animal-vehicle crashes in the eight counties, how many units and
          LoRa gateways that takes, and what it costs to scale. <b className="text-star-100">{fmtInt(m.crashes.eight_counties)}</b> reported animal crashes
          ({m.years[0]}–{m.years[1]}), {fmtInt(m.network_km / KM_PER_MI)} miles of modeled road; {Math.round((m.crashes.on_network / m.crashes.eight_counties) * 100)}% of crashes lie within 100 m of it.
        </p>
        <p className="mt-1 text-[11px] text-star-500">
          Risk = Empirical Bayes expected crashes per mile per year: a negative-binomial crash model (traffic, speed, habitat, two-lane) blended
          with each road's own record. Back-test: ranked on {m.backtest.train[0]}–{m.backtest.train[1]}, the riskiest 10% of miles caught{" "}
          <b className="text-glow-400">{Math.round(bt.eb.top10 * 100)}%</b> of {m.backtest.test[0]}–{m.backtest.test[1]} crashes (random: {Math.round(bt.length.top10 * 100)}%; model alone {Math.round(bt.model.top10 * 100)}%).
        </p>
      </Card>

      <Card title="Where to deploy">
        <Seg label="Deployment strategy" value={P.strategy} onChange={(v) => setP({ strategy: v })}
          options={[{ value: "top_miles", label: "Riskiest miles" }, { value: "hotspots", label: "UF hotspots" }, { value: "all", label: "All candidate roads" }]} />
        {P.strategy === "top_miles" && (
          <Slider label="Miles to cover (riskiest first)" value={P.miles} min={5} max={Math.max(50, Math.round(D.candMiles))} step={5} unit=" mi" onChange={(v) => setP({ miles: v })} />
        )}
        {P.strategy === "hotspots" && (
          <div className="mt-2"><Seg label="Hotspot confidence" value={P.hotspotTier} onChange={(v) => setP({ hotspotTier: v })}
            options={[{ value: 1, label: "90%+" }, { value: 2, label: "95%+" }, { value: 3, label: "99%" }]} /></div>
        )}
        <label className="mt-2 flex items-center gap-2 text-xs text-star-300">
          <input type="checkbox" className="accent-amber-400" checked={P.twoLaneOnly} onChange={(ev) => setP({ twoLaneOnly: ev.target.checked })} />
          Two-lane roads only <span className="text-[10px] text-star-500">(89% of large-animal collisions, FHWA 2008; WildSight's target)</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(m.counties).map(([f, name]) => {
            const on = P.counties.includes(f);
            return <button key={f} onClick={() => setP({ counties: on ? P.counties.filter((x) => x !== f) : [...P.counties, f] })} aria-pressed={on}
              className={`rounded px-2 py-0.5 text-[11px] ${on ? "bg-amber-400 text-ink-950" : "bg-ink-800 text-star-300"}`}>{name}</button>;
          })}
        </div>
        <div className="mt-3 h-36" aria-label="Share of expected crashes covered versus miles deployed">
          <ResponsiveContainer>
            <LineChart data={D.curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1a2642" />
              <XAxis dataKey="miles" type="number" stroke="#a79f88" fontSize={10} tickFormatter={(v) => `${Math.round(v)}`} domain={[0, "dataMax"]} />
              <YAxis stroke="#a79f88" fontSize={10} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={36} domain={[0, 1]} />
              <Tooltip formatter={(v) => `${Math.round(Number(v) * 100)}% of expected crashes`} labelFormatter={(l) => `${Math.round(Number(l))} miles`} contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60", fontSize: 11 }} />
              <ReferenceLine x={dep.miles} stroke="#f6b44b" strokeDasharray="3 2" />
              <Line dataKey="share" stroke="#7cc4ff" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-star-300">
          <b className="text-star-100">{fmtInt(dep.miles)} mi</b> ({Math.round((dep.miles / D.candMiles) * 100)}% of candidate miles) carry{" "}
          <b className="text-glow-400">{Math.round(dep.shareOfNetworkRisk * 100)}%</b> of their expected crashes ({dep.crashesPerYear.toFixed(0)} a year).
        </p>
      </Card>

      <Card title="Devices and network">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Kpi label="WildSight units" value={fmtInt(dep.units)} sub={`${(dep.units / Math.max(dep.miles, 0.01)).toFixed(0)} per mile`} />
          <Kpi label="LoRa gateways" value={fmtInt(dep.gateways)} sub={`${dep.corridors} corridors`} />
          <Kpi label="Road covered" value={`${fmtInt(dep.miles)} mi`} sub={`${dep.segments} segments`} />
          <Kpi label="Roadside in a motion zone" value={`${Math.round(Math.min(1, (2 * P.pirM) / P.spacingM) * 100)}%`} sub={`${P.pirM} m PIR, ${P.sides === 2 ? "both" : "one"} side${P.sides === 2 ? "s" : ""}`} />
        </div>
        <div className="mt-2 space-y-1">
          <Seg label="Unit spacing" value={P.spacingM} onChange={(v) => setP({ spacingM: v })}
            options={(S.device.spacing_m.options ?? [40, 80, 160, 320]).map((v) => ({ value: v, label: `${v} m` }))} />
          <Seg label="Sides" value={P.sides} onChange={(v) => setP({ sides: v })} options={[{ value: 2, label: "Both shoulders" }, { value: 1, label: "One shoulder" }]} />
          <Slider label="Gateway LoRa range" value={P.gatewayKm} min={1} max={8} step={0.5} unit=" km" onChange={(v) => setP({ gatewayKm: v })} />
        </div>
        <p className="mt-1 text-[10px] text-star-500">{S.device.spacing_m.provenance}. {S.network.gateway_range_km.provenance}.</p>
      </Card>

      <Card title="Costs and benefits" right={<button className="text-[11px] text-amber-400" onClick={resetP}>Reset assumptions</button>}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Kpi label="Up-front (CAPEX)" value={fmtUsd(dep.capex)} sub={`${fmtUsd(dep.costPerMile)} per mile`} />
          <Kpi label="Running cost / yr" value={fmtUsd(dep.opexYear)} sub={`units replaced every ${P.lifeYears} yr: ${fmtUsd(dep.replacementEach)}`} />
          <Kpi label="Crashes avoided / yr" value={dep.avoidedPerYear.toFixed(1)} sub={`${Math.round(P.effectiveness * 100)}% effective on ${dep.crashesPerYear.toFixed(0)} expected`} tone="good" />
          <Kpi label={`${P.horizonYears}-yr benefit / cost`} value={dep.bcr.toFixed(2)} sub={dep.paybackYear ? `pays back in year ${dep.paybackYear}` : "no payback in horizon"} tone={dep.bcr >= 1 ? "good" : "bad"} />
        </div>
        <p className="mt-2 rounded bg-ink-800/80 px-2 py-1 text-[11px] text-star-300">
          Break-even installed price per unit: {dep.breakEvenUnitCost !== null
            ? <b className={dep.breakEvenUnitCost >= P.unitHardware + P.unitInstall ? "text-glow-400" : "text-amber-300"}>{fmtUsd(dep.breakEvenUnitCost)}</b>
            : <b className="text-red-300">none</b>}{" "}
          <span className="text-star-500">{dep.breakEvenUnitCost !== null
            ? `(assumed ${fmtUsd(P.unitHardware + P.unitInstall)}; B/C reaches 1 at or below this, other costs unchanged)`
            : `(the yearly running cost of ${fmtUsd(P.cloudUnitYear + P.maintUnitYear)} per unit already exceeds the crash costs avoided)`}</span>
        </p>
        <Slider label="Effectiveness (share of crashes prevented)" value={Math.round(P.effectiveness * 100)} min={0} max={82} unit="%" onChange={(v) => setP({ effectiveness: v / 100 })} />
        <p className="text-[10px] text-star-500">{S.benefits.effectiveness.provenance}.</p>
        <div className="mt-2 h-32" aria-label="Cumulative net cash position">
          <ResponsiveContainer>
            <AreaChart data={dep.cashflow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1a2642" />
              <XAxis dataKey="year" stroke="#a79f88" fontSize={10} />
              <YAxis stroke="#a79f88" fontSize={10} tickFormatter={axisUsd} width={48} />
              <Tooltip formatter={(v) => fmtUsd(Number(v))} labelFormatter={(l) => `Year ${l}`} contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60", fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#f6b44b" />
              <Area dataKey="net" stroke="#7cc4ff" fill="#7cc4ff33" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-star-500">Cumulative net = crash costs avoided − costs (undiscounted); B/C uses present values at {(P.discount * 100).toFixed(1)}% (USDOT BCA guidance real rate). Crash cost {fmtUsd(P.crashCost)} each: {S.benefits.crash_cost_usd.provenance}.</p>
        <button className="mt-1 text-[11px] text-glow-400 hover:underline" onClick={() => setShowAssume(!showAssume)} aria-expanded={showAssume}>{showAssume ? "Hide" : "Edit"} cost assumptions</button>
        {showAssume && (
          <div className="mt-1 text-[11px]">
            {num("pirM", S.device.pir_range_m, "Detection range per unit (m)")}
            <p className="text-[10px] text-star-500">WildSight's PIR reaches 15–20 m, so full coverage needs a unit every ~40 m. A longer-range sensor (e.g. thermal) with wider spacing cuts the unit count.</p>
            {num("unitHardware", S.costs.unit_hardware, "Unit hardware ($)", 10)}
            {num("unitInstall", S.costs.unit_install, "Unit install ($)", 10)}
            {num("gatewayInstalled", S.costs.gateway_installed, "Gateway, installed ($)", 50)}
            {num("backhaulMonth", S.costs.backhaul_per_gateway_month, "Gateway data plan ($/month)")}
            {num("cloudUnitYear", S.costs.cloud_per_unit_year, "Cloud + dashboard ($/unit/yr)")}
            {num("maintUnitYear", S.costs.maintenance_per_unit_year, "Maintenance ($/unit/yr)")}
            {num("lifeYears", S.device.service_life_years, "Unit service life (yr)")}
            {num("crashCost", S.benefits.crash_cost_usd, "Cost per crash ($)", 100)}
            {num("unreported", S.benefits.unreported_factor, "Unreported-crash multiplier", 0.1)}
            {num("horizonYears", undefined, "Horizon (yr)")}
            {num("discount", undefined, "Discount rate (%)", 0.1, 100)}
            <p className="mt-1 text-star-500">Prices are design assumptions (the WildSight repo lists none); hover a line for its source.</p>
          </div>
        )}
      </Card>

      <Card title="Scaling out" right={<span className="text-[11px] text-star-500">same filters and assumptions</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-left text-star-500"><tr><th className="font-normal">Scenario</th><th className="text-right font-normal">Miles</th><th className="text-right font-normal">Units</th><th className="text-right font-normal">Gateways</th><th className="text-right font-normal">CAPEX</th><th className="text-right font-normal">Avoided/yr</th><th className="text-right font-normal">B/C</th></tr></thead>
            <tbody>
              {scale.map((r) => (
                <tr key={r.label} className="border-t border-ink-700">
                  <td className="py-0.5">{r.label}</td><td className="text-right tabular-nums">{fmtInt(r.d.miles)}</td><td className="text-right tabular-nums">{fmtInt(r.d.units)}</td>
                  <td className="text-right tabular-nums">{fmtInt(r.d.gateways)}</td><td className="text-right tabular-nums">{fmtUsd(r.d.capex)}</td>
                  <td className="text-right tabular-nums">{r.d.avoidedPerYear.toFixed(1)}</td>
                  <td className={`text-right tabular-nums ${r.d.bcr >= 1 ? "text-glow-400" : "text-red-300"}`}>{r.d.bcr.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-star-500">Benefit/cost falls as deployment spreads to lower-risk miles: the first miles carry the most crashes.</p>
      </Card>

      <Card title="Top corridors in this deployment">
        {corridorsTable.length === 0 ? <p className="text-xs text-star-500">No roads selected.</p> : (
          <table className="w-full text-[11px]">
            <thead className="text-left text-star-500"><tr><th className="font-normal">Road</th><th className="text-right font-normal">Miles</th><th className="text-right font-normal">Crashes {m.years[0] % 100}–{m.years[1] % 100}</th><th className="text-right font-normal">Expected/yr</th></tr></thead>
            <tbody>
              {corridorsTable.map((r) => (
                <tr key={`${r.name}|${r.county}`} className="cursor-pointer border-t border-ink-700 hover:bg-ink-800" onClick={() => select(r.first, true)}>
                  <td className="py-0.5">{r.name}<span className="block text-[10px] text-star-500">{r.county}</span></td>
                  <td className="text-right tabular-nums">{(r.km / KM_PER_MI).toFixed(1)}</td><td className="text-right tabular-nums">{r.crashes}</td><td className="text-right tabular-nums">{r.eb.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[10px] text-star-500">
          Species on these roads: {m.groups.map((g, i) => `${g} ${dep.groupTotals[i]}`).join(" · ")}.
          WildSight's prototype classes cover {Math.round(dep.trainedSpeciesShare * 100)}% of them (deer, dogs, cats); bears, wild pigs and livestock would need new training data.
        </p>
      </Card>

      {seg && (
        <Card title={roadName(seg.name)} right={<span className="text-[11px] text-star-500">{m.counties[seg.county]}</span>}>
          <table className="w-full text-[11px]"><tbody>
            <Row k="Road" v={`${CLASS_LABEL[m.classes[seg.cls]] ?? m.classes[seg.cls]} · ${seg.lanes} lane${seg.lanes === 1 ? "" : "s"} · ${seg.mph} mph`} />
            <Row k="Traffic" v={`${fmtInt(seg.aadt)} vehicles/day ${seg.aadtFdot ? "(FDOT 2025 count)" : "(class default; no FDOT count)"}`} />
            <Row k="Habitat" v={`${Math.round(seg.habitat * 100)}%${seg.conservation ? " · conservation land within 300 m" : ""}${seg.hotspot ? ` · UF hotspot ${["", "90%", "95%", "99%"][seg.hotspot]}` : ""}`} />
            <Row k="Crashes" v={<>{seg.crashes} reported {m.years[0]}–{m.years[1]} on this {(seg.km / KM_PER_MI).toFixed(2)} mi{" "}
              <span className="text-star-500">({m.groups.map((g, i) => (seg.groups[i] ? `${g} ${seg.groups[i]}` : "")).filter(Boolean).join(", ") || "none"})</span></>} />
            <Row k="Risk" v={`${seg.risk.toFixed(2)} expected crashes / mile / yr`} />
            <Row k="WildSight" v={`${fmtInt(Math.max(1, Math.ceil((seg.km * 1000) / P.spacingM)) * P.sides)} units at ${P.spacingM} m`} />
          </tbody></table>
          <div className="mt-2">
            <Suspense fallback={<div className="h-48 animate-pulse rounded bg-ink-800" />}>
              <CorridorSim mph={seg.mph} aadt={seg.aadt} spacingM={P.spacingM} roadName={roadName(seg.name)} />
            </Suspense>
          </div>
          <StopDemo mph={seg.mph} />
        </Card>
      )}

      <Card title="Map layers">
        <div className="flex flex-wrap gap-1">
          {([["risk", "Road risk"], ["units", "Units + gateways"], ["hotspots", "UF hotspots"], ["crashes", "Crash reports"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setLayers({ [k]: !layers[k] })} aria-pressed={layers[k]}
              className={`rounded px-2 py-0.5 text-[11px] ${layers[k] ? "bg-amber-400 text-ink-950" : "bg-ink-800 text-star-300"}`}>{label}</button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-star-500">Click a road on the map to inspect it and simulate it. Units show from zoom 12.</p>
      </Card>

      <p className="text-[10px] text-star-500">
        Sources: {m.seed.sources.crashes}; {m.seed.sources.hotspots}; {m.seed.sources.aadt}; {m.seed.sources.roads}; {m.seed.sources.device}.
        Reported crashes undercount collisions. WildSight's effect on animals and drivers is unproven until piloted; outcomes here are planning estimates.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-ink-800/80 p-2">
      <div className="text-[10px] uppercase tracking-wide text-star-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone === "good" ? "text-glow-400" : tone === "bad" ? "text-red-300" : "text-star-100"}`}>{value}</div>
      {sub && <div className="text-[10px] text-star-500">{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <tr className="border-t border-ink-700"><td className="w-20 py-0.5 pr-2 align-top text-star-500">{k}</td><td className="py-0.5 text-star-300">{v}</td></tr>;
}

/** WildSight's beacon demo: stopping with and without the amber warning at this road's speed. */
function StopDemo({ mph: roadMph }: { mph: number }) {
  const [mph, setMph] = useState(roadMph);
  useEffect(() => setMph(roadMph), [roadMph]);
  const s = stopping(mph), W = 360, scale = W / Math.max(170, s.stop + 10);
  const bar = (y: number, dist: number, color: string) => <rect x={0} y={y} width={dist * scale} height={10} fill={color} rx={2} />;
  return (
    <div className="mt-3 text-[11px]">
      <div className="flex items-center justify-between"><span className="font-semibold text-star-100">Driver beacon: the warning arrives earlier</span><span className="text-[10px] text-star-500">illustrative physics</span></div>
      <svg viewBox={`0 0 ${W} 64`} className="mt-1 w-full">
        <line x1={s.see * scale} x2={s.see * scale} y1={0} y2={64} stroke="#c78d52" strokeDasharray="3 2" />
        <text x={s.see * scale + 3} y={62} fontSize={8} fill="#c78d52">animal seen (60 m, low beams)</text>
        <line x1={s.warn * scale} x2={s.warn * scale} y1={0} y2={64} stroke="#ffb347" strokeDasharray="3 2" />
        <text x={Math.min(W - 70, s.warn * scale + 3)} y={8} fontSize={8} fill="#ffb347">beacon seen (150 m)</text>
        {bar(14, s.react, "#7cc4ff")}<rect x={s.react * scale} y={14} width={s.brake * scale} height={10} fill="#f08ab8" rx={2} />
        <text x={2} y={36} fontSize={8} fill="#a79f88">reaction {s.react.toFixed(0)} m + braking {s.brake.toFixed(0)} m = {s.stop.toFixed(0)} m to stop</text>
        <text x={2} y={48} fontSize={9} fill={s.impactCold > 0 ? "#ff8a80" : "#8fe38f"}>Today: {s.impactCold > 0 ? `hits the animal at ${(s.impactCold / 0.44704).toFixed(0)} mph` : "stops in time"}</text>
        <text x={W / 2} y={48} fontSize={9} fill={s.impactWarned > 0 ? "#ff8a80" : "#8fe38f"}>With beacon: {s.impactWarned > 0 ? `hits at ${(s.impactWarned / 0.44704).toFixed(0)} mph` : "stops in time"}</text>
      </svg>
      <input type="range" min={25} max={70} step={5} value={mph} onChange={(ev) => setMph(Number(ev.target.value))} className="w-full accent-amber-400" aria-label="Approach speed" />
      <div className="text-[10px] text-star-500">{mph} mph. 1.5 s perception-reaction, 0.7 g braking on dry pavement (WildSight beacon demo).</div>
    </div>
  );
}
