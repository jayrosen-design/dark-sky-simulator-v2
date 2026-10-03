// Three.js sky panorama (PRD 4.1 Sky panorama row): v1's static Bortle textures are replaced by a dome
// shaded from the computed zenith luminance, horizon glow toward the regional light domes, and stars
// culled at the naked-eye limiting magnitude implied by the zenith value. Stars, Milky Way, Sun and Moon
// are placed for the chosen date and time at the site; twilight and moonlight add to the modeled sky.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BASEMAP_STYLE, maplibregl } from "../shared/map/maplibre";
import type { FeatureCollection } from "geojson";
import { useData, useModel } from "../state/model";
import { fetchJson } from "../data/load";
import { domesFor, glowCurve, glowModel, glowUniforms, luminanceAt, LUM_LEGEND, magOf, mcdOf, SKYGLOW_GLSL, type GlowModel } from "../engine/skyglow";
import { add3DLayers, set3D, setLamps } from "../map/terrain3d";
import { basemapRoads, buildLamps, lampLayers, slotLooks } from "../map/lights3d";
import { formatSky, nelmFromSqm } from "../engine/bortle";
import { BRIGHT_STARS, dirFromAltAz, eqUnit, equatorialToScene, GALACTIC_POLE, SITE_TZ, skyNow, skyState, utcToZoned, zonedToUtc, type SkyState } from "../engine/sky";

const R_STARS = 45;
const EYE_HEIGHTS = [{ m: 2, label: "Standing (2 m)" }, { m: 30, label: "Rooftop (30 m)" }, { m: 150, label: "Drone (150 m)" }, { m: 600, label: "Aircraft (600 m)" }];
let lightData: Promise<[FeatureCollection, FeatureCollection]> | null = null;
const loadLightData = () => (lightData ??= Promise.all([fetchJson<FeatureCollection>("fixtures_surveyed.geojson"), fetchJson<FeatureCollection>("sports_venues.geojson")]));
const MOON_SCALE = 3; // Moon drawn 3x its 0.52° size so the phase is readable

// Star field in equatorial coordinates: named bright stars at catalog positions, plus a deterministic synthetic
// field of fainter stars (mag 3.5-8.5, N(<m) ~ 10^(0.45 m), ~8,000 brighter than 6.5 over the whole sky as observed)
// concentrated toward the real galactic plane.
function starField() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pole = new THREE.Vector3(...eqUnit(GALACTIC_POLE.ra, GALACTIC_POLE.dec));
  const stars: { dir: THREE.Vector3; mag: number; tint: [number, number, number]; name?: string }[] =
    BRIGHT_STARS.map((s) => ({ dir: new THREE.Vector3(...eqUnit(s.ra, s.dec)), mag: s.mag, tint: s.tint ?? [1, 1, 0.95], name: s.name }));
  for (let i = 0; i < 64000; i++) {
    const mag = 8.5 - Math.log10(1 + rnd() * (10 ** (0.45 * 8.5) - 1)) / 0.45;
    let v: THREE.Vector3;
    do {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      v = new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z);
    } while (rnd() > 0.35 + 0.65 * (1 - Math.abs(v.dot(pole))) ** 3);
    if (mag >= 3.5) stars.push({ dir: v, mag, tint: [1, 1, 0.95] });
  }
  return stars;
}
const FIELD = starField();

const SPEEDS = [
  { label: "1 min/s", rate: 60 }, { label: "10 min/s", rate: 600 }, { label: "1 hr/s", rate: 3600 },
  { label: "4 nights/s, same time", rate: 0 },
];
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (az: number) => COMPASS[Math.round(az / 45) % 8];
const pad = (n: number) => String(n).padStart(2, "0");

/** Default view time: the middle of the scenario's viewing window tonight (site clock). */
function defaultTime(window: "late" | "evening") {
  const z = utcToZoned(Date.now());
  return zonedToUtc(z.y, z.mo, z.d, window === "late" ? 24 * 60 + 90 : 21 * 60 + 30);
}

/** Night-centered clock: the evening's date plus minutes since 12:00 that day (0-1440). */
function nightOf(t: number) {
  const z = utcToZoned(t);
  const minutes = z.h * 60 + z.mi;
  if (z.h >= 12) return { y: z.y, mo: z.mo, d: z.d, minute: minutes - 720, z };
  const p = new Date(Date.UTC(z.y, z.mo - 1, z.d - 1));
  return { y: p.getUTCFullYear(), mo: p.getUTCMonth() + 1, d: p.getUTCDate(), minute: minutes + 720, z };
}

/** Any place the dome can show: a named site, or a spot picked in Stargaze mode. */
export interface DomePlace { id: string; name: string; lat: number; lon: number; modelMag: number; baseMag?: number; note?: string }

interface Overlays { directions: boolean; names: boolean; ground: boolean; eye: number; indicators: boolean; lumMap: boolean }
interface Frame { st: SkyState; modelMag: number; twilightMag: number; moonMag: number; nelm: number; ov: Overlays }

