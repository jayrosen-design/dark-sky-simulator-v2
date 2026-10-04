// Moving people and vehicles for the Activity tab: an illustration driven by the same hourly flows as the
// impressions model (traffic counts by hour on streets; the modeled walking/biking flow on streets and paths),
// sampled near the view with a seeded random stream. Dots brighten while an artwork is in view. The numbers on
// screen come from engine/impressions.ts, not from these dots.
import type { Cells, Seed } from "./types";
import { cellIndex, type RoadIndex } from "./engine/impressions";

export interface Agent { piece: number; s: number; dir: 1 | -1; speed: number; kind: 0 | 1 }   // kind 0 vehicle, 1 person
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Crowd {
  agents: Agent[] = [];
  private rnd = mulberry32(20261003);
  private pool: { k: number; w: number; len: number; kind: 0 | 1; speed: number }[] = [];
  private cum: number[][] = [[], []];

  constructor(private roads: RoadIndex, private cells: Cells, private seed: Seed) {}

  /** Rebuild the spawn pool for the pieces near (x, y) metres at local hour h, then (re)spawn agents. */
  reset(x: number, y: number, radius: number, hour: number) {
    const I = this.seed.impressions, P = I.hourly_ped.value, hv = I.hourly_vehicle.value[hour];
    this.pool = [];
    let veh = 0, ppl = 0;
    for (const k of this.roads.near(x, y, radius)) {
      const p = this.roads.pieces[k], s = this.roads.sampleOf(k), len = (s.length / 2) * 10;
      if (len < 10) continue;
      if (p.cls < 8 && p.aadt > 0) {
        const w = p.aadt * hv * len / (p.mph * 0.44704);           // vehicle-seconds on the piece this hour
        this.pool.push({ k, w, len, kind: 0, speed: p.mph * 0.44704 }); veh += w;
      }
      if (p.cls > 1) {
        const lon = this.roads.f.west + s[0] / this.roads.f.kx, lat = this.roads.f.south + s[1] / this.roads.f.ky;
        const ci = cellIndex(this.cells, lon, lat), C = this.cells.cols;
        if (ci < 0) continue;
        const mix = [C.mix_commute[ci], C.mix_midday[ci], C.mix_night[ci]], ms = mix[0] + mix[1] + mix[2] || 1;
        const share = (mix[0] * P.commute[hour] + mix[1] * P.midday[hour] + mix[2] * P.night[hour]) / ms;
        const w = C.ped[ci] * share * len / 1.4 / 100;                // person-seconds, scaled per 100 m of street in a 100 m cell
        if (w > 0) { this.pool.push({ k, w, len, kind: 1, speed: 1.4 }); ppl += w; }
      }
    }
    for (const kind of [0, 1] as const) {
      let c = 0;
      this.cum[kind] = this.pool.map((q) => (c += q.kind === kind ? q.w : 0));
    }
    // One dot per ~15 vehicles or ~3 people present on average this hour, capped for speed.
    const nVeh = Math.min(500, Math.round(veh / 3600 / 15)), nPpl = Math.min(500, Math.round(ppl / 3600 / 3));
    this.agents = [...Array(nVeh)].map(() => this.spawn(0)).concat([...Array(nPpl)].map(() => this.spawn(1))).filter((a): a is Agent => !!a);
  }

  private spawn(kind: 0 | 1): Agent | null {
    const cum = this.cum[kind], total = cum[cum.length - 1] ?? 0;
    if (!total) return null;
    const r = this.rnd() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const q = this.pool[lo];
    const jitter = kind === 1 ? 0.6 + this.rnd() * 0.8 : 0.85 + this.rnd() * 0.3;
    return { piece: q.k, s: this.rnd() * q.len, dir: this.rnd() < 0.5 ? 1 : -1, speed: q.speed * jitter * (kind === 1 && this.rnd() < 0.25 ? 3 : 1), kind };
  }

  /** Advance dt seconds (simulation time) and return positions in metres. */
  step(dt: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    this.agents = this.agents.map((a) => {
      const s = this.roads.sampleOf(a.piece), len = (s.length / 2) * 10;
      a.s += a.dir * a.speed * dt;
      if (a.s < 0 || a.s > len) return this.spawn(a.kind) ?? a;
      const i = Math.min(s.length / 2 - 1, Math.max(0, Math.floor(a.s / 10)));
      out.push([s[2 * i], s[2 * i + 1], a.kind]);
      return a;
    });
    return out;
  }
}
