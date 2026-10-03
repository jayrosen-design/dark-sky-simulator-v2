// Dark Sky Simulator UI: the shared primitives plus the simulator's own provenance badges.
import type { FixtureAccount } from "../engine/scenario";
import { fmtInt } from "../shared/ui";

export * from "../shared/ui";

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
