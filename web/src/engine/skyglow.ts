// Directional sky brightness for the all-sky view indicators (glow curve, luminance readout, false-color map).
// The zenith value is the model's (artificial + natural, plus twilight and moonlight); how brightness spreads over
// the sky is illustrative: brightening toward the horizon, Gaussian light domes toward the regional towns, and
// forward scattering around the Sun and Moon. Each component is normalized so the zenith equals the modeled value.
// SKYGLOW_GLSL mirrors luminanceAt() for the shader; keep the two in step.
import { NATURAL_MAG } from "../shared/sky";

const RAD = Math.PI / 180;
/** Light-dome brightness near the horizon relative to the zenith artificial glow. At Rosemary Hill (Gainesville ~30 km
 *  away, dome strength ~0.35) the sky at 10° altitude toward Gainesville comes out ~0.2 mag brighter than the darkest
 *  direction. Illustrative; the model computes only the zenith value. */
const DOME_GAIN = 20;
/** Linear luminance relative to 22.0 mag/arcsec² (natural sky ≈ 1.1), to keep shader floats well-scaled. */
export const rel = (mag: number) => 10 ** (-0.4 * (mag - 22));
export const magOf = (r: number) => 22 - 2.5 * Math.log10(r);
/** mag/arcsec² → mcd/m² (L = 10.8e4 · 10^(-0.4 m) cd/m²). */
export const mcdOf = (mag: number) => 10.8e4 * 10 ** (-0.4 * mag) * 1000;

export interface Dome { name: string; km: number; az: number; strength: number } // az in degrees from north

export function domesFor(lightDomes: { name: string; lat: number; lon: number; population: number }[], lat: number, lon: number): Dome[] {
  return lightDomes.map((d) => {
    const dx = (d.lon - lon) * Math.cos(lat * RAD), dy = d.lat - lat;
    const km = Math.hypot(dx, dy) * 111.32;
    return { name: d.name, km, az: ((Math.atan2(dx, dy) / RAD) + 360) % 360, strength: Math.min(1.5, (d.population / 150000) * (20 / Math.max(km, 5)) ** 2.5) };
  }).filter((d) => d.strength > 0.01).sort((a, b) => b.strength - a.strength).slice(0, 8);
}

export interface GlowModel {
  art: number; nat: number; twi: number; moon: number;   // zenith components, relative units
  domes: Dome[];
  sun: { alt: number; az: number }; moonPos: { alt: number; az: number };
}

/** Components from the modeled zenith magnitude (which already includes the natural sky) and twilight/moon magnitudes. */
export function glowModel(modelMag: number, twilightMag: number, moonMag: number, domes: Dome[], sun: { alt: number; az: number }, moonPos: { alt: number; az: number }): GlowModel {
  const nat = rel(NATURAL_MAG);
  return {
    art: Math.max(0, rel(modelMag) - nat), nat,
    twi: Math.max(0, rel(twilightMag) - nat), moon: Number.isFinite(moonMag) ? rel(moonMag) : 0,
    domes, sun, moonPos,
  };
}

const unit = (alt: number, az: number): [number, number, number] => [Math.sin(az * RAD) * Math.cos(alt * RAD), Math.sin(alt * RAD), -Math.cos(az * RAD) * Math.cos(alt * RAD)];
const angle = (a: [number, number, number], b: [number, number, number]) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

// Unnormalized shapes; each is divided by its value at the zenith.
function shapeArt(g: GlowModel, alt: number, az: number) {
  const hz = 1 - Math.sin(Math.max(0, alt) * RAD);
  let dome = 0;
  for (const d of g.domes) {
    const da = (((az - d.az) % 360) + 540) % 360 - 180;
    dome += DOME_GAIN * d.strength * Math.exp(-((da * RAD) ** 2) / 0.25);
  }
  return 1 + 0.8 * hz * hz + dome * Math.exp(-(Math.max(0, alt) * RAD) / 0.18);
}
const shapeNat = (alt: number) => 1 + 1.5 * (1 - Math.sin(Math.max(0, alt) * RAD)) ** 3;
const shapeTwi = (dir: [number, number, number], sun: [number, number, number], alt: number) => 1 + 3 * Math.exp(-angle(dir, sun) / 0.6) * (1 - Math.sin(Math.max(0, alt) * RAD));
const shapeMoon = (dir: [number, number, number], moon: [number, number, number]) => 1 + 4 * Math.exp(-angle(dir, moon) / 0.25);

