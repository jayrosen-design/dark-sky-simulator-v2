// Three.js artworks drawn inside the MapLibre map (a "3d" custom layer sharing the map's WebGL context and depth
// buffer, so buildings and art occlude each other). The scene lives in a local east-north-up metre frame whose
// origin is re-centred near the view as the map moves (keeps float32 precision at street level). The Sun from the
// shared astronomy code lights it, with ground shadows; at night only lit works are lit, by a fixed pool of
// spotlights (a fixed count avoids shader recompiles as the view changes).
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { maplibregl } from "../../shared/map/maplibre";
import { buildArtwork, shadowRadius, type ArtSpec } from "./meshes";

export interface PlacedArt extends ArtSpec { lon: number; lat: number }
export interface Lighting { sunAlt: number; sunAz: number } // degrees; azimuth clockwise from north

const SPOTS = 8;
const RECENTRE_M = 1500;

export class ArtLayer implements CustomLayerInterface {
  id = "paps-art-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private sun = new THREE.DirectionalLight(0xffffff, 0);
  private hemi = new THREE.HemisphereLight(0xbcd2ff, 0x2a2f3a, 0.4);
  private spots: THREE.SpotLight[] = [];
  private items: { art: PlacedArt; group: THREE.Group; ground: THREE.Mesh }[] = [];
  private origin: [number, number] = [-82.325, 29.652];
  private originMerc = maplibregl.MercatorCoordinate.fromLngLat(this.origin, 0);
  private lighting: Lighting = { sunAlt: 45, sunAz: 180 };
  private sunDir = new THREE.Vector3(0, -0.5, 0.87);
  private shadowDirty = true;
  visible = true;

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.near = 1; sc.far = 3000;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    for (let k = 0; k < SPOTS; k++) {
      const s = new THREE.SpotLight(0xffe2b8, 0, 40, Math.PI / 5, 0.6, 1.2);
      this.spots.push(s);
      this.scene.add(s, s.target);
    }
    map.on("moveend", this.onMoveEnd);
  }

  onRemove() {
    this.map.off("moveend", this.onMoveEnd);
    this.renderer.dispose();
  }

  private onMoveEnd = () => {
    const c = this.map.getCenter();
    const d = this.metresFromOrigin(c.lng, c.lat);
    if (Math.hypot(d[0], d[1]) > RECENTRE_M) { this.setOrigin([c.lng, c.lat]); }
    this.shadowDirty = true;
    this.map.triggerRepaint();
  };

  private metresFromOrigin(lon: number, lat: number): [number, number] {
    const k = Math.cos((this.origin[1] * Math.PI) / 180);
    return [(lon - this.origin[0]) * 111320 * k, (lat - this.origin[1]) * 111320];
  }

  private setOrigin(o: [number, number]) {
    this.origin = o;
    this.originMerc = maplibregl.MercatorCoordinate.fromLngLat(o, 0);
    for (const it of this.items) { const [x, y] = this.metresFromOrigin(it.art.lon, it.art.lat); it.group.position.set(x, y, 0); it.ground.position.set(x, y, 0.03); }
  }

  /** Replace the set of artworks. */
  setArtworks(arts: PlacedArt[]) {
    for (const it of this.items) {
      this.scene.remove(it.group, it.ground);
      it.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); for (const mm of [m.material].flat()) (mm as THREE.Material).dispose(); } });
      it.ground.geometry.dispose();
    }
    this.items = arts.map((art) => {
      const group = buildArtwork(art);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.ShadowMaterial({ opacity: 0.38 }));
      ground.receiveShadow = true;
      // MapLibre's combined matrix defeats three's frustum test, so nothing is culled (the art set is small).
      ground.frustumCulled = false;
      group.traverse((o) => { o.frustumCulled = false; });
      const [x, y] = this.metresFromOrigin(art.lon, art.lat);
      group.position.set(x, y, 0);
      ground.position.set(x, y, 0.03);
      this.scene.add(group, ground);
      return { art, group, ground };
    });
    this.applyLighting();
    this.map?.triggerRepaint();
  }

  setLighting(l: Lighting) {
    this.lighting = l;
    this.applyLighting();
    this.map?.triggerRepaint();
  }

  private applyLighting() {
    const { sunAlt, sunAz } = this.lighting;
    const day = Math.max(0, Math.min(1, (sunAlt + 0.83) / 8));        // fades in through civil twilight
    const a = (sunAz * Math.PI) / 180, h = (Math.max(sunAlt, 1) * Math.PI) / 180;
    this.sunDir.set(Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h));
    this.sun.intensity = 2.6 * day * Math.min(1, Math.sin(h) * 3);
    this.sun.color.set(sunAlt < 10 ? 0xffc48a : 0xfff4e0);                // warm low sun (golden hour)
    this.hemi.intensity = 0.12 + 0.5 * day;
    this.hemi.color.set(day > 0.5 ? 0xbcd2ff : 0x6d7fb8);
    for (const it of this.items) it.ground.scale.setScalar(shadowRadius(it.art, sunAlt));
    this.shadowDirty = true;
  }

  /** Aim the night spotlights at the lit artworks nearest the view centre. */
  private placeSpots() {
    const night = this.lighting.sunAlt < -0.83;
    const c = this.map.getCenter(), [cx, cy] = this.metresFromOrigin(c.lng, c.lat);
    const lit = night ? this.items.filter((it) => it.art.lit)
      .map((it) => ({ it, d: Math.hypot(it.group.position.x - cx, it.group.position.y - cy) })).sort((p, q) => p.d - q.d).slice(0, SPOTS) : [];
    this.spots.forEach((s, k) => {
      const t = lit[k]?.it;
      if (!t) { s.intensity = 0; return; }
      const H = t.art.height, b = (t.art.bearing * Math.PI) / 180;
      const off = 3 + H * 0.6;
      s.position.set(t.group.position.x + Math.sin(b) * off, t.group.position.y + Math.cos(b) * off, H * 0.9 + 1.5);
      s.target.position.set(t.group.position.x, t.group.position.y, H * 0.45);
      s.distance = off * 3 + H * 2;
      s.intensity = 20 + H * 8;
    });
  }

  render(_gl: WebGL2RenderingContext, opts: CustomRenderMethodInput) {
    if (!this.visible || !this.items.length) return;
    const s = this.originMerc.meterInMercatorCoordinateUnits();
    const model = new THREE.Matrix4().makeTranslation(this.originMerc.x, this.originMerc.y, this.originMerc.z ?? 0).scale(new THREE.Vector3(s, -s, s));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(opts.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // The shadow camera follows the view centre and covers the art around it (re-rendered only when it moves).
    const c = this.map.getCenter(), [cx, cy] = this.metresFromOrigin(c.lng, c.lat);
    const span = Math.min(900, Math.max(150, 40000 / 2 ** (this.map.getZoom() - 10)));
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); this.shadowDirty = true; }
    if (this.sun.target.position.x !== cx || this.sun.target.position.y !== cy) this.shadowDirty = true;
    this.sun.target.position.set(cx, cy, 0);
    this.sun.position.set(cx + this.sunDir.x * 1200, cy + this.sunDir.y * 1200, this.sunDir.z * 1200);
    this.placeSpots();
    if (this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
