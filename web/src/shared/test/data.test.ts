import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../data";

const reply = (body: string, type: string, status = 200) => vi.fn(async () => new Response(body, { status, headers: { "content-type": type } }));

describe("shared data loader", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads JSON from data/ next to the page", async () => {
    const f = reply('{"ok":1}', "application/json");
    vi.stubGlobal("fetch", f);
    expect(await fetchJson<{ ok: number }>("meta.json")).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledWith("data/meta.json");
  });

  it("reports a dev-server HTML fallback as a missing file, and HTTP errors by status", async () => {
    vi.stubGlobal("fetch", reply("<!doctype html><html></html>", "text/html"));
    await expect(fetchJson("wildsight.json")).rejects.toThrow(/wildsight.json was not found/);
    vi.stubGlobal("fetch", reply("nope", "text/plain", 404));
    await expect(fetchJson("x.json")).rejects.toThrow(/HTTP 404/);
  });
});
