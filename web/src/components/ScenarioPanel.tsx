import { useStore } from "../state/store";
import { useModel } from "../state/model";
import { CCT_OPTIONS, DEFAULT_PARAMS, GROUPS, type ScenarioParams } from "../engine/scenario";
import type { Group, Mode, SpdCode } from "../engine/types";
import { Basis, Card, fmtInt, fmtPct, Seg, Slider, Toggle } from "./ui";

const GROUP_LABEL: Record<string, string> = {
  GRU: "GRU streetlights", Municipal: "Municipal streetlights", Utility: "Duke / Clay / CFEC", FDOT: "FDOT state roads", Private: "Private (homes, businesses)",
  Sports: "Sports fields & stadiums",
};
const CCT_LABEL: Record<SpdCode, string> = { LED4000: "4000K", LED3000: "3000K", LED2700: "2700K", PCA590: "2200K / PCA amber", HPS: "HPS", MH: "MH", NBA: "NBA" };
const MODES: { value: Mode; label: string }[] = [
  { value: "V", label: "Visual (V)" }, { value: "scotopic", label: "Scotopic" },
  { value: "band_415", label: "415 nm" }, { value: "band_480", label: "480 nm" }, { value: "band_555", label: "555 nm" },
  { value: "band_590", label: "590 nm" }, { value: "band_680", label: "680 nm" },
];

