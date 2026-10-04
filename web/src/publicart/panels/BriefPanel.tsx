// Brief: a PDF for the Trust or the Commission. It opens with the planning-estimate sentence; every figure links back
// to this scenario with the field highlighted; exploratory items are kept out.
import { useState } from "react";
import { Card, fmtInt, fmtUsd } from "../../shared/ui";
import { pdfWriter } from "../../shared/pdf";
import type { Model } from "../model";
import { shareUrl, usePaps, type Tab } from "../state";

export const OPENING = "These outputs are planning estimates from public data and editable assumptions, not observed outcomes.";

export function briefFigures(m: Model, code: string) {
  const k = m.kpi;
  return [
    { label: `Capital for public art (${code})`, value: `${fmtUsd(k.capital)} over the program`, field: "kpi.capital", tab: "policy" as Tab },
    { label: "Same program under the 1989 code", value: fmtUsd(k.capital89), field: "kpi.capital", tab: "policy" as Tab },
    { label: "Conservation reserve at the end", value: code === "draft" ? fmtUsd(k.reserve) : "no reserve", field: "kpi.reserve", tab: "conservation" as Tab },
    { label: "Care not covered", value: fmtUsd(k.shortfall), field: "kpi.reserve", tab: "conservation" as Tab },
    { label: "Daily visual impressions", value: fmtInt(k.dvi), field: "kpi.dvi", tab: "activity" as Tab },
    { label: "Visitor spending from proposals", value: `${fmtUsd(k.visitorRevenue)}/yr`, field: "kpi.visitor", tab: "economics" as Tab },
    { label: "East Gainesville walk access", value: `${Math.round(k.eastCoverage * 100)}% (parity ${k.eastParity.toFixed(2)})`, field: "kpi.east", tab: "equity" as Tab },
  ];
}

export default function BriefPanel({ m }: { m: Model }) {
  const { policy } = usePaps();
  const [busy, setBusy] = useState(false);
  const figs = briefFigures(m, policy.code === "draft" ? "Trust draft" : "1989 code");
  const exportPdf = async () => {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const { line, linked, gap } = pdfWriter(doc);
      line(OPENING, 12, "bold", [110, 60, 160]);
      line("The artwork registry is hand-compiled from public sources plus facts from the Public Art Archive (Creative West), not the City's official inventory. The capital program is illustrative. Walking and biking volumes are a rough model fitted to 17 counters.", 9, "normal", [90, 90, 90]);
      gap(6);
      line("Public Art Policy Simulator - briefing sheet", 16, "bold");
      line(`Gainesville, Florida · Chapter 5.5 Art in Public Places · generated ${new Date().toISOString().slice(0, 10)} · data built ${m.data.meta.built}`, 9, "normal", [90, 90, 90]);
      gap(6);
      line("Scenario", 12, "bold");
      const P = policy;
      line(P.code === "draft" ? `Trust discussion draft (Aug 31 2026): cap ${fmtUsd(P.capDraft)}${P.indexCpi ? ", indexed to CPI-U from Oct 1 2027 and rounded to $5,000" : ""}; ${Math.round(P.reserveShare * 100)}% of unrestricted allocations to the Conservation Reserve; restricted funds ${P.restrictedMode === "segregate" ? "in their own sub-accounts" : "excluded"}.`
        : "Chapter 5.5 as adopted (1989): 1% of the construction budget, capped at $100,000 per project; no conservation reserve.", 10);
      line(`Horizon ${P.horizon} years; categories counted: ${P.categories.join(", ")}. ${m.proposals.length} proposed work${m.proposals.length === 1 ? "" : "s"} in the scenario.`, 10);
      gap(4);
      line("Key figures (each links to this scenario)", 12, "bold");
      for (const f of figs) linked(f.label, f.value, shareUrl(f.field, f.tab));
      gap(4);
      line("Walk access to public art (residents within half a mile)", 12, "bold");
      line(`Citywide ${Math.round(m.eq.city.share * 100)}%, low-income block groups ${Math.round(m.eq.low.share * 100)}%, East Gainesville ${Math.round(m.eq.east.share * 100)}% (without proposals: ${Math.round(m.eqBase.east.share * 100)}%).`, 10);
      gap(4);
      line("What the draft changes", 12, "bold");
      for (const s of ["Raises the single-project cap from $100,000 (1989) to $300,000 and indexes it to CPI-U.", "Sets aside 15% of unrestricted allocations for professional conservation, carried forward year to year.",
        "Clarifies aggregation and off-site use of retained funds, keeping restricted sources separately accounted.", "Adds visibility, accessibility, geographic distribution and community context to selection, and a public inventory."]) line(`• ${s}`, 10);
      gap(4);
      line("Not modeled here as policy: GRU/enterprise funds, a Chapter 30 developer incentive, and City-County coordination are left to staff and legal study (see the app's Staff study tab).", 9, "normal", [90, 90, 90]);
      line(`Scenario link: ${shareUrl()}`, 8, "normal", [20, 70, 160]);
      doc.save(`public-art-brief-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Card title="Briefing sheet (PDF)">
        <p className="text-xs font-semibold text-[#b79cff]">{OPENING}</p>
        <ul className="mt-2 space-y-1 text-xs">{figs.map((f) => <li key={f.label} className="flex justify-between gap-2"><span className="text-star-300">{f.label}</span><span className="tabular-nums text-star-100">{f.value}</span></li>)}</ul>
        <div className="mt-3 flex gap-2">
          <button disabled={busy} onClick={exportPdf} className="rounded-md bg-[#b79cff] px-3 py-1.5 text-sm font-semibold text-ink-950 disabled:opacity-60">{busy ? "Building…" : "Download PDF brief"}</button>
          <button onClick={() => navigator.clipboard?.writeText(shareUrl())} className="rounded-md bg-ink-800 px-3 py-1.5 text-sm text-star-100 hover:bg-ink-700">Copy scenario link</button>
        </div>
      </Card>
    </div>
  );
}
