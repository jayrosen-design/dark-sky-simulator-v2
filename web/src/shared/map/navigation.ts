// Trackpad-friendly map navigation (shared): two-finger swipe pans, pinch (reported as Ctrl + wheel) zooms at the
// pointer, Shift/Alt + swipe rotates and tilts; a mouse wheel still zooms.
import type { Map as MlMap } from "maplibre-gl";

/** Install the trackpad handler; returns a function that removes it and restores MapLibre's scroll zoom. */
export function enableTrackpadNav(map: MlMap, maxPitch = 75) {
  const box = map.getCanvasContainer();
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const r = box.getBoundingClientRect(), at = map.unproject([ev.clientX - r.left, ev.clientY - r.top]);
    const mouseWheel = ev.deltaMode === 1 || (ev.deltaX === 0 && Math.abs(ev.deltaY) >= 50 && Number.isInteger(ev.deltaY));
    if (ev.ctrlKey || mouseWheel) map.easeTo({ zoom: map.getZoom() - ev.deltaY * (ev.ctrlKey ? 0.012 : 0.0025), around: at, duration: 0 });
    else if (ev.shiftKey || ev.altKey) map.easeTo({ bearing: map.getBearing() + ev.deltaX * 0.3, pitch: Math.min(maxPitch, Math.max(0, map.getPitch() - ev.deltaY * 0.25)), duration: 0 });
    else map.panBy([ev.deltaX, ev.deltaY], { duration: 0 });
  };
  map.scrollZoom.disable();
  box.addEventListener("wheel", onWheel, { passive: false });
  return () => { box.removeEventListener("wheel", onWheel); map.scrollZoom.enable(); };
}
