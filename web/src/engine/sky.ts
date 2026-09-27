// Low-precision astronomy for the all-sky view: sidereal time, Sun and Moon positions (Astronomical Almanac
// low-precision formulae, ~0.01° Sun, ~0.3° Moon), Moon phase, twilight and moonlight sky brightness, and
// time-zone conversion for the site's local clock. Pure functions; no DOM or three.js.

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export const SITE_TZ = "America/New_York";

/** Days since J2000.0 (2000-01-01 12:00 TT, UT used). */
export const daysJ2000 = (ms: number) => ms / 86400000 + 2440587.5 - 2451545.0;

/** Local mean sidereal time in degrees (lon east-positive). */
export function lstDeg(ms: number, lonDeg: number) {
  return norm360(280.46061837 + 360.98564736629 * daysJ2000(ms) + lonDeg);
}

const obliquity = (d: number) => 23.439 - 0.00000036 * d;

function eclToEq(lambda: number, beta: number, eps: number) {
  const ra = Math.atan2(sin(lambda) * cos(eps) - Math.tan(beta * RAD) * sin(eps), cos(lambda)) / RAD;
  const dec = Math.asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda)) / RAD;
  return { ra: norm360(ra), dec };
}

/** Geocentric Sun: ecliptic longitude and RA/Dec in degrees. */
export function sunPosition(ms: number) {
  const d = daysJ2000(ms);
  const g = 357.529 + 0.98560028 * d;
  const q = 280.459 + 0.98564736 * d;
  const lambda = norm360(q + 1.915 * sin(g) + 0.02 * sin(2 * g));
  return { lambda, ...eclToEq(lambda, 0, obliquity(d)) };
}

/** Geocentric Moon: ecliptic longitude/latitude and RA/Dec in degrees. */
export function moonPosition(ms: number) {
  const d = daysJ2000(ms);
  const T = d / 36525;
  const lambda = norm360(218.32 + 481267.881 * T
    + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T) + 0.66 * sin(235.7 + 890534.22 * T)
    + 0.21 * sin(269.9 + 954397.74 * T) - 0.19 * sin(357.5 + 35999.05 * T) - 0.11 * sin(186.5 + 966404.03 * T));
  const beta = 5.13 * sin(93.3 + 483202.02 * T) + 0.28 * sin(228.2 + 960400.89 * T)
    - 0.28 * sin(318.3 + 6003.15 * T) - 0.17 * sin(217.6 - 407332.21 * T);
  return { lambda, beta, ...eclToEq(lambda, beta, obliquity(d)) };
}

/** Altitude and azimuth (from north, clockwise) in degrees. */
export function altAz(raDeg: number, decDeg: number, lst: number, latDeg: number) {
  const H = lst - raDeg;
  const alt = Math.asin(sin(latDeg) * sin(decDeg) + cos(latDeg) * cos(decDeg) * cos(H)) / RAD;
  const az = Math.atan2(-cos(decDeg) * sin(H), sin(decDeg) * cos(latDeg) - cos(decDeg) * cos(H) * sin(latDeg)) / RAD;
  return { alt, az: norm360(az) };
}

/** Scene direction (three.js: x = east, y = up, z = south) for an altitude/azimuth. */
export function dirFromAltAz(altDeg: number, azDeg: number): [number, number, number] {
  return [sin(azDeg) * cos(altDeg), sin(altDeg), -cos(azDeg) * cos(altDeg)];
}

/** Row-major 3x3 rotation taking equatorial unit vectors (x→RA 0h, z→north pole) to scene coordinates. */
export function equatorialToScene(lst: number, latDeg: number): number[] {
  const t = lst * RAD, f = latDeg * RAD;
  return [
    -Math.sin(t), Math.cos(t), 0,
    Math.cos(f) * Math.cos(t), Math.cos(f) * Math.sin(t), Math.sin(f),
    Math.sin(f) * Math.cos(t), Math.sin(f) * Math.sin(t), -Math.cos(f),
  ];
}