export default function SkyDome({ place, sites, onPickSite, initialTime, startFull, onExitFull }: {
  place: DomePlace; sites?: { id: string; name: string }[]; onPickSite?: (id: string) => void;
  initialTime?: number; startFull?: boolean; onExitFull?: () => void;
}) {
  const m = useModel();
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(!!startFull);
  const [t, setT] = useState(() => initialTime ?? defaultTime(m.params.view_window));
  const exitRef = useRef(onExitFull);
  exitRef.current = onExitFull;
  const [ov, setOv] = useState<Overlays>({ directions: true, names: false, ground: false, eye: 2, indicators: false, lumMap: false });
  const d = useData();
  const groundHost = useRef<HTMLDivElement>(null);
  const cam = useRef<[number, number, number]>([Math.PI, 0.45, 75]);          // yaw, pitch (rad), vertical fov (deg)
  const groundSync = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const modelMag = place.modelMag;
  const siteDef = useMemo(() => ({ lat: place.lat, lon: place.lon }), [place.lat, place.lon]);

  const st = useMemo(() => skyState(t, siteDef.lat, siteDef.lon), [t, siteDef]);
  const now = useMemo(() => skyNow(modelMag, st), [modelMag, st]);
  const nelm = Math.max(-3, nelmFromSqm(now.mag));
  const frame = useRef<Frame>({ st, modelMag, twilightMag: now.twilightMag, moonMag: now.moonMag, nelm, ov });
  frame.current = { st, modelMag, twilightMag: now.twilightMag, moonMag: now.moonMag, nelm, ov };
  const api = useRef<{ update: () => void } | null>(null);
  const domes = useMemo(() => domesFor(m.e.light_domes, siteDef.lat, siteDef.lon), [m.e.light_domes, siteDef]);
  const glow: GlowModel = useMemo(() => glowModel(modelMag, now.twilightMag, now.moonMag, domes, st.sun, st.moon), [modelMag, now, domes, st]);
  const glowRef = useRef(glow);
  glowRef.current = glow;

  useEffect(() => {
    const el = ref.current!;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    const px = Math.min(2, window.devicePixelRatio);
    renderer.setPixelRatio(px);
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 100);

    const gu = glowUniforms(glowRef.current);
    const uniforms = {
      uGlow: { value: 0 },
      uDomeAz: { value: domes.map((d) => (d.az * Math.PI) / 180).concat(Array(8).fill(0)).slice(0, 8) },
      uDomeS: { value: domes.map((d) => d.strength).concat(Array(8).fill(0)).slice(0, 8) },
      uPole: { value: new THREE.Vector3(0, 1, 0) },
      uTwi: { value: 0 }, uSun: { value: new THREE.Vector3(0, -1, 0) },
      uMoon: { value: new THREE.Vector3(0, -1, 0) }, uMoonK: { value: 0 },
      // Luminance model (false-color map), see engine/skyglow.ts.
      uFalse: { value: 0 }, uArt: { value: gu.uArt }, uNat: { value: gu.uNat }, uTwiL: { value: gu.uTwiL }, uMoonL: { value: gu.uMoonL },
      uGDomeAz: { value: gu.uGDomeAz }, uGDomeS: { value: gu.uGDomeS },
      uSunDir: { value: new THREE.Vector3(...gu.uSunDir) }, uMoonDir: { value: new THREE.Vector3(...gu.uMoonDir) },
    };
    const skyGeo = new THREE.SphereGeometry(50, 64, 32);
    const sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `
        varying vec3 vDir; uniform float uGlow; uniform float uDomeAz[8]; uniform float uDomeS[8]; uniform vec3 uPole;
        uniform float uTwi; uniform vec3 uSun; uniform vec3 uMoon; uniform float uMoonK; uniform float uFalse;
        ${SKYGLOW_GLSL}
        void main(){
          float alt = asin(clamp(vDir.y, -1.0, 1.0));
          if (alt < 0.0) { gl_FragColor = vec4(vec3(0.02,0.02,0.025) + vec3(0.05,0.07,0.10)*uTwi, 1.0); return; }
          if (uFalse > 0.5) { gl_FragColor = vec4(lumColor(skyLum(normalize(vDir))), 1.0); return; }
          float az = atan(vDir.x, -vDir.z);
          float airmass = 1.0 / max(sin(alt), 0.06);
          vec3 night = vec3(0.012,0.016,0.035);
          vec3 glowCol = mix(vec3(0.20,0.16,0.28), vec3(0.55,0.36,0.18), uGlow);
          vec3 c = night + glowCol * uGlow * (0.35 + 0.08 * airmass);
          for (int i = 0; i < 8; i++) {
            float d = abs(mod(az - uDomeAz[i] + 3.14159, 6.28318) - 3.14159);
            c += vec3(0.55,0.36,0.16) * uDomeS[i] * exp(-d*d/0.25) * exp(-alt/0.18) * 0.6;
          }
          float sd = max(dot(vDir, uSun), 0.0);
          vec3 day = mix(vec3(0.03,0.06,0.16), vec3(0.32,0.52,0.85), smoothstep(0.35, 1.0, uTwi));
          c += day * uTwi + vec3(0.9,0.45,0.18) * pow(sd, 6.0) * uTwi * exp(-alt/0.25) * 1.2;
          float md = max(dot(vDir, uMoon), 0.0);
          c += vec3(0.45,0.5,0.62) * uMoonK * (0.18 + 0.6 * pow(md, 40.0));
          float mw = exp(-pow(dot(vDir, uPole), 2.0) / 0.02) * pow(1.0 - uGlow, 2.0) * pow(1.0 - uTwi, 2.0) * (1.0 - uMoonK);
          c += vec3(0.10,0.10,0.12) * mw;
          gl_FragColor = vec4(min(c, vec3(1.0)), 1.0);
        }`,
    }));
    scene.add(sky);

    // Stars live in an equatorial frame; one matrix per frame rotates them to the site's horizon.
    const celestial = new THREE.Group();
    celestial.matrixAutoUpdate = false;
    scene.add(celestial);
    const pos = new Float32Array(FIELD.length * 3), col = new Float32Array(FIELD.length * 3), mag = new Float32Array(FIELD.length);
    FIELD.forEach((s, i) => { pos.set([s.dir.x * R_STARS, s.dir.y * R_STARS, s.dir.z * R_STARS], i * 3); col.set(s.tint, i * 3); mag[i] = s.mag; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("mag", new THREE.BufferAttribute(mag, 1));
    const starUniforms = { uNelm: { value: 6 }, uPx: { value: px } };
    const starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true, uniforms: starUniforms,
      vertexShader: `attribute float mag; uniform float uNelm; uniform float uPx; varying vec3 vC; varying float vA;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float s = wp.y / ${R_STARS.toFixed(1)};
          float me = mag + 0.25 * (1.0 / max(s, 0.035) - 1.0);   // extinction toward the horizon
          float vis = uNelm - me;
          vA = (s > 0.0 && vis > 0.0) ? clamp(0.25 + vis / 3.5, 0.0, 1.0) : 0.0;
          vC = color;
          gl_PointSize = vA > 0.0 ? (1.3 + max(0.0, 4.5 - me) * 0.9) * uPx : 0.0;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: "varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); gl_FragColor = vec4(vC * vA, smoothstep(0.5,0.1,d) * vA); }",
    });
    celestial.add(new THREE.Points(geo, starMat));

    // Moon: one point sprite shaded as a sphere lit from the Sun's direction (phase and bright-limb angle).
    const moonGeo = new THREE.BufferGeometry();
    moonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const moonUniforms = { uSunView: { value: new THREE.Vector3() }, uSize: { value: 10 }, uVis: { value: 0 } };
    const moon = new THREE.Points(moonGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: moonUniforms,
      vertexShader: "uniform float uSize; uniform float uVis; void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize*uVis; }",
      fragmentShader: `uniform vec3 uSunView; void main(){
        vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y; float r2 = dot(p, p); if (r2 > 1.0) discard;
        vec3 n = vec3(p, sqrt(1.0 - r2));
        float lit = smoothstep(-0.08, 0.08, dot(n, normalize(uSunView)));
        gl_FragColor = vec4(mix(vec3(0.07,0.075,0.09), vec3(0.96,0.94,0.86), lit), smoothstep(1.0, 0.85, r2));
      }`,
    }));
    scene.add(moon);

    // Direction overlay: horizon and 30°/60° altitude rings.
    const grid = new THREE.Group();
    const ringMat = new THREE.LineBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.35 });
    for (const alt of [0, 30, 60]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 128; k++) pts.push(new THREE.Vector3(...dirFromAltAz(alt, (k / 128) * 360)).multiplyScalar(44));
      grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
    }
    scene.add(grid);

    // HTML labels projected each frame: compass points, light-dome towns, bright-star names.
    const layer = document.createElement("div");
    layer.className = "pointer-events-none absolute inset-0 z-20 overflow-hidden";
    el.appendChild(layer);
    // Indicators: sky-glow curve along the horizon and a luminance readout at the center of view.
    const curveMat = new THREE.LineBasicMaterial({ color: 0xf6b44b, transparent: true, opacity: 0.9 });
    const curve = new THREE.Line(new THREE.BufferGeometry(), curveMat);
    scene.add(curve);
    const cross = document.createElement("div");
    cross.className = "pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center text-[11px] text-amber-300";
    cross.innerHTML = '<div class="text-lg leading-none">+</div><div data-readout class="mt-1 whitespace-nowrap rounded bg-ink-950/70 px-1.5 py-0.5"></div>';
    el.appendChild(cross);
    const readout = cross.querySelector("[data-readout]") as HTMLDivElement;
    type Label = { node: HTMLSpanElement; dir: THREE.Vector3; kind: "dir" | "dome" | "star"; star?: number };
    const label = (text: string, cls: string, kind: Label["kind"], dir: THREE.Vector3, star?: number): Label => {
      const node = document.createElement("span");
      node.textContent = text;
      node.className = `absolute left-0 top-0 whitespace-nowrap ${cls}`;
      layer.appendChild(node);
      return { node, dir, kind, star };
    };
    const labels: Label[] = [
      ...COMPASS.map((c, i) => label(c, i % 2 ? "text-[11px] text-star-300" : "text-sm font-bold text-amber-400", "dir", new THREE.Vector3(...dirFromAltAz(2, i * 45)))),
      ...domes.filter((d) => d.strength > 0.03).map((d) => label(`${d.name} ${d.km.toFixed(0)} km`, "text-[10px] text-amber-200/80", "dome",
        new THREE.Vector3(...dirFromAltAz(6, d.az)))),
      ...FIELD.flatMap((s, i) => (s.name ? [label(s.name, "text-[10px] text-glow-400/90 pl-3", "star", new THREE.Vector3(), i)] : [])),
    ];

    let yaw = Math.PI, pitch = 0.45, drag: { x: number; y: number } | null = null, raf = 0;
    const sunDir = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
    const draw = () => {
      camera.rotation.set(0, 0, 0);
      camera.rotateY(yaw);
      camera.rotateX(pitch);
      camera.updateMatrixWorld();
      moonUniforms.uSunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      moonUniforms.uSize.value = (renderer.domElement.height / camera.fov) * 0.52 * MOON_SCALE;
      renderer.render(scene, camera);
      const f = frame.current, cw = el.clientWidth, ch = el.clientHeight;
      camera.getWorldDirection(fwd);
      cam.current = [yaw, pitch, camera.fov];
      groundSync.current?.();
      cross.style.display = f.ov.indicators ? "" : "none";
      if (f.ov.indicators) {
        const alt = (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI, az = ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360;
        if (alt < 0) readout.textContent = `az ${az.toFixed(0)}° · below the horizon`;
        else { const mg = magOf(luminanceAt(glowRef.current, alt, az)); readout.textContent = `az ${az.toFixed(0)}° alt ${alt.toFixed(0)}° · ${mg.toFixed(2)} mag/arcsec² · ${mcdOf(mg).toFixed(2)} mcd/m²`; }
      }
      for (const l of labels) {
        let show = l.kind === "star" ? f.ov.names && l.dir.y > 0.02 && FIELD[l.star!].mag < f.nelm : f.ov.directions;
        if (show && l.dir.dot(fwd) < 0.1) show = false;
        if (show) {
          tmp.copy(l.dir).multiplyScalar(40).project(camera);
          if (tmp.z > 1) show = false;
          else l.node.style.transform = `translate(${((tmp.x + 1) / 2) * cw}px, ${((1 - tmp.y) / 2) * ch}px) translate(${l.kind === "star" ? "0" : "-50%"}, -50%)`;
        }
        l.node.style.display = show ? "" : "none";
      }
    };
    const update = () => {
      const f = frame.current;
      const R = equatorialToScene(f.st.lst, siteDef.lat);
      celestial.matrix.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
      celestial.updateMatrixWorld(true);
      const toScene = (v: THREE.Vector3) => new THREE.Vector3(R[0] * v.x + R[1] * v.y + R[2] * v.z, R[3] * v.x + R[4] * v.y + R[5] * v.z, R[6] * v.x + R[7] * v.y + R[8] * v.z);
      uniforms.uPole.value.copy(toScene(new THREE.Vector3(...eqUnit(GALACTIC_POLE.ra, GALACTIC_POLE.dec))));
      for (const l of labels) if (l.kind === "star") l.dir.copy(toScene(FIELD[l.star!].dir));
      sunDir.set(...dirFromAltAz(f.st.sun.alt, f.st.sun.az));
      uniforms.uSun.value.copy(sunDir);
      uniforms.uMoon.value.set(...dirFromAltAz(f.st.moon.alt, f.st.moon.az));
      uniforms.uGlow.value = Math.min(1, Math.max(0, (22.0 - f.modelMag) / 4.5));
      uniforms.uTwi.value = Math.min(1, Math.max(0, (21.9 - f.twilightMag) / 16));
      uniforms.uMoonK.value = Number.isFinite(f.moonMag) ? Math.min(1, Math.max(0, (21.9 - f.moonMag) / 5)) : 0;
      starUniforms.uNelm.value = f.nelm;
      moon.position.copy(uniforms.uMoon.value).multiplyScalar(44);
      moonUniforms.uVis.value = f.st.moon.alt > -0.3 ? 1 : 0;
      grid.visible = f.ov.directions;
      const g = glowRef.current, u = glowUniforms(g);
      uniforms.uFalse.value = f.ov.lumMap ? 1 : 0;
      uniforms.uArt.value = u.uArt; uniforms.uNat.value = u.uNat; uniforms.uTwiL.value = u.uTwiL; uniforms.uMoonL.value = u.uMoonL;
      uniforms.uGDomeAz.value = u.uGDomeAz; uniforms.uGDomeS.value = u.uGDomeS;
      uniforms.uSunDir.value.set(...u.uSunDir); uniforms.uMoonDir.value.set(...u.uMoonDir);
      celestial.visible = !f.ov.lumMap;
      moon.visible = !f.ov.lumMap;
      // Glow curve: brightness at 10° altitude by azimuth, drawn as a line whose height grows with the excess over the zenith.
      const zen = magOf(luminanceAt(g, 90, 0));
      curve.visible = f.ov.indicators;
      curve.geometry.dispose();
      curve.geometry = new THREE.BufferGeometry().setFromPoints(glowCurve(g, 10, 3).map((p) =>
        new THREE.Vector3(...dirFromAltAz(1 + 8 * Math.min(4, Math.max(0, zen - p.mag)), p.az)).multiplyScalar(43)));
      draw();
    };
    api.current = { update };

    const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    const down = (ev: PointerEvent) => { drag = { x: ev.clientX, y: ev.clientY }; el.setPointerCapture(ev.pointerId); };
    const move = (ev: PointerEvent) => {
      if (!drag) return;
      // With the ground shown you can look down (e.g. from drone height); otherwise the view stays at or above the horizon.
      yaw += (ev.clientX - drag.x) * 0.005; pitch = Math.min(1.5, Math.max(frame.current.ov.ground ? -1.2 : -0.1, pitch + (ev.clientY - drag.y) * 0.005));
      drag = { x: ev.clientX, y: ev.clientY };
      redraw();
    };
    const up = () => { drag = null; };
    // Pinch (Ctrl + wheel) or a mouse wheel zooms; a two-finger trackpad swipe looks around.
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const mouseWheel = ev.deltaMode === 1 || (ev.deltaX === 0 && Math.abs(ev.deltaY) >= 50 && Number.isInteger(ev.deltaY));
      if (ev.ctrlKey || mouseWheel) {
        camera.fov = Math.min(100, Math.max(25, camera.fov * Math.exp(ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0008))));
        camera.updateProjectionMatrix();
      } else {
        yaw -= ev.deltaX * 0.003;
        pitch = Math.min(1.5, Math.max(frame.current.ov.ground ? -1.2 : -0.1, pitch - ev.deltaY * 0.003));
      }
      redraw();
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    // Follow the container size (full-screen toggle, window resize).
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      draw();
    });
    ro.observe(el);
    update();
    return () => {
      api.current = null;
      ro.disconnect();
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      renderer.dispose(); geo.dispose(); skyGeo.dispose(); moonGeo.dispose(); curve.geometry.dispose();
      el.removeChild(renderer.domElement); el.removeChild(layer); el.removeChild(cross);
    };
  }, [siteDef, domes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.update(); }, [st, now, nelm, ov, modelMag, glow]);

  // Ground view: terrain, buildings and the scenario's light sources seen from the site, drawn by MapLibre over the
  // sky with a transparent sky above the horizon, and following the dome camera (bearing, tilt, field of view).
  const lampState = useRef({ e: m.e, params: m.params, d });
  lampState.current = { e: m.e, params: m.params, d };
  useEffect(() => {
    const host = groundHost.current;
    if (!ov.ground || !host) return;
    const gm = new maplibregl.Map({ container: host, style: BASEMAP_STYLE, interactive: false, attributionControl: { compact: true },
      center: [siteDef.lon, siteDef.lat], zoom: 17, pitch: 80, maxPitch: 180, maxZoom: 24 });
    let alive = true, timer = 0;
    gm.on("load", async () => {
      add3DLayers(gm);
      set3D(gm, true, 1);
      gm.setLayoutProperty("hillshade-3d", "visibility", "none");
      // MapLibre misdraws the ground when pitched above the horizon (pitch > 90°), so for upward views its camera stays
      // at pitch 89° and a lens shift (padding) moves its horizon to where the sky camera's horizon is; the ground
      // layer hides once the horizon leaves the frame.
      groundSync.current = () => {
        const [yaw, pitch, fov] = cam.current;
        const up = (pitch * 180) / Math.PI, H = host.clientHeight, RADS = Math.PI / 180;
        const focal = H / 2 / Math.tan((fov / 2) * RADS);
        const mlPitch = up <= -1 ? 90 + up : 89;
        const pad = up <= -1 ? 0 : 2 * focal * (Math.tan(up * RADS) + Math.tan(RADS));
        host.style.visibility = pad >= H * 0.98 ? "hidden" : "";
        if (pad >= H * 0.98) return;
        const bearing = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
        const elev = gm.queryTerrainElevation([siteDef.lon, siteDef.lat]) ?? 0;
        gm.setVerticalFieldOfView(fov);
        gm.jumpTo({ ...gm.calculateCameraOptionsFromCameraLngLatAltRotation([siteDef.lon, siteDef.lat], elev + eyeRef.current, bearing, mlPitch),
          padding: { top: pad, bottom: 0, left: 0, right: 0 } });
      };
      groundSync.current();
      const [surveyed, venues] = await loadLightData();
      const refresh = () => {
        if (!alive) return;
        const { e, params, d: dd } = lampState.current, r = 0.03;
        const roads = basemapRoads(gm);
        const lamps = buildLamps({
          e, looks: slotLooks(e, params), selected: new Set(params.selection.counties), surveyed, venues, sportsOn: params.view_window === "evening",
          grid: e.grids.a15, cat: dd.fixCat15, catNames: e.files.fixtures_cat_a15.names ?? ["street", "commercial", "residential", "sports"],
          county: dd.county15, countyValues: e.files.county_a15.values, roads, focus: [siteDef.lon, siteDef.lat],
          bbox: [siteDef.lon - r, siteDef.lat - r, siteDef.lon + r, siteDef.lat + r], maxLamps: 5000,
        });
        const { poles, pools } = lampLayers(lamps);
        setLamps(gm, poles, pools);
      };
      gm.on("idle", () => { clearTimeout(timer); timer = window.setTimeout(refresh, 200); });
      refresh();
    });
    const ro = new ResizeObserver(() => { gm.resize(); groundSync.current?.(); });
    ro.observe(host);
    return () => { alive = false; clearTimeout(timer); ro.disconnect(); groundSync.current = null; gm.remove(); };
  }, [ov.ground, siteDef]);
  const eyeRef = useRef(ov.eye);
  eyeRef.current = ov.eye;
  useEffect(() => { groundSync.current?.(); }, [ov.eye]);
  const curveData = useMemo(() => (ov.indicators ? glowCurve(glow, 10, 5) : []), [ov.indicators, glow]);

  // Full screen: the browser Fullscreen API where available, else a fixed overlay (e.g. iPhone Safari). Esc exits either.
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) { setFull(false); setPlaying(false); exitRef.current?.(); } };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { setFull(false); setPlaying(false); exitRef.current?.(); } };
    if (startFull) box.current?.requestFullscreen?.().catch(() => undefined);
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("fullscreenchange", sync); window.removeEventListener("keydown", esc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    if (full) {
      if (document.fullscreenElement) document.exitFullscreen();
      setFull(false);
      setPlaying(false);
      exitRef.current?.();
    } else {
      setFull(true);
      box.current?.requestFullscreen?.().catch(() => undefined);
    }
  };

  // Autoplay (full screen only): advance the clock continuously, or one night at a time at the same clock time.
  useEffect(() => {
    if (!playing || !full) return;
    let raf = 0, last = performance.now(), acc = 0;
    const rate = SPEEDS[speed].rate;
    const tick = (ts: number) => {
      const dt = Math.min(100, ts - last);
      last = ts;
      if (rate) setT((x) => x + dt * rate);
      else if ((acc += dt) >= 250) { acc -= 250; setT((x) => x + 86400000); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, full, speed]);

  const conditions = `${st.twilight} · Sun ${st.sun.alt.toFixed(0)}° · ${st.moon.name} ${Math.round(st.moon.illum * 100)}%, ${st.moon.alt > 0 ? `up ${st.moon.alt.toFixed(0)}° ${compass(st.moon.az)}` : "below horizon"}`;

  return (
    <div>
      <div ref={box} className={full ? "fixed inset-0 z-50 bg-black" : "relative"}>
        <div ref={ref} className={`relative w-full touch-none overflow-hidden ${full ? "h-full" : "h-64 rounded-lg"}`} aria-label={`Illustrative all-sky view at ${place.name}`} role="img" />
        {ov.ground && (
          // MapLibre forces its container to position: relative, so it fills a positioned wrapper.
          <div className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${full ? "" : "rounded-lg"}`} aria-hidden>
            <div ref={groundHost} className="h-full w-full" />
          </div>
        )}
        {(ov.indicators || ov.lumMap) && (
          <div className={`pointer-events-none absolute right-2 z-30 w-64 rounded-lg bg-ink-950/80 p-2 text-[10px] text-star-300 backdrop-blur ${full ? "top-10" : "top-9 hidden sm:block"}`}>
            <div>Zenith now: <b className="text-star-100">{now.mag.toFixed(2)} mag/arcsec²</b> = {mcdOf(now.mag).toFixed(2)} mcd/m²</div>
            {ov.indicators && <GlowChart data={curveData} zenith={now.mag} domes={domes} />}
            {ov.lumMap && <LumLegend />}
          </div>
        )}
        <button onClick={toggle} className="absolute right-2 top-2 z-30 rounded bg-ink-950/70 px-2 py-0.5 text-[11px] text-star-300 hover:bg-ink-800"
          aria-label={full ? "Exit full screen" : "Full screen sky view"} title={full ? "Exit full screen (Esc)" : "Full screen"}>
          {full ? "✕ Exit full screen" : "⛶ Full screen"}
        </button>
        {full && (
          <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-10rem)] rounded-lg bg-ink-950/75 p-2 text-xs text-star-300 backdrop-blur">
            {sites && onPickSite ? (
              <label className="flex items-center gap-2">
                <span className="sr-only">Site</span>
                <select value={place.id} onChange={(ev) => onPickSite(ev.target.value)} className="rounded bg-ink-800 px-1 py-0.5 text-sm font-semibold text-star-100">
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            ) : <div className="text-sm font-semibold text-star-100">{place.name}</div>}
            <div className="mt-1">Modeled sky: {formatSky(modelMag, m.table)}{place.note ? ` (${place.note})` : ""}</div>
            {place.baseMag !== undefined && (
              <div className="text-star-500">Today {place.baseMag.toFixed(2)} · Δ {(modelMag - place.baseMag >= 0 ? "+" : "") + (modelMag - place.baseMag).toFixed(2)} mag</div>
            )}
            <div className="mt-1">Sky at this time: {now.mag.toFixed(2)} mag/arcsec²</div>
            <div className="text-star-500">{conditions}</div>
          </div>
        )}
        <div className={`pointer-events-none absolute left-2 z-30 rounded bg-ink-950/70 px-2 py-0.5 text-[11px] text-star-300 ${full ? "bottom-24 md:bottom-20" : "bottom-2"}`}>
          Limiting magnitude ≈ {nelm.toFixed(1)}{full && " · illustrative, not a photograph"}
        </div>
        {full && (
          <div className="absolute inset-x-2 bottom-2 z-30 mx-auto max-w-3xl rounded-xl bg-ink-950/80 p-2 backdrop-blur">
            <TimeBar t={t} setT={setT} ov={ov} setOv={setOv} autoplay={{ playing, setPlaying, speed, setSpeed }} />
          </div>
        )}
      </div>
      {!full && (
        <div className="mt-2">
          <TimeBar t={t} setT={setT} ov={ov} setOv={setOv} />
          <p className="mt-1 text-[11px] text-star-300">{conditions} · sky now {now.mag.toFixed(2)} mag/arcsec²</p>
        </div>
      )}
    </div>
  );
}

