// On-screen camera buttons (shared), for trackpads and touch screens without right-drag.
import type { Map as MlMap } from "maplibre-gl";

export default function CameraPad({ map, className = "", maxPitch = 75, resetPitch = 60 }: { map: MlMap | null; className?: string; maxPitch?: number; resetPitch?: number }) {
  if (!map) return null;
  const btn = "flex h-7 w-7 items-center justify-center rounded bg-ink-950/85 text-sm text-star-100 hover:bg-ink-800";
  const turn = (d: number) => map.easeTo({ bearing: map.getBearing() + d, duration: 300 });
  const tilt = (d: number) => map.easeTo({ pitch: Math.min(maxPitch, Math.max(0, map.getPitch() + d)), duration: 300 });
  return (
    <div className={`absolute bottom-14 right-2 grid grid-cols-3 gap-1 rounded-lg bg-ink-950/60 p-1 backdrop-blur ${className}`} role="group" aria-label="Map camera">
      <button className={btn} onClick={() => turn(-20)} aria-label="Turn left" title="Turn left">⟲</button>
      <button className={btn} onClick={() => tilt(10)} aria-label="Tilt toward horizon" title="Tilt toward horizon">▲</button>
      <button className={btn} onClick={() => turn(20)} aria-label="Turn right" title="Turn right">⟳</button>
      <button className={btn} onClick={() => map.zoomOut({ duration: 300 })} aria-label="Zoom out" title="Zoom out">−</button>
      <button className={btn} onClick={() => tilt(-10)} aria-label="Tilt toward overhead" title="Tilt toward overhead">▼</button>
      <button className={btn} onClick={() => map.zoomIn({ duration: 300 })} aria-label="Zoom in" title="Zoom in">+</button>
      <button className={`${btn} col-span-3 w-auto text-[10px]`} onClick={() => map.easeTo({ bearing: 0, pitch: resetPitch, duration: 500 })} aria-label="Reset view to north">Reset north</button>
    </div>
  );
}
