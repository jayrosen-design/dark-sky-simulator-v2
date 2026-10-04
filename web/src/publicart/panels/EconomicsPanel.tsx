// Economics: visitor spending and hotel tax induced by proposed works, built bottom-up, with AEP6 as context only.
import { Card, fmtInt, fmtUsd, Slider, Stat } from "../../shared/ui";
import { aep6Context } from "../engine/economics";
import type { Model } from "../model";
import { usePaps } from "../state";

export default function EconomicsPanel({ m }: { m: Model }) {
  const { econ: P, setEcon, highlightField } = usePaps();
  const seed = m.data.meta.seed, A = aep6Context(seed);
  const props = m.proposals.map((a) => ({ a, e: m.econ.get(a.id)! })).filter((x) => x.e);
  const sum = (f: (e: (typeof props)[number]["e"]) => number) => props.reduce((s, x) => s + f(x.e), 0);
  return (
    <div className="space-y-3">
      <Card title="Spending induced by proposed works">
        {props.length ? (
          <div className="grid grid-cols-2 gap-2">
            <Stat id="kpi.visitor" highlight={highlightField === "kpi.visitor"} label="Visitor spending" value={`${fmtUsd(sum((e) => e.spending))}/yr`} sub={`${fmtInt(sum((e) => e.visits))} added visits`} />
            <Stat label="Hotel tax (5% TDT)" value={`${fmtUsd(sum((e) => e.tdt))}/yr`} sub={`${fmtInt(sum((e) => e.roomNights))} room nights`} />
            <Stat label="Shop & restaurant sales within 500 ft" value={`${fmtUsd(sum((e) => e.retail[0]))}–${fmtUsd(sum((e) => e.retail[2]))}/yr`} sub="range; not in headline totals" />
          </div>
        ) : <p className="text-xs text-star-500">Place a work in the Place tab to estimate what it would bring in.</p>}
        <p className="mt-2 text-[11px] text-star-500">Visits = added trips among the people who stop + destination visits by scale. Spending per visit uses AEP6's per-attendee figures
          (${A.spend_nonlocal} non-local, ${A.spend_local} local) times a realisation factor, because stopping at a sculpture is not attending an arts event.</p>
        <Slider label="Non-local share of visitors" value={Math.round(P.shareNonlocal * 100)} min={5} max={57} unit="%" onChange={(v) => setEcon({ shareNonlocal: v / 100 })} hint="AEP6's 57.3% for ticketed arts events is the upper bound" />
        <Slider label="Stops that are new trips" value={Math.round(P.incrementalShare * 100)} min={1} max={30} unit="%" onChange={(v) => setEcon({ incrementalShare: v / 100 })} />
        <Slider label="Spending vs an arts-event attendee" value={Math.round(P.realisation * 100)} min={5} max={100} unit="%" onChange={(v) => setEcon({ realisation: v / 100 })} />
        <Slider label="Non-local visitors staying overnight" value={Math.round(P.overnightShare * 100)} min={0} max={30} unit="%" onChange={(v) => setEcon({ overnightShare: v / 100 })} />
      </Card>
      <Card title="Arts & Economic Prosperity 6: Alachua County (context)">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Arts & culture sector activity" value={fmtUsd(A.total_activity)} sub={`organizations ${fmtUsd(A.organizations)} + audiences ${fmtUsd(A.audiences)}`} />
          <Stat label="Jobs supported" value={fmtInt(A.jobs)} />
          <Stat label="Taxes, local + state + federal" value={fmtUsd(A.tax_total)} sub={`local ${fmtUsd(A.tax_local)} · state ${fmtUsd(A.tax_state)} · federal ${fmtUsd(A.tax_federal)}`} />
          <Stat label="Attendees from outside the county" value={`${(A.share_nonlocal * 100).toFixed(1)}%`} sub={`resident pride ${(A.pride * 100).toFixed(1)}%`} />
        </div>
        <p className="mt-2 text-[11px] text-star-500">Annual, sector-wide figures for arts organizations and events (Americans for the Arts, 2023). They describe the whole sector, so the
          simulator never multiplies capital by them. The TRD's "$20,496,713 total tax revenue" is the federal line only.</p>
      </Card>
    </div>
  );
}
