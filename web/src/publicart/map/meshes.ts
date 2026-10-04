// Procedural 3D artworks (level of detail 2): a simple, recognisable form per artwork type, built in a local
// east-north-up frame in metres (x east, y north, z up, origin at the artwork's base). Real models can replace
// these later through the registry's model_url (glTF).
import * as THREE from "three";

export type ArtType = "figure" | "sculpture" | "mural" | "fence" | "wall" | "functional";
export type Material = "bronze" | "steel" | "painted_steel" | "glass" | "mosaic" | "acrylic_mural" | "concrete" | "stone" | "digital";

export interface ArtSpec {
  id: string;
  type: ArtType;
  material: Material;
  height: number;       // m
  width: number;        // m (murals, walls, fences: length along the facade or line)
  bearing: number;      // degrees clockwise from north: the direction a mural or wall faces
  color: string;        // dominant colour (painted pieces)
  lit: boolean;
  proposed?: boolean;
}

// Deterministic 0-1 random stream per artwork id, so procedural textures and forms stay stable.
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

const MAT = {
  bronze: () => new THREE.MeshStandardMaterial({ color: 0x8a6a3e, metalness: 0.55, roughness: 0.45 }),
  stone: () => new THREE.MeshStandardMaterial({ color: 0x9a978e, roughness: 0.9 }),
  concrete: () => new THREE.MeshStandardMaterial({ color: 0xb4b0a6, roughness: 0.95 }),
  steel: (c: string) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), metalness: 0.3, roughness: 0.35 }),
  post: () => new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.4, roughness: 0.6 }),
};

/** A canvas texture: painted mural (soft colour fields and bands) or glass/ceramic mosaic tiles. */
function artTexture(spec: ArtSpec, kind: "mural" | "mosaic", w: number, h: number) {
  const r = rng(spec.id), cv = document.createElement("canvas");
  const px = 64;
  cv.width = Math.max(64, Math.min(1024, Math.round(w * px / 2)));
  cv.height = Math.max(64, Math.min(512, Math.round(h * px / 2)));
  const g = cv.getContext("2d")!;
  const base = new THREE.Color(spec.color);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const tone = (dh: number, s = 0.65, l = 0.55) => `hsl(${(((hsl.h + dh) % 1) + 1) % 1 * 360} ${s * 100}% ${l * 100}%)`;
  if (kind === "mosaic") {
    const t = 10;
    for (let y = 0; y < cv.height; y += t) for (let x = 0; x < cv.width; x += t) {
      const band = Math.sin(x / cv.width * 6 + r() * 0.6) * 0.5 + 0.5;
      g.fillStyle = tone(band * 0.35 + r() * 0.08 - 0.04, 0.55 + r() * 0.3, 0.4 + r() * 0.3);
      g.fillRect(x + 1, y + 1, t - 2, t - 2);
    }
  } else {
    g.fillStyle = tone(0, 0.5, 0.35);
    g.fillRect(0, 0, cv.width, cv.height);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = tone(r() * 0.5 - 0.25, 0.55 + r() * 0.35, 0.35 + r() * 0.4);
      g.globalAlpha = 0.75;
      g.beginPath();
      const cx = r() * cv.width, cy = r() * cv.height, rad = (0.15 + r() * 0.35) * cv.height;
      g.ellipse(cx, cy, rad * (1 + r()), rad, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = tone(0.5, 0.7, 0.75);
      g.lineWidth = 3 + r() * 5;
      g.beginPath();
      g.moveTo(0, r() * cv.height);
      g.bezierCurveTo(cv.width * 0.3, r() * cv.height, cv.width * 0.7, r() * cv.height, cv.width, r() * cv.height);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Works cast shadows onto the ground disc but do not receive them: at street scale the shadow map's texels are near a
// metre, and self-shadowing would darken their faces (shadow acne).
const shadowed = <T extends THREE.Object3D>(m: T) => { m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; } }); return m; };

