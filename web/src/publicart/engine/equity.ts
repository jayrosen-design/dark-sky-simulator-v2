// Spatial equity (draft Sec. 5.5-4(1)(e): geographic distribution, access): share of residents within a half-mile
// walk of a public artwork, citywide, in low-income block groups and in East Gainesville, and a gap ranking that
// suggests where pooled funds would reach the most uncovered residents (weighting low-income and East Gainesville
// blocks) at places people pass. Straight-line distance stands in for the walk. Planning estimates.
import type { BgProps, Block, Cells, Seed } from "../types";
import { toM, type Frame } from "./impressions";

export interface Cov { pop: number; covered: number; share: number }
export interface Equity { city: Cov; east: Cov; low: Cov; parity: number; covered: Uint8Array }

const cov = (): Cov => ({ pop: 0, covered: 0, share: 0 });

export function coverage(blocks: Block[], bgs: BgProps[], arts: { lon: number; lat: number }[], seed: Seed, f: Frame): Equity {
  const r = seed.equity.walk_radius_m.value;
  const pts = arts.map((a) => toM(f, a.lon, a.lat));
  const covered = new Uint8Array(blocks.length);
  const city = cov(), east = cov(), low = cov();
  blocks.forEach((b, i) => {
    const g = b.bg >= 0 ? bgs[b.bg] : null;
    if (!g || !g.in_city) return;
    const [x, y] = toM(f, b.lon, b.lat);
    const c = pts.some(([px, py]) => Math.abs(px - x) <= r && Math.abs(py - y) <= r && Math.hypot(px - x, py - y) <= r);
    covered[i] = c ? 1 : 0;
    for (const [grp, on] of [[city, true], [east, g.east], [low, g.low_income]] as const) {
      if (!on) continue;
      grp.pop += b.pop;
      if (c) grp.covered += b.pop;
    }
  });
  for (const g of [city, east, low]) g.share = g.pop ? g.covered / g.pop : 0;
  return { city, east, low, parity: city.share ? east.share / city.share : 0, covered };
}

export interface Suggestion { lon: number; lat: number; gain: number; vis: number; score: number }

/** Greedy picks of k places (at least one walk radius apart) maximizing weighted uncovered residents and visibility. */
export function suggestSites(cells: Cells, blocks: Block[], bgs: BgProps[], covered: Uint8Array, seed: Seed, k: number, wVis = 0.35): Suggestion[] {
  const g = cells.grid, C = cells.cols, r = seed.equity.walk_radius_m.value;
  const wl = seed.equity.gap_weight_low_income.value, we = seed.equity.gap_weight_east.value;
  const f: Frame = { west: g.west, south: g.south, kx: g.kx, ky: g.ky };
  const B = 400, buckets = new Map<number, number[]>();
  const bxy = blocks.map((b) => toM(f, b.lon, b.lat));
  const weight = blocks.map((b) => { const bg = b.bg >= 0 ? bgs[b.bg] : null; return bg?.in_city ? b.pop * (1 + (bg.low_income ? wl : 0) + (bg.east ? we : 0)) : 0; });
  blocks.forEach((_, i) => { if (!weight[i]) return; const key = Math.floor(bxy[i][0] / B) * 100000 + Math.floor(bxy[i][1] / B); (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(i); });
  const done = Uint8Array.from(covered);
  const cand: { i: number; x: number; y: number; vis: number }[] = [];
  for (let i = 0; i < C.ped.length; i++) {
    if (!(C.flags[i] & 1) || C.walk_m[i] <= 0) continue;
    const ix = i % g.nx, iy = Math.floor(i / g.nx);
    cand.push({ i, x: (ix + 0.5) * g.res_m, y: (g.ny - iy - 0.5) * g.res_m, vis: C.veh_ref[i] + C.ped_ref[i] });
  }
  const maxVis = Math.log1p(Math.max(1, ...cand.map((c) => c.vis)));
  const gain = (x: number, y: number) => {
    let s = 0;
    for (let bx = Math.floor((x - r) / B); bx <= Math.floor((x + r) / B); bx++)
      for (let by = Math.floor((y - r) / B); by <= Math.floor((y + r) / B); by++)
        for (const j of buckets.get(bx * 100000 + by) ?? []) if (!done[j] && Math.hypot(bxy[j][0] - x, bxy[j][1] - y) <= r) s += weight[j];
    return s;
  };
  const picks: Suggestion[] = [];
  for (let n = 0; n < k; n++) {
    let best: { c: (typeof cand)[number]; gain: number; score: number } | null = null;
    const gains = cand.map((c) => gain(c.x, c.y));
    const maxGain = Math.max(1, ...gains);
    cand.forEach((c, j) => {
      if (picks.some((p) => Math.hypot(toM(f, p.lon, p.lat)[0] - c.x, toM(f, p.lon, p.lat)[1] - c.y) < r)) return;
      const score = (1 - wVis) * (gains[j] / maxGain) + wVis * (Math.log1p(c.vis) / maxVis);
      if (!best || score > best.score) best = { c, gain: gains[j], score };
    });
    if (!best) break;
    const { c, gain: gn, score } = best as { c: (typeof cand)[number]; gain: number; score: number };
    picks.push({ lon: g.west + c.x / g.kx, lat: g.south + c.y / g.ky, gain: gn, vis: c.vis, score });
    blocks.forEach((_, j) => { if (Math.hypot(bxy[j][0] - c.x, bxy[j][1] - c.y) <= r) done[j] = 1; });
  }
  return picks;
}
