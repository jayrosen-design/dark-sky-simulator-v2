import { useEffect, useMemo, useState } from "react";
import { useData } from "../state/model";
import { useStore } from "../state/store";
import { useMcda, type RefRow } from "../state/mcda";
import { CRITERIA, defaultWeights, landEstimate, type Candidate, type LandEstimate, type ScoreLine } from "../engine/mcda";
import type { EngineData } from "../engine/types";
import { Card, fmtInt, fmtUsd, Seg, Slider } from "./ui";

const UNIT: Record<string, (v: number) => string> = {
  sky: (v) => `${v.toFixed(2)} mag`, sprawl: (v) => `+${v.toFixed(0)}% / 10 yr`, clarity: (v) => `${(v * 100).toFixed(0)}% nights`,
  urban: (v) => `${v.toFixed(0)} km`, land: (v) => `class score ${v.toFixed(2)}`,
  elevation: (v) => `${v.toFixed(0)} m`, access: (v) => `${v.toFixed(1)} km`,
  land_cost: (v) => (Number.isFinite(v) ? `$${fmtInt(v)}/acre nearby sales` : "no sales data"),
};

function Scorecard({ lines }: { lines: ScoreLine[] }) {
  return (
    <table className="mt-1 w-full text-[11px]">
      <thead className="text-left text-star-500"><tr><th className="font-normal">Criterion</th><th className="font-normal">Raw</th><th className="text-right font-normal">Score</th><th className="text-right font-normal">Weight</th><th className="text-right font-normal">Contrib.</th></tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.criterion} className="border-t border-ink-700">
            <td>{l.criterion}</td><td className="text-star-300">{UNIT[l.criterion]?.(l.raw) ?? l.raw}</td>
            <td className="text-right tabular-nums">{l.norm.toFixed(2)}</td><td className="text-right tabular-nums">{l.weight.toFixed(2)}</td>
            <td className="text-right tabular-nums">{l.contrib.toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Short cost label for a list row: public land is transferred or leased, private land is priced on nearby sales. */
function costLabel(l: LandEstimate) {
  if (l.publicShare >= 0.5) return `${Math.round(l.publicShare * 100)}% public land`;
  return l.marketCost !== null ? `≈${fmtUsd(l.marketCost)}` : "no price data";
}

function LandBlock({ e, l }: { e: EngineData; l: LandEstimate }) {
  const cats = e.land?.categories ?? {};
  const pubName = l.publicCat ? cats[String(l.publicCat)] : null;
  const p = l.largest;
  return (
    <div className="mt-2 rounded-md bg-ink-800/80 p-2 text-[11px]">
      <div className="mb-1 font-semibold text-star-100">Land & facilities ({l.targetAcres} acres)</div>
      <table className="w-full"><tbody>
        <tr><td className="pr-2 text-star-500">Market estimate</td><td className="tabular-nums">
          {l.marketCost !== null ? <>{fmtUsd(l.marketCost)} <span className="text-star-500">({fmtUsd(l.marketCostLow ?? 0)}–{fmtUsd(l.marketCostHigh ?? 0)})</span></> : "–"}
        </td></tr>
        <tr><td className="pr-2 text-star-500">Basis</td><td>
          {l.marketUsdAcre !== null ? `$${fmtInt(l.marketUsdAcre)}/acre, ${l.comps ? `median of ${l.comps} nearest qualified vacant-land sales` : "county median of qualified vacant-land sales (few nearby)"}, ${e.land?.sale_years.join("–")}` : "no qualified sales"}
        </td></tr>
        <tr><td className="pr-2 text-star-500">Tax-roll estimate</td><td className="tabular-nums">
          {l.assessedCost !== null ? `${fmtUsd(l.assessedCost)} ($${fmtInt(l.assessedUsdAcre ?? 0)}/acre just value, incl. any buildings × ${(l.saleToJustValue ?? 1).toFixed(2)} county sale/just-value ratio)` : "no private parcels ≥ 5 acres here"}
        </td></tr>
        <tr><td className="pr-2 text-star-500">Ownership</td><td>
          {l.parcelAcres > 0 ? `${fmtInt(l.parcelAcres)} acres in parcels ≥ 5 acres; ${Math.round(l.publicShare * 100)}% public${pubName ? ` (mostly ${pubName})` : ""}` : "no parcels ≥ 5 acres"}
          {l.publicShare > 0 && <span className="text-glow-400"> · public land: transfer, lease or MOU rather than purchase</span>}
        </td></tr>
        <tr><td className="pr-2 align-top text-star-500">Largest parcel</td><td>
          {p ? <>
            {fmtInt(p.acres)} acres, {cats[String(p.cat)]}{p.owner ? ` (${p.owner})` : ""} · parcel {p.parcel_id}
            <br />just value {fmtUsd(p.just_value)} (land {fmtUsd(p.land_value)}, existing buildings/facilities {fmtUsd(p.improvement_value)})
            {!l.largestFits && <span className="text-amber-400"> · smaller than {l.targetAcres} acres: assembly of parcels needed</span>}
          </> : "none ≥ 20 acres"}
        </td></tr>
      </tbody></table>
      <p className="mt-1 text-star-500">Florida DOR {e.land?.assessment_year} tax roll and recorded sales; estimates, not appraisals. Private owner names withheld.</p>
    </div>
  );
}

export default function ObservatoryPanel() {
  const { e } = useData();
  const mc = useMcda();
  const stored = useStore((s) => s.weights);
  const weights = useMemo(() => stored ?? defaultWeights(e), [stored, e]);
  const setWeights = useStore((s) => s.setWeights);
  const [open, setOpen] = useState<number | string | null>(null);
  const lp = e.seed.mcda.land_pricing;
  const acres = mc.acres ?? lp?.target_site_acres.value ?? 80;
  const setAcres = mc.setAcres;

  useEffect(() => { mc.load(e); }, [e]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mc.norm) mc.recompute(e, weights); }, [mc.norm, weights, e]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimate = (cells: number[], best: number) =>
    mc.data && e.land ? landEstimate(e, mc.data, cells, best, acres, mc.parcels) : null;
  /** Reference sites are single points: use the 3 x 3 cells around them. */
  const around = (i: number) => {
    const g = mc.data!.grid, x = i % g.nx, y = Math.floor(i / g.nx), out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < g.nx && ny < g.ny) out.push(ny * g.nx + nx);
    }
    return out;
  };

  const labels = e.seed.mcda.weights;
  const row = (key: string | number, title: string, score: number, mag24: number, mag34: number, lines: ScoreLine[], land: LandEstimate | null, extra?: string) => (
    <li key={key} className="border-t border-ink-700 py-1">
      <button className="flex w-full items-center justify-between gap-2 text-left text-xs" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
        <span>{title}{extra && <span className="ml-1 text-star-500">{extra}</span>}</span>
        <span className="text-right tabular-nums text-star-300">{score.toFixed(3)} · {mag24.toFixed(2)} → {mag34.toFixed(2)}
          {land && <span className="block text-[10px] text-amber-400">{costLabel(land)}</span>}</span>
      </button>
      {open === key && <>
        <Scorecard lines={lines} />
        {land && <LandBlock e={e} l={land} />}
      </>}
    </li>
  );

  return (
    <div className="space-y-3">
      <Card title="Weights (WLC)" right={<button className="text-[11px] text-amber-400" onClick={() => setWeights(defaultWeights(e))}>Research optical defaults</button>}>
        {CRITERIA.map((k) => (
          <Slider key={k} label={labels[k]?.label ?? k} value={Math.round(weights[k] * 100)} min={0} max={60} unit="%"
            onChange={(v) => setWeights({ ...weights, [k]: v / 100 })} />
        ))}
        <p className="text-[11px] text-star-500">Weights are renormalized to sum to 1. Ranking updates live (B-01). Land acquisition cost is not a PRD 6.6 criterion, so it starts at 0%; raise it to let price steer the ranking.</p>
      </Card>

      {e.land && (
        <Card title="Site size for land estimates">
          <Seg label="Target site acres" value={acres} onChange={setAcres}
            options={(lp?.target_site_acres.options ?? [20, 40, 80, 160, 320]).map((a) => ({ value: a, label: `${a} ac` }))} />
          <p className="mt-1 text-[11px] text-star-500">
            Default 80 acres = Rosemary Hill Observatory (PRD 1.1). Prices come from {fmtInt(e.land.qualified_vacant_sales)} qualified vacant-land sales
            ({e.land.sale_years.join("–")}) and the {e.land.assessment_year} Florida DOR tax roll ({fmtInt(e.land.parcels)} parcels ≥ 5 acres in the 11 counties).
          </p>
        </Card>
      )}

      <Card title="Reference sites (B-06)">
        <ul>{mc.refs.map((r: RefRow) => row(r.id, r.name, r.score, r.mag2024, r.mag2034, r.scorecard, mc.data ? estimate(around(r.cell), r.cell) : null, `${r.pct.toFixed(0)}th pct`))}</ul>
      </Card>

      <Card title={`Top ${e.seed.mcda.top_sites.value} candidate sites (B-01, B-02)`} right={<span className="text-[11px] text-star-500">score · mag 2024 → 2034 · land</span>}>
        {mc.loading || !mc.score ? <p className="text-xs text-star-500">Loading criteria rasters…</p> : (
          <ol>{mc.candidates.map((c: Candidate) => row(c.rank, `#${c.rank} ${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`, c.score, c.mag2024, c.mag2034, c.scorecard,
            estimate(c.cellList, c.best), `${e.region_county_names[c.county] ?? c.county} · ${c.cells} cells`))}</ol>
        )}
        <p className="mt-2 text-[11px] text-star-500">
          Sites are ≥ {e.seed.mcda.site_min_cells.value} contiguous ~1 km cells among the best-scoring cells. 2034 values extrapolate
          {e.growth_model.method === "lightgbm"
            ? ` the LightGBM growth forecast (back-test 2012–2018 → 2024: median error ${e.growth_model.median_ape_pct?.toFixed(1)}% vs ${e.growth_model.naive_median_ape_pct?.toFixed(1)}% for trend persistence, ${e.growth_model.n_cells?.toLocaleString("en-US")} lit cells)`
            : e.data_status.viirs.loaded ? " the per-cell VIIRS trend" : " the 2010→2020 housing-growth proxy (VIIRS not loaded; back-test unavailable)"}.
          Clarity uses the PRD seed climatology (0.50 coastal → 0.55 inland), not MODIS.
          {e.land ? " Land class uses Florida DOR parcel land-use codes (parcels ≥ 5 acres) plus FNAI conservation lands." : " Land class is a proxy (FNAI conservation lands, else housing density) until parcels load."}
        </p>
      </Card>
    </div>
  );
}
