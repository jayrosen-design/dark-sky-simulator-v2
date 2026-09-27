/** @type {import('tailwindcss').Config} */
export default {
  content: { relative: true, files: ["./index.html", "./src/**/*.{ts,tsx}"] },
  theme: {
    extend: {
      colors: {
        ink: { 950: "#05070d", 900: "#0a0f1c", 800: "#111a2e", 700: "#1a2642", 600: "#2a3a60" },
        star: { 100: "#f5f1e6", 300: "#d9d2bd", 500: "#a79f88" },
        amber: { 400: "#f6b44b", 500: "#e8962c" },
        glow: { 400: "#7cc4ff", 500: "#4aa3f0" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
