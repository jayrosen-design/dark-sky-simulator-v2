import { describe, expect, it } from "vitest";
import { allFacilities, artEstimate, filterFacilities, landOwnerOfArt, landOwnerOfWork, onLand, type FacilitiesPkg } from "../engine/facilities";
import { seed } from "./fixtures";

const sq = (x: number, y: number) => ({ type: "Polygon" as const, coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]] });
const pkg: FacilitiesPkg = {
  built: "2026-10-05", classes: ["state", "county", "city", "school", "federal", "district"], sources: [], report: {},
  alachua: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: sq(-82.325, 29.651), properties: { id: "15664-000-000", cls: "city", owner: "CITY OF GAINESVILLE", address: "200 E UNIVERSITY AVE", city: "GAINESVILLE", yb: 1970, nc: 0,
      use: "Municipal", jv: 9e6, bv: 7e6, sqft: 60000, quality: null, acpa: "https://example/acpa", ev: [[2018, 50000, 60000, 1.2e6, false, "area and value"]], area: {}, jvh: {} } },
    { type: "Feature", geometry: sq(-82.35, 29.64), properties: { id: "15999-000-000", cls: "state", owner: "STATE OF FLA IIF EDUCATION-UNIV OF FLA", address: null, city: null, yb: null, nc: 0,
      use: "Colleges", jv: 5e8, bv: 4e8, sqft: 9e6, quality: null, acpa: null, ev: [[2022, 0, 80000, 30e6, true, "area and value"]], area: {}, jvh: {} } },
    { type: "Feature", geometry: sq(-82.32, 29.65), properties: { id: "12000-000-000", cls: "county", owner: "ALACHUA COUNTY", address: "220 S MAIN ST", city: "GAINESVILLE", yb: 1998, nc: 0,
      use: "County owned", jv: 6e7, bv: 5e7, sqft: 200000, quality: null, acpa: null, ev: [], area: {}, jvh: {} } },
  ] },
  florida: { cols: [], rows: [
    ["16-504203", "county", "BROWARD COUNTY", "1 N UNIVERSITY DR", "PLANTATION", "Broward", "086", 3e7, 2.5e7, 4e6, 2025, 2025, 90000, -80.25, 26.12],
    ["29-A100", "city", "CITY OF TAMPA", "306 E JACKSON ST", "TAMPA", "Hillsborough", "089", 2e7, 1.5e7, 0, 1960, 1990, 80000, -82.46, 27.95],
  ] },
  tags: { registry: { "sankofa": "12000-000-000", "rejoined": null },
    catalog: { a: ["alachua", "15664-000-000"], b: ["alachua", null], c: ["parcel", "county", "BROWARD COUNTY", "086", 3e7, "16-504203"],
      d: ["parcel", null, "SMITH JOHN", "001", 2e5, "16-999"], e: ["parcel", null, null, null, null, null] } },
};

describe("public buildings", () => {
  const fs = allFacilities(pkg);
  const base = { q: "", classes: pkg.classes, since: null, bounds: null };

  it("joins Alachua outlines and statewide centres, and filters by class, recent construction and words", () => {
    expect(fs).toHaveLength(5);
    expect(filterFacilities(fs, { ...base, classes: ["city"] }).map((f) => f.id)).toEqual(["15664-000-000", "29-A100"]);
    expect(filterFacilities(fs, { ...base, since: 2020 }).map((f) => f.id)).toEqual(["15999-000-000", "16-504203"]);
    expect(filterFacilities(fs, { ...base, q: "main" }).map((f) => f.id)).toEqual(["12000-000-000"]);
  });

  it("applies Chapter 5.5 only to Gainesville's buildings, with the cap of the chosen code", () => {
    const gnv = fs.find((f) => f.id === "15664-000-000")!, tampa = fs.find((f) => f.id === "29-A100")!;
    expect(artEstimate(gnv, 1.2e6, false, seed, "draft").amount).toBe(12000);
    expect(artEstimate(gnv, 50e6, false, seed, "1989").amount).toBe(100000);
    expect(artEstimate(gnv, 50e6, false, seed, "draft").amount).toBe(300000);
    expect(artEstimate(tampa, 5e6, false, seed, "draft").amount).toBeNull();          // other cities: not modelled
  });

  it("applies the state rule at 0.5% up to $100,000 and says when it only covers new buildings", () => {
    const uf = fs.find((f) => f.id === "15999-000-000")!;
    expect(artEstimate(uf, 30e6, true, seed, "draft").amount).toBe(100000);
    expect(artEstimate(uf, 10e6, true, seed, "draft").amount).toBe(50000);
    expect(artEstimate(uf, 10e6, false, seed, "draft").note).toMatch(/Only if the added space is a new building/);
    const county = fs.find((f) => f.id === "12000-000-000")!;
    expect(artEstimate(county, 10e6, false, seed, "draft").amount).toBe(0);             // no Alachua County rule found
  });

  it("says who owns the land under each artwork", () => {
    expect(landOwnerOfWork(pkg, "a")).toMatchObject({ cls: "city", facilityId: "15664-000-000" });
    expect(landOwnerOfWork(pkg, "b")?.cls).toBe("other");                             // Alachua, not on a public building parcel
    expect(landOwnerOfWork(pkg, "c")).toMatchObject({ cls: "county", owner: "BROWARD COUNTY", facilityId: "16-504203" });
    expect(landOwnerOfWork(pkg, "d")?.cls).toBe("private");
    expect(landOwnerOfWork(pkg, "e")?.cls).toBe("none");
    expect(landOwnerOfArt(pkg, "sankofa")?.cls).toBe("county");
    const works = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    expect(onLand(works, "public", pkg).map((w) => w.id)).toEqual(["a", "c"]);
    expect(onLand(works, "private", pkg).map((w) => w.id)).toEqual(["d"]);
  });
});
