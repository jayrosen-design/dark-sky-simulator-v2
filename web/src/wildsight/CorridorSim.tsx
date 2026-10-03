// Corridor simulation, recreating the WildSight pitch site's "With WildSight / Today" run (index.html SIM_CONFIG):
// the same animals and cars on a stretch of the selected road, once without and once with WildSight units at the
// planned spacing. Outcome odds are WildSight's illustrative hypotheses, not measurements.
import { useEffect, useRef, useState } from "react";

const SIM = {
  pirRange: 17, wakeTime: 0.45, classifyTime: 0.9, redirectTuned: 0.82,
  beaconSlowRange: 75, beaconSpeed: 8, beaconSeconds: 10, reactWarned: 26, reactCold: 5, collideSpeed: 11,
  spawnEvery: [5.5, 8.5] as [number, number], animalSpeed: 1.6, brake: 0.7 * 9.81, accel: 2.0,
};
const STRETCH_M = 260, FIELD_M = 34, LANE_M = 3.6;

type Outcome = "hit" | "near" | "safe" | "redirected";
interface Animal { x: number; y: number; dir: 1 | -1; turned: boolean; detectedAt: number | null; done: Outcome | null; conflict: boolean; t: number }
interface Car { x: number; v: number; lane: 1 | -1 }
interface Unit { x: number; side: 1 | -1; beaconUntil: number }
interface Tally { hit: number; near: number; safe: number; redirected: number; detections: number }

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class World {
  t = 0; animals: Animal[] = []; cars: Car[] = []; units: Unit[] = []; tally: Tally = { hit: 0, near: 0, safe: 0, redirected: 0, detections: 0 };
  flashes: { x: number; y: number; kind: "hit" | "near"; until: number }[] = [];
  private spawnR: () => number; private behR: () => number; private nextAnimal = 2; private nextCar: Record<string, number> = { "1": 0, "-1": 1.5 };
  constructor(public wildsight: boolean, public mesh: boolean, public speed: number, public headway: number, spacing: number, seed: number) {
    this.spawnR = rng(seed); this.behR = rng(seed * 7 + 1);
    if (wildsight) for (const side of [1, -1] as const) for (let x = spacing / 2; x < STRETCH_M; x += spacing) this.units.push({ x, side, beaconUntil: -1 });
  }
  step(dt: number) {
    this.t += dt;
    const T = this.t;
    if (T >= this.nextAnimal) {
      const [a, b] = SIM.spawnEvery;
      this.nextAnimal = T + a + (b - a) * this.spawnR();
      const side = this.spawnR() < 0.5 ? 1 : -1;
      this.animals.push({ x: 40 + this.spawnR() * (STRETCH_M - 80), y: side * FIELD_M, dir: side === 1 ? -1 : 1, turned: false, detectedAt: null, done: null, conflict: false, t: T });
    }
    for (const lane of [1, -1] as const) {
      if (T >= this.nextCar[lane]) {
        this.nextCar[lane] = T + this.headway * (0.6 + 0.8 * this.spawnR());
        this.cars.push({ x: lane === 1 ? -10 : STRETCH_M + 10, v: this.speed, lane });
      }
    }
    // Units: wake on PIR, classify, then beacon (and tone) for 10 s; with the mesh, neighbours light up too.
    for (const a of this.animals) {
      if (!this.wildsight || a.done || a.detectedAt !== null) continue;
      const side = a.y > 0 ? 1 : -1;
      const u = this.units.find((q) => q.side === side && Math.hypot(q.x - a.x, (side * LANE_M) - a.y) < SIM.pirRange);
      if (u) a.detectedAt = T;
    }
    for (const a of this.animals) {
      if (!this.wildsight || a.done || a.detectedAt === null || a.turned) continue;
      if (T - a.detectedAt >= SIM.wakeTime + SIM.classifyTime && !(a as Animal & { acted?: boolean }).acted) {
        (a as Animal & { acted?: boolean }).acted = true;
        this.tally.detections++;
        const lit = this.units.filter((q) => Math.abs(q.x - a.x) < (this.mesh ? 120 : SIM.pirRange + 6));
        for (const q of lit) q.beaconUntil = T + SIM.beaconSeconds;
        if (Math.abs(a.y) > LANE_M && this.behR() < SIM.redirectTuned) { a.turned = true; a.dir = (a.dir * -1) as 1 | -1; }
      }
    }
    // Animals walk across (or back to the field once turned by the tone).
    for (const a of this.animals) {
      if (a.done) continue;
      a.y += a.dir * SIM.animalSpeed * dt;
      if (a.turned && Math.abs(a.y) > FIELD_M) { a.done = "redirected"; this.tally.redirected++; }
      else if (!a.turned && Math.abs(a.y) > FIELD_M && Math.sign(a.y) === a.dir) {
        // Reached the far field: a near miss was already counted when it happened.
        if (!a.conflict) this.tally.safe++;
        a.done = a.conflict ? "near" : "safe";
      }
    }
    // Cars: slow for a lit beacon ahead; brake for an animal in the lane once noticed (warned drivers notice sooner).
    for (const c of this.cars) {
      let vt = this.speed;
      const ahead = (x: number) => (x - c.x) * c.lane;
      const warned = this.units.some((q) => q.beaconUntil > T && ahead(q.x) > -4 && ahead(q.x) < SIM.beaconSlowRange);
      if (warned) vt = Math.min(vt, SIM.beaconSpeed);
      const laneY = -c.lane * LANE_M / 2;
      const notice = warned ? SIM.reactWarned : SIM.reactCold;
      for (const a of this.animals) {
        if (a.done || Math.abs(a.y - laneY) > 1.6) continue;
        const dx = ahead(a.x) - 2.2;
        if (dx > 0 && dx < notice) vt = 0;
        if (dx > -3.3 && dx < 0.6 && !a.conflict) {
          a.conflict = true;
          if (c.v > SIM.collideSpeed) { a.done = "hit"; this.tally.hit++; this.flashes.push({ x: a.x, y: a.y, kind: "hit", until: T + 1.3 }); }
          else { this.tally.near++; this.flashes.push({ x: a.x, y: a.y, kind: "near", until: T + 1.3 }); }
        }
      }
      c.v = vt < c.v ? Math.max(vt, c.v - SIM.brake * dt) : Math.min(vt, c.v + SIM.accel * dt);
      c.x += c.lane * c.v * dt;
    }
    this.cars = this.cars.filter((c) => c.x > -20 && c.x < STRETCH_M + 20);
    this.animals = this.animals.filter((a) => !a.done);
    this.flashes = this.flashes.filter((f) => f.until > T);
  }
}

