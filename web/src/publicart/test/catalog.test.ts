import { describe, expect, it } from "vitest";
import { allWorks, filterWorks, tally, type FloridaPkg } from "../engine/catalog";

const pkg = { built: "2026-10-05", fetched: "2026-10-05", source: { name: "", url: "", note: "" }, report: {} as FloridaPkg["report"],
  works: { cols: [], rows: [
    ["a", "Wave Wall", "Ann Smith", 2005, "bronze, concrete", "sculpture", "parks", "City of Tampa, FL", null, "Riverwalk", "Tampa", "Hillsborough", -82.46, 27.95, false, "https://www.publicartarchive.org/art/Wave-Wall/a", 150000, "commission", "https://tampa.gov/x"],
    ["b", "Sea Mural", "Bo Diaz", 2019, "acrylic paint", "mural paintings", "streets", "City of St. Petersburg, Florida", null, null, "St. Petersburg", "Pinellas", -82.64, 27.77, false, "https://www.publicartarchive.org/art/Sea-Mural/b", null, null, null],
    ["c", "Untitled", null, null, null, null, null, "Broward County Public Art & Design; Business for the Arts Broward", null, null, "Fort Lauderdale", "Broward", -80.14, 26.12, true, "https://www.publicartarchive.org/art/Untitled/c", null, null, null],
  ] } } as FloridaPkg;

describe("Florida catalog", () => {
  const ws = allWorks(pkg);
  const f = (p: Partial<Parameters<typeof filterWorks>[1]>) => filterWorks(ws, { q: "", county: null, collection: null, budgetOnly: false, bounds: null, ...p }).map((w) => w.id);

  it("searches artist, title, medium, collection and place as whole words", () => {
    expect(f({ q: "bronze" })).toEqual(["a"]);
    expect(f({ q: "mural pinellas county" })).toEqual(["b"]);
    expect(f({ q: "smith wave" })).toEqual(["a"]);
    expect(f({ q: "wav" })).toEqual([]);                                             // whole words only
  });

  it("filters by county, collection (works can belong to two), stated budget and map view", () => {
    expect(f({ county: "Broward" })).toEqual(["c"]);
    expect(f({ collection: "Business for the Arts Broward" })).toEqual(["c"]);
    expect(f({ budgetOnly: true })).toEqual(["a"]);
    expect(f({ bounds: [-83, 27.5, -82, 28.5] })).toEqual(["a", "b"]);
  });

  it("counts works per county and per collection for the pickers", () => {
    expect(tally(ws, (w) => [w.county ?? ""])).toEqual([["Broward", 1], ["Hillsborough", 1], ["Pinellas", 1]]);
    const cols = tally(ws, (w) => (w.collection ?? "").split("; ")).map(([k]) => k);
    expect(cols).toContain("Business for the Arts Broward");
    expect(cols).toContain("City of Tampa, FL");                                       // a comma inside a name stays whole
  });
});
