import { describe, expect, it } from "vitest";
import { allItems, byCounty, filterCalls, filterItems, fmtMoney, isOpen, matcher, norm, openOpportunities, totalOf, type Call, type GrantsPkg, type Opportunity } from "../engine/grants";

const call = (id: string, extra: Partial<Call> = {}): Call => ({ id, title: `Mural ${id}`, organization: "City", kind: "mural", city: "Gainesville", state: "FL",
  budget_usd: 50000, budget_note: null, deadline: "2026-11-01", rolling: false, eligibility: null, source_url: "https://example.gov", retrieved: "2026-10-05",
  notes: null, lon: -82.33, lat: 29.65, located_by: "city centre", ...extra });

const pkg: GrantsPkg = {
  built: "2026-10-05", period: { federal: "FY2021-FY2025" }, sources: [], linkouts: [], report: {},
  awards: { cols: [], rows: [
    ["a1", "NEA", 2024, 25000, "Hippodrome Theatre", "Gainesville", "FL", -82.32, 29.65, "zip", "45.024", "To support a public art project."],
    ["a2", "NEH", 2025, 150000, "University of Florida", "Gainesville", "FL", -82.34, 29.64, "zip", "45.164", "Humanities collections"],
    ["a3", "NEA", 2024, 40000, "Seattle Arts", "Seattle", "WA", -122.33, 47.6, "zip", "45.024", "Mural festival"],
    ["a4", "IMLS", 2021, 3270854, "Department of Public Instruction", "Madison", "WI", -89.4, 43.07, "zip", "45.310", "Library services"],
  ] },
  florida: { cols: [], rows: [["2025-26", "Alachua", "Dance Alive!, Inc.", "GPS", 107254], ["2025-26", "Alachua", "UF", "GPS", 150000], ["2024-25", "Leon", "X", "SCP", 9000]],
    counties: { Alachua: [-82.36, 29.68], Leon: [-84.28, 30.46] }, pages: { "2025-26": "https://dos.fl.gov/x" }, programs: { GPS: "General Program Support" } },
  opportunities: [], calls: [],
};

describe("arts funding index", () => {
  it("formats dollars compactly", () => {
    expect([fmtMoney(950), fmtMoney(45200), fmtMoney(1_250_000), fmtMoney(3_000_000_000), fmtMoney(null)]).toEqual(["$950", "$45K", "$1.3M", "$3B", "—"]);
  });

  it("matches every search word, the chosen sources and year, and the map view", () => {
    const items = allItems(pkg);
    expect(items).toHaveLength(7);
    const f = (p: Partial<Parameters<typeof filterItems>[1]>) => filterItems(items, { q: "", sources: ["NEA", "NEH", "IMLS", "FL"], year: null, bounds: null, ...p });
    expect(f({ q: "public art" }).map((i) => i.id)).toEqual(["a1"]);                  // not "Department of Public Instruction"
    expect(f({ q: '"art project"' }).map((i) => i.id)).toEqual(["a1"]);
    expect(f({ q: "art" }).map((i) => i.id)).toEqual(["a1", "a3"]);                    // whole words, plurals: art, Arts
    expect(matcher("art")(norm("Advancing artificial intelligence"))).toBe(false);
    expect(matcher("cafe arts")(norm("Café Arts, Inc."))).toBe(true);                    // accents and punctuation ignored
    expect(f({ q: "gainesville", sources: ["NEH"] }).map((i) => i.id)).toEqual(["a2"]);
    expect(f({ year: 2024, sources: ["NEA"] }).map((i) => i.id)).toEqual(["a1", "a3"]);
    expect(f({ year: 2026, sources: ["FL"] })).toHaveLength(2);                       // Florida FY2025-26 is filed under 2026
    const florida: [number, number, number, number] = [-87.7, 24.4, -79.9, 31.1];
    expect(f({ bounds: florida }).map((i) => i.source).sort()).toEqual(["FL", "FL", "FL", "NEA", "NEH"]);
    expect(totalOf(f({ bounds: florida, sources: ["FL"] }))).toBe(266254);
  });

  it("sums Florida awards per county for the map", () => {
    const c = byCounty(allItems(pkg));
    expect(c.find((x) => x.place === "Alachua County, FL")).toMatchObject({ total: 257254, n: 2 });
  });

  it("keeps only open calls, soonest first, and searches them", () => {
    const calls = [call("late", { deadline: "2026-12-01" }), call("closed", { deadline: "2026-10-01" }), call("soon"), call("rolling", { deadline: null, rolling: true })];
    expect(isOpen(calls[1], "2026-10-05")).toBe(false);
    expect(filterCalls(calls, "", "2026-10-05", null).map((c) => c.id)).toEqual(["soon", "late", "rolling"]);
    expect(filterCalls(calls, "mural soon", "2026-10-05", null).map((c) => c.id)).toEqual(["soon"]);
    expect(filterCalls(calls, "", "2026-10-05", [-123, 45, -120, 48])).toHaveLength(0);
  });

  it("lists federal opportunities that have not closed", () => {
    const o = (id: string, close: string | null): Opportunity => ({ id, number: id, title: `Grant ${id}`, agency: "NEA", agency_code: "NEA", status: "posted", posted: null,
      close, ceiling: 100000, floor: null, estimated_total: null, awards_expected: null, applicants: [], summary: null, url: "https://www.grants.gov/x" });
    const out = openOpportunities([o("past", "Jul 1, 2026 12:00:00 AM EDT"), o("next", "Feb 12, 2027 12:00:00 AM EST"), o("tbd", null)], "", "2026-10-05");
    expect(out.map((x) => x.id)).toEqual(["next", "tbd"]);
  });
});
