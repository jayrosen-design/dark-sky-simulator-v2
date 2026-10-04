import { describe, expect, it } from "vitest";
import { conservation } from "../engine/conservation";
import { aep6Context, defaultEcon, induced } from "../engine/economics";
import { coverage } from "../engine/equity";
import { ch30Program, ch30Site, gruAccount, interlocal } from "../engine/exploratory";
import { impressions, nightFactor, PointIndex, RoadIndex } from "../engine/impressions";
import type { BgProps, Block } from "../types";
import { art, project, seed, tinyWorld } from "./fixtures";

const day = Array(24).fill(30), night = Array(24).fill(-30);

describe("impressions", () => {
  const w = tinyWorld();
  const ctx = (aadt = 10000, lamps: [number, number][] = []) => {
    const t = tinyWorld(aadt);
    return { seed, roads: new RoadIndex(t.roads, t.frame), cells: t.cells, lamps: new PointIndex(lamps, t.frame) };
  };
  const a = art("s", { lon: w.frame.west + 1500 / w.frame.kx, lat: 29.6535 + 20 / w.frame.ky });

  it("adds up hour by hour and rises with traffic", () => {
    const i = impressions(a, ctx(), day);
    expect(i.dvi).toBeCloseTo(i.total.reduce((s, v) => s + v, 0), 6);
    expect(i.vehDaily).toBeGreaterThan(0);
    expect(impressions(a, ctx(20000), day).vehDaily).toBeGreaterThan(i.vehDaily);
  });

  it("keeps more after dark when lit, and streetlights help an unlit work", () => {
    const lit = impressions({ ...a, lit: true }, ctx(), night).dvi, unlit = impressions(a, ctx(), night).dvi;
    expect(lit).toBeGreaterThan(unlit);
    const lamps: [number, number][] = [[a.lon, a.lat], [a.lon + 0.0001, a.lat]];
    expect(impressions(a, ctx(10000, lamps), night).dvi).toBeGreaterThan(unlit);
    expect(nightFactor(10, 0.2)).toBe(1);
    expect(nightFactor(-10, 0.2)).toBe(0.2);
  });

  it("counts each passing vehicle once, however many pieces the street is cut into", () => {
    const t = tinyWorld(), [p] = t.roads, mid = (p.coords[0][0] + p.coords[1][0]) / 2;
    const split = [{ ...p, coords: [p.coords[0], [mid, p.coords[0][1]]] as [number, number][] }, { ...p, coords: [[mid, p.coords[0][1]], p.coords[1]] as [number, number][] }];
    const one = impressions(a, ctx(), day).vehDaily;
    const two = impressions(a, { seed, roads: new RoadIndex(split, t.frame), cells: t.cells, lamps: new PointIndex([], t.frame) }, day).vehDaily;
    expect(two).toBeCloseTo(one, 3);
  });

  it("counts a one-sided mural only from streets it faces", () => {
    const toward = impressions({ ...a, type: "mural", bearing: 180 }, ctx(), day).vehDaily;   // street is south of the mural
    const away = impressions({ ...a, type: "mural", bearing: 0 }, ctx(), day).vehDaily;
    expect(toward).toBeGreaterThan(away);
  });

  it("gives works indoors, or not yet checked, no street impressions", () => {
    expect(impressions({ ...a, setting: "outdoor" }, ctx(), day).dvi).toBeGreaterThan(0);
    for (const setting of ["indoor", "unverified"] as const) {
      const i = impressions({ ...a, setting }, ctx(), day);
      expect(i.dvi).toBe(0);
      expect(i.stops).toBe(0);
      expect(i.radius).toBe(0);
    }
  });
});

describe("equity coverage", () => {
  const { frame } = tinyWorld();
  const bgs: BgProps[] = [{ geoid: "w", pop: 100, mhi: 80000, moe: 0, low_income: false, east: false, in_city: true },
    { geoid: "e", pop: 100, mhi: 30000, moe: 0, low_income: true, east: true, in_city: true }];
  const blocks: Block[] = [{ lon: -82.335, lat: 29.65, pop: 100, bg: 0 }, { lon: -82.315, lat: 29.65, pop: 100, bg: 1 }];

  it("stays between 0 and 1, and a work in East Gainesville raises its coverage", () => {
    const west = coverage(blocks, bgs, [{ lon: -82.335, lat: 29.65 }], seed, frame);
    expect(west.east.share).toBe(0);
    expect(west.city.share).toBeCloseTo(0.5);
    const both = coverage(blocks, bgs, [{ lon: -82.335, lat: 29.65 }, { lon: -82.315, lat: 29.65 }], seed, frame);
    expect(both.east.share).toBe(1);
    expect(both.parity).toBeCloseTo(1);
    for (const c of [west.city, west.east, west.low, both.city]) { expect(c.share).toBeGreaterThanOrEqual(0); expect(c.share).toBeLessThanOrEqual(1); }
  });
});

