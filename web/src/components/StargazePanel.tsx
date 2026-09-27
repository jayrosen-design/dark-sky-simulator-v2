// Stargaze mode: everyday observing. Find a dark, clear spot for tonight (grab & go, camping, imaging) or dark-sky
// land to buy; click anywhere on the map for a spot report with an hourly observing forecast.
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { useData, useModel } from "../state/model";
import { useMcda } from "../state/mcda";
import { useStargaze, type Place } from "../state/stargaze";
import { bortleClass, bortleLabel, nelmFromSqm } from "../engine/bortle";
import { meanCloudLayer, placeFacts, topSpots, USE_CASES, waterViewLayer, type PlaceFacts, type UseCase } from "../engine/spots";
import { darknessFactor, dewRisk, goScore, seeingProxy, transparencyProxy, WX_ATTRIBUTION, type WxPoint } from "../engine/weather";
import { nightDateOf, nightSummary, siteTimeLabel, skyState } from "../engine/sky";
import type { EngineData } from "../engine/types";
import { Card, fmtInt, fmtUsd, Seg } from "./ui";

const SkyDome = lazy(() => import("./SkyDome"));
const CENTER = { lat: 29.6, lon: -82.5 };
const PUBLIC_CATS = new Set([4, 5, 6, 7, 8, 9, 10]);

