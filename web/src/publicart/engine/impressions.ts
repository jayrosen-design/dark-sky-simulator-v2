// Daily visual impressions (TRD Module 2) for an artwork, hour by hour. Vehicles: every street in the view radius
// contributes AADT x hourly share x occupancy x P(glance), with P(glance) = 1 - exp(-t / tau) for t seconds of exposure
// (its visible length / speed, over all its pieces, so a car is counted once); one-sided murals count only streets
// in front of the painted face.
// People on foot or bike: the modeled flow at the site (publicart/build.py, fitted to the City's counters) x a
// view-radius factor, split by hour with commute / daytime / nightlife profiles mixed by the local destinations.
// After dark a lit work keeps most of its visibility; an unlit one depends on streetlights within 40 m.
// Same formulas as the pipeline's placement heatmap. Planning estimates; assumptions in seed.yaml.
// Works inside buildings, or not yet checked (see registry_paa.yaml), are not seen from the street: no impressions.
import type { Artwork, Cells, RoadPiece, Scale, Seed } from "../types";

/** Outdoor works are the ones passers-by see (proposals and the hand-compiled registry have no setting: outdoor). */
export const isOutdoor = (a: Pick<Artwork, "setting">) => !a.setting || a.setting === "outdoor";

const SAMPLE_M = 10;
const BUCKET_M = 250;

export interface Frame { west: number; south: number; kx: number; ky: number }
export const toM = (f: Frame, lon: number, lat: number): [number, number] => [(lon - f.west) * f.kx, (lat - f.south) * f.ky];

/** Street pieces bucketed on a 250 m grid with lazily computed 10 m sample points (local metres). */
export class RoadIndex {
  private buckets = new Map<number, number[]>();
  private samples: (Float64Array | null)[];
  constructor(public pieces: RoadPiece[], public f: Frame) {
    this.samples = pieces.map(() => null);
    pieces.forEach((p, k) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [lon, lat] of p.coords) { const [x, y] = toM(f, lon, lat); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      for (let bx = Math.floor(x0 / BUCKET_M); bx <= Math.floor(x1 / BUCKET_M); bx++)
        for (let by = Math.floor(y0 / BUCKET_M); by <= Math.floor(y1 / BUCKET_M); by++) {
          const key = bx * 100000 + by;
          (this.buckets.get(key) ?? this.buckets.set(key, []).get(key)!).push(k);
        }
    });
  }
  near(x: number, y: number, r: number) {
    const out = new Set<number>();
    for (let bx = Math.floor((x - r) / BUCKET_M); bx <= Math.floor((x + r) / BUCKET_M); bx++)
      for (let by = Math.floor((y - r) / BUCKET_M); by <= Math.floor((y + r) / BUCKET_M); by++)
        for (const k of this.buckets.get(bx * 100000 + by) ?? []) out.add(k);
    return [...out];
  }
  sampleOf(k: number) {
    const cached = this.samples[k];
    if (cached) return cached;
    // Points at 5, 15, 25 ... m along the whole piece (as publicart/build.py samples it).
    const pts = this.pieces[k].coords.map(([lon, lat]) => toM(this.f, lon, lat));
    const out: number[] = [];
    let i = 0, start = 0;
    for (let s = SAMPLE_M / 2; ; s += SAMPLE_M) {
      while (i + 1 < pts.length && start + Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) < s) {
        start += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        i++;
      }
      if (i + 1 >= pts.length) break;
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], d = Math.hypot(bx - ax, by - ay), f = d > 0 ? (s - start) / d : 0;
      out.push(ax + (bx - ax) * f, ay + (by - ay) * f);
    }
    return (this.samples[k] = Float64Array.from(out));
  }
}

/** Points (e.g. streetlights) bucketed for radius counts. */
export class PointIndex {
  private buckets = new Map<number, [number, number][]>();
  constructor(pts: [number, number][], public f: Frame) {
    for (const [lon, lat] of pts) {
      const [x, y] = toM(f, lon, lat), key = Math.floor(x / BUCKET_M) * 100000 + Math.floor(y / BUCKET_M);
      (this.buckets.get(key) ?? this.buckets.set(key, []).get(key)!).push([x, y]);
    }
  }
  count(x: number, y: number, r: number) {
    let n = 0;
    for (let bx = Math.floor((x - r) / BUCKET_M); bx <= Math.floor((x + r) / BUCKET_M); bx++)
      for (let by = Math.floor((y - r) / BUCKET_M); by <= Math.floor((y + r) / BUCKET_M); by++)
        for (const [px, py] of this.buckets.get(bx * 100000 + by) ?? []) if (Math.hypot(px - x, py - y) <= r) n++;
    return n;
  }
}

export function cellIndex(c: Cells, lon: number, lat: number) {
  const g = c.grid, ix = Math.floor(((lon - g.west) * g.kx) / g.res_m), iy = g.ny - 1 - Math.floor(((lat - g.south) * g.ky) / g.res_m);
  return ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny ? -1 : iy * g.nx + ix;
}

export const viewRadius = (seed: Seed, scale: Scale) => seed.impressions.view_radius_m.value[scale];

export function attraction(a: Pick<Artwork, "scale" | "lit" | "seating" | "interactive">, seed: Seed) {
  const A = seed.impressions.attraction.value;
  return Math.min(1, A.scale[a.scale] + (a.lit ? A.lit : 0) + (a.seating ? A.seating : 0) + (a.interactive ? A.interactive : 0));
}