function drawWorld(ctx: CanvasRenderingContext2D, w: World, W: number, H: number, trees: [number, number][]) {
  const k = W / STRETCH_M, cy = H / 2, Y = (y: number) => cy - y * k;
  ctx.fillStyle = "#0e1a14"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#16271d";
  for (const [x, y] of trees) { ctx.beginPath(); ctx.arc(x * k, Y(y), 2.2 * k, 0, 6.283); ctx.fill(); }
  ctx.fillStyle = "#1d2127"; ctx.fillRect(0, Y(LANE_M), W, 2 * LANE_M * k);
  ctx.strokeStyle = "#c9a227"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke(); ctx.setLineDash([]);
  for (const u of w.units) {
    const ux = u.x * k, uy = Y(u.side * LANE_M * 1.35);
    ctx.fillStyle = "rgba(95,214,196,0.10)"; ctx.beginPath(); ctx.arc(ux, uy, SIM.pirRange * k, u.side > 0 ? Math.PI : 0, u.side > 0 ? 2 * Math.PI : Math.PI); ctx.fill();
    const lit = u.beaconUntil > w.t && Math.floor(w.t * 3) % 2 === 0;
    ctx.fillStyle = lit ? "#ffb347" : "#5fd6c4"; ctx.fillRect(ux - 2, uy - 2, 4, 4);
    if (lit) { ctx.fillStyle = "rgba(255,179,71,0.35)"; ctx.beginPath(); ctx.arc(ux, uy, 7, 0, 6.283); ctx.fill(); }
  }
  for (const c of w.cars) {
    const x = c.x * k, y = Y(-c.lane * LANE_M / 2);
    ctx.fillStyle = "rgba(255,240,180,0.10)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c.lane * 60 * k, y - 10); ctx.lineTo(x + c.lane * 60 * k, y + 10); ctx.fill();
    ctx.fillStyle = c.v < SIM.beaconSpeed + 0.5 ? "#f6b44b" : "#dfe6f2"; ctx.fillRect(x - 2.25 * k, y - 0.9 * k, 4.5 * k, 1.8 * k);
  }
  for (const a of w.animals) {
    if (a.done) continue;
    ctx.fillStyle = a.turned ? "#8fe38f" : "#c78d52"; ctx.beginPath(); ctx.arc(a.x * k, Y(a.y), Math.max(2.2, 0.9 * k), 0, 6.283); ctx.fill();
  }
  for (const f of w.flashes) {
    ctx.strokeStyle = f.kind === "hit" ? "#ff5a4f" : "#ffd84a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x * k, Y(f.y), 9, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1;
  }
}

