// Traffic Insights: WildSight deployment sizing, costs and benefits on the modeled road network. Pure functions.
// Segment risk is the pipeline's Empirical Bayes estimate of reported animal crashes per year (pipeline/wildsight.py).

export interface SeedValue<T = number> { value: T; low?: number; high?: number; options?: number[]; provenance: string }
export interface WsMeta {
  classes: string[]; groups: string[]; years: [number, number]; counties: Record<string, string>;
  network_km: number; network_km_by_class: Record<string, number>; aadt_fdot_share_km: number;
  crashes: { bbox: number; eight_counties: number; on_network: number; by_year: Record<string, number>; by_group: Record<string, number> };
  model: { form: string; coefficients: Record<string, number>; alpha: number; converged: boolean; eb_total_per_year: number };
  backtest: { train: [number, number]; test: [number, number]; share_of_test_crashes_on_top_miles: Record<string, Record<string, number>> };
  seed: {
    device: Record<string, SeedValue>; network: Record<string, SeedValue>; costs: Record<string, SeedValue>;
    benefits: Record<string, SeedValue>; sources: Record<string, string>;
  };
}

export interface Segment {
  id: number; cls: number; name: string; km: number; mph: number; lanes: number; aadt: number; aadtFdot: boolean;
  habitat: number; conservation: boolean; hotspot: number; crashes: number; groups: number[]; eb: number;
  county: string; coords: [number, number][]; risk: number; twoLane: boolean;
}

export const KM_PER_MI = 1.609344;

export function parseRoads(json: { cols: string[]; rows: unknown[][] }, countyFips: string[], classes: string[]): Segment[] {
  const c = Object.fromEntries(json.cols.map((k, i) => [k, i]));
  return json.rows.map((r, id) => {
    const flat = r[c.coords] as number[], coords: [number, number][] = [];
    for (let k = 0; k + 1 < flat.length; k += 2) coords.push([flat[k], flat[k + 1]]);
    const km = r[c.km] as number, eb = r[c.eb_per_year] as number, cls = r[c.cls] as number, lanes = r[c.lanes] as number;
    return {
      id, cls, name: r[c.name] as string, km, mph: r[c.mph] as number, lanes, aadt: r[c.aadt] as number, aadtFdot: r[c.aadt_fdot] === 1,
      habitat: r[c.habitat] as number, conservation: r[c.conservation] === 1, hotspot: r[c.hotspot] as number, crashes: r[c.crashes] as number,
      groups: r[c.groups] as number[], eb, county: countyFips[r[c.county] as number], coords,
      risk: km > 0 ? eb / (km / KM_PER_MI) : 0,       // expected reported crashes per mile per year
      twoLane: classes[cls] !== "motorway" && lanes <= 2,
    };
  });
}

export interface DeployParams {
  strategy: "top_miles" | "hotspots" | "all";
  miles: number;                 // top_miles: deploy on the riskiest miles, up to this many
  hotspotTier: 1 | 2 | 3;        // hotspots: UF Gi* tier at or above (1 = 90%, 2 = 95%, 3 = 99%)
  twoLaneOnly: boolean;
  counties: string[];
  spacingM: number; sides: 1 | 2; gatewayKm: number; pirM: number;   // gatewayKm = LoRa radio range of a gateway
  unitHardware: number; unitInstall: number; gatewayInstalled: number; backhaulMonth: number;
  cloudUnitYear: number; maintUnitYear: number; lifeYears: number;
  effectiveness: number; crashCost: number; unreported: number;
  horizonYears: number; discount: number;
}

export function defaultParams(m: WsMeta): DeployParams {
  const s = m.seed, v = (x: SeedValue) => x.value;
  return {
    strategy: "top_miles", miles: 100, hotspotTier: 1, twoLaneOnly: true, counties: Object.keys(m.counties),
    spacingM: v(s.device.spacing_m), sides: v(s.device.sides) as 1 | 2, gatewayKm: v(s.network.gateway_range_km), pirM: v(s.device.pir_range_m),
    unitHardware: v(s.costs.unit_hardware), unitInstall: v(s.costs.unit_install), gatewayInstalled: v(s.costs.gateway_installed),
    backhaulMonth: v(s.costs.backhaul_per_gateway_month), cloudUnitYear: v(s.costs.cloud_per_unit_year), maintUnitYear: v(s.costs.maintenance_per_unit_year),
    lifeYears: v(s.device.service_life_years), effectiveness: v(s.benefits.effectiveness), crashCost: v(s.benefits.crash_cost_usd),
    unreported: v(s.benefits.unreported_factor), horizonYears: 10, discount: 0.031,
  };
}

/** Candidate segments (county and road-type filters), riskiest first. */
export function candidates(segs: Segment[], p: Pick<DeployParams, "counties" | "twoLaneOnly">) {
  const cs = new Set(p.counties);
  return segs.filter((s) => cs.has(s.county) && (!p.twoLaneOnly || s.twoLane)).sort((a, b) => b.risk - a.risk);
}

