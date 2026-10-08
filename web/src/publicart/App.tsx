// Public Art Policy Simulator shell: planning panel on the left, map on the right (same layout as the other apps).
import { lazy, Suspense, useEffect, useState } from "react";
import ErrorBoundary from "../shared/ErrorBoundary";
import type { Suggestion } from "./engine/equity";
import { useModel, type Model } from "./model";
import { usePaps, type Tab } from "./state";
import ActivityPanel from "./panels/ActivityPanel";
import BriefPanel from "./panels/BriefPanel";
import CollectionPanel from "./panels/CollectionPanel";
import ConservationPanel from "./panels/ConservationPanel";
import EconomicsPanel from "./panels/EconomicsPanel";
import EquityPanel from "./panels/EquityPanel";
import FundingPanel from "./panels/FundingPanel";
import BuildingsPanel from "./panels/BuildingsPanel";
import PlacePanel from "./panels/PlacePanel";
import PolicyPanel from "./panels/PolicyPanel";
import StaffPanel from "./panels/StaffPanel";

const MapView = lazy(() => import("./MapView"));

const TABS: { id: Tab; label: string }[] = [
  { id: "collection", label: "Collection" }, { id: "place", label: "Place" }, { id: "activity", label: "Activity" },
  { id: "policy", label: "Policy" }, { id: "conservation", label: "Conservation" }, { id: "equity", label: "Equity" },
  { id: "economics", label: "Economics" }, { id: "funding", label: "Funding" }, { id: "buildings", label: "Buildings" }, { id: "staff", label: "Staff study" }, { id: "brief", label: "Brief" },
];

function Panel({ m, agents, setAgents, setSugs }: { m: Model; agents: boolean; setAgents: (v: boolean) => void; setSugs: (s: Suggestion[]) => void }) {
  const tab = usePaps((s) => s.tab);
  switch (tab) {
    case "collection": return <CollectionPanel m={m} />;
    case "place": return <PlacePanel m={m} />;
    case "activity": return <ActivityPanel m={m} agents={agents} setAgents={setAgents} />;
    case "policy": return <PolicyPanel m={m} />;
    case "conservation": return <ConservationPanel m={m} />;
    case "equity": return <EquityPanel m={m} onSuggest={setSugs} />;
    case "economics": return <EconomicsPanel m={m} />;
    case "funding": return <FundingPanel />;
    case "buildings": return <BuildingsPanel m={m} />;
    case "staff": return <StaffPanel m={m} />;
    case "brief": return <BriefPanel m={m} />;
  }
}

export default function App() {
  const { tab, setTab, load, error } = usePaps();
  const m = useModel();
  const [agents, setAgents] = useState(true);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-700 bg-ink-950 px-3 py-2">
        <h1 className="text-base font-semibold tracking-tight"><span className="text-[#b79cff]">Public Art</span> Policy Simulator</h1>
        <span className="hidden text-xs text-star-500 sm:inline">Gainesville &amp; Alachua County · Chapter 5.5 modernization</span>
        <span className="rounded-full border border-[#b79cff]/60 bg-[#b79cff]/10 px-2 py-0.5 text-[11px] font-medium text-[#b79cff]"
          title="Every figure is a planning estimate from public data and editable assumptions; draft and exploratory policies are not law.">Planning estimates</span>
        <span className="ml-auto flex items-center gap-3">
          <a href="../" target="_top" className="text-xs text-star-500 hover:text-star-300" title="All three simulators">All apps</a>
          <a href="../dark-sky/" target="_top" className="text-xs text-star-500 hover:text-star-300" title="Same map platform">Dark Sky Simulator ↗</a>
          <a href="../wildsight/" target="_top" className="text-xs text-star-500 hover:text-star-300" title="Same map platform">WildSight ↗</a>
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-[42dvh] shrink-0 md:order-2 md:h-auto md:flex-1">
          <ErrorBoundary label="map"><Suspense fallback={<div className="h-full w-full bg-ink-900" />}><MapView m={m} agents={agents} suggestions={sugs} /></Suspense></ErrorBoundary>
        </div>
        <aside className="flex min-h-0 flex-1 flex-col border-ink-700 md:order-1 md:w-[440px] md:flex-none md:border-r" aria-label="Public art planner">
          <nav role="tablist" aria-label="Modules" className="flex flex-wrap gap-1 border-b border-ink-700 p-2">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-md px-2 py-1 text-sm ${tab === t.id ? "bg-ink-800 text-star-100" : "text-star-500 hover:text-star-300"}`}>{t.label}</button>
            ))}
          </nav>
          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-3">
            {error ? <p className="text-xs text-red-300">Could not load the public art data package: {error}</p>
              : !m ? <p className="text-xs text-star-500">Loading the art registry, street network and city data…</p>
              : <ErrorBoundary label="panel"><Panel m={m} agents={agents} setAgents={setAgents} setSugs={setSugs} /></ErrorBoundary>}
          </div>
        </aside>
      </div>
    </div>
  );
}
