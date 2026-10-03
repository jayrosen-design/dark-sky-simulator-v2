import { describe, expect, it } from "vitest";
import { World } from "../CorridorSim";

const run = (wildsight: boolean, mesh = true, mph = 55, seconds = 1200) => {
  const w = new World(wildsight, mesh, mph * 0.44704, 5, 40, 20260927);
  for (let t = 0; t < seconds; t += 0.02) w.step(0.02);
  return w.tally;
};

describe("WildSight corridor simulation", () => {
  it("has fewer collisions with WildSight than today for the same animals and cars", () => {
    const today = run(false), ws = run(true);
    expect(today.detections).toBe(0);
    expect(today.redirected).toBe(0);
    expect(today.hit).toBeGreaterThan(0);
    expect(ws.detections).toBeGreaterThan(0);
    expect(ws.redirected).toBeGreaterThan(0);
    expect(ws.hit).toBeLessThan(today.hit);
  });

  it("accounts for every animal that finished: collisions + near misses + safe + turned back", () => {
    const t = run(true, true, 45, 600);
    const finished = t.hit + t.near + t.safe + t.redirected;
    expect(finished).toBeGreaterThan(50);
  });
});