/** Share of daytime visibility at a Sun altitude (degrees): 1 in daylight, the night value below -6 degrees. */
export function nightFactor(sunAlt: number, night: number) {
  if (sunAlt >= -0.83) return 1;
  if (sunAlt <= -6) return night;
  return night + (1 - night) * ((sunAlt + 6) / (6 - 0.83));
}

export interface Ctx { seed: Seed; roads: RoadIndex; cells: Cells; lamps: PointIndex }

/** Pieces of one named street (both carriageways of a divided road) form one traffic stream; unnamed pieces stand alone. */
export const streamKey = (p: RoadPiece, k: number) => (p.name ? `${p.name}|${p.cls <= 1 ? "hwy" : p.cls}` : `#${k}`);

export interface Impressions {
  veh: number[]; ped: number[]; total: number[]; dvi: number; vehDaily: number; pedDaily: number;
  stops: number; dwellMin: number; attraction: number; night: number; lamps: number; radius: number; streetPieces: number;
}

/** Impressions by hour for a date given the Sun's altitude at the middle of each local hour (24 values). */
export function impressions(a: Artwork, ctx: Ctx, sunAlt: number[]): Impressions {
  const { seed, roads, cells } = ctx, I = seed.impressions;
  if (!isOutdoor(a)) {
    const z = new Array(24).fill(0);
    return { veh: z, ped: z, total: z, dvi: 0, vehDaily: 0, pedDaily: 0, stops: 0, dwellMin: 0, attraction: 0, night: 1, lamps: 0, radius: 0, streetPieces: 0 };
  }
  const R = viewRadius(seed, a.scale), tau = I.glance_tau_s.value, occ = I.vehicle_occupancy.value, sal = I.salience.value[a.type];
  const [x, y] = toM(roads.f, a.lon, a.lat);
  const oneSided = a.type === "mural";
  const b = (a.bearing * Math.PI) / 180, fx = Math.sin(b), fy = Math.cos(b);
  // Vehicles: a street is one stream of traffic however many pieces (or one-way carriageways) it is mapped as, so the
  // exposure seconds of all its pieces in view add up and its traffic counts once (the largest AADT among them).
  const streams = new Map<string, { aadt: number; t: number; n: number; face: number }>();
  let pieces = 0;
  for (const k of roads.near(x, y, R)) {
    const p = roads.pieces[k];
    if (p.cls >= 8 || p.aadt <= 0) continue;
    const s = roads.sampleOf(k);
    let n = 0, face = 0;
    for (let i = 0; i < s.length; i += 2) {
      const dx = s[i] - x, dy = s[i + 1] - y, d = Math.hypot(dx, dy);
      if (d > R) continue;
      n++;
      face += oneSided ? Math.max(0, d > 0 ? (dx * fx + dy * fy) / d : 1) : 1;
    }
    if (!n) continue;
    pieces++;
    const key = streamKey(p, k), st = streams.get(key) ?? { aadt: 0, t: 0, n: 0, face: 0 };
    st.aadt = Math.max(st.aadt, p.aadt); st.t += (n * SAMPLE_M) / Math.max(0.5, p.mph * 0.44704); st.n += n; st.face += face;
    streams.set(key, st);
  }
  let vehDaily = 0;
  for (const st of streams.values()) vehDaily += st.aadt * occ * (1 - Math.exp(-st.t / tau)) * (st.face / st.n) * sal;
  // People on foot or bike at the site.
  const ci = cellIndex(cells, a.lon, a.lat), C = cells.cols;
  const kr = I.ped_radius_factor.value, kR = Math.min(kr.max, Math.max(kr.min, R * kr.per_m));
  const pedDaily = (ci >= 0 ? C.ped[ci] : 0) * kR * sal * (oneSided ? 0.5 : 1);
  const mix = ci >= 0 ? [C.mix_commute[ci], C.mix_midday[ci], C.mix_night[ci]] : [100, 0, 0];
  const ms = mix[0] + mix[1] + mix[2] || 1, P = I.hourly_ped.value;
  // Night visibility.
  const N = I.night.value, lamps = ctx.lamps.count(x, y, N.lamp_radius_m);
  const night = a.lit ? N.lit : Math.min(N.lamp_cap, N.unlit + N.per_lamp * lamps);
  const veh: number[] = [], ped: number[] = [], total: number[] = [];
  for (let h = 0; h < 24; h++) {
    const nf = nightFactor(sunAlt[h], night);
    veh.push(vehDaily * I.hourly_vehicle.value[h] * nf);
    ped.push(pedDaily * ((mix[0] * P.commute[h] + mix[1] * P.midday[h] + mix[2] * P.night[h]) / ms) * nf);
    total.push(veh[h] + ped[h]);
  }
  const A = attraction(a, seed);
  const pedSeen = ped.reduce((s, v) => s + v, 0);
  const stops = pedSeen * I.stop_probability.value * A;
  return { veh, ped, total, dvi: total.reduce((s, v) => s + v, 0), vehDaily, pedDaily, stops, dwellMin: stops * I.dwell_minutes.value * (1 + A),
    attraction: A, night, lamps, radius: R, streetPieces: pieces };
}
