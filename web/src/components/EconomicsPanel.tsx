import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useModel } from "../state/model";
import { useStore } from "../state/store";
import { cashflow } from "../engine/econ";
import { Basis, Card, fmtInt, fmtUsd, Stat } from "./ui";

export default function EconomicsPanel() {
  const m = useModel();
  const r = m.econ;
  const hl = useStore((s) => s.highlightField);
  const P = m.e.seed.econ.params;
  const data = cashflow(r, 15);
  const none = r.capex === 0 && r.kwhSaved === 0;

  return (
    <div className="space-y-3">
      <Card title="Costs and savings (public fixtures)" right={<span className="text-[11px] text-star-500">seed values, PRD 6.4</span>}>
        {none ? (
          <p className="text-sm text-star-300">No public fixtures change under the current controls. Pick fixtures in step 1 and a control in step 2, or turn on an overlay zone.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat id="econ.capex" highlight={hl === "econ.capex"} label="CAPEX" value={fmtUsd(r.capex)}
                sub={`${fmtInt(r.replacedPublic)} retrofits × $${P.capex_retrofit_u0.value} + ${fmtInt(r.nodes)} nodes × $${P.capex_smart_node.value}`} />
              <Stat id="econ.usd_saved" highlight={hl === "econ.usd_saved"} label="Energy savings" value={`${fmtUsd(r.usdEnergy)}/yr`} sub={`${fmtInt(r.kwhSaved)} kWh/yr`} />
              <Stat id="econ.opex_delta" highlight={hl === "econ.opex_delta"} label="O&M change" value={`${fmtUsd(r.opexDelta)}/yr`}
                sub={`avoided maintenance $${P.avoided_maintenance.value}/HPS retrofit; nodes −$${P.cms_saas_default.value + P.node_replacement_reserve.value}/yr`} />
              <Stat id="econ.payback" highlight={hl === "econ.payback"} label="Simple payback" value={r.paybackYears ? `${r.paybackYears.toFixed(1)} yr` : "none"}
                sub="CAPEX ÷ (energy + O&M)" />
            </div>
            <div className="mt-3 h-40" aria-label="Cumulative net cash position">
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1a2642" />
                  <XAxis dataKey="year" stroke="#a79f88" fontSize={10} />
                  <YAxis stroke="#a79f88" fontSize={10} tickFormatter={(v) => fmtUsd(v)} width={56} />
                  <Tooltip formatter={(v) => fmtUsd(Number(v))} labelFormatter={(l) => `Year ${l}`} contentStyle={{ background: "#0a0f1c", border: "1px solid #2a3a60" }} />
                  <ReferenceLine y={0} stroke="#f6b44b" />
                  <Area dataKey="net" stroke="#7cc4ff" fill="#7cc4ff33" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        <Basis acct={m.affectedAcct} what="Money figures cover public fixtures among" />
      </Card>

      {r.byCard.length > 0 && (
        <Card title="Catalog fixtures (Build tab)">
          <table className="w-full text-xs">
            <thead className="text-left text-star-500"><tr><th className="font-normal">Fixture</th><th className="text-right font-normal">Units</th><th className="text-right font-normal">Unit</th><th className="text-right font-normal">Total</th></tr></thead>
            <tbody>
              {r.byCard.map((l) => (
                <tr key={l.card} className="border-t border-ink-700"><td className="py-1">{l.name}<span className="block text-[10px] text-star-500">{l.public ? "public" : "private owners"}</span></td>
                  <td className="text-right tabular-nums">{fmtInt(l.units)}</td><td className="text-right tabular-nums">{fmtUsd(l.unitCost)}</td><td className="text-right tabular-nums">{fmtUsd(l.total)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-star-500">Private cost borne by owners: {fmtUsd(r.privateCost)} (not in CAPEX or payback). Unit costs are installed estimates from the catalog; see each card's source.</p>
        </Card>
      )}

      <Card title="By tariff" right={<span className="text-[11px] text-star-500">A-06 tariff + rate date</span>}>
        {r.byTariff.length === 0 ? <p className="text-xs text-star-500">No tariffed fixtures affected.</p> : (
          <table className="w-full text-xs">
            <thead className="text-left text-star-500"><tr><th className="font-normal">Tariff</th><th className="font-normal">Rate basis</th><th className="text-right font-normal">kWh/yr</th><th className="text-right font-normal">$/yr</th></tr></thead>
            <tbody>
              {r.byTariff.map((t) => (
                <tr key={t.tariff} className="border-t border-ink-700 align-top">
                  <td className="py-1">{t.tariff}</td>
                  <td className="py-1 text-star-300">{t.rateDate}{t.flags.map((f) => <div key={f} className="text-amber-400">⚑ {f}</div>)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtInt(t.kwhSaved)}</td>
                  <td className="py-1 text-right tabular-nums">{fmtUsd(t.usdSaved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-star-500">
          Burn hours {fmtInt(Number(m.e.seed.engine.burn_hours_per_year))} h/yr. Levy owner split is not in the corpus; tariffs are split equally (assumption). Neighbor-county fixtures use the generic rate (their utilities' tariffs are not in the corpus).
          {r.privateAffected > 0 && ` ${fmtInt(r.privateAffected)} private fixtures are affected; private cost is estimated only for catalog fixtures (no corpus value for a generic private retrofit).`}
        </p>
        <p className="mt-1 text-[11px] text-star-500">CO₂: hidden until an EPA eGRID FRCC factor is loaded (PRD 6.4 placeholder only).</p>
      </Card>
    </div>
  );
}
