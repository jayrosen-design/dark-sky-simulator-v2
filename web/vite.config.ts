import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative so the static build works under any sub-path
// (GitHub Pages or jayrosen.design/dark-sky/v2/). Two apps share one build: the Dark Sky Simulator (index.html)
// and the WildSight Planner (wildsight/index.html, served at /wildsight/), with common code in src/shared.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), wildsight: resolve(__dirname, "wildsight/index.html") } } },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
