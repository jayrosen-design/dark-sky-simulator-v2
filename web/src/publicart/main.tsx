// Public Art Policy Simulator entry (/public-art/). A separate app from the Dark Sky Simulator and WildSight that
// shares their mapping core, astronomy, UI primitives and data loader (src/shared) and the offline backend plumbing
// (ingest/, counties/region).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../index.css";
import { reloadForNewBuild } from "../shared/staleBuild";

// After a redeploy an open tab is on an old build: reload once into the new one.
window.addEventListener("vite:preloadError", (ev) => { if (reloadForNewBuild()) ev.preventDefault(); });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