/** Build the artwork's mesh group (base at z = 0). */
export function buildArtwork(spec: ArtSpec): THREE.Group {
  const g = new THREE.Group();
  const r = rng(spec.id);
  const H = Math.max(0.5, spec.height), W = Math.max(0.5, spec.width);
  switch (spec.type) {
    case "figure": {
      const plinthH = Math.min(1.2, H * 0.3), body = H - plinthH;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(body * 0.55, body * 0.55, plinthH), MAT.stone());
      plinth.position.z = plinthH / 2;
      const mat = spec.material === "bronze" ? MAT.bronze() : MAT.steel(spec.color);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(body * 0.13, body * 0.5, 6, 12), mat);
      torso.rotation.x = Math.PI / 2;
      torso.position.z = plinthH + body * 0.42;
      const head = new THREE.Mesh(new THREE.SphereGeometry(body * 0.09, 16, 12), mat);
      head.position.z = plinthH + body * 0.86;
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(body * 0.1, body * 0.14, body * 0.32, 10), mat);
      legs.rotation.x = Math.PI / 2;
      legs.position.z = plinthH + body * 0.16;
      g.add(plinth, legs, torso, head);
      break;
    }
    case "sculpture": {
      // Abstract piece: a seeded arc of spheres or a torus knot in the piece's colour.
      const mat = MAT.steel(spec.color);
      if (r() < 0.5) {
        const n = 4 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const t = k / (n - 1), rad = H * (0.12 + 0.08 * Math.sin(t * Math.PI));
          const s = new THREE.Mesh(new THREE.SphereGeometry(rad, 24, 16), mat);
          s.position.set((t - 0.5) * W, 0, rad + Math.sin(t * Math.PI) * (H - 2 * rad));
          g.add(s);
        }
      } else {
        const k = new THREE.Mesh(new THREE.TorusKnotGeometry(H * 0.28, H * 0.07, 96, 12, 2, 3), mat);
        k.position.z = H * 0.5;
        g.add(k);
      }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.35, W * 0.38, 0.25, 24), MAT.concrete());
      base.rotation.x = Math.PI / 2;
      base.position.z = 0.125;
      g.add(base);
      break;
    }
    case "mural": {
      // Painted facade: a textured plane standing on the facade line, facing `bearing`, on a wall slab.
      const wall = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.5, H + 0.6), MAT.concrete());
      wall.position.set(0, -0.3, (H + 0.6) / 2);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: artTexture(spec, "mural", W, H), roughness: 0.85 }));
      face.rotation.x = Math.PI / 2;
      face.position.set(0, -0.04, 0.3 + H / 2);
      g.add(wall, face);
      break;
    }
    case "wall": {
      const tex = artTexture(spec, "mosaic", W, H);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, H), [MAT.concrete(), MAT.concrete(),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 }),
        MAT.concrete(), MAT.concrete()]);
      wall.position.z = H / 2;
      g.add(wall);
      break;
    }
    case "fence": {
      // Posts with tinted glass/metal panels along the facade line.
      const n = Math.max(1, Math.round(W / 1.5));
      const panelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color), transparent: true, opacity: 0.75, roughness: 0.15, metalness: 0.2,
        emissive: new THREE.Color(spec.color), emissiveIntensity: 0.08 });
      for (let k = 0; k <= n; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, H), MAT.post());
        p.position.set(-W / 2 + (k * W) / n, 0, H / 2);
        g.add(p);
        if (k < n) {
          const pane = new THREE.Mesh(new THREE.BoxGeometry(W / n - 0.12, 0.03, H * 0.8), panelMat);
          pane.position.set(-W / 2 + ((k + 0.5) * W) / n, 0, H * 0.5);
          g.add(pane);
        }
      }
      break;
    }
    default: {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.25, W * 0.3, H, 16), MAT.steel(spec.color));
      m.rotation.x = Math.PI / 2;
      m.position.z = H / 2;
      g.add(m);
    }
  }
  // Facing: the group's +y is "out of the facade"; rotate so it faces `bearing` (clockwise from north).
  g.rotation.z = -(spec.bearing * Math.PI) / 180 + Math.PI;
  if (spec.proposed) g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) { mm.emissive = new THREE.Color("#b79cff"); mm.emissiveIntensity = 0.25; }
  });
  return shadowed(g);
}

/** Radius (m) of the ground disc that receives the artwork's shadow for a given sun altitude. */
export function shadowRadius(spec: ArtSpec, sunAltDeg: number) {
  const len = sunAltDeg > 2 ? Math.min(80, spec.height / Math.tan((sunAltDeg * Math.PI) / 180)) : 0;
  return Math.max(spec.width, spec.height) * 0.75 + len + 2;
}
