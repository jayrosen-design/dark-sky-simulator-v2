// Module C legislative brief (PRD 3 Module C; v2.0 closes C-01 and A-08). Generated in the browser with jsPDF.
// A-08: the PDF opens with the planning-projection sentence and lists inventory confidence.
// C-01: every figure is a hyperlink to the app state and scenario field it came from.
import type { Model } from "../state/model";
import { formatSky } from "./bortle";
import { pdfWriter } from "../shared/pdf";
import type { ScenarioParams } from "./scenario";

export const A08_SENTENCE = "These outputs are planning projections, not observed outcomes.";

export interface BriefFigure { label: string; value: string; field: string }

const usd = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString("en-US")}`);

export function describeParams(p: ScenarioParams, e: Model["e"]) {
  const parts: string[] = [];
  parts.push(`Fixtures: ${p.selection.groups.join(", ") || "none"} in ${p.selection.counties.map((f) => e.county_names[f]).join(" + ") || "no county"}`);
  if (p.shielding.pct_converted) parts.push(`${p.shielding.pct_converted}% converted to U${p.shielding.target_u}`);
  if (p.cct_cap) parts.push(`CCT cap ${p.cct_cap}`);
  if (p.intensity.pct_reduction) parts.push(`${p.intensity.pct_reduction}% intensity reduction`);
  if (p.curfew.enabled) parts.push(`curfew ${p.curfew.start}-${p.curfew.end} at ${p.curfew.motion_only ? "motion-only" : `${p.curfew.dim_level_pct}%`}`);
  for (const o of p.overlays) parts.push(`${o.site} overlay LZ0 ${o.lz0_radius_mi} mi / LZ1 ${o.lz1_radius_mi} mi`);
  if (p.growth_baseline === "trend") parts.push(`growth trend +${p.growth_years} yr`);
  for (const [slot, ch] of Object.entries(p.fixtures ?? {})) {
    const card = e.seed.catalog?.fixtures.find((f) => f.id === ch?.card);
    if (card && ch) parts.push(`${slot} fixtures: ${ch.pct}% replaced with ${card.name}`);
  }
  if (p.view_window === "evening") parts.push("sky values for the evening window");
  parts.push(`amortization: private ${p.amortization.years} yr, public ${p.amortization.public_deadline_years} yr (ordinance parameter; not time-stepped in v2.0)`);
  return parts;
}

/** Figures in the brief, each tied to the scenario field it came from (C-01). */
export function briefFigures(m: Model): BriefFigure[] {
  const r = m.econ;
  const figs: BriefFigure[] = [
    { label: "CAPEX (public fixtures)", value: usd(r.capex), field: "econ.capex" },
    { label: "Energy savings", value: `${usd(r.usdEnergy)}/yr (${Math.round(r.kwhSaved).toLocaleString("en-US")} kWh/yr)`, field: "econ.usd_saved" },
    { label: "O&M change", value: `${usd(r.opexDelta)}/yr`, field: "econ.opex_delta" },
    { label: "Simple payback", value: r.paybackYears ? `${r.paybackYears.toFixed(1)} years` : "no payback", field: "econ.payback" },
    ...(r.byCard.length ? [{ label: "Private owners' fixture cost", value: usd(r.privateCost), field: "econ.private_cost" }] : []),
  ];
  for (const s of m.sites) {
    const fin = m.growthOn && s.futureScnMag !== null ? s.futureScnMag : s.scnMag;
    figs.push({ label: s.name, value: `${formatSky(s.baseMag, m.table)} -> ${formatSky(fin, m.table)}`, field: `site_metrics.${s.id}` });
  }
  return figs;
}

export async function exportBrief(m: Model, link: (field: string) => string) {
  const doc = await buildBrief(m, link);
  doc.save(`dark-sky-brief-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function buildBrief(m: Model, link: (field: string) => string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const { line, linked, gap } = pdfWriter(doc);

  // A-08 opening sentence, then inventory confidence.
  line(A08_SENTENCE, 12, "bold", [150, 60, 0]);
  line(`Inventory confidence: ${m.allAcct.confidence.toFixed(2)} across ${Math.round(m.allAcct.total).toLocaleString("en-US")} modeled fixtures ` +
    `(${Math.round(m.allAcct.public).toLocaleString("en-US")} public, ${Math.round(m.allAcct.private).toLocaleString("en-US")} private). ` +
    `Scenario acts on ${Math.round(m.affectedAcct.total).toLocaleString("en-US")} fixtures (confidence ${m.affectedAcct.confidence.toFixed(2)}).`, 9);
  line("Skyglow values are uncalibrated projections from modeled light sources and literature coefficients; no sky-quality meter data was used. Utility streetlight counts are modeled estimates. Bortle labels are bands on a computed magnitude.", 9, "normal", [90, 90, 90]);
  gap(6);
  line("Dark Sky Simulator v2.0 - Legislative briefing sheet", 16, "bold");
  line(`Alachua and Levy counties, Florida · generated ${new Date().toISOString().slice(0, 10)} · data package ${m.e.version} (${m.e.mode} mode, built ${m.e.built})`, 9, "normal", [90, 90, 90]);
  gap(6);

  line("Problem", 12, "bold");
  const t = m.e.trend_seed["12001"];
  line(t ? `Alachua County's measured VIIRS radiance rose ${t.county_pct}% from 2012 to 2024 (lit area ${t.lit_area_pct[0]}% to ${t.lit_area_pct[1]}%; Paynes Prairie vicinity +${t.paynes_prairie_vicinity_pct}%) [AC-EPAC]. ` : "");
  line(m.e.data_status.viirs.loaded ? "Per-pixel trends for both counties are in the data package." :
    "Levy County has no published radiance trend yet; the VIIRS 2012-2024 series for both counties is pending Earth Engine access.", 10);
  gap(4);

  line("Proposed ordinance parameters", 12, "bold");
  for (const s of describeParams(m.params, m.e)) line(`• ${s}`, 10);
  gap(4);

  line("Fiscal summary (public fixtures)", 12, "bold");
  for (const f of briefFigures(m).filter((x) => x.field.startsWith("econ."))) linked(f.label, f.value, link(f.field));
  for (const tl of m.econ.byTariff) line(`  ${tl.tariff}: ${usd(tl.usdSaved)}/yr - rate basis: ${tl.rateDate}${tl.flags.length ? ` (${tl.flags.join("; ")})` : ""}`, 8, "normal", [90, 90, 90]);
  line(`Unit costs: retrofit $${m.e.seed.econ.params.capex_retrofit_u0.value}/fixture, smart node $${m.e.seed.econ.params.capex_smart_node.value} (PRD 6.4 seed). Private compliance cost not estimated.`, 8, "normal", [90, 90, 90]);
  gap(4);

  line("Sky at named sites (zenith mag/arcsec², Bortle band)", 12, "bold");
  for (const f of briefFigures(m).filter((x) => x.field.startsWith("site_metrics."))) linked(f.label, f.value, link(f.field));
  gap(4);

  line("Legal defensibility", 12, "bold");
  line("Nuisance abatement under F.S. 70.001(3)(e)(2); amortization precedent Standard Oil v. Tallahassee (10-yr) [LEGAL-BH]; Groveland Ord. 2022-26 private deadline Aug 15, 2032 [GV-ORD]. Right-to-Farm preemption (F.S. 823.14(6)) applies only where an FDACS BMP exists; none exists for lighting [LEVY-AG].", 9);
  gap(4);

  line("Evidence quality", 12, "bold");
  line(`Calibration RMSE: not available (0 SQM stations). Tier 1 vs Tier 2 agreement: not run (Tier 2 is v3.0). Seed-site sanity fit: RMSE ${m.e.anchor.rmse_mag.toFixed(2)} mag over ${m.e.anchor.n_sites} corpus site values (not a calibration).`, 9);
  line(`Every figure above links to the live scenario: ${link("")}`, 8, "normal", [20, 70, 160]);
  return doc;
}