function TimeBar({ t, setT, ov, setOv, autoplay }: {
  t: number; setT: (t: number) => void; ov: Overlays; setOv: React.Dispatch<React.SetStateAction<Overlays>>;
  autoplay?: { playing: boolean; setPlaying: (p: boolean) => void; speed: number; setSpeed: (s: number) => void };
}) {
  const n = nightOf(t);
  const date = `${n.y}-${pad(n.mo)}-${pad(n.d)}`;
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: SITE_TZ, timeZoneName: "short" }).formatToParts(t).find((p) => p.type === "timeZoneName")?.value ?? "";
  const set = (dateStr: string, minute: number) => {
    const [y, mo, d] = dateStr.split("-").map(Number);
    if (y && mo && d) setT(zonedToUtc(y, mo, d, 720 + minute));
  };
  const chip = (on: boolean) => `rounded px-2 py-0.5 text-[11px] ${on ? "bg-amber-400 text-ink-950" : "bg-ink-800 text-star-300 hover:bg-ink-700"}`;
  return (
    <div className="text-[11px] text-star-300">
      <div className="flex flex-wrap items-center gap-2">
        {autoplay && (
          <>
            <button onClick={() => autoplay.setPlaying(!autoplay.playing)} className="rounded-full bg-amber-400 px-3 py-0.5 text-xs font-semibold text-ink-950"
              aria-label={autoplay.playing ? "Pause autoplay" : "Play autoplay"}>{autoplay.playing ? "❚❚ Pause" : "▶ Play"}</button>
            <select value={autoplay.speed} onChange={(ev) => autoplay.setSpeed(Number(ev.target.value))} aria-label="Autoplay speed" className="rounded bg-ink-800 px-1 py-0.5">
              {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
            </select>
          </>
        )}
        <label className="flex items-center gap-1">Night of
          <input type="date" value={date} onChange={(ev) => set(ev.target.value, n.minute)} className="rounded bg-ink-800 px-1 py-0.5 text-star-100 [color-scheme:dark]" />
        </label>
        <span className="tabular-nums text-sm font-semibold text-star-100">{pad(n.z.h)}:{pad(n.z.mi)} <span className="text-[10px] font-normal text-star-500">{tz}</span></span>
        <button onClick={() => setT(Date.now())} className={chip(false)}>Now</button>
        <span className="ml-auto flex gap-1">
          <button onClick={() => setOv((o) => ({ ...o, directions: !o.directions }))} aria-pressed={ov.directions} className={chip(ov.directions)}>Directions</button>
          <button onClick={() => setOv((o) => ({ ...o, names: !o.names }))} aria-pressed={ov.names} className={chip(ov.names)}>Star names</button>
          <button onClick={() => setOv((o) => ({ ...o, ground: !o.ground }))} aria-pressed={ov.ground} className={chip(ov.ground)} title="3D terrain, buildings and light sources around the site">Terrain &amp; lights</button>
          <button onClick={() => setOv((o) => ({ ...o, indicators: !o.indicators }))} aria-pressed={ov.indicators} className={chip(ov.indicators)} title="Sky-glow curve and luminance readout">Indicators</button>
          <button onClick={() => setOv((o) => ({ ...o, lumMap: !o.lumMap }))} aria-pressed={ov.lumMap} className={chip(ov.lumMap)} title="False-color sky luminance">Luminance map</button>
        </span>
      </div>
      {ov.ground && (
        <label className="mt-1 flex items-center gap-1">Viewpoint
          <select value={ov.eye} onChange={(ev) => setOv((o) => ({ ...o, eye: Number(ev.target.value) }))} className="rounded bg-ink-800 px-1 py-0.5">
            {EYE_HEIGHTS.map((h) => <option key={h.m} value={h.m}>{h.label}</option>)}
          </select>
          <span className="text-star-500">basemap roads and buildings, terrain; lights = scenario fixtures (mapped positions, or modeled along the roads)</span>
        </label>
      )}
      <input type="range" min={0} max={1439} step={5} value={n.minute} onChange={(ev) => set(date, Number(ev.target.value))}
        className="mt-1 w-full accent-amber-400" aria-label="Time of night" />
      <div className="flex justify-between text-[10px] text-star-500"><span>12:00</span><span>18:00</span><span>00:00</span><span>06:00</span><span>12:00</span></div>
    </div>
  );
}

