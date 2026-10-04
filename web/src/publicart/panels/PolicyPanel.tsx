// Policy: Chapter 5.5 as adopted in 1989 versus the Trust's discussion draft, run on an illustrative capital program.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, fmtUsd, Seg, Slider, Stat, Toggle } from "../../shared/ui";
import { ALL_CATEGORIES } from "../engine/ledger";
import type { Model } from "../model";
import { usePaps } from "../state";

const CAT_LABEL: Record<string, string> = { building_new: "New city buildings", building_major_renovation: "Major renovations", park_public_space: "Parks & public spaces",
  transportation: "Transportation", utility: "Utility (GRU)", stormwater: "Stormwater", it_equipment: "IT & equipment", land: "Land", repair_maintenance: "Repair & maintenance", other: "Other" };
const axisUsd = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);

export default function PolicyPanel({ m }: { m: Model }) {
  const { policy: P, setPolicy, highlightField } = usePaps();
  const seed = m.data.meta.seed, draft = P.code === "draft";
  const L = m.led, B = m.led89;
  const rows = L.fys.map((fy) => ({ fy: `FY${String(fy).slice(2)}`, "1989 code": Math.round(B.years.find((y) => y.fy === fy)?.alloc ?? 0), "Trust draft": Math.round(m.led.years.find((y) => y.fy === fy)?.alloc ?? 0) }));
  const ledDraft = draft ? L : null;
  const cip = m.data.cip;
  return (
    <div className="space-y-3">
      <Card title="Ordinance version">
        <Seg label="Ordinance version" value={P.code} onChange={(code) => setPolicy({ code })}
          options={[{ value: "1989", label: "1989 code (in force)" }, { value: "draft", label: "Trust draft · Aug 31 2026" }]} />
        <p className="mt-2 text-[11px] text-star-500">The draft is a discussion handout for the Art in Public Places Trust, not adopted law; staff and the City Attorney would draft the
          ordinance. Both versions keep allocations that are not used on site in the trust fund for art at other public places (the 1989 code already allows it).</p>
        <div className={draft ? "" : "pointer-events-none opacity-40"}>
          <Slider label="Single-project cap" value={P.capDraft} min={100000} max={500000} step={25000} unit="" onChange={(capDraft) => setPolicy({ capDraft })}
            hint={`${fmtUsd(P.capDraft)} (draft: $300,000; 1989: $100,000, about $265,000 in 2024 dollars per the handout)`} />
          <Toggle label="Index the cap to CPI-U from Oct 1, 2027" checked={P.indexCpi} onChange={(indexCpi) => setPolicy({ indexCpi })} hint="Rounded to the nearest $5,000; CPI-U from BLS, projected after the last month" />
          <Slider label="CPI-U growth after the last BLS month" value={Math.round(P.cpiForward * 1000) / 10} min={0} max={6} step={0.1} unit="%/yr" onChange={(v) => setPolicy({ cpiForward: v / 100 })} />
          <Slider label="Conservation reserve share" value={Math.round(P.reserveShare * 100)} min={0} max={30} step={1} unit="%" onChange={(v) => setPolicy({ reserveShare: v / 100 })}
            hint="Draft Sec. 5.5-5(a): 15% of each unrestricted allocation" />
          <Toggle label="Treat the County infrastructure surtax as restricted" checked={P.surtaxRestricted} onChange={(surtaxRestricted) => setPolicy({ surtaxRestricted })}
            hint="Most City buildings are paid from the surtax. Whether it can pay for on-site art is a legal question; restricted money goes to sub-accounts and never to the reserve or the pool" />
          <Seg label="Restricted funds" value={P.restrictedMode} onChange={(restrictedMode) => setPolicy({ restrictedMode })}
            options={[{ value: "segregate", label: "Own sub-accounts" }, { value: "exclude", label: "Excluded (source can't pay for art)" }]} />
        </div>
      </Card>
      <Card title="Which projects owe the 1%">
        <div className="grid grid-cols-2 text-xs">
          {ALL_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1 py-0.5">
              <input type="checkbox" className="accent-amber-400" checked={P.categories.includes(c)}
                onChange={(ev) => setPolicy({ categories: ev.target.checked ? [...P.categories, c] : P.categories.filter((x) => x !== c) })} />{CAT_LABEL[c] ?? c}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-star-500">Ch. 5.5 applies to the original construction or major renovation of city buildings employees or the public use; which other
          capital categories count is a reading to confirm with staff.</p>
        <div className="mt-2"><Seg label="Horizon" value={P.horizon} onChange={(horizon) => setPolicy({ horizon })} options={[{ value: 5, label: "5-year CIP" }, { value: 10, label: "10 years (program repeated)" }]} /></div>
      </Card>
      <Card title="Capital captured for public art">
        <div className="grid grid-cols-2 gap-2">
          <Stat id="kpi.capital" highlight={highlightField === "kpi.capital"} label={draft ? "Trust draft" : "1989 code"} value={fmtUsd(L.totals.alloc)} sub={`${P.horizon}-yr total`} />
          <Stat label={draft ? "vs 1989 code" : "Trust draft would give"} value={draft ? `${L.totals.alloc >= B.totals.alloc ? "+" : ""}${fmtUsd(L.totals.alloc - B.totals.alloc)}` : "switch above"} sub={`1989 total ${fmtUsd(B.totals.alloc)}`} />
          <Stat label="Lost to the cap" value={fmtUsd(L.totals.capped)} sub="1% above the cap, not collected" />
          <Stat label="Conservation reserve" value={fmtUsd(L.totals.reserveIn)} sub={draft ? `${Math.round(P.reserveShare * 100)}% of unrestricted` : "no reserve in 1989 code"} />
          <Stat label="Art on site" value={fmtUsd(L.totals.onsite)} />
          <Stat label="Pooled for other sites" value={fmtUsd(L.totals.pooledIn)} sub="low-visibility sites (e.g. plants, evidence facilities)" />
          {draft && <Stat label="Restricted sub-accounts" value={fmtUsd(L.totals.restricted)} sub={P.restrictedMode === "exclude" ? `${fmtUsd(L.totals.excluded)} excluded` : "spent only as the source allows"} />}
          {!draft && L.totals.commingled > 0 && <Stat label="Restricted money mixed in" value={fmtUsd(L.totals.commingled)} sub="no separate accounting in 1989 code" />}
        </div>
        <div className="mt-2 h-40" aria-label="Allocation by fiscal year, 1989 code versus Trust draft">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 4, left: -6, bottom: 0 }}>
              <CartesianGrid stroke="#1a2642" strokeDasharray="2 3" />
              <XAxis dataKey="fy" tick={{ fontSize: 10, fill: "#a79f88" }} />
              <YAxis tickFormatter={axisUsd} tick={{ fontSize: 10, fill: "#a79f88" }} />
              <Tooltip formatter={(v) => fmtUsd(Number(v))} contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="1989 code" fill="#a79f88" />
              <Bar dataKey="Trust draft" fill="#b79cff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Project by project" right={<span className="text-[11px] text-star-500">{cip.projects.length} projects · illustrative</span>}>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-ink-900 text-star-500"><tr><th className="text-left font-normal">Project</th><th className="text-right font-normal">FY</th><th className="text-right font-normal">Eligible</th><th className="text-right font-normal">Cap</th><th className="text-right font-normal">To art</th></tr></thead>
            <tbody>
              {(ledDraft ?? L).projects.filter((r) => !r.repeat).map((r) => (
                <tr key={r.id} className="border-t border-ink-700" title={`${r.category} · ${r.funding}${r.restricted ? " (restricted)" : ""}`}>
                  <td className={`pr-1 ${r.applies ? "text-star-300" : "text-star-500 line-through"}`}>{r.name}{r.restricted ? " ·R" : ""}</td>
                  <td className="text-right tabular-nums">{r.fy}</td>
                  <td className="text-right tabular-nums">{r.applies ? fmtUsd(r.eligible) : "—"}</td>
                  <td className="text-right tabular-nums text-star-500">{fmtUsd(r.cap)}</td>
                  <td className="text-right tabular-nums text-star-100">{fmtUsd(r.alloc)}{r.capped > 0 ? <span className="text-amber-400"> capped</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-star-500">Struck through: category not counted. ·R: restricted funding (grant, bond, enterprise, gas tax, interlocal).
          {cip.source_documents?.length ? <> Sources: {cip.source_documents.map((d, k) => <a key={k} className="ml-1 text-glow-400 underline" href={d.url} target="_blank" rel="noreferrer">{d.title}</a>)}.</> : null}
          {" "}Verify with staff: the CPI reference month ({seed.policy.cpi_reference_month.value === 6 ? "June" : seed.policy.cpi_reference_month.value}) and the 1989 exclusion list.</p>
      </Card>
    </div>
  );
}
