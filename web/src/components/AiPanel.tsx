// "How the AI works": what is learned from data, how it is checked, and what is not AI (ADR 0011).
import { useEffect, useMemo, type ReactNode } from "react";
import { useData } from "../state/model";
import { useStore } from "../state/store";
import { useViirsLayers } from "../state/viirs";
import { fitStep } from "../engine/changes";
import { Card, fmtInt, fmtPct, Stat } from "./ui";

const FEATURE_LABELS: Record<string, string> = {
  d_urban_km: "Distance to urban cores", hu_density: "Housing density", elevation: "Elevation",
  log_radiance: "Current brightness", d_road_km: "Distance to major roads", conservation: "Conservation land",
};
const AMBER = "#f6b44b", BLUE = "#7cc4ff", MUTED = "#6f6a5c", TEXT = "#a79f88";
const pct0 = (v: number) => `${Math.round(v * 100)}%`;

export default function AiPanel() {
  const { e } = useData();
  const v = e.viirs;
  const setView = useStore((s) => s.setMapView);
  const aiCell = useStore((s) => s.aiCell);
  const setAiCell = useStore((s) => s.setAiCell);
  const layers = useViirsLayers(e, true);
  useEffect(() => { if (v) setView("changes"); }, [v, setView]);

  if (!v) return <Card title="How the AI works"><p className="text-xs text-star-300">The NASA VIIRS series is not loaded in this package, so the machine-learning steps have not run. See README, "VIIRS (Earth Engine)".</p></Card>;
  const s = v.steps, g = e.growth_model;
  const bg = Object.entries(v.background_nw.region).map(([y, x]) => [Number(y), x] as const);

  return (
    <div className="space-y-3 text-xs text-star-300">
      <Card title="How the AI works">
        <p>Two models learned from data, a statistical change detector and a machine-learning forecast, read 13 years of NASA satellite images of
          Florida at night. Everything else in the simulator is physics or explicit rules with editable assumptions.</p>
        <ol className="mt-2 space-y-1">
          <Step n={1} tag="data">NASA Black Marble (VIIRS VNP46A2): each year's median of cloud-free nights, 2012–2024, about 500 m per cell.</Step>
          <Step n={2} tag="cleaning">Remove the faint airglow of the upper atmosphere, which rises and falls with the solar cycle.</Step>
          <Step n={3} tag="statistics">Find where lighting changed abruptly: a step test on every lit cell, calibrated by simulation.</Step>
          <Step n={4} tag="machine learning">Forecast where light will grow: a LightGBM model, back-tested on years it never saw. It feeds the 2034 sky in the Observatory tab.</Step>
        </ol>
      </Card>

      <Card title="1 · The satellite record and the airglow fix">
        <p>Even over forest and open water the satellite records a little light: airglow, high in the atmosphere. It is weakest at the
          2019–20 solar minimum and strongest near the maxima. Left in, unlit land would seem to brighten 70–120%, so each year's background
          (the median of the darkest fifth of the region) is removed first.</p>
        <Bars data={bg} label="Background over unlit land, nW cm⁻² sr⁻¹ (region)" />
        {s.common_mode_pct && <p className="mt-1 text-star-500">After that, lit areas still move together: {fmtPct(Math.min(...s.common_mode_pct), 0)} by{" "}
          {v.years[s.common_mode_pct.indexOf(Math.min(...s.common_mode_pct))]}, {fmtPct(s.common_mode_pct[s.common_mode_pct.length - 1], 0)} by 2024 (vs 2012). NOAA's separately processed product shows the same rise after 2021.</p>}
      </Card>

      <Card title="2 · Finding where lighting changed">
        <p>For each lit cell, the test compares two explanations of its 13 yearly values: a steady trend, or a trend with a sudden step.
          It keeps the step only if pure noise would produce that much evidence less than 1 time in {fmtInt(1 / s.alpha)} (F ≥ {s.critical_f.toFixed(1)},
          found by simulating 200,000 noise-only cells), and only if the step is at least {s.min_step_pct}%. The region's shared movement is taken out
          first, so a cell is flagged for what happened <i>there</i>.</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="Lit cells tested" value={fmtInt(s.n_lit)} />
          <Stat label="Cells flagged" value={fmtInt(s.n_flagged)} sub={`${s.events.rises} rises · ${s.events.drops} drops`} />
          <Stat label="Expected by chance" value={`≈${fmtInt(s.expected_false)}`} sub={`1 in ${fmtInt(1 / s.alpha)}`} />
        </div>
        <p className="mt-2">A lit cell's yearly values typically scatter {s.noise_pct.median}% around its trend (middle half {s.noise_pct.p25}–{s.noise_pct.p75}%).
          At that noise a simulated +50% step is caught {pct0(s.detection_at_median_noise["+50%"])} of the time and a −30% step {pct0(s.detection_at_median_noise["-30%"])}:
          what it flags are large changes such as new development, and it misses most retrofits.</p>
        <Inspector cell={aiCell?.i ?? null} layers={layers} />
        <div className="mt-3 font-semibold text-star-100">Largest events</div>
        <ul className="mt-1 divide-y divide-ink-700" aria-label="Largest change events">
          {v.events.slice(0, 10).map((ev) => (
            <li key={ev.cell}>
              <button onClick={() => setAiCell({ i: ev.cell, fly: true })}
                className={`flex w-full items-baseline gap-2 py-1 text-left hover:bg-ink-800 ${aiCell?.i === ev.cell ? "bg-ink-800" : ""}`}>
                <span className="w-9 tabular-nums text-star-100">{ev.year}</span>
                <span className="w-16 tabular-nums" style={{ color: ev.pct > 0 ? AMBER : BLUE }}>{ev.pct > 0 ? "+" : ""}{fmtInt(ev.pct)}%</span>
                <span className="flex-1">{ev.near_km < 3 ? ev.near : `${fmtInt(ev.near_km)} km from ${ev.near}`}</span>
                <span className="text-star-500">{ev.pixels} cells</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-star-500">Ranked by the radiance gained or lost. Events carry only their nearest town: the model knows that light changed, not what was built.</p>
      </Card>

      {g.method === "lightgbm" && g.importance && g.deciles_pct_per_yr && g.lit_change_pct && (
        <Card title="3 · Forecasting growth with LightGBM">
          <p>A gradient-boosted tree model learns how fast each ~1 km cell brightened over six years from what the cell looked like at the start.
            What it leans on:</p>
          <div className="mt-2 space-y-1">
            {Object.entries(g.importance).sort((a, b) => b[1] - a[1]).map(([k, w]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-40 shrink-0">{FEATURE_LABELS[k] ?? k}</span>
                <span className="h-2 rounded-sm" style={{ width: `${w * 150}px`, background: AMBER }} />
                <span className="tabular-nums text-star-500">{pct0(w)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3"><b className="text-star-100">The back-test.</b> Trained on 2012→2018, then asked for 2024 from 2018, years it never saw
            ({fmtInt(g.n_cells ?? 0)} lit cells):</p>
          <table className="mt-1 w-full" aria-label="Back-test against baselines">
            <thead className="text-left text-star-500"><tr><th className="font-normal">Prediction of 2024</th><th className="text-right font-normal">Median error</th><th className="text-right font-normal">Log error</th></tr></thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-ink-700"><td className="text-star-100">LightGBM</td><td className="text-right">{g.median_ape_pct?.toFixed(1)}%</td><td className="text-right">{g.rmse_log?.toFixed(3)}</td></tr>
              <tr className="border-t border-ink-700"><td>No change (2024 = 2018)</td><td className="text-right">{g.nochange_median_ape_pct?.toFixed(1)}%</td><td className="text-right">{g.nochange_rmse_log?.toFixed(3)}</td></tr>
              <tr className="border-t border-ink-700"><td>Each cell's own past trend</td><td className="text-right">{g.naive_median_ape_pct?.toFixed(1)}%</td><td className="text-right">–</td></tr>
            </tbody>
          </table>
          <Deciles pairs={g.deciles_pct_per_yr} />
          <p className="mt-1">It gets the <b className="text-star-100">order</b> right, not the <b className="text-star-100">amount</b>: cells it expected to grow fastest did grow fastest
            (correlation {g.rate_corr?.toFixed(2)}; {g.cv_r2?.toFixed(2)} R² on areas held out of training), but every group grew faster than predicted. Lit areas
            changed {fmtPct(g.lit_change_pct["2012-2018"])} in 2012–18 and {fmtPct(g.lit_change_pct["2018-2024"])} in 2018–24; nothing in the earlier years
            announced that reversal, so on total brightness the model does no better than "no change".</p>
          <p className="mt-1 text-star-500">Used for: the 2034 sky in the Observatory tab, refit on 2018→2024 and assuming that pace continues.</p>
        </Card>
      )}

      <Card title="How it is kept honest">
        <ul className="list-disc space-y-1 pl-4">
          <li>The forecast is scored only on years it never trained on, beside two simple baselines; a test fails if the hold-out leaks into training.</li>
          <li>The step test's false-alarm rate is checked on simulated noise, and steady trends are checked not to count as steps.</li>
          <li>This page repeats the step test for any cell you click; a test requires it to agree with the pipeline on every lit cell.</li>
          <li>The modeled sky is compared with observations: one brightness scale is fitted to {e.anchor.n_sites} reference sites (RMSE {e.anchor.rmse_mag.toFixed(2)} mag),
            and {e.sanity.globe_at_night.n_sqm} Globe at Night meter readings never used in any fit read {e.sanity.globe_at_night.median_residual_sqm?.toFixed(2)} mag
            brighter than the model (median).</li>
        </ul>
      </Card>

      <Card title="What is not AI here">
        <ul className="list-disc space-y-1 pl-4">
          <li><b className="text-star-100">Sky brightness</b>: Garstang single-scattering physics (molecules and aerosols scattering light through the atmosphere), not a learned model.</li>
          <li><b className="text-star-100">Scenario effects</b>: explicit fixture rules (shielding, color temperature, curfews) from published sources.</li>
          <li><b className="text-star-100">Observatory ranking</b>: a weighted sum of criteria whose weights you set.</li>
          <li><b className="text-star-100">Costs and payback</b>: unit prices × fixture counts.</li>
        </ul>
      </Card>
    </div>
  );
}

function Step({ n, tag, children }: { n: number; tag: string; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] text-star-100">{n}</span>
      <span>{children} <span className="ml-1 rounded bg-ink-800 px-1 text-[10px] text-star-500">{tag}</span></span>
    </li>
  );
}

/** Year bars (background glow). */
function Bars({ data, label }: { data: (readonly [number, number])[]; label: string }) {
  const W = 360, H = 90, max = Math.max(...data.map((d) => d[1]));
  const bw = W / data.length;
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label={label}>
        {data.map(([y, x], k) => (
          <g key={y}>
            <rect x={k * bw + 2} y={H - (x / max) * H} width={bw - 4} height={(x / max) * H} fill={AMBER} opacity={0.75} />
            <text x={k * bw + bw / 2} y={H + 11} textAnchor="middle" fontSize="9" fill={TEXT}>{String(y).slice(2)}</text>
          </g>
        ))}
      </svg>
      <figcaption className="text-[10px] text-star-500">{label}; tallest {max.toFixed(2)}</figcaption>
    </figure>
  );
}

/** One cell's 13 years, the fitted line (plus step), and the verdict. */
function Inspector({ cell, layers }: { cell: number | null; layers: ReturnType<typeof useViirsLayers> }) {
  const { e } = useData();
  const v = e.viirs!;
  const fit = useMemo(() => (cell === null || !layers ? null : fitStep(layers.years.map((l) => l[cell]), v.years, v.steps)), [cell, layers, v]);
  if (cell === null) return <p className="mt-3 rounded border border-dashed border-ink-600 p-2 text-star-500">Click any lit cell on the map, or an event below, to see its 13 years and why it was or was not flagged.</p>;
  if (!fit || !layers) return <p className="mt-3 text-star-500">Loading the satellite series…</p>;
  const g = e.grids.a15, s = v.steps;
  const lon = g.west + ((cell % g.nx) + 0.5) * ((g.east - g.west) / g.nx), lat = g.north - (Math.floor(cell / g.nx) + 0.5) * ((g.north - g.south) / g.ny);
  const raw = layers.years.map((l) => l[cell]);
  const verdict = !fit.lit ? `Too dim to test: below ${s.lit_nw} nW at both ends of the record.`
    : fit.flagged ? `Step in ${fit.year}: ${fmtPct(fit.stepPct, 0)} on top of the cell's trend (F = ${fit.f.toFixed(1)}, needs ${s.critical_f.toFixed(1)}).`
    : fit.f >= s.critical_f ? `A real but small step (${fit.year}, ${fmtPct(fit.stepPct, 0)}; F = ${fit.f.toFixed(1)}): under the ${s.min_step_pct}% size rule.`
    : `No step: the best split (${fit.year}, ${fmtPct(fit.stepPct, 0)}) scores F = ${fit.f.toFixed(1)}, below the ${s.critical_f.toFixed(1)} needed. A steady trend fits as well.`;
  return (
    <div className="mt-3 rounded border border-ink-600 p-2">
      <div className="flex justify-between text-[11px]"><span className="font-semibold text-star-100">Cell {lat.toFixed(3)}, {lon.toFixed(3)}</span>
        <span className="text-star-500">{raw[0].toFixed(1)} → {raw[raw.length - 1].toFixed(1)} nW</span></div>
      {fit.lit && <Series years={v.years} dots={fit.adjusted} fit={fit.fitted} step={fit.flagged ? fit.year : null} up={fit.stepPct > 0} />}
      <p className={fit.flagged ? "text-star-100" : ""}>{verdict}</p>
    </div>
  );
}

function Series({ years, dots, fit, step, up }: { years: number[]; dots: number[]; fit: number[]; step: number | null; up: boolean }) {
  const W = 360, H = 110, pad = 26;
  const lo = Math.min(...dots, ...fit) * 0.9, hi = Math.max(...dots, ...fit) * 1.1;
  const x = (k: number) => pad + (k / (years.length - 1)) * (W - pad - 6);
  const y = (val: number) => 6 + (1 - Math.log(val / lo) / Math.log(hi / lo)) * (H - 12);
  const color = step === null ? MUTED : up ? AMBER : BLUE;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="mt-1 w-full" role="img" aria-label="Radiance by year with the fitted model">
      {[lo / 0.9, hi / 1.1].map((t) => <text key={t} x={pad - 3} y={y(t) + 3} textAnchor="end" fontSize="8" fill={TEXT}>{t < 10 ? t.toFixed(1) : Math.round(t)}</text>)}
      {step !== null && <line x1={x(years.indexOf(step) - 0.5)} x2={x(years.indexOf(step) - 0.5)} y1={4} y2={H - 4} stroke={color} strokeDasharray="3 3" />}
      <polyline points={fit.map((f, k) => `${x(k)},${y(f)}`).join(" ")} fill="none" stroke={color} strokeWidth={2} />
      {dots.map((d, k) => <circle key={k} cx={x(k)} cy={y(d)} r={2.8} fill="#f5f1e6" />)}
      {years.map((yr, k) => (k % 2 === 0 ? <text key={yr} x={x(k)} y={H + 11} textAnchor="middle" fontSize="8" fill={TEXT}>{yr}</text> : null))}
    </svg>
  );
}

/** Predicted vs observed 2018-2024 growth by tenth of predicted growth, with the 1:1 line. */
function Deciles({ pairs }: { pairs: [number, number][] }) {
  const W = 360, H = 150, pad = 30;
  const all = pairs.flat(), lo = Math.floor(Math.min(...all)), hi = Math.ceil(Math.max(...all));
  const sx = (v: number) => pad + ((v - lo) / (hi - lo)) * (W - pad - 8), sy = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 26);
  const ticks = [lo, 0, hi].filter((t, i, a) => a.indexOf(t) === i);
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Predicted versus observed growth by tenth of cells">
        <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke={MUTED} strokeDasharray="4 3" />
        {ticks.map((t) => (
          <g key={t}>
            <text x={pad - 4} y={sy(t) + 3} textAnchor="end" fontSize="8" fill={TEXT}>{t}%</text>
            <text x={sx(t)} y={H - 8} textAnchor="middle" fontSize="8" fill={TEXT}>{t}%</text>
          </g>
        ))}
        {pairs.map(([p, o], k) => <circle key={k} cx={sx(p)} cy={sy(o)} r={4} fill={AMBER} />)}
        <text x={sx(hi)} y={sy(hi) + 12} textAnchor="end" fontSize="8" fill={MUTED}>predicted = observed</text>
      </svg>
      <figcaption className="text-[10px] text-star-500">Each dot is a tenth of the cells, sorted by predicted growth: predicted (across) vs observed 2018–24 growth (up), % a year.</figcaption>
    </figure>
  );
}
