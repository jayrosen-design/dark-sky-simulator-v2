// Schematic thumbnails for the lighting catalog (drawn here, not manufacturer photos). The light cone is tinted by
// color temperature and points only downward for full-cutoff (U0) fixtures; U1 adds a faint glow above.
import type { SpdCode } from "../engine/types";

const CONE: Record<string, string> = {
  LED4000: "#fff3d9", LED3000: "#ffdca3", LED2700: "#ffcc8a", PCA590: "#ffb04a", NBA: "#ff962e", HPS: "#ffb85c", MH: "#f4f7ff",
};
const METAL = "#9aa5b8";
const DARK = "#4b5568";

function Cone({ x, y, w, h, color, spread = 1, id }: { x: number; y: number; w: number; h: number; color: string; spread?: number; id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.85" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${x - w / 2},${y} ${x + w / 2},${y} ${x + (w / 2) * spread * 3},${y + h} ${x - (w / 2) * spread * 3},${y + h}`} fill={`url(#${id})`} />
    </>
  );
}

export default function FixtureIcon({ archetype, spd = "LED3000", u = 0, size = 64, uid }: {
  archetype: string; spd?: SpdCode; u?: number; size?: number; uid: string;
}) {
  const color = CONE[spd] ?? CONE.LED3000;
  const id = `cone-${uid}`;
  const glow = u > 0 ? <ellipse cx="32" cy="12" rx="10" ry="4" fill={color} opacity="0.18" /> : null;
  let body: JSX.Element;
  switch (archetype) {
    case "cobra":
      body = <>
        <rect x="14" y="10" width="3" height="46" fill={DARK} />
        <path d="M16 13 Q24 10 34 13" stroke={DARK} strokeWidth="3" fill="none" />
        <path d="M31 11 h17 q3 0 3 3 v1 h-20 z" fill={METAL} />
        <Cone x={41} y={16} w={16} h={40} color={color} spread={0.9} id={id} />
      </>;
      break;
    case "shoebox":
      body = <>
        <rect x="30.5" y="16" width="3" height="40" fill={DARK} />
        <rect x="21" y="11" width="22" height="6" rx="1" fill={METAL} />
        <Cone x={32} y={17} w={20} h={39} color={color} spread={0.8} id={id} />
      </>;
      break;
    case "posttop":
      body = <>
        <rect x="30.5" y="24" width="3" height="32" fill={DARK} />
        <path d="M24 16 h16 l-2 8 h-12 z" fill={METAL} />
        <rect x="22" y="13" width="20" height="3" rx="1" fill={DARK} />
        <Cone x={32} y={24} w={12} h={32} color={color} spread={1.1} id={id} />
      </>;
      break;
    case "decorative":
      body = <>
        <rect x="30.5" y="22" width="3" height="34" fill={DARK} />
        <path d="M22 18 q10 -10 20 0 z" fill={METAL} />
        <rect x="26" y="18" width="12" height="4" fill={DARK} />
        <Cone x={32} y={22} w={12} h={34} color={color} spread={1.1} id={id} />
      </>;
      break;
    case "wallpack":
      body = <>
        <rect x="8" y="8" width="10" height="48" fill={DARK} />
        <path d="M18 18 h12 l-3 9 h-9 z" fill={METAL} />
        <Cone x={24} y={27} w={10} h={29} color={color} spread={1.2} id={id} />
      </>;
      break;
    case "canopy":
      body = <>
        <rect x="6" y="10" width="52" height="7" fill={DARK} />
        <rect x="14" y="17" width="12" height="2" fill={METAL} />
        <rect x="38" y="17" width="12" height="2" fill={METAL} />
        <Cone x={20} y={19} w={12} h={37} color={color} spread={0.7} id={`${id}a`} />
        <Cone x={44} y={19} w={12} h={37} color={color} spread={0.7} id={`${id}b`} />
        <rect x="8" y="17" width="3" height="39" fill={DARK} />
        <rect x="53" y="17" width="3" height="39" fill={DARK} />
      </>;
      break;
    case "flood":
      body = <>
        <rect x="8" y="8" width="8" height="48" fill={DARK} />
        <path d="M16 20 l8 -2 l8 8 l-6 4 z" fill={METAL} />
        <path d="M15 17 h16 v2 h-16 z" fill={DARK} />
        <Cone x={28} y={26} w={10} h={30} color={color} spread={1.3} id={id} />
      </>;
      break;
    case "porch":
      body = <>
        <rect x="6" y="6" width="14" height="50" fill="#3a4356" />
        <rect x="11" y="44" width="5" height="12" fill="#2a3142" />
        <path d="M20 20 h10 v4 h-10 z" fill={DARK} />
        <path d="M24 24 h12 l-2 6 h-8 z" fill={METAL} />
        <Cone x={30} y={30} w={9} h={26} color={color} spread={1.2} id={id} />
      </>;
      break;
    case "sports":
      body = <>
        <rect x="30.5" y="16" width="3" height="40" fill={DARK} />
        <rect x="18" y="8" width="28" height="3" fill={DARK} />
        {[20, 27, 34, 41].map((x) => <rect key={x} x={x} y="11" width="5" height="5" fill={METAL} />)}
        <path d="M18 16 h28 v1 h-28 z" fill={DARK} />
        <Cone x={32} y={17} w={26} h={39} color={color} spread={1.4} id={id} />
      </>;
      break;
    case "highmast":
      body = <>
        <rect x="30.5" y="10" width="3" height="46" fill={DARK} />
        <ellipse cx="32" cy="10" rx="14" ry="3" fill={METAL} />
        <Cone x={32} y={12} w={24} h={44} color={color} spread={1.6} id={id} />
      </>;
      break;
    default:
      body = <circle cx="32" cy="24" r="8" fill={METAL} />;
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1230" />
          <stop offset="1" stopColor="#141d3a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="10" fill={`url(#sky-${uid})`} />
      {[[8, 6], [50, 5], [56, 14], [40, 4], [4, 18]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.7" fill="#dfe6ff" opacity="0.8" />)}
      {glow}
      {body}
      <rect x="0" y="56" width="64" height="8" rx="0" fill="#1f2a1f" />
    </svg>
  );
}
