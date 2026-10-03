// WildSight Planner entry (/wildsight/planner.html, embedded in the /wildsight/ homepage). A separate app from the
// Dark Sky Simulator that shares its mapping core, UI primitives and data loader (src/shared) and its offline backend
// plumbing (ingest/, counties/region).
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