/** Sky-glow curve chart: mag/arcsec² at 10° altitude around the horizon (lower = brighter), light-dome towns marked. */
function GlowChart({ data, zenith, domes }: { data: { az: number; mag: number }[]; zenith: number; domes: { name: string; az: number; strength: number }[] }) {
  if (!data.length) return null;
  const W = 240, H = 70, lo = Math.min(zenith, ...data.map((p) => p.mag)) - 0.1, hi = Math.max(zenith, ...data.map((p) => p.mag)) + 0.1;
  const x = (az: number) => (az / 360) * W, y = (mg: number) => ((mg - lo) / (hi - lo || 1)) * H;
  return (
    <div className="mt-1">
      <div className="flex justify-between"><span className="text-amber-400">Sky-glow curve (10° altitude)</span><span>brighter ↑</span></div>
      <svg viewBox={`0 0 ${W} ${H + 12}`} className="mt-0.5 w-full">
        <line x1={0} x2={W} y1={y(zenith)} y2={y(zenith)} stroke="#7cc4ff" strokeDasharray="3 2" strokeWidth={0.8} />
        <polyline fill="none" stroke="#f6b44b" strokeWidth={1.5} points={data.map((p) => `${x(p.az)},${y(p.mag)}`).join(" ")} />
        {domes.filter((d) => d.strength > 0.03).slice(0, 4).map((d, i) => <text key={d.name} x={Math.min(W - 40, x(d.az))} y={7 + i * 8} fontSize={7} fill="#fcd9a0">▾{d.name}</text>)}
        {["N", "E", "S", "W", "N"].map((c, i) => <text key={i} x={Math.min(W - 5, (i / 4) * W)} y={H + 10} fontSize={8} fill="#a79f88">{c}</text>)}
      </svg>
      <div className="flex justify-between text-star-500"><span>brightest {Math.min(...data.map((p) => p.mag)).toFixed(2)}</span><span className="text-glow-400">- - zenith {zenith.toFixed(2)}</span><span>darkest {Math.max(...data.map((p) => p.mag)).toFixed(2)}</span></div>
    </div>
  );
}

function LumLegend() {
  return (
    <div className="mt-1">
      <div className="text-amber-400">Luminance map (mag/arcsec²)</div>
      <div className="mt-0.5 flex h-2 overflow-hidden rounded">{LUM_LEGEND.map((s) => <div key={s.mag} className="flex-1" style={{ background: s.css }} />)}</div>
      <div className="flex justify-between"><span>22 · {mcdOf(22).toFixed(2)}</span><span>19 · {mcdOf(19).toFixed(1)}</span><span>16 · {mcdOf(16).toFixed(0)} mcd/m²</span></div>
      <div className="text-star-500">Zenith is modeled; the spread over the sky is illustrative.</div>
    </div>
  );
}
