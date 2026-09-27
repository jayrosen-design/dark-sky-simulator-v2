import { useState } from "react";
import { useModel } from "../state/model";
import { shareUrl } from "../state/store";
import { A08_SENTENCE, briefFigures, describeParams, exportBrief } from "../engine/brief";
import { Card, fmtInt } from "./ui";

/** C-04: evidence quality before the number. */
export function Defensibility() {
  const m = useModel();
  const inv = m.e.inventory;
  const ds = m.e.data_status;
  const row = (k: string, v: string, bad = false) => (
    <tr className="border-t border-ink-700"><td className="py-1 pr-2 text-star-300">{k}</td><td className={bad ? "text-amber-400" : ""}>{v}</td></tr>
  );
  return (
    <Card title="Defensibility (C-04)">
      <table className="w-full text-xs">
        <tbody>
          {row("Inventory confidence", `${m.allAcct.confidence.toFixed(2)} (fixture-weighted; ${fmtInt(inv.surveyed_points)} surveyed points, rest modeled)`, true)}
          {row("Calibration RMSE", "not available: 0 SQM stations", true)}
          {row("Tier 1 vs Tier 2", "not run (ILLUMINA Tier 2 is v3.0)", true)}
          {row("SQM stations used", "none", true)}
          {row("Seed-site sanity fit", `RMSE ${m.e.anchor.rmse_mag.toFixed(2)} mag over ${m.e.anchor.n_sites} corpus values (one global scale; not calibration)`)}
          {row("Globe at Night SQM check", m.e.sanity.globe_at_night.n_sqm && m.e.sanity.globe_at_night.median_residual_sqm !== null
            ? `${m.e.sanity.globe_at_night.n_sqm} public SQM readings: model − observed median ${m.e.sanity.globe_at_night.median_residual_sqm >= 0 ? "+" : ""}${m.e.sanity.globe_at_night.median_residual_sqm.toFixed(2)} mag, spread ±${m.e.sanity.globe_at_night.mad_sqm!.toFixed(2)} (not fitted; docs/sanity_check.md)`
            : "no SQM readings inside the grid")}
          {row("VIIRS 2012–2024", ds.viirs.loaded ? "loaded" : "not loaded (Earth Engine credentials needed)", !ds.viirs.loaded)}
          {row("FDOT RCI 341 (D2)", ds.fdot_rci341.status === "ok" ? "loaded" : "not published at PRD endpoint; modeled on state roads", ds.fdot_rci341.status !== "ok")}
          {row("Alachua Cityworks test layer", ds.cityworks.loaded ? "loaded" : "endpoint unreachable at build time", !ds.cityworks.loaded)}
        </tbody>
      </table>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-star-300">Seed-site sanity check (model vs corpus values)</summary>
        <table className="mt-1 w-full">
          <thead className="text-left text-star-500"><tr><th className="font-normal">Site</th><th className="text-right font-normal">Corpus</th><th className="text-right font-normal">Model</th><th className="text-right font-normal">Δ</th></tr></thead>
          <tbody>
            {m.e.sites.map((s) => (
              <tr key={s.id} className="border-t border-ink-700"><td>{s.name}</td><td className="text-right tabular-nums">{s.seed_mag.toFixed(2)}</td>
                <td className="text-right tabular-nums">{s.model_mag.toFixed(2)}</td><td className="text-right tabular-nums">{s.residual >= 0 ? "+" : ""}{s.residual.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-star-500">Corpus values: Clear Dark Sky / IDA figures in PRD 6.5 (approximate coordinates, to be verified). Not measurements taken for this project.</p>
      </details>
    </Card>
  );
}

export default function BriefPanel() {
  const m = useModel();
  const [busy, setBusy] = useState(false);
  const link = (field: string) => shareUrl(m.params, field || undefined);
  return (
    <div className="space-y-3">
      <Defensibility />
      <Card title="Legislative brief (PDF)">
        <p className="text-sm font-semibold text-amber-400">{A08_SENTENCE}</p>
        <ul className="mt-2 list-disc pl-4 text-xs text-star-300">
          {describeParams(m.params, m.e).map((s) => <li key={s}>{s}</li>)}
        </ul>
        <ul className="mt-2 text-xs">
          {briefFigures(m).filter((f) => f.field.startsWith("econ.")).map((f) => (
            <li key={f.field} className="flex justify-between border-t border-ink-700 py-1"><span className="text-star-300">{f.label}</span>
              <a className="tabular-nums text-glow-400 underline" href={link(f.field)}>{f.value}</a></li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy} onClick={async () => { setBusy(true); try { await exportBrief(m, link); } finally { setBusy(false); } }}
            className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-ink-950 disabled:opacity-50">{busy ? "Building…" : "Download PDF brief"}</button>
          <button onClick={() => navigator.clipboard?.writeText(link(""))} className="rounded-md bg-ink-700 px-3 py-1.5 text-sm">Copy scenario link</button>
        </div>
        <p className="mt-2 text-[11px] text-star-500">Each figure in the PDF links back to this scenario and highlights its source field (C-01).</p>
      </Card>
    </div>
  );
}