export default function CorridorSim({ mph, aadt, spacingM, roadName }: { mph: number; aadt: number; spacingM: number; roadName: string }) {
  const refA = useRef<HTMLCanvasElement>(null), refB = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const [mesh, setMesh] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [big, setBig] = useState(false);
  const [tallies, setTallies] = useState<[Tally, Tally] | null>(null);
  const speed = mph * 0.44704;
  // One direction's mean headway from AADT, compressed 6x (and kept between 3 and 14 s) so the run stays watchable.
  const headway = Math.min(14, Math.max(3, (2 * 86400) / Math.max(aadt, 200) / 6));

  useEffect(() => {
    const seed = 20260927;
    const today = new World(false, false, speed, headway, spacingM, seed), ws = new World(true, mesh, speed, headway, spacingM, seed);
    const tr = rng(99), trees: [number, number][] = Array.from({ length: 140 }, () => [tr() * STRETCH_M, (tr() < 0.5 ? 1 : -1) * (LANE_M * 2.2 + tr() * FIELD_M)]);
    let raf = 0, last = performance.now(), tick = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      if (playing) for (let s = 0; s < 2; s++) { today.step(dt / 2); ws.step(dt / 2); }
      for (const [cv, w] of [[refA.current, today], [refB.current, ws]] as const) {
        if (!cv) continue;
        const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio);
        if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
        const ctx = cv.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWorld(ctx, w, W, H, trees);
      }
      if (++tick % 15 === 0) setTallies([{ ...today.tally }, { ...ws.tally }]);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed, headway, spacingM, mesh, playing]);

  const row = (label: string, t: Tally | undefined, good: boolean) => (
    <div className="flex flex-wrap gap-x-3 text-[10px]">
      <b className={good ? "text-glow-400" : "text-red-300"}>{label}</b>
      <span>collisions <b className="tabular-nums text-red-300">{t?.hit ?? 0}</b></span>
      <span>near misses <b className="tabular-nums text-amber-300">{t?.near ?? 0}</b></span>
      <span>safe crossings <b className="tabular-nums">{t?.safe ?? 0}</b></span>
      {good && <><span>detections <b className="tabular-nums">{t?.detections ?? 0}</b></span><span>turned by tone <b className="tabular-nums text-glow-400">{t?.redirected ?? 0}</b></span></>}
    </div>
  );
  return (
    <div ref={box} className={big ? "fixed inset-4 z-50 flex flex-col rounded-xl border border-ink-600 bg-ink-950 p-3 shadow-2xl" : ""}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-star-100">{roadName || "Selected road"} · {Math.round(mph)} mph · {Math.round(aadt).toLocaleString("en-US")} veh/day</span>
        <button onClick={() => setPlaying(!playing)} className="ml-auto rounded bg-ink-800 px-2 py-0.5 hover:bg-ink-700">{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <label className="flex items-center gap-1"><input type="checkbox" className="accent-amber-400" checked={mesh} onChange={(ev) => setMesh(ev.target.checked)} /> Corridor mesh</label>
        <button onClick={() => setBig(!big)} className="rounded bg-ink-800 px-2 py-0.5 hover:bg-ink-700">{big ? "✕ Close" : "⛶ Expand"}</button>
      </div>
      <div className={`grid gap-1 ${big ? "flex-1 grid-rows-2" : ""}`}>
        <div>{row("Today", tallies?.[0], false)}<canvas ref={refA} className={`w-full rounded ${big ? "h-full min-h-40" : "h-24"}`} aria-label="Simulation without WildSight" /></div>
        <div>{row("With WildSight", tallies?.[1], true)}<canvas ref={refB} className={`w-full rounded ${big ? "h-full min-h-40" : "h-24"}`} aria-label="Simulation with WildSight" /></div>
      </div>
      <p className="mt-1 text-[10px] text-star-500">
        {STRETCH_M} m of road; teal squares = WildSight units every {spacingM} m with their 17 m motion zones, amber = beacon flashing; brown = animal, green = turned by the tone; cars slow (amber) for a lit beacon.
        Same animals and cars in both runs; traffic compressed 6x. Wake 0.45 s, classify 0.9 s, 82% turn rate for a species-tuned tone, warned drivers notice an animal at 26 m instead of 5 m: WildSight's illustrative hypotheses (SIM_CONFIG), to be replaced by pilot data.
      </p>
    </div>
  );
}
