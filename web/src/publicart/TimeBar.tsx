// Date and time of day for the 3D lighting and the activity model, with Sun-based presets for the chosen date
// (dawn, midday, golden hour, dusk, night), computed from the shared astronomy code at Gainesville.
import { useMemo } from "react";
import { skyState, zonedToUtc } from "../shared/sky";
import { usePaps } from "./state";
import { GNV_CENTER } from "./constants";

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Minutes after local midnight when the Sun crosses `alt` (rising or setting) on a date, scanning in 5-min steps. */
export function sunCrossing(y: number, mo: number, d: number, alt: number, rising: boolean) {
  let prev = skyState(zonedToUtc(y, mo, d, 0), GNV_CENTER[1], GNV_CENTER[0]).sun.alt;
  for (let m = 5; m < 1440; m += 5) {
    const a = skyState(zonedToUtc(y, mo, d, m), GNV_CENTER[1], GNV_CENTER[0]).sun.alt;
    if (rising ? prev < alt && a >= alt : prev > alt && a <= alt) return m;
    prev = a;
  }
  return null;
}

export function dayPresets(y: number, mo: number, d: number) {
  let noon = 720, best = -90;
  for (let m = 600; m <= 900; m += 5) {
    const a = skyState(zonedToUtc(y, mo, d, m), GNV_CENTER[1], GNV_CENTER[0]).sun.alt;
    if (a > best) { best = a; noon = m; }
  }
  return [
    { label: "Dawn", minutes: sunCrossing(y, mo, d, -0.83, true) ?? 420 },
    { label: "Midday", minutes: noon },
    { label: "Golden hour", minutes: sunCrossing(y, mo, d, 6, false) ?? 1080 },
    { label: "Dusk", minutes: sunCrossing(y, mo, d, -3, false) ?? 1170 },
    { label: "Night", minutes: 21 * 60 + 30 },
  ];
}

export default function TimeBar() {
  const { date, minutes, setTime } = usePaps();
  const presets = useMemo(() => dayPresets(date.y, date.mo, date.d), [date.y, date.mo, date.d]);
  const iso = `${date.y}-${String(date.mo).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  return (
    <div className="pointer-events-auto rounded-lg bg-ink-950/85 px-3 py-2 text-xs text-star-300 backdrop-blur" role="group" aria-label="Date and time of day">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={iso} aria-label="Date"
          onChange={(ev) => { const [y, mo, d] = ev.target.value.split("-").map(Number); if (y) setTime({ y, mo, d }, minutes); }}
          className="rounded bg-ink-800 px-1 py-0.5 text-star-100 [color-scheme:dark]" />
        <span className="w-12 tabular-nums text-sm font-semibold text-star-100">{fmt(minutes)}</span>
        {presets.map((p) => (
          <button key={p.label} onClick={() => setTime(date, p.minutes)}
            className={`rounded px-1.5 py-0.5 ${Math.abs(p.minutes - minutes) < 3 ? "bg-[#b79cff] text-ink-950" : "bg-ink-800 hover:bg-ink-700"}`}>{p.label}</button>
        ))}
      </div>
      <input type="range" min={0} max={1435} step={5} value={minutes} aria-label="Time of day"
        onChange={(ev) => setTime(date, Number(ev.target.value))} className="mt-1 w-full accent-[#b79cff]" />
    </div>
  );
}
