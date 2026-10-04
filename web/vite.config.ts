import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative so the static build works under any sub-path
// (GitHub Pages or jayrosen.design/dark-sky/v2/). One build serves a homepage (index.html, static) and three apps
// with common code in src/shared: the Dark Sky Simulator (dark-sky/index.html, served at /dark-sky/); WildSight, whose
// homepage (wildsight/index.html) embeds the WildSight Planner (wildsight/planner.html); and the Public Art Policy
// Simulator (public-art/index.html).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { rollupOptions: { input: { home: resolve(__dirname, "index.html"), darksky: resolve(__dirname, "dark-sky/index.html"),
    wildsight: resolve(__dirname, "wildsight/index.html"), planner: resolve(__dirname, "wildsight/planner.html"),
    publicart: resolve(__dirname, "public-art/index.html") } } },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
