import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "../staleBuild";

describe("stale build detection", () => {
  it("recognizes failed dynamic imports in Chrome, Firefox and Safari wording, and nothing else", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x.vercel.app/assets/ObservatoryPanel-rg92H43X.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'value')"))).toBe(false);
  });
});