export function selectSegments(segs: Segment[], p: DeployParams): Segment[] {
  const cand = candidates(segs, p);
  if (p.strategy === "hotspots") return cand.filter((s) => s.hotspot >= p.hotspotTier);
  if (p.strategy === "all") return cand;
  // Riskiest first, up to the target: a segment is added only if it overshoots the target by less than half its length.
  const out: Segment[] = [];
  let mi = 0;
  for (const s of cand) {
    const add = s.km / KM_PER_MI;
    if (mi + add - p.miles > add / 2) break;
    out.push(s);
    mi += add;
  }
  return out;
}

/** Connected corridors of selected segments (shared end points within ~10 m). */
export function corridors(sel: Segment[]): Segment[][] {
  const parent = sel.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byKey = new Map<string, number>();
  const key = (c: [number, number]) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
  sel.forEach((s, i) => {
    for (const c of [s.coords[0], s.coords[s.coords.length - 1]]) {
      const k = key(c), j = byKey.get(k);
      if (j === undefined) byKey.set(k, i); else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Segment[]>();
  sel.forEach((s, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(s); });
  return [...groups.values()];
}

/** Gateways so every selected segment lies within radio range of one (greedy cover, riskiest segments seed first). */
export function gatewayCover(sel: Segment[], rangeKm: number): [number, number][] {
  const mids = sel.map((s) => s.coords[Math.floor(s.coords.length / 2)]);
  const kx = 111.32 * Math.cos((29.6 * Math.PI) / 180), ky = 110.57, cell = Math.max(rangeKm, 0.1);
  const bucket = new Map<string, number[]>(), key = (x: number, y: number) => `${x},${y}`;
  mids.forEach(([lon, lat], i) => { const k = key(Math.floor((lon * kx) / cell), Math.floor((lat * ky) / cell)); (bucket.get(k) ?? bucket.set(k, []).get(k)!).push(i); });
  const covered = new Uint8Array(sel.length), out: [number, number][] = [];
  for (let i = 0; i < sel.length; i++) {
    if (covered[i]) continue;
    const g = mids[i], gx = Math.floor((g[0] * kx) / cell), gy = Math.floor((g[1] * ky) / cell);
    out.push(g);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of bucket.get(key(gx + dx, gy + dy)) ?? []) {
      if (covered[j]) continue;
      const d = Math.hypot((mids[j][0] - g[0]) * kx, (mids[j][1] - g[1]) * ky);
      if (d <= rangeKm - sel[j].km / 2) covered[j] = 1;   // the whole segment, not just its middle, is in range
    }
    covered[i] = 1;
  }
  return out;
}

/** Units along a segment: continuous coverage per side at the chosen spacing. */
export const unitsFor = (km: number, spacingM: number, sides: number) => Math.max(1, Math.ceil((km * 1000) / spacingM)) * sides;
/** Share of roadside inside a PIR zone (two 17 m radii per unit) at this spacing. */
export const coverageShare = (spacingM: number, pirM: number) => Math.min(1, (2 * pirM) / spacingM);

export interface Deployment {
  segments: number; miles: number; corridors: number; units: number; gateways: number;
  capex: number; opexYear: number; replacementEach: number; costPerMile: number;
  crashesPerYear: number; avoidedPerYear: number; benefitYear: number;
  pvCost: number; pvBenefit: number; bcr: number; paybackYear: number | null;
  breakEvenUnitCost: number | null;   // installed price per unit (hardware + install) at which B/C = 1; null if running costs alone exceed benefits
  cashflow: { year: number; cost: number; benefit: number; net: number }[];
  shareOfNetworkRisk: number; trainedSpeciesShare: number; groupTotals: number[];
}

export function deploy(sel: Segment[], p: DeployParams, networkRiskPerYear: number): Deployment {
  const comps = corridors(sel);
  const km = sel.reduce((a, s) => a + s.km, 0);
  const units = sel.reduce((a, s) => a + unitsFor(s.km, p.spacingM, p.sides), 0);
  const gateways = gatewayCover(sel, p.gatewayKm).length;
  const capex = units * (p.unitHardware + p.unitInstall) + gateways * p.gatewayInstalled;
  const opexYear = gateways * p.backhaulMonth * 12 + units * (p.cloudUnitYear + p.maintUnitYear);
  const replacementEach = units * (p.unitHardware + 0.5 * p.unitInstall);
  const crashesPerYear = sel.reduce((a, s) => a + s.eb, 0) * p.unreported;
  const sideShare = p.sides === 2 ? 1 : 0.5;
  const avoidedPerYear = crashesPerYear * p.effectiveness * coverageShare(p.spacingM, p.pirM) * sideShare;
  const benefitYear = avoidedPerYear * p.crashCost;
  const cashflow: Deployment["cashflow"] = [];
  let pvCost = capex, pvBenefit = 0, cum = -capex, paybackYear: number | null = null;
  cashflow.push({ year: 0, cost: capex, benefit: 0, net: -capex });
  for (let t = 1; t <= p.horizonYears; t++) {
    const repl = t % p.lifeYears === 0 && t < p.horizonYears ? replacementEach : 0;
    const cost = opexYear + repl, df = (1 + p.discount) ** -t;
    pvCost += cost * df;
    pvBenefit += benefitYear * df;
    cum += benefitYear - cost;
    if (paybackYear === null && cum >= 0) paybackYear = t;
    cashflow.push({ year: t, cost, benefit: benefitYear, net: cum });
  }
  // Break-even installed unit price: PV costs are linear in the unit price, so solve B/C = 1 directly.
  let pvUnitShare = units, pvRest = gateways * p.gatewayInstalled;
  for (let t = 1; t <= p.horizonYears; t++) {
    const df = (1 + p.discount) ** -t;
    pvRest += opexYear * df;
    if (t % p.lifeYears === 0 && t < p.horizonYears) pvUnitShare += units * df * (p.unitHardware + 0.5 * p.unitInstall) / Math.max(1, p.unitHardware + p.unitInstall);
  }
  const breakEvenUnitCost = units > 0 && pvBenefit > pvRest ? (pvBenefit - pvRest) / pvUnitShare : null;
  const groupTotals = sel.reduce((a, s) => a.map((v, i) => v + (s.groups[i] ?? 0)), [0, 0, 0, 0, 0, 0]);
  const allCrashes = groupTotals.reduce((a, b) => a + b, 0);
  return {
    segments: sel.length, miles: km / KM_PER_MI, corridors: comps.length, units, gateways, capex, opexYear, replacementEach,
    costPerMile: km > 0 ? capex / (km / KM_PER_MI) : 0, crashesPerYear, avoidedPerYear, benefitYear,
    pvCost, pvBenefit, bcr: pvCost > 0 ? pvBenefit / pvCost : 0, paybackYear, cashflow, breakEvenUnitCost,
    shareOfNetworkRisk: networkRiskPerYear > 0 ? sel.reduce((a, s) => a + s.eb, 0) / networkRiskPerYear : 0,
    // WildSight's prototype classes include deer, dogs and cats (README 7); bears, pigs and livestock are not trained yet.
    trainedSpeciesShare: allCrashes > 0 ? (groupTotals[0] + groupTotals[3]) / allCrashes : 0,
    groupTotals,
  };
}

/** Coverage curve: share of the candidate network's expected crashes covered vs miles deployed (riskiest first). */
export function coverageCurve(cand: Segment[], steps = 60) {
  const total = cand.reduce((a, s) => a + s.eb, 0), totalMi = cand.reduce((a, s) => a + s.km, 0) / KM_PER_MI;
  const out = [{ miles: 0, share: 0 }];
  let mi = 0, eb = 0, next = totalMi / steps;
  for (const s of cand) {
    mi += s.km / KM_PER_MI; eb += s.eb;
    if (mi >= next) { out.push({ miles: mi, share: total > 0 ? eb / total : 0 }); next += totalMi / steps; }
  }
  out.push({ miles: totalMi, share: 1 });
  return out;
}

/** Map positions: units offset ~6 m each side of the centre line at the chosen spacing. */
export function unitPoints(sel: Segment[], spacingM: number, sides: number, max = 20000) {
  const pts: [number, number, number][] = []; // lon, lat, side
  for (const s of sel) {
    let carry = spacingM / 2;
    for (let k = 0; k + 1 < s.coords.length; k++) {
      const [a, b] = [s.coords[k], s.coords[k + 1]];
      const kx = 111320 * Math.cos((a[1] * Math.PI) / 180), dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * 110574, len = Math.hypot(dx, dy);
      if (!(len > 0)) continue;
      const nx = -dy / len, ny = dx / len;
      for (let d = carry; d <= len; d += spacingM) {
        const f = d / len, lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f;
        for (let side = 0; side < sides; side++) {
          const o = side === 0 ? 6 : -6;
          pts.push([lon + (nx * o) / kx, lat + (ny * o) / 110574, side]);
          if (pts.length >= max) return pts;
        }
        carry = d + spacingM - len;
      }
      if (carry > len) carry -= len;
    }
  }
  return pts;
}

export const gatewayPoints = gatewayCover;

/** WildSight beacon demo physics: 1.5 s perception-reaction, 0.7 g braking, animal seen at 60 m in low beams,
 *  beacon seen at 150 m (WildSight index.html initBeacon). Speeds in m/s. */
export function stopping(mph: number) {
  const G = 9.81, A = 0.7 * G, TR = 1.5, SEE = 60, WARN = 150;
  const v = mph * 0.44704, react = v * TR, brake = (v * v) / (2 * A), stop = react + brake;
  const impact = (seenAt: number) => (stop > seenAt ? Math.sqrt(Math.max(0, v * v - 2 * A * Math.max(0, seenAt - react))) : 0);
  return { v, react, brake, stop, see: SEE, warn: WARN, impactCold: impact(SEE), impactWarned: impact(WARN) };
}
