// Build mode: a SimCity-style tray along the bottom of the map. Category buttons on the left, a horizontally
// scrolling strip of lighting cards in the middle, the loadout (one card per slot) on the right. Picking a card
// replaces that slot's existing fixtures in the selected counties; the sky, costs and install markers update live.
import { useState } from "react";
import { useModel } from "../state/model";
import { useStore } from "../state/store";
import { cardsFor, CCT_LABEL, slotStats } from "../engine/catalog";
import { SLOTS, type Slot } from "../engine/scenario";
import type { CatalogFixture } from "../engine/types";
import FixtureIcon from "./FixtureIcon";
import { fmtInt, fmtUsd } from "./ui";

const SLOT_LABEL: Record<Slot, string> = { street: "Street lights", commercial: "Commercial", residential: "Residential", sports: "Sports" };

export default function BuildTray() {
  const m = useModel();
  const { e, params: p } = m;
  const setParams = useStore((s) => s.setParams);
  const setBuildOpen = useStore((s) => s.setBuildOpen);
  const showInstalls = useStore((s) => s.showInstalls);
  const setShowInstalls = useStore((s) => s.setShowInstalls);
  const catalog = e.seed.catalog;
  const cats = Object.entries(catalog?.categories ?? {});
  const [tab, setTab] = useState<string>(cats[0]?.[0] ?? "street");
  if (!catalog) return null;

  const equip = (f: CatalogFixture) => {
    const cur = p.fixtures[f.slot];
    const next = { ...p.fixtures };
    if (cur?.card === f.id) delete next[f.slot];
    else next[f.slot] = { card: f.id, pct: cur?.pct ?? 100 };
    setParams({ fixtures: next });
  };
  const unequip = (slot: Slot) => {
    const next = { ...p.fixtures };
    delete next[slot];
    setParams({ fixtures: next });
  };
  const setPct = (slot: Slot, pct: number) => setParams({ fixtures: { ...p.fixtures, [slot]: { ...p.fixtures[slot]!, pct } } });
  const byCard = new Map(m.econ.byCard.map((l) => [l.card, l]));
  const publicCost = m.econ.byCard.filter((l) => l.public).reduce((a, l) => a + l.total, 0);
  const delta = (id: string) => {
    const s = m.sites.find((x) => x.id === id);
    return s ? s.scnMag - s.baseMag : 0;
  };
  const counties = p.selection.counties.map((f) => e.county_names[f]).join(", ") || "no county selected";

  return (
    <section aria-label="Build mode: lighting catalog"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[62dvh] flex-col border-t border-amber-400/40 bg-ink-950/95 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] backdrop-blur md:absolute md:h-72 md:max-h-none">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-1.5 text-xs">
        <span className="font-semibold text-amber-400">Build mode</span>
        <span className="truncate text-star-500">Replacing fixtures in {counties} · viewing time {p.view_window === "late" ? "late night" : "evening"}</span>
        <label className="ml-auto flex shrink-0 items-center gap-1 text-star-300">
          <input type="checkbox" className="accent-amber-400" checked={showInstalls} onChange={(ev) => setShowInstalls(ev.target.checked)} /> Install markers
        </label>
        <button onClick={() => setBuildOpen(false)} className="shrink-0 rounded px-2 py-0.5 text-star-300 hover:bg-ink-800" aria-label="Close build mode">✕</button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Categories */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-ink-700 p-2 md:w-44 md:flex-col md:overflow-y-auto md:border-r" role="tablist" aria-label="Lighting categories">
          {cats.map(([key, c]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1 text-left text-xs ${tab === key ? "border-amber-400 bg-amber-400/15 text-star-100" : "border-transparent text-star-300 hover:bg-ink-800"}`}>
              <FixtureIcon archetype={c.icon} size={26} uid={`cat-${key}`} spd={key === "wildlife" ? "PCA590" : "LED3000"} />
              <span className="whitespace-nowrap">{c.label}</span>
            </button>
          ))}
        </nav>

        {/* Card strip */}
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden p-2" role="list" aria-label="Lighting solutions">
          <div className="grid h-full auto-cols-[10.5rem] grid-flow-col gap-2">
            {cardsFor(e, tab).map((f) => {
              const on = p.fixtures[f.slot]?.card === f.id;
              const st = slotStats(e, p, f.slot);
              const units = st.units * ((p.fixtures[f.slot]?.pct ?? 100) / 100);
              const lightPct = st.avgLm ? (f.lumens / st.avgLm) * 100 : 0;
              return (
                <button key={f.id} role="listitem" onClick={() => equip(f)} aria-pressed={on} title={`${f.unit_cost.ref}${f.note ? ` · ${f.note}` : ""}`}
                  className={`relative flex flex-col rounded-xl border p-2 text-left transition hover:-translate-y-0.5 ${on ? "border-amber-400 bg-amber-400/10 shadow-[0_0_18px_rgba(246,180,75,0.35)]" : "border-ink-700 bg-ink-900 hover:border-ink-600"}`}>
                  {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-ink-950">✓</span>}
                  <div className="flex justify-center"><FixtureIcon archetype={f.archetype} spd={f.spd} u={f.u} size={64} uid={f.id} /></div>
                  <div className="mt-1 line-clamp-2 text-[11px] font-semibold leading-tight text-star-100">{f.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[9px]">
                    <span className="rounded bg-ink-700 px-1">{CCT_LABEL[f.spd]}</span>
                    <span className="rounded bg-ink-700 px-1">U{f.u}</span>
                    <span className="rounded bg-ink-700 px-1">{fmtInt(f.lumens)} lm</span>
                    <span className="rounded bg-ink-700 px-1">{fmtInt(f.watts)} W</span>
                  </div>
                  <div className="mt-auto pt-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-bold text-amber-400">{fmtUsd(f.unit_cost.value)}</span>
                      <span className="text-[9px] text-star-500">{fmtUsd(f.unit_cost.low)}–{fmtUsd(f.unit_cost.high)}</span>
                    </div>
                    <div className="text-[10px] text-star-300">× {fmtInt(units)} = {fmtUsd(units * f.unit_cost.value)}</div>
                    <div className={`text-[9px] ${lightPct < 60 || lightPct > 160 ? "text-amber-400" : "text-star-500"}`}>Light vs existing {lightPct.toFixed(0)}% · {f.unit_cost.provenance}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Loadout */}
        <aside className="shrink-0 border-ink-700 p-2 md:w-72 md:overflow-y-auto md:border-l" aria-label="Loadout">
          <div className="grid grid-cols-2 gap-1.5">
            {SLOTS.map((slot) => {
              const ch = p.fixtures[slot];
              const f = ch ? catalog.fixtures.find((x) => x.id === ch.card) : undefined;
              const line = f ? byCard.get(f.id) : undefined;
              const st = slotStats(e, p, slot);
              return (
                <div key={slot} className={`rounded-lg border p-1.5 text-[10px] ${f ? "border-amber-400/60 bg-amber-400/5" : "border-dashed border-ink-600"}`}>
                  <div className="flex items-center gap-1">
                    {f ? <FixtureIcon archetype={f.archetype} spd={f.spd} u={f.u} size={22} uid={`slot-${slot}`} /> : <span className="flex h-[22px] w-[22px] items-center justify-center text-star-500">+</span>}
                    <span className="font-semibold text-star-100">{SLOT_LABEL[slot]}</span>
                    {f && <button className="ml-auto text-star-500 hover:text-star-100" onClick={() => unequip(slot)} aria-label={`Remove ${SLOT_LABEL[slot]} fixture`}>✕</button>}
                  </div>
                  <div className="truncate text-star-300" title={f?.name}>{f ? f.name : `keep existing (${fmtInt(st.units)})`}</div>
                  {f && ch && <>
                    <div className="tabular-nums text-amber-400">{fmtUsd(line?.total ?? 0)} · {fmtInt(line?.units ?? 0)} units</div>
                    <input type="range" min={10} max={100} step={10} value={ch.pct} onChange={(ev) => setPct(slot, Number(ev.target.value))}
                      className="w-full accent-amber-400" aria-label={`${SLOT_LABEL[slot]} share replaced`} />
                    <div className="text-star-500">{ch.pct}% of existing replaced</div>
                  </>}
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
            {[["RHO-Dome1", "Rosemary Hill"], ["CAV-BillyDodd", "Chiefland AV"], ["PP-Overlook", "Paynes Prairie"]].map(([id, name]) => {
              const d = delta(id);
              return <div key={id} className="rounded bg-ink-800 p-1"><div className="text-star-500">{name}</div>
                <div className={`font-semibold tabular-nums ${d > 0.005 ? "text-glow-400" : "text-star-300"}`}>{d >= 0 ? "+" : ""}{d.toFixed(2)}</div></div>;
            })}
          </div>
          <p className="mt-1 text-[10px] text-star-500">
            Public {fmtUsd(publicCost)} · owners {fmtUsd(m.econ.privateCost)}. Generic DarkSky-compliant types, not products;
            find models in the <a className="text-glow-400 underline" href={catalog.darksky_search_url} target="_blank" rel="noreferrer">DarkSky Approved search</a>.
          </p>
        </aside>
      </div>
    </section>
  );
}