/** Relative luminance (see rel) in the direction alt/az, degrees. */
export function luminanceAt(g: GlowModel, alt: number, az: number) {
  const dir = unit(alt, az), zen: [number, number, number] = [0, 1, 0];
  const sun = unit(g.sun.alt, g.sun.az), moon = unit(g.moonPos.alt, g.moonPos.az);
  return g.art * shapeArt(g, alt, az) / shapeArt(g, 90, 0)
    + g.nat * shapeNat(alt) / shapeNat(90)
    + g.twi * shapeTwi(dir, sun, alt) / shapeTwi(zen, sun, 90)
    + (g.moonPos.alt > 0 ? g.moon * shapeMoon(dir, moon) / shapeMoon(zen, moon) : 0);
}

/** Sky-glow curve: mag/arcsec² at a fixed altitude for each azimuth step. */
export function glowCurve(g: GlowModel, altDeg = 10, stepDeg = 2) {
  const out: { az: number; mag: number }[] = [];
  for (let az = 0; az <= 360; az += stepDeg) out.push({ az, mag: magOf(luminanceAt(g, altDeg, az)) });
  return out;
}

/** Uniform values for SKYGLOW_GLSL. */
export function glowUniforms(g: GlowModel) {
  const sun = unit(g.sun.alt, g.sun.az), moon = unit(g.moonPos.alt, g.moonPos.az), zen: [number, number, number] = [0, 1, 0];
  return {
    uArt: g.art / shapeArt(g, 90, 0), uNat: g.nat / shapeNat(90),
    uTwiL: g.twi / shapeTwi(zen, sun, 90), uMoonL: g.moonPos.alt > 0 ? g.moon / shapeMoon(zen, moon) : 0,
    uGDomeAz: g.domes.map((d) => d.az * RAD).concat(Array(8).fill(0)).slice(0, 8),
    uGDomeS: g.domes.map((d) => d.strength).concat(Array(8).fill(0)).slice(0, 8),
    uSunDir: sun, uMoonDir: moon,
  };
}

/** GLSL twin of luminanceAt (dir: unit vector, y up, azimuth = atan(x, -z)). */
export const SKYGLOW_GLSL = `
  uniform float uArt; uniform float uNat; uniform float uTwiL; uniform float uMoonL;
  uniform float uGDomeAz[8]; uniform float uGDomeS[8]; uniform vec3 uSunDir; uniform vec3 uMoonDir;
  float skyLum(vec3 dir) {
    float alt = asin(clamp(dir.y, 0.0, 1.0));
    float hz = 1.0 - sin(alt);
    float az = atan(dir.x, -dir.z);
    float dome = 0.0;
    for (int i = 0; i < 8; i++) {
      float d = mod(az - uGDomeAz[i] + 3.14159265, 6.2831853) - 3.14159265;
      dome += ${DOME_GAIN.toFixed(1)} * uGDomeS[i] * exp(-d * d / 0.25);
    }
    float art = 1.0 + 0.8 * hz * hz + dome * exp(-alt / 0.18);
    float nat = 1.0 + 1.5 * hz * hz * hz;
    float twi = 1.0 + 3.0 * exp(-acos(clamp(dot(dir, uSunDir), -1.0, 1.0)) / 0.6) * hz;
    float moon = 1.0 + 4.0 * exp(-acos(clamp(dot(dir, uMoonDir), -1.0, 1.0)) / 0.25);
    return uArt * art + uNat * nat + uTwiL * twi + uMoonL * moon;
  }
  // False-color scale by mag/arcsec²: 22 navy, 21 blue, 20 green, 19 yellow, 18 orange, 17 red, 16 white.
  vec3 lumColor(float lum) {
    float m = 22.0 - 2.5 * log(max(lum, 1e-6)) / log(10.0);
    float t = clamp(22.0 - m, 0.0, 6.0);
    vec3 c0 = vec3(0.02,0.03,0.12), c1 = vec3(0.10,0.25,0.85), c2 = vec3(0.10,0.70,0.35), c3 = vec3(0.95,0.90,0.20), c4 = vec3(1.0,0.55,0.10), c5 = vec3(0.90,0.12,0.10), c6 = vec3(1.0,1.0,1.0);
    if (t < 1.0) return mix(c0, c1, t);
    if (t < 2.0) return mix(c1, c2, t - 1.0);
    if (t < 3.0) return mix(c2, c3, t - 2.0);
    if (t < 4.0) return mix(c3, c4, t - 3.0);
    if (t < 5.0) return mix(c4, c5, t - 4.0);
    return mix(c5, c6, t - 5.0);
  }
`;
export const LUM_LEGEND = [
  { mag: 22, css: "rgb(5,8,31)" }, { mag: 21, css: "rgb(26,64,217)" }, { mag: 20, css: "rgb(26,179,89)" }, { mag: 19, css: "rgb(242,230,51)" },
  { mag: 18, css: "rgb(255,140,26)" }, { mag: 17, css: "rgb(230,31,26)" }, { mag: 16, css: "rgb(255,255,255)" },
];