export default function StargazePanel() {
  const { e } = useData();
  const m = useModel();
  const mc = useMcda();
  const sg = useStargaze();

  useEffect(() => { mc.load(e); }, [e]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sg.grid && !sg.gridLoading) sg.loadGrid(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const water = useMemo(() => (mc.data ? waterViewLayer(mc.data) : null), [mc.data]);
  const nightDate = sg.hour ? nightDateOf(sg.hour) : null;
  const night = useMemo(() => (nightDate ? nightSummary(nightDate.y, nightDate.mo, nightDate.d, CENTER.lat, CENTER.lon) : null),
    [nightDate?.y, nightDate?.mo, nightDate?.d]); // eslint-disable-line react-hooks/exhaustive-deps
  // Forecast hours inside tonight's astronomical darkness (fallback: the next 12 hours).
  const darkIdx = useMemo(() => {
    if (!sg.grid) return [];
    const inNight = night?.dusk && night.dawn ? sg.grid.times.flatMap((t, k) => (t >= night.dusk! && t <= night.dawn! ? [k] : [])) : [];
    return inNight.length ? inNight : sg.grid.times.flatMap((t, k) => (t >= Date.now() && t < Date.now() + 12 * 3600000 ? [k] : []));
  }, [sg.grid, night]);
  const cloud = useMemo(() => (mc.data && sg.grid && sg.use !== "property" ? meanCloudLayer(mc.data, sg.grid, darkIdx) : null), [mc.data, sg.grid, darkIdx, sg.use]);
  const spots = useMemo(() => (mc.data && water ? topSpots(mc.data, water, cloud, sg.use, 8, 10) : []), [mc.data, water, cloud, sg.use]);
  useEffect(() => { sg.setSpots(spots); }, [spots]); // eslint-disable-line react-hooks/exhaustive-deps
  const countyName = (f: string) => e.region_county_names[f] ?? f;
  const spotName = (s: (typeof spots)[number]) => `${countyName(s.county)} · ${USE_CASES[sg.use].label} #${s.rank}`;
  // Open the report on tonight's #1 once the ranking includes the forecast (or needs none).
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || sg.spot || !spots[0] || (sg.use !== "property" && !cloud)) return;
    autoPicked.current = true;
    sg.setSpot({ lat: spots[0].lat, lon: spots[0].lon, name: spotName(spots[0]) }, true);
  }, [spots]); // eslint-disable-line react-hooks/exhaustive-deps

  const facts = sg.spot && mc.data && water ? placeFacts(e, mc.data, water, sg.spot.lat, sg.spot.lon) : null;
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => sg.setSpot({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), name: "My location" }, true));

  return (
    <div className="space-y-3">
      <Card title="Stargaze" right={<button onClick={locate} className="text-[11px] text-glow-400 hover:underline">Use my location</button>}>
        <Seg label="What are you planning?" value={sg.use} onChange={(u: UseCase) => sg.setUse(u)}
          options={(Object.keys(USE_CASES) as UseCase[]).map((k) => ({ value: k, label: USE_CASES[k].label }))} />
        <p className="mt-1 text-[11px] text-star-300">{USE_CASES[sg.use].blurb}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-star-500">Weather</span>
          <Seg label="Weather source" value={sg.source} onChange={sg.setSource}
            options={[{ value: "live", label: "Live forecast" }, { value: "sim", label: "Simulated (demo)" }]} />
          {sg.gridLoading && <span className="text-star-500">loading…</span>}
        </div>
        {(sg.gridError || sg.grid?.source === "sim") && (
          <p className="mt-1 rounded bg-amber-400/10 px-2 py-1 text-[11px] text-amber-400">
            {sg.gridError ?? "Simulated weather: a synthetic pattern for demos, not a forecast."}
          </p>
        )}
        {night && (
          <p className="mt-2 text-[11px] text-star-300">
            <span className="text-star-100">Night of {nightDate!.mo}/{nightDate!.d}:</span> astronomical dark {night.dusk ? siteTimeLabel(night.dusk) : "–"} → {night.dawn ? siteTimeLabel(night.dawn) : "–"}
            {" · "}{night.moonName} {Math.round(night.moonIllum * 100)}%
            {night.moonRise ? ` · moonrise ${siteTimeLabel(night.moonRise)}` : ""}{night.moonSet ? ` · moonset ${siteTimeLabel(night.moonSet)}` : ""}
            {" · "}<span className="text-glow-400">{night.darkMoonlessHours.toFixed(1)} h moonless dark</span>
          </p>
        )}
        <p className="mt-1 text-[11px] text-star-500">Click anywhere on the map for a spot report. The map shows modeled sky brightness under the forecast cloud layer; move the time slider on the map to scrub the forecast.</p>
      </Card>

      <Card title={`Best spots · ${USE_CASES[sg.use].label}`} right={<span className="text-[11px] text-star-500">{sg.use === "property" ? "sky · 2034 sky · price · views" : "tonight"}</span>}>
        {!mc.data ? <p className="text-xs text-star-500">Loading regional layers…</p> : (
          <ol className="space-y-1">
            {spots.map((s) => {
              const sky = mc.data!.raw.sky[s.cell];
              const on = sg.spot && Math.abs(sg.spot.lat - s.lat) < 1e-6 && Math.abs(sg.spot.lon - s.lon) < 1e-6;
              return (
                <li key={s.rank}>
                  <button onClick={() => sg.setSpot({ lat: s.lat, lon: s.lon, name: spotName(s) }, true)}
                    className={`w-full rounded-md border px-2 py-1 text-left text-xs ${on ? "border-amber-400 bg-amber-400/10" : "border-ink-700 hover:bg-ink-800"}`}>
                    <div className="flex items-baseline justify-between">
                      <span><span className="font-semibold text-amber-400">#{s.rank}</span> {countyName(s.county)} <span className="text-star-500">{s.lat.toFixed(3)}, {s.lon.toFixed(3)}</span></span>
                      <span className="tabular-nums text-star-300">{Math.round(s.score * 100)}</span>
                    </div>
                    <div className="text-[10px] text-star-500">
                      {sky.toFixed(2)} mag (B{bortleLabel(bortleClass(sky, m.table), m.table)})
                      {cloud && ` · ${Math.round(cloud[s.cell])}% cloud tonight`}
                      {sg.use === "grabgo" && ` · ${mc.data!.raw.access[s.cell].toFixed(1)} km to major road`}
                      {sg.use === "camping" && ` · ${Math.round(s.f.publicLand * 100)}% public land`}
                      {(sg.use === "imaging" || sg.use === "camping") && s.f.open > 0.55 && " · open-water views"}
                      {sg.use === "property" && ` · $${fmtInt(mc.data!.raw.sale_usd_acre[s.cell])}/acre · ${fmtInt(s.f.privateAcres)} private acres`}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {sg.spot && facts && <SpotReport e={e} facts={facts} spot={sg.spot} table={m.table} />}

      {sg.saved.length > 0 && (
        <Card title="Saved spots" right={<span className="text-[11px] text-star-500">this browser only</span>}>
          <ul className="space-y-1 text-xs">
            {sg.saved.map((p, i) => (
              <li key={`${p.lat},${p.lon}`} className="flex items-center gap-2">
                <button className="text-left text-star-100 hover:underline" onClick={() => sg.setSpot(p, true)}>{p.name ?? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`}</button>
                <button className="ml-auto text-star-500 hover:text-star-100" onClick={() => sg.removeSaved(i)} aria-label="Remove saved spot">✕</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-[11px] text-star-500">
        Sky brightness is the modeled zenith value (uncalibrated planning projection), not a measurement. Transparency and seeing are proxies
        (aerosol optical depth, humidity and high cloud; jet-stream wind at 250 hPa), not a numerical seeing forecast. Horizons use terrain and
        open water only; trees and buildings are not modeled. Always check land access, hours and camping rules with the managing agency, and get
        permission on private land. {WX_ATTRIBUTION}.
      </p>

      {sg.skyOpen && sg.spot && facts && (
        <Suspense fallback={null}>
          <SkyDome startFull initialTime={sg.hour ?? undefined} onExitFull={() => sg.setSkyOpen(false)}
            place={{ id: "stargaze-spot", name: sg.spot.name ?? `${sg.spot.lat.toFixed(3)}, ${sg.spot.lon.toFixed(3)}`, lat: sg.spot.lat, lon: sg.spot.lon, modelMag: facts.sky }} />
        </Suspense>
      )}
    </div>
  );
}

function SpotReport({ e, facts: f, spot, table }: { e: EngineData; facts: PlaceFacts; spot: Place; table: ReturnType<typeof useModel>["table"] }) {
  const sg = useStargaze();
  const name = spot.name ?? `${spot.lat.toFixed(3)}, ${spot.lon.toFixed(3)}`;
  const nd = sg.hour ? nightDateOf(sg.hour) : null;
  const night = useMemo(() => (nd ? nightSummary(nd.y, nd.mo, nd.d, spot.lat, spot.lon) : null), [nd?.y, nd?.mo, nd?.d, spot.lat, spot.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const publicLand = f.publicShare >= 0.5 || f.conservation;
  const owner = f.publicCat && PUBLIC_CATS.has(f.publicCat) ? e.land?.categories[String(f.publicCat)] : null;
  if (f.water) return <Card title={name}><p className="text-xs text-star-300">That point is open water. Pick a spot on land (a nearby shoreline gives a low, open horizon).</p></Card>;
  const nelm = nelmFromSqm(f.sky);
  return (
    <Card title={name} right={<span className="text-[11px] text-star-500">{e.region_county_names[f.county] ?? ""}</span>}>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => sg.setSkyOpen(true)} className="rounded-md bg-amber-400 px-2 py-1 text-xs font-semibold text-ink-950">Sky view here</button>
        <button onClick={() => sg.saveSpot({ ...spot, name })} className="rounded-md bg-ink-800 px-2 py-1 text-xs text-star-300 hover:bg-ink-700">Save spot</button>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat.toFixed(5)},${spot.lon.toFixed(5)}`} target="_blank" rel="noreferrer"
          className="rounded-md bg-ink-800 px-2 py-1 text-xs text-star-300 hover:bg-ink-700">Directions ↗</a>
      </div>
      <table className="mt-2 w-full text-[11px]"><tbody className="align-top">
        <Row k="Sky (modeled)" v={<>{f.sky.toFixed(2)} mag/arcsec² · Bortle {bortleLabel(bortleClass(f.sky, table), table)} · naked-eye limit ≈ {nelm.toFixed(1)}
          <span className="text-star-500"> · 2034 trend {f.sky2034.toFixed(2)}</span></>} />
        <Row k="Light domes" v={f.domes.map((d) => `${d.name} ${d.dir} ${d.km.toFixed(0)} km`).join(" · ")} />
        <Row k="Horizon" v={<>terrain ≤ {f.horizonDeg.toFixed(1)}°{f.waterView > 0 ? ` · open water in ${Math.round(f.waterView * 100)}% of directions within 3 km` : ""}
          <span className="text-star-500"> (trees not modeled)</span></>} />
        <Row k="Access" v={`${f.roadKm.toFixed(1)} km to the nearest major road`} />
        <Row k="Land" v={<>{f.parcelAcres > 0 ? `${Math.round(f.publicShare * 100)}% public${owner ? ` (${owner})` : ""}` : f.conservation ? "Conservation land" : "no parcel data"}
          <span className={publicLand ? "text-glow-400" : "text-star-500"}>{publicLand ? " · public land: check the agency's rules for night use and camping" : " · mostly private: get the owner's permission"}</span></>} />
        <Row k="Land price" v={Number.isFinite(f.usdAcre) && f.usdAcre > 0 ? <>${fmtInt(f.usdAcre)}/acre typical vacant-land sale
          {Number.isFinite(f.usdP25) && Number.isFinite(f.usdP75) && f.usdP25 > 0 ? <span className="text-star-500"> (${fmtInt(f.usdP25)}–${fmtInt(f.usdP75)})</span> : null}
          {sg.use === "property" && <div>≈ {[5, 10, 20, 40].map((a) => `${a} ac ${fmtUsd(a * f.usdAcre)}`).join(" · ")}</div>}</> : "no nearby sales"} />
        {night && <Row k="Tonight" v={<>dark {night.dusk ? siteTimeLabel(night.dusk) : "–"} → {night.dawn ? siteTimeLabel(night.dawn) : "–"} · {night.moonName} {Math.round(night.moonIllum * 100)}%
          · {night.darkMoonlessHours.toFixed(1)} h moonless dark</>} />}
      </tbody></table>
      {sg.pointError && <p className="mt-1 text-[11px] text-amber-400">{sg.pointError}</p>}
      {sg.point ? <ForecastChart p={sg.point} lat={spot.lat} lon={spot.lon} hour={sg.hour} setHour={sg.setHour} /> : <p className="mt-2 text-[11px] text-star-500">Loading forecast…</p>}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <tr className="border-t border-ink-700"><td className="w-24 py-0.5 pr-2 text-star-500">{k}</td><td className="py-0.5 text-star-300">{v}</td></tr>;
}

// Clear-Sky-Chart-style colors: dark blue = good, white = bad.
const GOOD = [18, 52, 130], BAD = [230, 232, 236];
const mix = (t: number) => `rgb(${GOOD.map((g, i) => Math.round(g + (BAD[i] - g) * Math.min(1, Math.max(0, t)))).join(",")})`;

function ForecastChart({ p, lat, lon, hour, setHour }: { p: WxPoint; lat: number; lon: number; hour: number | null; setHour: (t: number) => void }) {
  const cols = useMemo(() => p.times.flatMap((t, i) => {
    if (t < Date.now() - 3600000) return [];
    const st = skyState(t, lat, lon);
    const dark = darknessFactor(st.sun.alt, st.moon.alt, st.moon.illum);
    return [{ t, i, st, dark, go: goScore(p.cloud[i], dark),
      tr: transparencyProxy(p.aod[i], p.rh[i], p.high[i], p.visibility[i]), se: seeingProxy(p.jet[i], p.gust[i]), dew: dewRisk(p.temp[i], p.dew[i]) }];
  }).slice(0, 60), [p, lat, lon]);
  // Longest run of consecutive hours with go >= 60 among the next 36 hours.
  let best: [number, number] | null = null;
  for (let a = 0; a < Math.min(cols.length, 36); a++) {
    if (cols[a].go < 60) continue;
    let b = a;
    while (b + 1 < cols.length && cols[b + 1].go >= 60) b++;
    if (!best || b - a > best[1] - best[0]) best = [a, b];
    a = b;
  }
  const darkColor = (c: typeof cols[number]) => c.st.sun.alt > -0.83 ? "#dbe8ff" : c.st.sun.alt > -12 ? "#3a6ea5" : c.st.sun.alt > -18 ? "#1d3d6e"
    : c.st.moon.alt > 0 ? `rgb(${Math.round(20 + 60 * c.st.moon.illum)},${Math.round(30 + 70 * c.st.moon.illum)},${Math.round(60 + 110 * c.st.moon.illum)})` : "#05070d";
  const rows: { label: string; cell: (c: typeof cols[number]) => { bg: string; txt?: string; title: string } }[] = [
    { label: "Darkness", cell: (c) => ({ bg: darkColor(c), title: `${c.st.twilight}; Moon ${c.st.moon.alt > 0 ? `up ${c.st.moon.alt.toFixed(0)}°, ${Math.round(c.st.moon.illum * 100)}% lit` : "down"}` }) },
    { label: "Cloud", cell: (c) => ({ bg: mix(p.cloud[c.i] / 100), title: `${Math.round(p.cloud[c.i])}% (low ${Math.round(p.low[c.i])}, mid ${Math.round(p.mid[c.i])}, high ${Math.round(p.high[c.i])})` }) },
    { label: "Transp.*", cell: (c) => ({ bg: mix((5 - c.tr) / 4), title: `transparency proxy ${c.tr}/5${p.aod[c.i] !== null ? `, AOD ${p.aod[c.i]}` : ""}` }) },
    { label: "Seeing*", cell: (c) => ({ bg: Number.isFinite(c.se) ? mix((5 - c.se) / 4) : "#333", title: `seeing proxy ${c.se}/5, jet ${Math.round(p.jet[c.i])} m/s` }) },
    { label: "Dew", cell: (c) => ({ bg: c.dew === "high" ? "#b4442f" : c.dew === "moderate" ? "#b58a2a" : "#18344f", title: `dew risk ${c.dew}: ${p.temp[c.i].toFixed(0)}°C, dew point ${p.dew[c.i].toFixed(0)}°C, RH ${Math.round(p.rh[c.i])}%` }) },
    { label: "Wind", cell: (c) => ({ bg: mix(p.wind[c.i] / 10), title: `${p.wind[c.i].toFixed(1)} m/s, gusts ${p.gust[c.i].toFixed(1)} m/s` }) },
    { label: "Temp °F", cell: (c) => ({ bg: "transparent", txt: String(Math.round(p.temp[c.i] * 9 / 5 + 32)), title: `${p.temp[c.i].toFixed(1)}°C` }) },
    { label: "Go", cell: (c) => ({ bg: `hsl(${Math.round(c.go * 1.2)},55%,${c.go ? 32 : 16}%)`, txt: c.go ? String(c.go) : "", title: `go score ${c.go}/100 (clear sky × usable darkness)` }) },
  ];
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-semibold text-star-100">Hourly observing forecast</span>
        <span className="text-star-500">{p.source === "sim" ? "SIMULATED" : "Open-Meteo"} · click an hour</span>
      </div>
      {best && <p className="mb-1 text-[11px] text-glow-400">Best window: {siteTimeLabel(cols[best[0]].t)} → {siteTimeLabel(cols[best[1]].t + 3600000)} (go ≥ 60)</p>}
      <div className="overflow-x-auto pb-1">
        <table className="border-separate border-spacing-[1px] text-[9px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-ink-900 pr-1 text-left font-normal text-star-500">site time</th>
              {cols.map((c) => {
                const lab = siteTimeLabel(c.t).split(" ");
                return <th key={c.t} className={`w-5 font-normal ${lab[1].startsWith("00") ? "text-amber-400" : "text-star-500"}`} title={siteTimeLabel(c.t, true)}>
                  {lab[1].startsWith("00") ? lab[0].slice(0, 2) : lab[1].slice(0, 2)}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="sticky left-0 whitespace-nowrap bg-ink-900 pr-1 text-star-500">{r.label}</td>
                {cols.map((c) => {
                  const v = r.cell(c);
                  const sel = hour !== null && Math.abs(hour - c.t) < 1800000;
                  return <td key={c.t} title={`${siteTimeLabel(c.t, true)}: ${v.title}`} onClick={() => setHour(c.t)}
                    className={`h-4 w-5 cursor-pointer text-center tabular-nums text-star-100 ${sel ? "outline outline-1 outline-amber-400" : ""}`} style={{ background: v.bg }}>{v.txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-star-500">Dark blue = good, white = poor. Darkness: black = dark &amp; moonless, blue = moonlit, teal = twilight. *Proxies, not a seeing model.</p>
    </div>
  );
}
