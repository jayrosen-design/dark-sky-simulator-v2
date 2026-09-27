import { lazy, Suspense, useEffect, useState } from "react";
import { DataContext, type DataPackage } from "./state/model";
import { useStore, type Tab } from "./state/store";
import { loadEngine, loadInt8, loadLin16, loadLog16 } from "./data/load";
import { UncalibratedBadge } from "./components/ui";
import ScenarioPanel from "./components/ScenarioPanel";
import SitesPanel from "./components/SitesPanel";
import EconomicsPanel from "./components/EconomicsPanel";
import BriefPanel from "./components/BriefPanel";
import About from "./components/About";
import ErrorBoundary from "./components/ErrorBoundary";
import CostHud from "./components/CostHud";

const MapView = lazy(() => import("./components/MapView"));
const ObservatoryPanel = lazy(() => import("./components/ObservatoryPanel"));
const BuildTray = lazy(() => import("./components/BuildTray"));

const TABS: { value: Tab; label: string }[] = [
  { value: "scenario", label: "Scenario" }, { value: "sites", label: "Sites" }, { value: "economics", label: "Costs" },
  { value: "observatory", label: "Observatory" }, { value: "brief", label: "Brief" },
];

export default function App() {
  const [data, setData] = useState<DataPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const buildOpen = useStore((s) => s.buildOpen);
  const setBuildOpen = useStore((s) => s.setBuildOpen);

  useEffect(() => {
    (async () => {
      const e = await loadEngine();
      const [base] = await loadLog16(e.files.baseline_a15);
      setData({ e, base15: base, basis: null, growth30: null, fixCat15: null, county15: null });
      // Heavier layers load after first paint so the baseline map opens fast on a phone.
      const [basis, [growth], cats, county] = await Promise.all([loadLog16(e.files.basis_a30), loadLin16(e.files.growth_a30),
        loadLin16(e.files.fixtures_cat_a15), loadInt8(e.files.county_a15.file)]);
      setData((d) => (d ? { ...d, basis, growth30: growth, fixCat15: cats, county15: county } : d));
    })().catch((err) => setError(String(err)));
  }, []);

  if (error) return <div className="p-6 text-red-400">Failed to load data package: {error}</div>;
  if (!data) return <div className="flex h-dvh items-center justify-center text-star-300">Loading Dark Sky Simulator…</div>;

  return (
    <DataContext.Provider value={data}>
      <div className="flex h-dvh flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-700 bg-ink-950 px-3 py-2">
          <h1 className="text-base font-semibold tracking-tight">Dark Sky Simulator <span className="text-star-500">v2.0</span></h1>
          <span className="hidden text-xs text-star-500 sm:inline">Alachua, Levy + 6 neighboring counties, Florida</span>
          <UncalibratedBadge />
          <button onClick={() => setAbout(true)} className="ml-auto rounded-md border border-ink-600 px-2 py-0.5 text-xs text-star-300 hover:bg-ink-800">About & data</button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative h-[42dvh] shrink-0 md:order-2 md:h-auto md:flex-1">
            <ErrorBoundary label="map"><Suspense fallback={<div className="h-full w-full bg-ink-900" />}><MapView /></Suspense></ErrorBoundary>
            {!buildOpen && tab !== "observatory" && (
              <button onClick={() => setBuildOpen(true)}
                className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-400 bg-ink-950/90 px-4 py-1.5 text-sm font-semibold text-amber-400 shadow-lg backdrop-blur hover:bg-amber-400 hover:text-ink-950">
                Build mode · choose fixtures
              </button>
            )}
            {tab !== "observatory" && data.basis && <ErrorBoundary label="budget"><CostHud /></ErrorBoundary>}
            {buildOpen && tab !== "observatory" && <ErrorBoundary label="build"><Suspense fallback={null}><BuildTray /></Suspense></ErrorBoundary>}
          </div>
          <aside className="flex min-h-0 flex-1 flex-col border-ink-700 md:order-1 md:w-[420px] md:flex-none md:border-r">
            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-700 bg-ink-950 px-2 py-1.5" role="tablist" aria-label="Modules">
              {TABS.map((t) => (
                <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
                  className={`whitespace-nowrap rounded-md px-3 py-1 text-sm ${tab === t.value ? "bg-ink-700 text-star-100" : "text-star-500 hover:text-star-300"}`}>{t.label}</button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto p-3" role="tabpanel">
              <ErrorBoundary key={tab} label={TABS.find((t) => t.value === tab)?.label ?? tab}>
                {tab === "scenario" && <ScenarioPanel />}
                {tab === "sites" && <SitesPanel />}
                {tab === "economics" && <EconomicsPanel />}
                {tab === "observatory" && <Suspense fallback={null}><ObservatoryPanel /></Suspense>}
                {tab === "brief" && <BriefPanel />}
              </ErrorBoundary>
            </div>
          </aside>
        </div>
      </div>
      {about && <About onClose={() => setAbout(false)} />}
    </DataContext.Provider>
  );
}
