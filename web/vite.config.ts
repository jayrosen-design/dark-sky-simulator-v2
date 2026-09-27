import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative so the static build works under any sub-path
// (GitHub Pages or jayrosen.design/dark-sky/v2/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
