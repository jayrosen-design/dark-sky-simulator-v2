// Everything the panels, KPI strip and brief derive from the data package and the scenario, memoised per input.
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { skyState, zonedToUtc } from "../shared/sky";
import { GNV_CENTER } from "./constants";
import { conservation } from "./engine/conservation";
import { induced, type Econ } from "./engine/economics";
import { coverage, type Equity } from "./engine/equity";
import { impressions, PointIndex, RoadIndex, type Ctx, type Frame, type Impressions } from "./engine/impressions";
import { ledger, type Ledger } from "./engine/ledger";
import { proposalArt, usePaps } from "./state";
import type { Artwork, BgProps, Pkg } from "./types";

const FT500 = 152.4;
const ctxCache = new WeakMap<Pkg, { ctx: Ctx; shops: PointIndex; frame: Frame; bgs: BgProps[] }>();

export function contextOf(data: Pkg) {
  let c = ctxCache.get(data);
  if (!c) {
    const g = data.cells.grid, frame: Frame = { west: g.west, south: g.south, kx: g.kx, ky: g.ky };
    const shopCats = new Set(["food", "night", "retail"].map((k) => data.pois.cats.indexOf(k)));
    c = { frame, ctx: { seed: data.meta.seed, roads: new RoadIndex(data.roads, frame), cells: data.cells, lamps: new PointIndex(data.streetlights, frame) },
      shops: new PointIndex(data.pois.rows.filter((r) => shopCats.has(r[2])).map((r) => [r[0], r[1]] as [number, number]), frame),
      bgs: data.equity.features.map((f) => f.properties as BgProps) };
    ctxCache.set(data, c);
  }
  return c;
}

/** Sun altitude at the middle of each local hour of a date (Gainesville). */
export function sunByHour(y: number, mo: number, d: number) {
  return Array.from({ length: 24 }, (_, h) => skyState(zonedToUtc(y, mo, d, h * 60 + 30), GNV_CENTER[1], GNV_CENTER[0]).sun.alt);
}

/** City-owned or City-entrusted works, the ones a City Conservation Reserve maintains. */
export const cityOwned = (a: Artwork) => a.provenance === "municipal" || a.provenance === "cra" || a.provenance === "proposed";

export interface Model {
  data: Pkg; arts: Artwork[]; existing: Artwork[]; proposals: Artwork[]; imp: Map<string, Impressions>;
  led: Ledger; led89: Ledger; cons: ReturnType<typeof conservation>; cons89: ReturnType<typeof conservation>;
  eq: Equity; eqBase: Equity; econ: Map<string, Econ>;
  kpi: { capital: number; capital89: number; reserve: number; shortfall: number; dvi: number; dviProposed: number; visitorRevenue: number;
    localTarget: number; localShare: number | null; eastCoverage: number; eastParity: number };
}

export function useModel(): Model | null {
  const { data, policy, econ, proposals, showPlanned, date, localTarget } = usePaps(useShallow((s) => ({
    data: s.data, policy: s.policy, econ: s.econ, proposals: s.proposals, showPlanned: s.showPlanned, date: s.date, localTarget: s.localTarget })));
  const sun = useMemo(() => sunByHour(date.y, date.mo, date.d), [date.y, date.mo, date.d]);
  const base = useMemo(() => data ? data.art.filter((a) => a.status === "existing" || (showPlanned && a.status === "planned")) : [], [data, showPlanned]);
  const props = useMemo(() => proposals.map(proposalArt), [proposals]);
  const arts = useMemo(() => [...base, ...props], [base, props]);
  const imp = useMemo(() => {
    const m = new Map<string, Impressions>();
    if (data) { const { ctx } = contextOf(data); for (const a of arts) m.set(a.id, impressions(a, ctx, sun)); }
    return m;
  }, [data, arts, sun]);
  const leds = useMemo(() => data && policy ? [ledger(data.cip.projects, policy, data.meta.seed, data.cpi.monthly),
    ledger(data.cip.projects, { ...policy, code: "1989" }, data.meta.seed, data.cpi.monthly)] : null, [data, policy]);
  const cons = useMemo(() => {
    if (!data || !leds) return null;
    const owned = arts.filter(cityOwned);
    return [conservation(owned, data.meta.seed, leds[0].fys, leds[0].years.map((y) => y.reserveIn)),
      conservation(owned, data.meta.seed, leds[1].fys, leds[1].years.map((y) => y.reserveIn))];
  }, [data, leds, arts]);
  const eqs = useMemo(() => {
    if (!data) return null;
    const { frame, bgs } = contextOf(data);
    return [coverage(data.blocks, bgs, arts, data.meta.seed, frame), coverage(data.blocks, bgs, base, data.meta.seed, frame)];
  }, [data, arts, base]);
  const ec = useMemo(() => {
    const m = new Map<string, Econ>();
    if (!data || !econ) return m;
    const { shops, ctx } = contextOf(data);
    for (const a of arts) {
      const i = imp.get(a.id);
      if (!i) continue;
      const [x, y] = [(a.lon - ctx.roads.f.west) * ctx.roads.f.kx, (a.lat - ctx.roads.f.south) * ctx.roads.f.ky];
      m.set(a.id, induced(i.stops, a.scale, shops.count(x, y, FT500), data.meta.seed, econ));
    }
    return m;
  }, [data, econ, arts, imp]);
  if (!data || !leds || !cons || !eqs || !policy) return null;
  const [led, led89] = leds, [eq, eqBase] = eqs;
  const known = data.art.filter((a) => a.artist_local === true || a.artist_local === false);
  const dvi = arts.reduce((s, a) => s + (imp.get(a.id)?.dvi ?? 0), 0);
  const dviProposed = props.reduce((s, a) => s + (imp.get(a.id)?.dvi ?? 0), 0);
  return {
    data, arts, existing: base, proposals: props, imp, led, led89, cons: cons[0], cons89: cons[1], eq, eqBase, econ: ec,
    kpi: {
      capital: led.totals.alloc, capital89: led89.totals.alloc, reserve: policy.code === "draft" ? cons[0].endBalance : 0,
      shortfall: policy.code === "draft" ? cons[0].totalShortfall : cons[1].totalShortfall, dvi, dviProposed,
      visitorRevenue: props.reduce((s, a) => s + (ec.get(a.id)?.spending ?? 0), 0), localTarget,
      localShare: known.length ? known.filter((a) => a.artist_local).length / known.length : null,
      eastCoverage: eq.east.share, eastParity: eq.parity,
    },
  };
}