export default function ScenarioPanel() {
  const m = useModel();
  const { e, params: p } = m;
  const setParams = useStore((s) => s.setParams);
  const replace = useStore((s) => s.replaceParams);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const toggleGroup = (g: Group, on: boolean) =>
    setParams({ selection: { ...p.selection, groups: on ? [...p.selection.groups, g] : p.selection.groups.filter((x) => x !== g) } });
  const toggleCounty = (f: string, on: boolean) =>
    setParams({ selection: { ...p.selection, counties: on ? [...p.selection.counties, f] : p.selection.counties.filter((x) => x !== f) } });
  const ov = (site: string) => p.overlays.find((o) => o.site === site);
  const setOverlay = (site: string, patch: Partial<{ lz0_radius_mi: number; lz1_radius_mi: number }> | null) => {
    const rest = p.overlays.filter((o) => o.site !== site);
    if (patch === null) return setParams({ overlays: rest });
    const cur = ov(site) ?? { site, lz0_radius_mi: e.seed.overlay.lz0.default_radius_mi, lz1_radius_mi: e.seed.overlay.lz1.default_radius_mi };
    const next = { ...cur, ...patch };
    if (next.lz1_radius_mi <= next.lz0_radius_mi) next.lz1_radius_mi = e.seed.overlay.lz1.radius_options_mi.find((r) => r > next.lz0_radius_mi) ?? next.lz1_radius_mi;
    setParams({ overlays: [...rest, next] });
  };
  const applyPreset = (key: string) => {
    const pr = e.seed.presets[key].params as Record<string, any>;
    const overlays = pr.overlays?.enabled ? ["RHO", "CAV"].map((site) => ({ site, lz0_radius_mi: pr.overlays.lz0_radius_mi, lz1_radius_mi: pr.overlays.lz1_radius_mi })) : [];
    replace({ ...DEFAULT_PARAMS, selection: pr.selection, shielding: pr.shielding, cct_cap: pr.cct_cap, intensity: { pct_reduction: pr.intensity.pct_reduction },
      curfew: pr.curfew, amortization: pr.amortization, overlays, growth_baseline: p.growth_baseline, growth_years: p.growth_years } as ScenarioParams);
  };
  const lz0Opts = e.seed.overlay.lz0.radius_options_mi;
  const lz1Opts = e.seed.overlay.lz1.radius_options_mi;

  return (
    <div className="space-y-3">
      <Card title="Presets">
        <div className="flex flex-wrap gap-2">
          {Object.entries(e.seed.presets).filter(([, v]) => typeof v === "object" && v !== null && "params" in v).map(([k, v]) => (
            <button key={k} onClick={() => applyPreset(k)} className="rounded-md bg-ink-700 px-2 py-1 text-xs hover:bg-ink-600" title={`${v.ref}. ${v.notes}`}>{v.label}</button>
          ))}
          <button onClick={() => replace({ ...DEFAULT_PARAMS })} className="rounded-md bg-ink-800 px-2 py-1 text-xs text-star-300 hover:bg-ink-700">Reset</button>
        </div>
      </Card>

      <Card title="1 · Which fixtures?" right={<span className="text-[11px] text-star-500">A-01 explicit selection</span>}>
        <p className="mb-1 text-[11px] text-star-500">Controls in step 2 apply only to these fixtures. Overlay zones (step 3) apply to every fixture inside them.</p>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <Toggle key={g} label={GROUP_LABEL[g]} checked={p.selection.groups.includes(g)} onChange={(v) => toggleGroup(g, v)} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-star-500">
          Counties
          <button className="rounded bg-ink-800 px-2 py-0.5 text-star-300 hover:bg-ink-700" onClick={() => setParams({ selection: { ...p.selection, counties: ["12001", "12075"] } })}>Alachua + Levy</button>
          <button className="rounded bg-ink-800 px-2 py-0.5 text-star-300 hover:bg-ink-700" onClick={() => setParams({ selection: { ...p.selection, counties: Object.keys(e.county_names) } })}>All {Object.keys(e.county_names).length}</button>
        </div>
        <div className="grid grid-cols-2 gap-x-3">
          {Object.entries(e.county_names).map(([f, n]) => (
            <Toggle key={f} label={n} checked={p.selection.counties.includes(f)} onChange={(v) => toggleCounty(f, v)} />
          ))}
        </div>
        <p className="text-[11px] text-star-500">
          Neighbor counties have no public inventory: their streetlights are estimated at {e.public_rates.urban_per_hu.toFixed(3)} per urban and {e.public_rates.rural_per_hu.toFixed(3)} per rural home (derived from Alachua and Levy), confidence 0.2.
        </p>
        <Basis acct={m.affectedAcct} what="Selection + overlays act on" />
      </Card>

      <Card title="2 · Lighting controls">
        <Slider label="Shielding: fixtures converted" value={p.shielding.pct_converted} min={0} max={100} step={5} unit="%"
          onChange={(v) => setParams({ shielding: { ...p.shielding, pct_converted: v } })}
          hint="Converted fixtures become the target TM-15 uplight rating; HPS/MH are replaced by LED." />
        <div className="flex items-center gap-2 py-1 text-xs text-star-300">
          <span>Target rating</span>
          <Seg label="Target uplight rating" value={p.shielding.target_u} onChange={(v) => setParams({ shielding: { ...p.shielding, target_u: v } })}
            options={[{ value: 0, label: "U0" }, { value: 1, label: "U1" }, { value: 2, label: "U2" }]} />
        </div>
        <div className="py-1">
          <div className="mb-1 text-xs text-star-300">CCT cap</div>
          <Seg label="CCT cap" value={p.cct_cap ?? "none"} onChange={(v) => setParams({ cct_cap: v === "none" ? null : (v as SpdCode) })}
            options={[{ value: "none", label: "None" }, ...CCT_OPTIONS.map((c) => ({ value: c, label: CCT_LABEL[c] }))]} />
        </div>
        <Slider label="Intensity reduction" value={p.intensity.pct_reduction} min={0} max={50} step={5} unit="%"
          onChange={(v) => setParams({ intensity: { pct_reduction: v } })} />
        <Toggle label="Dimming curfew" checked={p.curfew.enabled} onChange={(v) => setParams({ curfew: { ...p.curfew, enabled: v } })}
          hint="Magnitudes are for the SQM window 01:00–04:00; the VIIRS readout uses the 01:30 overpass." />
        {p.curfew.enabled && (
          <div className="ml-6 space-y-1">
            <div className="flex gap-2 text-xs">
              <label className="flex items-center gap-1">Start <input type="time" value={p.curfew.start} onChange={(ev) => setParams({ curfew: { ...p.curfew, start: ev.target.value } })} className="rounded bg-ink-800 px-1" /></label>
              <label className="flex items-center gap-1">End <input type="time" value={p.curfew.end} onChange={(ev) => setParams({ curfew: { ...p.curfew, end: ev.target.value } })} className="rounded bg-ink-800 px-1" /></label>
            </div>
            <Slider label="Dim level" value={p.curfew.dim_level_pct} min={30} max={70} step={5} unit="%" onChange={(v) => setParams({ curfew: { ...p.curfew, dim_level_pct: v } })} />
            <Toggle label="Motion-only" checked={p.curfew.motion_only} onChange={(v) => setParams({ curfew: { ...p.curfew, motion_only: v } })}
              hint={`Modeled as ${e.seed.overlay.motion_only_equivalent_dim_pct.value}% output all night (design assumption).`} />
          </div>
        )}
      </Card>

      <Card title="3 · Dark-sky overlay zones" right={<span className="text-[11px] text-star-500">[LEVY-OVERLAY]</span>}>
        <p className="mb-1 text-[11px] text-star-500">LZ0 core: U0, narrow-band amber, motion-only. LZ1 buffer: U0, ≤ 2700K, {fmtInt(e.seed.overlay.lz1.lm_per_net_acre_cap)} lm/net acre cap (shown in the brief; parcel caps are not modeled in v2.0).</p>
        {[{ key: "RHO", name: "Rosemary Hill Observatory" }, { key: "CAV", name: "Chiefland Astronomy Village" }].map(({ key, name }) => {
          const o = ov(key);
          return (
            <div key={key} className="border-t border-ink-700 py-1 first:border-0">
              <Toggle label={name} checked={Boolean(o)} onChange={(v) => setOverlay(key, v ? {} : null)} />
              {o && (
                <div className="ml-6 flex flex-wrap items-center gap-2 text-xs text-star-300">
                  <span>LZ0</span>
                  <Seg label={`${key} LZ0 radius`} value={o.lz0_radius_mi} onChange={(v) => setOverlay(key, { lz0_radius_mi: v })} options={lz0Opts.map((r) => ({ value: r, label: `${r} mi` }))} />
                  <span>LZ1</span>
                  <Seg label={`${key} LZ1 radius`} value={o.lz1_radius_mi} onChange={(v) => setOverlay(key, { lz1_radius_mi: v })} options={lz1Opts.filter((r) => r > o.lz0_radius_mi).map((r) => ({ value: r, label: `${r} mi` }))} />
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card title="Viewing time">
        <Seg label="Viewing time" value={p.view_window} onChange={(v) => setParams({ view_window: v })}
          options={[{ value: "late", label: `Late night ${e.seed.engine.sqm_window_start}–${e.seed.engine.sqm_window_end}` },
            { value: "evening", label: `Evening ${e.seed.engine.evening_window_start}–${e.seed.engine.evening_window_end}` }]} />
        <p className="mt-1 text-[11px] text-star-500">
          Late night is the SQM window used for Bortle and certification. Evening is when star parties run and sports fields are lit
          (sports assumed on {String(e.seed.engine.sports_hours)}).
        </p>
      </Card>

      <Card title="4 · Growth baseline">
        <Toggle label="Extrapolate growth trend" checked={p.growth_baseline === "trend"} onChange={(v) => setParams({ growth_baseline: v ? "trend" : "hold_2024" })}
          hint={e.data_status.viirs.loaded ? "Per-cell VIIRS 2012–2024 trend." : "Proxy until VIIRS loads: housing-unit growth 2010→2020 by county subdivision (Census)."} />
        {p.growth_baseline === "trend" && (
          <Slider label="Years ahead" value={p.growth_years} min={1} max={10} unit=" yr" onChange={(v) => setParams({ growth_years: v })} />
        )}
      </Card>

      <Card title="Spectral view">
        <Seg label="Output band" value={mode} onChange={setMode} options={MODES} />
        <p className="mt-2 text-[11px] text-star-500">
          Magnitudes are always visual (V). Other bands change the delta map to that band's relative skyglow change.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-ink-800 p-2">Visual upward light<div className="text-base font-semibold">{fmtPct(m.viirs.visualPct)}</div></div>
          <div className="rounded bg-ink-800 p-2">VIIRS would record<div className="text-base font-semibold">{fmtPct(m.viirs.viirsPct)}</div></div>
        </div>
        <p className="mt-1 text-[11px] text-star-500">VIIRS is blind below ~500 nm, so it under-counts white-LED light (CF per [GIS-VIIRS]): an HPS→LED retrofit looks like a bigger drop from orbit than on the ground, and LED growth is under-counted. Alachua + Levy only.</p>
      </Card>
    </div>
  );
}
