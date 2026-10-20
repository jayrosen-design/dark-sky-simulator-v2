// VIIRS layers (one per year, plus [pct_change, step_year, step_pct]) loaded once and shared by the map and the AI tab.
import { useEffect, useState } from "react";
import { loadLin16, loadLog16 } from "../data/load";
import type { EngineData } from "../engine/types";

export interface ViirsLayers { years: Float32Array[]; trend: Float32Array[] }

let pending: Promise<ViirsLayers> | null = null;

export function useViirsLayers(e: EngineData, want: boolean): ViirsLayers | null {
  const [v, setV] = useState<ViirsLayers | null>(null);
  useEffect(() => {
    const yearsMeta = e.files.viirs_a15, trendMeta = e.files.viirs_trend_a15;
    if (!want || v || !yearsMeta || !trendMeta) return;
    pending ??= Promise.all([loadLog16(yearsMeta), loadLin16(trendMeta)]).then(([years, trend]) => ({ years, trend }));
    let live = true;
    pending.then((x) => { if (live) setV(x); });
    return () => { live = false; };
  }, [want, v, e]);
  return v;
}
