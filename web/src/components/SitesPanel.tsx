import { lazy, Suspense } from "react";
import { useModel } from "../state/model";
import { useStore } from "../state/store";
import { bortleClass, bortleLabel, formatSky } from "../engine/bortle";
import { Basis, Card } from "./ui";

const SkyDome = lazy(() => import("./SkyDome"));

export default function SitesPanel() {
  const m = useModel();
  const focus = useStore((s) => s.focusSite);
  const setFocus = useStore((s) => s.setFocusSite);
  const park = Number(m.e.seed.certification.find((c) => c.code === "park")?.min_zenith_mag ?? 21.2);
  const sky = (mag: number) => `${mag.toFixed(2)} (B${bortleLabel(bortleClass(mag, m.table), m.table)})`;
  const focused = m.sites.find((s) => s.id === (focus ?? "RHO-Dome1")) ?? m.sites[0];

  return (
    <div className="space-y-3">
      <Card title="Sky at named sites" right={<span className="text-[11px] text-star-500">zenith mag/arcsec² (Bortle)</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Zenith sky brightness at named sites">
            <thead className="text-left text-star-500">
              <tr>
                <th className="py-1 pr-2 font-normal">Site</th>
                <th className="pr-2 font-normal">Today</th>
                <th className="pr-2 font-normal">Scenario</th>
                {m.growthOn && <th className="pr-2 font-normal">{2024 + m.years}, no action</th>}
                {m.growthOn && <th className="pr-2 font-normal">{2024 + m.years}, scenario</th>}
                <th className="font-normal">Δ</th>
              </tr>
            </thead>
            <tbody>
              {m.sites.map((s) => {
                const final = m.growthOn && s.futureScnMag !== null ? s.futureScnMag : s.scnMag;
                const d = final - s.baseMag;
                return (
                  <tr key={s.id} onClick={() => setFocus(s.id)}
                    className={`cursor-pointer border-t border-ink-700 hover:bg-ink-800 ${focused.id === s.id ? "bg-ink-800" : ""}`}>
                    <td className="py-1 pr-2">{s.name}{s.baseMag >= park && <span className="ml-1 text-[10px] text-glow-400" title="≥ 21.2: DarkSky Park tier">Park</span>}</td>
                    <td className="pr-2 tabular-nums">{sky(s.baseMag)}</td>
                    <td className="pr-2 tabular-nums">{sky(s.scnMag)}</td>
                    {m.growthOn && <td className="pr-2 tabular-nums">{s.futureBaseMag !== null ? sky(s.futureBaseMag) : "–"}</td>}
                    {m.growthOn && <td className="pr-2 tabular-nums">{s.futureScnMag !== null ? sky(s.futureScnMag) : "–"}</td>}
                    <td className={`tabular-nums ${d > 0.005 ? "text-glow-400" : d < -0.005 ? "text-red-400" : "text-star-500"}`}>{d >= 0 ? "+" : ""}{d.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-star-500">Positive Δ = darker sky. Bortle is a label on the computed magnitude (Clear Dark Sky scale), never an input.</p>
        <Basis acct={m.allAcct} />
      </Card>

      <Card title={`All-sky view · ${focused.name}`}>
        <p className="mb-2 text-xs text-star-300">Scenario: {formatSky(m.growthOn && focused.futureScnMag !== null ? focused.futureScnMag : focused.scnMag, m.table)}</p>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-ink-800" />}>
          <SkyDome site={focused} />
        </Suspense>
        <p className="mt-1 text-[11px] text-star-500">Drag to look around, scroll to zoom. Stars, Milky Way, Sun and Moon are placed for the chosen date and site time; named bright stars are at catalog positions, fainter ones are a synthetic field. Star count follows the naked-eye limiting magnitude from the modeled zenith value plus twilight and moonlight (Krisciunas &amp; Schaefer 1991); horizon glow points at the regional light domes; the Moon is drawn 3× size. The modeled artificial light is the scenario's viewing-window value at every hour. Illustrative, not a photograph.</p>
      </Card>
    </div>
  );
}
