import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { reloadForNewBuild } from "./staleBuild";

// Vite reports a failed lazy-chunk load here; after a redeploy that means the tab is on an old build.
window.addEventListener("vite:preloadError", (ev) => { if (reloadForNewBuild()) ev.preventDefault(); });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
