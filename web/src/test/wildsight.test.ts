import { describe, expect, it } from "vitest";
import { corridors, coverageCurve, coverageShare, deploy, gatewayPoints, selectSegments, stopping, unitPoints, unitsFor, type DeployParams, type Segment } from "../engine/wildsight";

const seg = (id: number, x0: number, eb: number, extra: Partial<Segment> = {}): Segment => ({
  id, cls: 3, name: `Road ${id}`, km: 1, mph: 55, lanes: 2, aadt: 5000, aadtFdot: true, habitat: 0.5, conservation: false, hotspot: 0,
  crashes: Math.round(eb * 11), groups: [Math.round(eb * 11), 0, 0, 0, 0, 0], eb, county: "12001",
  coords: [[x0, 29.6], [x0 + 0.01033, 29.6]], risk: eb * 1.609344, twoLane: true, ...extra,
});
const P: DeployParams = {
  strategy: "top_miles", miles: 1.3, hotspotTier: 1, twoLaneOnly: true, counties: ["12001"], spacingM: 40, sides: 2, gatewayKm: 3, pirM: 17,
  unitHardware: 450, unitInstall: 250, gatewayInstalled: 1500, backhaulMonth: 15, cloudUnitYear: 24, maintUnitYear: 60, lifeYears: 5,
  effectiveness: 0.4, crashCost: 10300, unreported: 1, horizonYears: 10, discount: 0.031,
};

describe("WildSight deployment sizing", () => {
  const a = seg(0, -82.40, 2), b = seg(1, -82.40 + 0.01033, 1), c = seg(2, -82.30, 0.5), d = seg(3, -82.20, 3, { twoLane: false, cls: 0 });

  it("picks the riskiest two-lane miles up to the target and respects county and road filters", () => {
    const sel = selectSegments([a, b, c, d], P);
    expect(sel.map((s) => s.id)).toEqual([0, 1]);            // d is a motorway, excluded
    expect(selectSegments([a, b, c, d], { ...P, twoLaneOnly: false }).map((s) => s.id)).toEqual([3, 0]);
    expect(selectSegments([a, b, c, d], { ...P, counties: [] })).toHaveLength(0);
    expect(selectSegments([a, { ...b, hotspot: 2 }, c], { ...P, strategy: "hotspots", hotspotTier: 2 }).map((s) => s.id)).toEqual([1]);
  });

  it("joins touching segments into one corridor and sizes units and gateways", () => {
    expect(corridors([a, b, c])).toHaveLength(2);
    expect(unitsFor(1, 40, 2)).toBe(50);
    expect(coverageShare(40, 17)).toBeCloseTo(0.85);
    expect(coverageShare(20, 17)).toBe(1);
    const dep = deploy([a, b], P, 10);
    expect(dep.units).toBe(100);
    expect(dep.gateways).toBe(1);                              // both segments within 3 km of one gateway
    expect(dep.capex).toBe(100 * 700 + 1500);
    expect(dep.opexYear).toBe(15 * 12 + 100 * 84);
    expect(dep.avoidedPerYear).toBeCloseTo(3 * 0.4 * 0.85, 6);
    expect(dep.shareOfNetworkRisk).toBeCloseTo(0.3);
    expect(dep.cashflow).toHaveLength(11);
    expect(gatewayPoints([a, b], 3)).toHaveLength(1);
    expect(gatewayPoints([a, b], 0.9)).toHaveLength(2);       // 1 km apart: a 0.9 km radio cannot cover both whole segments
    expect(gatewayPoints([a, c], 3)).toHaveLength(2);          // 9.6 km apart
    expect(dep.breakEvenUnitCost).toBeGreaterThan(0);          // ~ $87: benefit barely exceeds running costs
    expect(dep.breakEvenUnitCost).toBeLessThan(700);
    expect(deploy([a, b], { ...P, effectiveness: 0.1 }, 10).breakEvenUnitCost).toBeNull(); // running costs alone exceed the benefit
    const big = deploy([a, b], { ...P, crashCost: 1e6 }, 10);
    expect(big.breakEvenUnitCost).not.toBeNull();
    const atBreakEven = deploy([a, b], { ...P, crashCost: 1e6, unitHardware: big.breakEvenUnitCost! * 450 / 700, unitInstall: big.breakEvenUnitCost! * 250 / 700 }, 10);
    expect(atBreakEven.bcr).toBeCloseTo(1, 6);
  });

  it("discounts benefits and costs, replaces units at end of life, and finds the payback year", () => {
    const dep = deploy([a, b], P, 10);
    const pvB = Array.from({ length: 10 }, (_, t) => dep.benefitYear / 1.031 ** (t + 1)).reduce((x, y) => x + y, 0);
    expect(dep.pvBenefit).toBeCloseTo(pvB, 3);
    expect(dep.cashflow[5].cost).toBeCloseTo(dep.opexYear + dep.replacementEach, 6);
    expect(dep.cashflow[10].cost).toBeCloseTo(dep.opexYear, 6);   // no replacement bought in the final year
    const rich = deploy([a, b], { ...P, crashCost: 1e7 }, 10);
    expect(rich.paybackYear).toBe(1);
    expect(deploy([a, b], { ...P, effectiveness: 0 }, 10).paybackYear).toBeNull();
  });

  it("spaces map units along the road on both shoulders", () => {
    const pts = unitPoints([a], 40, 2);
    expect(pts).toHaveLength(50);
    expect(new Set(pts.map((p) => p[2]))).toEqual(new Set([0, 1]));
  });

  it("builds a monotone coverage curve ending at 100%", () => {
    const curve = coverageCurve([d, a, b, c].sort((x, y) => y.risk - x.risk), 10);
    for (let i = 1; i < curve.length; i++) expect(curve[i].share).toBeGreaterThanOrEqual(curve[i - 1].share);
    expect(curve[curve.length - 1].share).toBe(1);
  });

  it("reproduces the WildSight beacon demo: at 55 mph an unwarned driver hits, a warned one stops", () => {
    const s = stopping(55);
    expect(s.stop).toBeGreaterThan(60);
    expect(s.impactCold).toBeGreaterThan(0);
    expect(s.impactWarned).toBe(0);
    expect(stopping(25).impactCold).toBe(0);
  });
});
