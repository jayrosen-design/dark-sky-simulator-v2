// WildSight Planner shell: map on the right, planner panel on the left, About dialog.
import { lazy, Suspense, useState } from "react";
import ErrorBoundary from "../shared/ErrorBoundary";
import TrafficPanel from "./TrafficPanel";

const MapView = lazy(() => import("./MapView"));

export default function App() {
  const [about, setAbout] = useState(false);
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-700 bg-ink-950 px-3 py-2">
        <h1 className="text-base font-semibold tracking-tight"><span className="text-[#5fd6c4]">WildSight</span> Planner</h1>
        <span className="hidden text-xs text-star-500 sm:inline">Roadside AI wildlife detection · eight counties, North Central Florida</span>
        <span className="rounded-full border border-[#5fd6c4]/60 bg-[#5fd6c4]/10 px-2 py-0.5 text-[11px] font-medium text-[#5fd6c4]"
          title="Crash risk is modeled from reported crashes; WildSight's effect on animals and drivers is unproven until piloted.">Planning estimates</span>
        <span className="ml-auto flex items-center gap-2">
          <a href="../" target="_top" className="text-xs text-star-500 hover:text-star-300" title="Same map region and data platform">Dark Sky Simulator ↗</a>
          <button onClick={() => setAbout(true)} className="rounded-md border border-ink-600 px-2 py-0.5 text-xs text-star-300 hover:bg-ink-800">About & data</button>
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-[42dvh] shrink-0 md:order-2 md:h-auto md:flex-1">
          <ErrorBoundary label="map"><Suspense fallback={<div className="h-full w-full bg-ink-900" />}><MapView /></Suspense></ErrorBoundary>
        </div>
        <aside className="min-h-0 flex-1 overflow-y-auto border-ink-700 p-3 md:order-1 md:w-[420px] md:flex-none md:border-r" aria-label="WildSight planner">
          <ErrorBoundary label="planner"><TrafficPanel /></ErrorBoundary>
        </aside>
      </div>
      {about && <About onClose={() => setAbout(false)} />}
    </div>
  );
}

function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="About WildSight Planner" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-ink-600 bg-ink-900 p-4 text-sm text-star-300" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-2 flex items-center"><h2 className="text-base font-semibold text-star-100">About WildSight Planner</h2>
          <button onClick={onClose} className="ml-auto rounded px-2 text-star-500 hover:bg-ink-800" aria-label="Close">✕</button></div>
        <p><a className="text-[#5fd6c4] underline" href="./" target="_top">WildSight</a> is a solar roadside unit
          (UF Engineering Innovation Team 7) that wakes on motion, identifies the animal on-device, flashes an amber beacon to oncoming drivers and plays a
          species-tuned tone. This planner estimates where units would prevent the most animal-vehicle crashes, how many units and LoRa gateways that takes,
          and what scaling the service costs.</p>
        <h3 className="mt-3 font-semibold text-star-100">How risk is estimated</h3>
        <p>Road segments (OpenStreetMap, ~1 km) carry FDOT traffic counts, speed, lanes, habitat and the reported animal crashes within 100 m (2014–2024). A
          negative-binomial crash model, blended with each road's own record (Empirical Bayes, Highway Safety Manual), gives expected crashes per mile per year,
          back-tested on 2020–2024.</p>
        <h3 className="mt-3 font-semibold text-star-100">Data</h3>
        <ul className="list-disc pl-5">
          <li>Animal-related vehicle crashes 2014–2024 and hotspots: University of Florida Center for Landscape Conservation Planning, from Signal Four Analytics crash reports</li>
          <li>Traffic: FDOT Transportation Data and Analytics, AADT 2025</li>
          <li>Roads: OpenStreetMap contributors (ODbL); conservation lands: FNAI; housing: 2020 Census</li>
        </ul>
        <h3 className="mt-3 font-semibold text-star-100">Shared platform</h3>
        <p>WildSight Planner is a separate app from the <a className="text-glow-400 underline" href="../" target="_top">Dark Sky Simulator</a>. Both use the same mapping core
          (MapLibre, OpenFreeMap basemap, trackpad navigation), UI components, region definition and offline data pipeline plumbing.</p>
        <p className="mt-3 text-xs text-star-500">Prices are design assumptions; reported crashes undercount collisions; all outcomes are planning estimates.</p>
      </div>
    </div>
  );
}
