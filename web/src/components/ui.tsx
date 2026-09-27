import type { ReactNode } from "react";
import type { FixtureAccount } from "../engine/scenario";

export function Card({ title, children, right, id, highlight }: { title?: ReactNode; children: ReactNode; right?: ReactNode; id?: string; highlight?: boolean }) {
  return (
    <section id={id} className={`rounded-xl border bg-ink-900/80 p-3 ${highlight ? "border-amber-400 ring-2 ring-amber-400/40" : "border-ink-700"}`}>
      {title && (
        <header className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-star-100">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Slider({ label, value, min, max, step = 1, unit = "", onChange, hint }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="block py-1">
      <div className="flex justify-between text-xs text-star-300">
        <span>{label}</span>
        <span className="tabular-nums text-star-100">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(ev) => onChange(Number(ev.target.value))} className="w-full accent-amber-400" />
      {hint && <p className="text-[11px] text-star-500">{hint}</p>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-sm">
      <input type="checkbox" checked={checked} onChange={(ev) => onChange(ev.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-400" />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-star-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Seg<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1 text-xs ${o.value === value ? "bg-amber-400 text-ink-950" : "bg-ink-800 text-star-300 hover:bg-ink-700"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, id, highlight }: { label: string; value: ReactNode; sub?: ReactNode; id?: string; highlight?: boolean }) {
  return (
    <div id={id} className={`rounded-lg bg-ink-800/80 p-2 ${highlight ? "ring-2 ring-amber-400" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-star-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-star-100">{value}</div>
      {sub && <div className="text-[11px] text-star-500">{sub}</div>}
    </div>
  );
}

/** A-02: every output panel shows the fixture count and inventory confidence it was computed from. */
export function Basis({ acct, what = "Computed from" }: { acct: FixtureAccount; what?: string }) {
  return (
    <p className="mt-2 border-t border-ink-700 pt-2 text-[11px] text-star-500" data-testid="basis">
      {what} {fmtInt(acct.total)} modeled fixtures ({fmtInt(acct.public)} public, {fmtInt(acct.private)} private) ·
      inventory confidence {acct.confidence.toFixed(2)}
    </p>
  );
}

export function UncalibratedBadge({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-400"
      title="Skyglow values are uncalibrated projections from modeled light sources and literature coefficients; no sky-quality meter data has been used.">
      <span aria-hidden>●</span>{compact ? "Uncalibrated" : "Uncalibrated planning projection"}
    </span>
  );
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtUsd = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString("en-US")}`);
export const fmtPct = (n: number, d = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