describe("economics", () => {
  it("uses the verified AEP6 Alachua figures; the three tax lines total $33,148,133", () => {
    const A = aep6Context(seed);
    expect(A.total_activity).toBe(189462764);
    expect(A.jobs).toBe(2992);
    expect(A.tax_total).toBe(33148133);
    expect(A.spend_nonlocal).toBe(76.48);
    expect(A.spend_local).toBe(29.26);
    expect(A.share_nonlocal).toBe(0.573);
  });

  it("builds spending bottom-up: sector totals do not move a project's estimate, and hotel tax is 5% of room revenue", () => {
    const P = defaultEcon(seed);
    const e = induced(20, "large", 4, seed, P);
    const bigger = { ...seed, economics: { ...seed.economics, aep6: { ...seed.economics.aep6, value: { ...seed.economics.aep6.value, total_activity: 1e12 } } } };
    expect(induced(20, "large", 4, bigger, P).spending).toBe(e.spending);
    expect(e.tdt).toBeCloseTo(e.roomNights * seed.economics.adr.value * 0.05, 6);
    expect(e.retail[0]).toBeLessThanOrEqual(e.retail[1]);
    expect(e.retail[1]).toBeLessThanOrEqual(e.retail[2]);
  });
});

describe("conservation", () => {
  it("carries the reserve forward, never below zero, and reports unfunded care without a reserve", () => {
    const arts = [art("m", { type: "mural", material: "acrylic_mural", height: 6, width: 10 }), art("b", { material: "bronze" })];
    const fys = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
    const funded = conservation(arts, seed, fys, fys.map(() => 50000));
    const none = conservation(arts, seed, fys, fys.map(() => 0));
    for (const y of funded.years) expect(y.balance).toBeGreaterThanOrEqual(0);
    expect(none.totalShortfall).toBeCloseTo(none.totalRequired, 6);
    expect(funded.totalShortfall).toBeLessThan(none.totalShortfall);
    expect(funded.conds.find((c) => c.id === "m")!.interventions.length).toBeGreaterThan(0);   // acrylic murals need work within ten years
  });

  it("applies the Florida weathering factor to outdoor works only", () => {
    const fys = [2026, 2027, 2028];
    const c = conservation([art("o", { material: "bronze" }), art("i", { material: "bronze", setting: "indoor" })], seed, fys, fys.map(() => 0));
    const end = (id: string) => c.conds.find((x) => x.id === id)!.path.at(-1)!;
    expect(end("i")).toBeGreaterThan(end("o"));
  });
});

describe("staff study (exploratory)", () => {
  it("flags every output as exploratory with no legal conclusion, keeps participation voluntary and clamps bonuses", () => {
    const s = ch30Site({ valuation: 1e7, gfaSf: 1e5, option: "C", farBonus: 0.5, extraStory: true, parkingReduction: 0.9 }, seed);
    expect(s.exploratory).toBe(true);
    expect(s.legalConclusion).toBeNull();
    expect(s.voluntary).toBe(true);
    expect(s.far).toBe(seed.staff_study.ch30_bonus_caps.value.far);
    expect(s.parking).toBe(seed.staff_study.ch30_bonus_caps.value.parking);
    expect(s.pledge).toBeCloseTo(1e7 * 0.0075, 6);
    expect(ch30Program(0.5, 1e8, { A: 1, B: 0, C: 0 }, seed).onsite).toBeCloseTo(1e8 * 0.5 * 0.01, 6);
    expect(interlocal(seed).exploratory).toBe(true);
  });

  it("flags GRU allocations with no nexus use", () => {
    const g = gruAccount([project("plant", 2027, 5e7, { funding: "enterprise_gru", restricted: true, category: "utility" })], 0.01, 300000, {});
    expect(g.rows[0].alloc).toBe(300000);
    expect(g.flagged).toBe(1);
    expect(gruAccount([project("plant", 2027, 5e7, { funding: "enterprise_gru" })], 0.01, 300000, { plant: 0 }).flagged).toBe(0);
  });
});
