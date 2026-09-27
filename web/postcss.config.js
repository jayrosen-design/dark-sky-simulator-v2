import { fileURLToPath } from "node:url";

// Explicit config path: the dev server may be launched from a parent directory.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)) },
    autoprefixer: {},
  },
};
