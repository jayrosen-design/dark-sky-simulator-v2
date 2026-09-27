import { useData } from "../state/model";
import { fmtInt } from "./ui";

// 0A.5: what v2.0 must say honestly.
export default function About({ onClose }: { onClose: () => void }) {
  const { e } = useData();
  const t = e.trend_seed["12001"];
  const inv = e.inventory.by_group;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="About this simulator" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-ink-700 bg-ink-900 p-4 text-sm sm:rounded-2xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">About Dark Sky Simulator v2.0</h2>
          <button onClick={onClose} className="rounded px-2 text-star-300 hover:bg-ink-800" aria-label="Close">✕</button>
        </div>
        <div className="space-y-3 text-star-300">
          <p className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-2 text-amber-400">
            Skyglow values are <b>uncalibrated projections</b> from modeled light sources and literature coefficients. Streetlight counts for utilities are
            <b> modeled estimates</b>. Bortle labels are bands on a computed magnitude. No sky-quality meter data has been used.
          </p>
          <section>
            <h3 className="font-semibold text-star-100">How it works</h3>
            <p>A Garstang single-scattering model (Rayleigh + aerosol, Earth curvature, 100 km cutoff, summer/winter turbidity averaged) is computed offline and fitted to a
              distance kernel (max fit error {Math.max(e.physics.kernel_fits.direct.max_rel_error, e.physics.kernel_fits.reflected.max_rel_error) * 100 < 10 ? "under 10%" : "≈10%"}).
              Direct uplight and ground-reflected light get separate kernels, so shielding changes distant skyglow more than nearby. Five spectral bands weight each lamp type.
              The browser recombines {e.components.length} precomputed basis layers for any control setting.</p>
          </section>
          <section>
            <h3 className="font-semibold text-star-100">Where the light comes from ({e.mode === "seed" ? "seed mode" : "VIIRS mode"})</h3>
            {e.mode === "seed" ? (
              <p>NASA VIIRS radiance is not loaded yet (it needs Google Earth Engine credentials). Until then, public streetlights are placed on the OpenStreetMap
                road network ({fmtInt(e.osm_roads.segments)} segments, {fmtInt(e.osm_roads.lit_yes)} tagged lit) using the PRD 6.5 counts by owner for Alachua and Levy and
                derived rates for the six neighbors ({e.public_rates.urban_per_hu.toFixed(3)} per urban and {e.public_rates.rural_per_hu.toFixed(3)} per rural home);
                private light follows Census 2020 housing. One global brightness scale is fitted to the corpus
                site values (RMSE {e.anchor.rmse_mag.toFixed(2)} mag over {e.anchor.n_sites} sites); that is a sanity fit, not a calibration.</p>
            ) : <p>Light-source strength follows VIIRS VNP46A2 annual medians, LED-corrected with literature factors.</p>}
            <table className="mt-2 w-full text-xs">
              <thead className="text-left text-star-500"><tr><th className="font-normal">County</th><th className="font-normal">Group</th><th className="text-right font-normal">Fixtures</th><th className="text-right font-normal">Confidence</th></tr></thead>
              <tbody>{inv.map((r) => (
                <tr key={r.county + r.group} className="border-t border-ink-700"><td>{e.county_names[r.county]}</td><td>{r.group}</td><td className="text-right tabular-nums">{fmtInt(r.n)}</td><td className="text-right tabular-nums">{r.confidence.toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section>
            <h3 className="font-semibold text-star-100">Measured trend</h3>
            <p>{t ? `Alachua County VIIRS radiance +${t.county_pct}% (2012–2024), lit area ${t.lit_area_pct[0]}% → ${t.lit_area_pct[1]}%, Gainesville +${t.gainesville_pct}%, Paynes Prairie vicinity +${t.paynes_prairie_vicinity_pct}% [AC-EPAC]. ` : ""}
              {e.viirs
                ? `This package's VNP46A2 series (first vs last three years): ${Object.entries(e.viirs.county_pct_change).map(([f, v]) => `${e.county_names[f]} ${v >= 0 ? "+" : ""}${v.toFixed(1)}%`).join(", ")}.`
                : "Levy County has no published trend; per-pixel trends for both counties appear here once the VIIRS series is loaded."}</p>
          </section>
          <section>
            <h3 className="font-semibold text-star-100">What turns projections into evidence (v3.0)</h3>
            <p>Sky-quality meter stations (≥ 5 per county, RMSE ≤ 0.25 mag), utility fixture inventories under data-sharing agreements (GRU, Duke, Clay, CFEC),
              locally fit VIIRS LED correction, and ILLUMINA Tier 2 runs. See the PRD/TRD Sections 5–8.</p>
          </section>
          <p className="text-xs text-star-500">Data package {e.version}, built {e.built}. Basemap © OpenMapTiles © OpenStreetMap contributors (OpenFreeMap). Census TIGER/Line, FNAI Florida Conservation Lands, USGS 3DEP.
            v1: doi.org/10.5281/zenodo.17252185 · Jay Rosen, University of Florida.</p>
        </div>
      </div>
    </div>
  );
}