export function eqUnit(raDeg: number, decDeg: number): [number, number, number] {
  return [cos(decDeg) * cos(raDeg), cos(decDeg) * sin(raDeg), sin(decDeg)];
}

/** Galactic north pole (J2000), for placing the Milky Way. */
export const GALACTIC_POLE = { ra: 192.859, dec: 27.128 };

export interface SkyState {
  lst: number;
  sun: { alt: number; az: number };
  moon: { alt: number; az: number; illum: number; phaseAngle: number; waxing: boolean; name: string };
  twilight: string;
}

export function skyState(ms: number, latDeg: number, lonDeg: number): SkyState {
  const lst = lstDeg(ms, lonDeg);
  const s = sunPosition(ms), m = moonPosition(ms);
  const sun = altAz(s.ra, s.dec, lst, latDeg);
  const mh = altAz(m.ra, m.dec, lst, latDeg);
  mh.alt -= 0.95 * cos(mh.alt); // topocentric parallax (~0.95°)
  const elong = Math.acos(cos(m.beta) * cos(m.lambda - s.lambda)) / RAD;
  const waxing = norm360(m.lambda - s.lambda) < 180;
  const illum = (1 - cos(elong)) / 2;
  const name = illum < 0.03 ? "New Moon" : illum > 0.97 ? "Full Moon"
    : illum < 0.47 ? (waxing ? "Waxing crescent" : "Waning crescent")
    : illum <= 0.53 ? (waxing ? "First quarter" : "Last quarter")
    : (waxing ? "Waxing gibbous" : "Waning gibbous");
  const twilight = sun.alt > -0.83 ? "Daytime" : sun.alt > -6 ? "Civil twilight" : sun.alt > -12 ? "Nautical twilight"
    : sun.alt > -18 ? "Astronomical twilight" : "Night";
  return { lst, sun, moon: { ...mh, illum, phaseAngle: 180 - elong, waxing, name }, twilight };
}

// ---------------------------------------------------------------- sky brightness (V, mag/arcsec²)

const L = (mag: number) => 10 ** (-0.4 * mag);
const M = (lum: number) => -2.5 * Math.log10(lum);
export const NATURAL_MAG = 21.9;

/** Approximate zenith twilight brightness vs Sun altitude (illustrative curve through typical measured values). */
const TWILIGHT: [number, number][] = [[-18, 21.9], [-15, 20.8], [-12, 18.8], [-9, 16.0], [-6, 12.8], [-3, 10.0], [0, 7.5], [10, 4.5], [90, 3.5]];
export function twilightMag(sunAlt: number) {
  if (sunAlt <= TWILIGHT[0][0]) return Infinity;
  for (let i = 1; i < TWILIGHT.length; i++) {
    const [a1, m1] = TWILIGHT[i - 1], [a2, m2] = TWILIGHT[i];
    if (sunAlt <= a2) return m1 + ((sunAlt - a1) / (a2 - a1)) * (m2 - m1);
  }
  return TWILIGHT[TWILIGHT.length - 1][1];
}

/** Moonlight at the zenith, Krisciunas & Schaefer (1991) with k = 0.172 (V). Infinity when the Moon is down. */
export function moonlightMag(phaseAngle: number, moonAlt: number) {
  if (moonAlt <= 0) return Infinity;
  const k = 0.172;
  const a = Math.abs(phaseAngle);
  const istar = 10 ** (-0.4 * (3.84 + 0.026 * a + 4e-9 * a ** 4));
  const rho = 90 - moonAlt, zm = 90 - moonAlt;
  const f = 10 ** 5.36 * (1.06 + cos(rho) ** 2) + 10 ** (6.15 - rho / 40);
  const X = (z: number) => 1 / Math.sqrt(1 - 0.96 * sin(z) ** 2);
  const B = f * istar * 10 ** (-0.4 * k * X(0)) * (1 - 10 ** (-0.4 * k * X(zm))); // nanoLamberts
  return (20.7233 - Math.log(B / 34.08)) / 0.92104;
}

