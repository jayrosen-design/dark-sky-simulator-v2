import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { reloadForNewBuild, setReloadState } from "./shared/staleBuild";
import { useStore } from "./state/store";

// Vite reports a failed lazy-chunk load here; after a redeploy that means the tab is on an old build.
// Keep the open tab across that reload.
setReloadState(() => ({ t: useStore.getState().tab }));
window.addEventListener("vite:preloadError", (ev) => { if (reloadForNewBuild()) ev.preventDefault(); });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
