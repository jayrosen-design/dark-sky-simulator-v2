import { describe, expect, it } from "vitest";
import { capFor, cpiAt, defaultPolicy, eligibleBudget, ledger, round5k } from "../engine/ledger";
import { cpi, project, seed } from "./fixtures";

const draft = defaultPolicy(seed, "draft"), old = defaultPolicy(seed, "1989");

describe("Chapter 5.5 caps", () => {
  it("keeps the 1989 cap at $100,000 and the draft at $300,000 until FY2027", () => {
    for (const fy of [2026, 2027, 2030]) expect(capFor(fy, old, seed, cpi)).toBe(100000);
    expect(capFor(2026, draft, seed, cpi)).toBe(300000);
    expect(capFor(2027, draft, seed, cpi)).toBe(300000);
  });

  it("indexes the draft cap to CPI-U from FY2028 (Oct 1 2027), rounded to the nearest $5,000 from the unrounded base", () => {
    const ratio = cpiAt(cpi, 2027, 6, draft.cpiForward) / cpiAt(cpi, 2026, 6, draft.cpiForward);
    expect(capFor(2028, draft, seed, cpi)).toBe(round5k(300000 * ratio));
    expect(capFor(2028, draft, seed, cpi) % 5000).toBe(0);
    expect(capFor(2031, draft, seed, cpi)).toBeGreaterThan(capFor(2028, draft, seed, cpi));
    expect(capFor(2030, { ...draft, indexCpi: false }, seed, cpi)).toBe(300000);
    expect(round5k(302499)).toBe(300000);
    expect(round5k(302500)).toBe(305000);
  });

  it("projects CPI-U past the last BLS month at the forward rate", () => {
    const [lastKey, lastV] = cpi[cpi.length - 1], [y, m] = lastKey.split("-").map(Number);
    expect(cpiAt(cpi, y + 1, m, 0.03)).toBeCloseTo(lastV * 1.03, 6);
  });
});

describe("Chapter 5.5 ledger", () => {
  const comp = { land_acquisition: 1e6, equipment_furniture: 5e5, financing: 2e5, repair_maintenance: 3e5 };
  const projects = [
    project("hall", 2026, 12e6, { components: comp }),                                // 1% of eligible, under the draft cap
    project("station", 2027, 40e6),                                                   // capped
    project("plant", 2026, 20e6, { visibility: "low" }),                              // unsuited site: pooled
    project("grant-center", 2028, 15e6, { funding: "grant", restricted: true }),
    project("surtax-park", 2029, 8e6, { funding: "surtax", restricted: true, category: "park_public_space" }),
    project("road", 2026, 9e6, { category: "transportation", funding: "gas_tax", restricted: true }),
  ];

  it("removes the excluded costs from the construction budget", () => {
    expect(eligibleBudget(projects[0], "1989", seed)).toBe(12e6 - 1.5e6);
    expect(eligibleBudget(projects[0], "draft", seed)).toBe(12e6 - 2e6);
  });

  it("sends exactly the reserve share of unrestricted money to the reserve, never restricted money, and conserves money", () => {
    const L = ledger(projects, draft, seed, cpi);
    for (const r of L.projects) {
      expect(r.capped).toBeGreaterThanOrEqual(0);
      expect(r.reserve + r.onsite + r.pooled + r.restrictedSub).toBeCloseTo(r.alloc, 6);
      if (r.restricted) { expect(r.reserve).toBe(0); expect(r.pooled).toBe(0); }
      else if (r.applies) expect(r.reserve).toBeCloseTo(r.alloc * seed.policy.reserve_share.value, 6);
    }
    expect(L.projects.find((r) => r.id === "station")!.capped).toBeGreaterThan(0);
    expect(L.projects.find((r) => r.id === "plant")!.pooled).toBeGreaterThan(0);
    expect(L.projects.find((r) => r.id === "road")!.applies).toBe(false);
  });

  it("has no reserve and no separate restricted accounts under the 1989 code", () => {
    const L = ledger(projects, old, seed, cpi);
    expect(L.totals.reserveIn).toBe(0);
    expect(L.totals.restricted).toBe(0);
    expect(L.totals.commingled).toBeGreaterThan(0);
  });

  it("captures more under the draft cap and can exclude restricted sources entirely", () => {
    expect(ledger(projects, draft, seed, cpi).totals.alloc).toBeGreaterThan(ledger(projects, old, seed, cpi).totals.alloc);
    const ex = ledger(projects, { ...draft, restrictedMode: "exclude" }, seed, cpi);
    expect(ex.totals.restricted).toBe(0);
    expect(ex.totals.excluded).toBeGreaterThan(0);
  });

  it("treats surtax money as restricted or not depending on the switch, and only surtax money", () => {
    const a = ledger(projects, draft, seed, cpi), b = ledger(projects, { ...draft, surtaxRestricted: false }, seed, cpi);
    expect(a.projects.find((r) => r.id === "surtax-park")!.restricted).toBe(true);
    expect(b.projects.find((r) => r.id === "surtax-park")!.restricted).toBe(false);
    expect(b.projects.find((r) => r.id === "grant-center")!.restricted).toBe(true);
    expect(b.totals.reserveIn).toBeGreaterThan(a.totals.reserveIn);
  });

  it("repeats the five-year program for a ten-year horizon without changing the first five years", () => {
    const five = ledger(projects, draft, seed, cpi), ten = ledger(projects, { ...draft, horizon: 10 }, seed, cpi);
    expect(ten.fys.length).toBeGreaterThan(five.fys.length);
    for (const y of five.years) expect(ten.years.find((t) => t.fy === y.fy)!.alloc).toBeCloseTo(y.alloc, 6);
  });
});