/** Zenith brightness now: modeled artificial + natural sky plus twilight and moonlight excess. */
export function skyNow(modelMag: number, st: SkyState) {
  const twi = Math.max(0, L(twilightMag(st.sun.alt)) - L(NATURAL_MAG));
  const moon = L(moonlightMag(st.moon.phaseAngle, st.moon.alt));
  return { mag: M(L(modelMag) + twi + moon), twilightMag: M(L(NATURAL_MAG) + twi), moonMag: moon > 0 ? M(moon) : Infinity };
}

// ---------------------------------------------------------------- site clock

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(ms)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}

export function utcToZoned(ms: number, tz = SITE_TZ) {
  return parts(ms, tz);
}

/** UTC ms for a wall-clock date and minutes after midnight in `tz` (DST-aware). */
export function zonedToUtc(y: number, mo: number, d: number, minutes: number, tz = SITE_TZ) {
  const guess = Date.UTC(y, mo - 1, d, 0, minutes);
  const offset = (ms: number) => { const p = parts(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
  let t = guess - offset(guess);
  const o2 = offset(t);
  if (guess - o2 !== t) t = guess - o2;
  return t;
}

// ---------------------------------------------------------------- bright stars (J2000, rounded to 0.01°)

export interface BrightStar { name: string; ra: number; dec: number; mag: number; tint?: [number, number, number] }
const ORANGE: [number, number, number] = [1, 0.78, 0.55], BLUE: [number, number, number] = [0.8, 0.88, 1];
export const BRIGHT_STARS: BrightStar[] = [
  { name: "Sirius", ra: 101.29, dec: -16.72, mag: -1.46, tint: BLUE },
  { name: "Canopus", ra: 95.99, dec: -52.70, mag: -0.74 },
  { name: "Arcturus", ra: 213.92, dec: 19.18, mag: -0.05, tint: ORANGE },
  { name: "Vega", ra: 279.23, dec: 38.78, mag: 0.03, tint: BLUE },
  { name: "Capella", ra: 79.17, dec: 46.00, mag: 0.08 },
  { name: "Rigel", ra: 78.63, dec: -8.20, mag: 0.13, tint: BLUE },
  { name: "Procyon", ra: 114.83, dec: 5.22, mag: 0.34 },
  { name: "Betelgeuse", ra: 88.79, dec: 7.41, mag: 0.5, tint: ORANGE },
  { name: "Altair", ra: 297.70, dec: 8.87, mag: 0.76 },
  { name: "Aldebaran", ra: 68.98, dec: 16.51, mag: 0.86, tint: ORANGE },
  { name: "Antares", ra: 247.35, dec: -26.43, mag: 0.96, tint: ORANGE },
  { name: "Spica", ra: 201.30, dec: -11.16, mag: 0.97, tint: BLUE },
  { name: "Pollux", ra: 116.33, dec: 28.03, mag: 1.14, tint: ORANGE },
  { name: "Fomalhaut", ra: 344.41, dec: -29.62, mag: 1.16 },
  { name: "Deneb", ra: 310.36, dec: 45.28, mag: 1.25 },
  { name: "Regulus", ra: 152.09, dec: 11.97, mag: 1.35, tint: BLUE },
  { name: "Castor", ra: 113.65, dec: 31.89, mag: 1.58 },
  { name: "Bellatrix", ra: 81.28, dec: 6.35, mag: 1.64, tint: BLUE },
  { name: "Alnilam", ra: 84.05, dec: -1.20, mag: 1.69, tint: BLUE },
  { name: "Alnitak", ra: 85.19, dec: -1.94, mag: 1.77, tint: BLUE },
  { name: "Mintaka", ra: 83.00, dec: -0.30, mag: 2.23, tint: BLUE },
  { name: "Saiph", ra: 86.94, dec: -9.67, mag: 2.09, tint: BLUE },
  { name: "Polaris", ra: 37.95, dec: 89.26, mag: 1.98 },
  { name: "Dubhe", ra: 165.93, dec: 61.75, mag: 1.79, tint: ORANGE },
  { name: "Merak", ra: 165.46, dec: 56.38, mag: 2.37 },
  { name: "Phecda", ra: 178.46, dec: 53.69, mag: 2.44 },
  { name: "Megrez", ra: 183.86, dec: 57.03, mag: 3.31 },
  { name: "Alioth", ra: 193.51, dec: 55.96, mag: 1.77 },
  { name: "Mizar", ra: 200.98, dec: 54.93, mag: 2.23 },
  { name: "Alkaid", ra: 206.89, dec: 49.31, mag: 1.86, tint: BLUE },
  { name: "Schedar", ra: 10.13, dec: 56.54, mag: 2.24, tint: ORANGE },
  { name: "Caph", ra: 2.29, dec: 59.15, mag: 2.28 },
  { name: "Gamma Cas", ra: 14.18, dec: 60.72, mag: 2.47, tint: BLUE },
  { name: "Ruchbah", ra: 21.45, dec: 60.24, mag: 2.68 },
  { name: "Segin", ra: 28.60, dec: 63.67, mag: 3.37 },
];

// ---------------------------------------------------------------- night summary

export interface NightSummary {
  noon: number;              // local noon starting this night (UTC ms)
  dusk: number | null;       // Sun reaches -18° (astronomical dusk)
  dawn: number | null;       // Sun back to -18°
  moonRise: number | null; moonSet: number | null;
  moonIllum: number; moonName: string;
  darkMoonlessHours: number; // Sun < -18° and Moon down (or < 5% lit)
}

/** Scan a night (local noon to noon, site clock) in 5-minute steps. */
export function nightSummary(y: number, mo: number, d: number, latDeg: number, lonDeg: number, tz = SITE_TZ): NightSummary {
  const noon = zonedToUtc(y, mo, d, 720, tz);
  const step = 5 * 60000;
  let dusk: number | null = null, dawn: number | null = null, rise: number | null = null, set: number | null = null, dark = 0;
  let prev = skyState(noon, latDeg, lonDeg), mid = prev;
  for (let k = 1; k <= 288; k++) {
    const t = noon + k * step, st = skyState(t, latDeg, lonDeg);
    if (dusk === null && prev.sun.alt > -18 && st.sun.alt <= -18) dusk = t;
    if (dusk !== null && prev.sun.alt <= -18 && st.sun.alt > -18) dawn = t;
    if (rise === null && prev.moon.alt <= 0 && st.moon.alt > 0) rise = t;
    if (set === null && prev.moon.alt > 0 && st.moon.alt <= 0) set = t;
    if (st.sun.alt < -18 && (st.moon.alt <= 0 || st.moon.illum < 0.05)) dark += 5 / 60;
    if (k === 144) mid = st;
    prev = st;
  }
  return { noon, dusk, dawn, moonRise: rise, moonSet: set, moonIllum: mid.moon.illum, moonName: mid.moon.name, darkMoonlessHours: dark };
}

/** Short site-clock label, e.g. "Sat 23:00". */
export function siteTimeLabel(ms: number, withDate = false, tz = SITE_TZ) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    ...(withDate ? { month: "numeric", day: "numeric" } : {}) }).format(ms);
}

/** The evening date (site clock) of the night containing `ms`: times before local noon belong to the previous evening. */
export function nightDateOf(ms: number, tz = SITE_TZ) {
  const z = parts(ms, tz);
  if (z.h >= 12) return { y: z.y, mo: z.mo, d: z.d };
  const p = new Date(Date.UTC(z.y, z.mo - 1, z.d - 1));
  return { y: p.getUTCFullYear(), mo: p.getUTCMonth() + 1, d: p.getUTCDate() };
}
