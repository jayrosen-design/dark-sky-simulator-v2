import { describe, expect, it } from "vitest";
import { decodeState, encodeState } from "../share";

describe("shared share-URL state", () => {
  it("round-trips state through base64url, including non-ASCII text", () => {
    const s = { a: 1, b: [1, 2, { c: "Café — ½ mile" }], d: null };
    const enc = encodeState(s);
    expect(enc).not.toMatch(/[+/=]/);
    expect(decodeState(enc)).toEqual(s);
  });

  it("returns null for a damaged hash", () => {
    expect(decodeState("%%%not-base64")).toBeNull();
  });
});
