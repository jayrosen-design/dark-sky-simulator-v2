// One line on an artwork card: who owns the land it stands on (from the public buildings package, loaded on request).
import { useBuildings } from "../buildings";
import { allFacilities, CLASS_COLOR, LAND_LABEL, landOwnerOfArt, landOwnerOfWork } from "../engine/facilities";
import { usePaps } from "../state";

export default function LandLine({ artId, workId }: { artId?: string; workId?: string }) {
  const b = useBuildings();
  if (!b.pkg) return <p className="text-[11px]"><button className="text-glow-400 underline" onClick={() => b.load()} disabled={b.loading}>
    {b.loading ? "Loading land owners…" : "Show who owns this land"}</button></p>;
  const lo = artId ? landOwnerOfArt(b.pkg, artId) : workId ? landOwnerOfWork(b.pkg, workId) : null;
  if (!lo) return null;
  const color = (CLASS_COLOR as Record<string, string>)[lo.cls] ?? "#a79f88";
  return (
    <p className="text-[11px] text-star-300">Land: <span style={{ color }}>■</span> {LAND_LABEL[lo.cls]}{lo.owner ? <span className="text-star-500"> · {lo.owner}</span> : null}
      {lo.facilityId && <> · <button className="text-glow-400 underline" onClick={() => {
        const f = allFacilities(b.pkg!).find((x) => x.id === lo.facilityId);
        usePaps.getState().setTab("buildings");
        b.set({ sel: lo.facilityId });
        if (f) b.fly(f.lon, f.lat, f.source === "alachua" ? 16.5 : 15);
      }}>open the building</button></>}</p>
  );
}

