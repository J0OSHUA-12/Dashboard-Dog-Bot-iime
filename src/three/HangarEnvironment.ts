// Escenario «Hangar / Laboratorio»: taller industrial cálido. Suelo oscuro de hormigón y chapa
// estriada, lámparas colgantes de tungsteno con bruma, y alrededor del área de pruebas, en
// penumbra: brazos robóticos, estanterías metálicas, andamios y mesas de trabajo.
//
// Es una nave sin fin a lo largo de X: al avanzar la caminata, el suelo y el mobiliario se
// desplazan y se repiten cada PERIOD unidades. Como el terreno marciano, es un escenario
// visual: suelo plano (cota 0), sin contacto ni dinámica. Los trazos de calibración quedan
// anclados al robot y están a escala (1 u = 100 mm).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CalibrationOverlay, SceneEnvironment, disposeTree, softDotTexture } from './CalibrationOverlay';
import { seededRandom, smoothstep } from './marsTerrain';

type EnvTheme = 'dark' | 'light';

interface HangarSpec {
  haze: number;
  fogNear: number;
  fogFar: number;
  floor: number;
  wall: number;
  paint: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  key: number;
  keyIntensity: number;
  ambientLamps: number;
  rimIntensity: number;
  /** Brillo de bombillas, halos, haces y charcos de luz (0 = luces del taller apagadas de día). */
  lamps: number;
  exposure: number;
  overlay: number;
  overlayStrength: number;
  additive: boolean;
}

// Oscuro = taller de noche, sólo con las lámparas de tungsteno; claro = nave con luz de día.
const SPEC: Record<EnvTheme, HangarSpec> = {
  dark: {
    haze: 0x23160d,
    fogNear: 14,
    fogFar: 104,
    floor: 0x6e6862,
    wall: 0x5c4f44,
    paint: 0xb58a3c,
    hemiSky: 0xead6c0,
    hemiGround: 0x2a1a10,
    hemiIntensity: 0.3,
    key: 0xffdfbd,
    keyIntensity: 3000,
    ambientLamps: 0.36,
    rimIntensity: 320,
    lamps: 1,
    exposure: 1,
    overlay: 0xffc56e,
    overlayStrength: 1,
    additive: true,
  },
  light: {
    haze: 0xcfc4b6,
    fogNear: 30,
    fogFar: 170,
    floor: 0xc9c2b8,
    wall: 0xd8d0c4,
    paint: 0xa06e18,
    hemiSky: 0xffffff,
    hemiGround: 0x9c9488,
    hemiIntensity: 1.45,
    key: 0xfff4e6,
    keyIntensity: 1400,
    ambientLamps: 1.1,
    rimIntensity: 0,
    lamps: 0.16,
    exposure: 0.96,
    overlay: 0x5a3a08,
    overlayStrength: 0.85,
    additive: false,
  },
};

/** Longitud (u) tras la que se repite el mobiliario a lo largo de X. */
const PERIOD = 128;
const HALF = PERIOD / 2;
/** Semiancho (u) de la nave: paredes en z = ±HALL_Z. */
const HALL_Z = 34;
/** Lado (u) que cubre una repetición de la textura del suelo. */
const FLOOR_TILE = 8;
/** Largo (u) de un tramo de la textura de pared. */
const WALL_TILE = 16;

const TUNGSTEN = 0xffb766;

// ---------------------------------------------------------------- texturas procedurales

/** Suelo: cuatro losas por repetición; hormigón pulido y una chapa estriada. */
function floorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = seededRandom(31);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 150 + Math.floor(rnd() * 46);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const half = size / 2;
  // Manchas y desgaste.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 30 + rnd() * 120;
    const shade = rnd() < 0.6 ? 60 : 235;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${shade},${shade},${shade},0.14)`);
    grd.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  // Chapa estriada (lágrima) en una de las cuatro losas.
  g.fillStyle = 'rgb(118,118,118)';
  g.fillRect(half, 0, half, half);
  for (let y = 0; y < half; y += 26) {
    for (let x = half; x < size; x += 26) {
      for (const [dx, dy, a] of [
        [6, 6, Math.PI / 4],
        [19, 19, -Math.PI / 4],
      ]) {
        g.save();
        g.translate(x + dx, y + dy);
        g.rotate(a);
        g.fillStyle = 'rgba(214,214,214,0.85)';
        g.fillRect(-7, -1.6, 14, 3.2);
        g.fillStyle = 'rgba(40,40,40,0.5)';
        g.fillRect(-7, 1.6, 14, 1.4);
        g.restore();
      }
    }
  }
  // Roces de rodadura.
  g.strokeStyle = 'rgba(40,40,40,0.2)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 260, y + (rnd() - 0.5) * 50);
    g.stroke();
  }
  // Juntas entre losas.
  g.strokeStyle = 'rgba(26,24,22,0.95)';
  g.lineWidth = 6;
  for (const v of [0, half, size]) {
    g.beginPath();
    g.moveTo(v, 0);
    g.lineTo(v, size);
    g.moveTo(0, v);
    g.lineTo(size, v);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pared: chapa ondulada arriba y zócalo de bloque abajo, con pilastras. */
function wallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.3)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 16, 330);
  }
  // Zócalo.
  g.fillStyle = 'rgba(70,66,62,0.9)';
  g.fillRect(0, 330, 512, 182);
  g.strokeStyle = 'rgba(20,20,20,0.5)';
  g.lineWidth = 2;
  for (let y = 330; y < 512; y += 46) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
    for (let x = (y / 46) % 2 ? 0 : 48; x < 512; x += 96) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 46);
      g.stroke();
    }
  }
  // Pilastra de acero.
  g.fillStyle = 'rgba(40,38,36,0.95)';
  g.fillRect(0, 0, 26, 512);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(4, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Degradado vertical para el haz de luz simulado (más denso junto a la lámpara). */
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- piezas del taller

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Coloca una geometría y le pinta un color por vértice, lista para fusionar. */
function part(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  geo.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
const cyl = (r: number, h: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, r2 = r) => part(new THREE.CylinderGeometry(r2, r, h, 16), color, x, y, z, rx, ry, rz);

const STEEL = 0x4a4744;
const STEEL_DARK = 0x2b2927;
const ARM = 0xb8842f;

/** Brazo robótico industrial sobre pedestal (≈ 9 u de alto). */
function robotArmGeometry(): THREE.BufferGeometry {
  const a1 = -0.44; // brazo, desde la vertical
  const a2 = 1.9; // antebrazo
  const sx = 0;
  const sy = 3.3;
  const ex = sx + Math.sin(a1) * 5;
  const ey = sy + Math.cos(a1) * 5;
  const wx = ex + Math.sin(a2) * 4.2;
  const wy = ey + Math.cos(a2) * 4.2;
  return mergeGeometries([
    cyl(1.7, 0.35, STEEL_DARK, 0, 0.18, 0),
    cyl(1.05, 1.5, STEEL, 0, 1.1, 0),
    cyl(1.2, 1.0, ARM, 0, 2.3, 0, 0, 0, 0, 0.95),
    cyl(0.85, 1.9, STEEL_DARK, sx, sy, 0, Math.PI / 2),
    box(0.95, 5, 0.95, ARM, (sx + ex) / 2, (sy + ey) / 2, 0, 0, 0, -a1),
    cyl(0.7, 1.6, STEEL_DARK, ex, ey, 0, Math.PI / 2),
    box(0.72, 4.2, 0.72, ARM, (ex + wx) / 2, (ey + wy) / 2, 0, 0, 0, -a2),
    cyl(0.42, 0.9, STEEL_DARK, wx, wy, 0, Math.PI / 2),
    box(0.3, 1.0, 0.18, STEEL, wx + 0.25, wy - 0.7, 0.28),
    box(0.3, 1.0, 0.18, STEEL, wx + 0.25, wy - 0.7, -0.28),
    // Armario de control junto al pedestal.
    box(1.6, 2.6, 1.2, STEEL_DARK, -2.6, 1.3, 0.4),
  ])!;
}

/** Estantería metálica de 10 u con cajas. */
function shelfGeometry(seed: number): THREE.BufferGeometry {
  const rnd = seededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const W = 10;
  const D = 3;
  const H = 12;
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) parts.push(box(0.22, H, 0.22, STEEL, x, H / 2, z));
  const cargo = [0x6b4a2c, 0x7a5a36, 0x3f4a4a, 0x5a2a22, 0x4a5236, 0x2f3238];
  for (const y of [0.4, 4.2, 8, 11.7]) {
    parts.push(box(W, 0.16, D, STEEL_DARK, 0, y, 0));
    if (y > 11) continue;
    let x = -W / 2 + 0.5;
    while (x < W / 2 - 1.2) {
      const w = 1 + rnd() * 1.9;
      const h = 0.9 + rnd() * 2.2;
      if (rnd() < 0.82 && x + w < W / 2 - 0.3) parts.push(box(w, h, 1.4 + rnd() * 1.2, cargo[Math.floor(rnd() * cargo.length)], x + w / 2, y + 0.08 + h / 2, (rnd() - 0.5) * 0.5));
      x += w + 0.25 + rnd() * 0.7;
    }
  }
  // Arriostramiento trasero en cruz.
  const diag = Math.hypot(W, H);
  parts.push(box(0.1, diag, 0.1, STEEL, 0, H / 2, -D / 2, 0, 0, Math.atan2(W, H)));
  parts.push(box(0.1, diag, 0.1, STEEL, 0, H / 2, -D / 2, 0, 0, -Math.atan2(W, H)));
  return mergeGeometries(parts)!;
}

/** Mesa de trabajo de 9 u con monitor, caja de herramientas y flexo. */
function benchGeometry(): THREE.BufferGeometry {
  const W = 9;
  const D = 3.4;
  const H = 3.1;
  const parts: THREE.BufferGeometry[] = [box(W, 0.3, D, 0x4a3524, 0, H, 0), box(W - 0.8, 0.14, D - 0.6, STEEL_DARK, 0, 0.9, 0)];
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) parts.push(box(0.24, H, 0.24, STEEL, x, H / 2, z));
  parts.push(box(2.6, 1.7, 0.16, 0x16181c, -2.2, H + 1.3, -0.9), box(0.3, 0.5, 0.3, STEEL_DARK, -2.2, H + 0.35, -0.9));
  parts.push(box(2.1, 1.0, 1.3, 0x7a2a22, 1.2, H + 0.65, -0.6), box(1.3, 0.7, 1.0, 0x3f4a4a, 3.4, H + 0.5, 0.3));
  parts.push(box(2.4, 2.0, 1.6, STEEL_DARK, 2.6, 1.95, 0));
  // Flexo: brazo articulado y pantalla.
  parts.push(box(0.1, 2.0, 0.1, STEEL, -4, H + 1.1, 0.9, 0, 0, 0.25), box(0.1, 1.6, 0.1, STEEL, -3.35, H + 2.35, 0.9, 0, 0, -0.9));
  parts.push(cyl(0.5, 0.5, STEEL_DARK, -2.7, H + 2.7, 0.9, 0, 0, 0.5, 0.2));
  return mergeGeometries(parts)!;
}

/** Andamio tubular de dos cuerpos. */
function scaffoldGeometry(): THREE.BufferGeometry {
  const W = 6;
  const D = 4;
  const H = 14;
  const TUBE = 0x6a6258;
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) parts.push(cyl(0.12, H, TUBE, x, H / 2, z));
  for (const y of [0.5, 5, 9.5, H]) {
    for (const z of [-D / 2, D / 2]) parts.push(cyl(0.09, W, TUBE, 0, y, z, 0, 0, Math.PI / 2));
    for (const x of [-W / 2, W / 2]) parts.push(cyl(0.09, D, TUBE, x, y, 0, Math.PI / 2));
  }
  const diag = Math.hypot(W, 4.5);
  for (const [y, s] of [
    [2.75, 1],
    [7.25, -1],
    [11.75, 1],
  ]) {
    parts.push(cyl(0.07, diag, TUBE, 0, y, -D / 2, 0, 0, s * Math.atan2(W, 4.5)));
  }
  parts.push(box(W + 0.4, 0.2, D + 0.2, 0x5a4630, 0, 5.15, 0), box(W + 0.4, 0.2, D + 0.2, 0x5a4630, 0, 9.65, 0));
  parts.push(box(1.6, 1.4, 1.4, 0x3f4a4a, -1.4, 5.95, 0), box(1.2, 1.0, 1.2, 0x6b4a2c, 1.6, 10.25, 0.4));
  return mergeGeometries(parts)!;
}

/** Lámpara colgante: cable hasta el techo y pantalla troncocónica. */
function pendantGeometry(): THREE.BufferGeometry {
  return mergeGeometries([cyl(0.035, 34, 0x15110d, 0, 17.9, 0), cyl(0.3, 0.5, 0x1d1a16, 0, 0.75, 0), cyl(1.35, 0.7, 0x24291f, 0, 0.25, 0, 0, 0, 0, 0.32)])!;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  ry: number;
  /** Escala (x, y, z). */
  s: [number, number, number];
}

/** Conjunto de piezas iguales que se desplazan con el suelo y reaparecen por delante. */
class ScrollSet {
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();
  readonly mesh: THREE.InstancedMesh;

  constructor(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    private items: Placement[],
  ) {
    this.mesh = new THREE.InstancedMesh(geo, material, items.length);
    this.mesh.frustumCulled = false;
  }

  place(travel: number) {
    this.items.forEach((it, i) => {
      const x = wrap(it.x - travel);
      // Se hunden al salir y crecen al entrar: sin apariciones bruscas en el límite del tramo.
      const k = edgeFade(x);
      this.sc.set(it.s[0] * k, it.s[1] * k, it.s[2] * k);
      this.p.set(x, it.y, it.z);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q.setFromEuler(this.e.set(0, it.ry, 0)), this.sc));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const wrap = (x: number) => ((((x + HALF) % PERIOD) + PERIOD) % PERIOD) - HALF;
const edgeFade = (x: number) => 1 - smoothstep(HALF - 7, HALF, Math.abs(x));

export class HangarEnvironment implements SceneEnvironment {
  readonly world = new THREE.Group();
  private calib = new CalibrationOverlay(() => 0);
  readonly overlay = this.calib.group;
  readonly fog: THREE.Fog;
  private hemi: THREE.HemisphereLight;
  private key: THREE.SpotLight;
  private ambient: THREE.DirectionalLight;
  private rims: THREE.SpotLight[] = [];
  private backdrop: THREE.MeshBasicMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private wallMat: THREE.MeshStandardMaterial;
  private paintMat: THREE.MeshStandardMaterial;
  private bulbMat: THREE.MeshBasicMaterial;
  private beamMat: THREE.MeshBasicMaterial;
  private poolMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.PointsMaterial;
  private floorTex: THREE.CanvasTexture;
  private wallTex: THREE.CanvasTexture;
  private sets: ScrollSet[] = [];
  private glows: THREE.Points;
  private glowBase: Float32Array;
  private travel = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    const spec = SPEC.dark;
    this.fog = new THREE.Fog(spec.haze, spec.fogNear, spec.fogFar);

    // --- Luz: foco de tungsteno sobre el área de pruebas, ambiente tenue de las lámparas del
    //     taller y dos contras ámbar que recortan la silueta del robot.
    this.hemi = new THREE.HemisphereLight(spec.hemiSky, spec.hemiGround, spec.hemiIntensity);
    this.key = new THREE.SpotLight(spec.key, spec.keyIntensity, 0, 0.5, 0.9, 2);
    this.key.position.set(3.5, 23, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 6;
    this.key.shadow.camera.far = 50;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 7;
    this.key.shadow.blurSamples = 20;
    this.ambient = new THREE.DirectionalLight(TUNGSTEN, spec.ambientLamps);
    this.ambient.position.set(-4, 20, 6);
    this.world.add(this.hemi, this.key, this.key.target, this.ambient);
    for (const [x, z] of [
      [-20, -15],
      [18, -19],
    ]) {
      const rim = new THREE.SpotLight(0xffa860, spec.rimIntensity, 0, 0.5, 1, 2);
      rim.position.set(x, 8, z);
      rim.target.position.set(0, 1.2, 0);
      this.rims.push(rim);
      this.world.add(rim, rim.target);
    }

    // --- Fondo: cúpula del color de la bruma; el fondo de la nave se pierde en ella.
    this.backdrop = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), this.backdrop);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.world.add(dome);

    // --- Suelo industrial: hormigón oscuro y chapa estriada, mate.
    this.floorTex = floorTexture();
    this.floorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const LEN = 320;
    this.floorTex.repeat.set(LEN / FLOOR_TILE, (HALL_Z * 2) / FLOOR_TILE);
    this.floorMat = new THREE.MeshStandardMaterial({ map: this.floorTex, bumpMap: this.floorTex, bumpScale: 1.1, roughness: 0.84, metalness: 0.12 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(LEN, HALL_Z * 2), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.world.add(floor);

    // --- Pintura de suelo: carril continuo a ambos lados del robot y franjas de aviso que pasan.
    this.paintMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const s of [-1, 1]) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 0.16).rotateX(-Math.PI / 2), this.paintMat);
      lane.position.set(0, 0.006, s * 12.5);
      lane.receiveShadow = true;
      this.world.add(lane);
    }
    const dashes: Placement[] = [];
    for (let x = -HALF; x < HALF; x += 8) for (const s of [-1, 1]) dashes.push({ x: x + 2, y: 0.007, z: s * 12.5, ry: 0, s: [1, 1, 1] });
    const dashGeo = mergeGeometries([0, 1, 2].map((i) => new THREE.PlaneGeometry(0.5, 1.5).rotateX(-Math.PI / 2).rotateY(0.6).translate(i * 0.95, 0, -1.1)))!;
    this.addSet(dashGeo, this.paintMat, dashes).mesh.receiveShadow = true;

    // --- Paredes laterales de la nave.
    this.wallTex = wallTexture();
    this.wallTex.repeat.set(LEN / WALL_TILE, 1);
    this.wallMat = new THREE.MeshStandardMaterial({ map: this.wallTex, roughness: 0.85, metalness: 0.2 });
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 30), this.wallMat);
      wall.position.set(0, 15, s * HALL_Z);
      wall.rotation.y = s > 0 ? Math.PI : 0;
      this.world.add(wall);
    }

    // --- Mobiliario del taller (en penumbra, alrededor del área de pruebas).
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.28 });
    const one: [number, number, number] = [1, 1, 1];
    // Brazos robóticos: uno queda a la izquierda de la vista inicial.
    this.addSet(robotArmGeometry(), propMat, [
      { x: -27, y: 0, z: -8.5, ry: 0.5, s: one },
      { x: 30, y: 0, z: 10, ry: 2.6, s: [0.9, 0.9, 0.9] },
      { x: 52, y: 0, z: -15, ry: -0.9, s: [1.1, 1.1, 1.1] },
    ]);
    // Estanterías metálicas al fondo, casi continuas, y otra fila en el lado opuesto.
    const rnd = seededRandom(77);
    for (const [seed, z, ry, step, off] of [
      [5, -28.5, 0, 25.6, 0],
      [9, -28.5, 0, 25.6, 12.8],
      [13, 28.5, Math.PI, 32, 6],
    ] as [number, number, number, number, number][]) {
      const items: Placement[] = [];
      for (let x = -HALF + off; x < HALF; x += step) items.push({ x: x + rnd() * 1.5, y: 0, z, ry, s: [1, 0.9 + rnd() * 0.25, 1] });
      this.addSet(shelfGeometry(seed), propMat, items);
    }
    // Mesas de trabajo: fila a la derecha de la vista inicial y otra enfrente.
    const benches: Placement[] = [];
    for (let x = -HALF + 4; x < HALF; x += 21.3) benches.push({ x, y: 0, z: -19.5, ry: 0, s: one });
    for (let x = -HALF + 14; x < HALF; x += 32) benches.push({ x, y: 0, z: 20, ry: Math.PI, s: one });
    this.addSet(benchGeometry(), propMat, benches);
    // Andamios.
    this.addSet(scaffoldGeometry(), propMat, [
      { x: -40, y: 0, z: -22, ry: 0.08, s: one },
      { x: 12, y: 0, z: -23.5, ry: -0.05, s: [1, 0.86, 1] },
      { x: -8, y: 0, z: 24, ry: 0.1, s: one },
    ]);
    // Cajas y bidones sueltos entre el carril y las mesas.
    const crates: Placement[] = [];
    for (let i = 0; i < 26; i++) {
      const side = rnd() < 0.6 ? -1 : 1;
      const s = 0.8 + rnd() * 1.3;
      crates.push({ x: (rnd() * 2 - 1) * HALF, y: s / 2, z: side * (13.6 + rnd() * 4), ry: rnd() * Math.PI, s: [s * (0.8 + rnd() * 0.6), s, s * (0.8 + rnd() * 0.6)] });
    }
    this.addSet(part(new THREE.BoxGeometry(1, 1, 1), 0x5a4630, 0, 0, 0), propMat, crates);

    // --- Lámparas colgantes de tungsteno: pantalla, bombilla, halo, haz y charco de luz.
    const lamps: Placement[] = [];
    for (const [z, y, off] of [
      [-19, 8.6, 0],
      [0, 12.5, 8],
      [19, 8.6, 4],
      [-30, 10, 10],
    ]) {
      for (let x = -HALF + off; x < HALF; x += 16) lamps.push({ x, y, z, ry: 0, s: one });
    }
    this.addSet(pendantGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), lamps);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
    this.addSet(new THREE.CircleGeometry(1.2, 20).rotateX(Math.PI / 2).translate(0, 0.02, 0), this.bulbMat, lamps);
    this.beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: TUNGSTEN, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    // Haz: cono de altura 1 con la boca arriba; cada lámpara lo estira hasta el suelo.
    this.addSet(
      new THREE.CylinderGeometry(1.1, 5.2, 1, 28, 1, true).translate(0, -0.5, 0),
      this.beamMat,
      lamps.map((l) => ({ ...l, s: [1, l.y, 1] as [number, number, number] })),
    );
    this.poolMat = new THREE.MeshBasicMaterial({
      map: softDotTexture('rgba(255,200,130,0.55)', 'rgba(255,160,70,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.addSet(
      new THREE.CircleGeometry(6.5, 32).rotateX(-Math.PI / 2),
      this.poolMat,
      lamps.map((l) => ({ ...l, y: 0.012 })),
    );
    // Halos (y el brillo de los flexos de las mesas): puntos luminosos que acompañan al tramo.
    const glowPts: number[] = [];
    for (const l of lamps) glowPts.push(l.x, l.y + 0.05, l.z);
    for (const b of benches) glowPts.push(b.x + (b.ry ? 2.7 : -2.7), 5.7, b.z + (b.ry ? -0.9 : 0.9));
    this.glowBase = new Float32Array(glowPts);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowPts), 3));
    this.glowMat = new THREE.PointsMaterial({
      map: softDotTexture('rgba(255,236,200,1)', 'rgba(255,170,80,0)'),
      color: TUNGSTEN,
      size: 5.5,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glows = new THREE.Points(gg, this.glowMat);
    this.glows.frustumCulled = false;
    this.world.add(this.glows);

    this.setTheme('dark');
    this.place();
  }

  private addSet(geo: THREE.BufferGeometry, material: THREE.Material, items: Placement[]): ScrollSet {
    const set = new ScrollSet(geo, material, items);
    this.sets.push(set);
    this.world.add(set.mesh);
    return set;
  }

  /** Coloca suelo, paredes, mobiliario y lámparas según el avance. */
  private place() {
    const t = this.travel;
    this.floorTex.offset.x = (t / FLOOR_TILE) % 1;
    this.wallTex.offset.x = (t / WALL_TILE) % 1;
    for (const set of this.sets) set.place(t);
    const pos = this.glows.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = wrap(this.glowBase[i * 3] - t);
      // Fuera del tramo el halo baja bajo el suelo junto con su lámpara.
      pos.setXYZ(i, x, edgeFade(x) > 0.5 ? this.glowBase[i * 3 + 1] : -50, this.glowBase[i * 3 + 2]);
    }
    pos.needsUpdate = true;
  }

  setTravel(distance: number) {
    if (distance === this.travel) return;
    this.travel = distance;
    this.place();
  }

  setFootMark(i: number, x: number, z: number) {
    this.calib.setFootMark(i, x, z);
  }

  heightAt() {
    return 0;
  }

  setTheme(theme: EnvTheme) {
    const s = SPEC[theme];
    this.fog.color.setHex(s.haze);
    this.fog.near = s.fogNear;
    this.fog.far = s.fogFar;
    this.backdrop.color.setHex(s.haze);
    this.floorMat.color.setHex(s.floor);
    this.wallMat.color.setHex(s.wall);
    this.paintMat.color.setHex(s.paint);
    this.hemi.color.setHex(s.hemiSky);
    this.hemi.groundColor.setHex(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.key.color.setHex(s.key);
    this.key.intensity = s.keyIntensity;
    this.ambient.intensity = s.ambientLamps;
    for (const rim of this.rims) rim.intensity = s.rimIntensity;
    this.bulbMat.color.setHex(0xffe2b0).multiplyScalar(0.35 + 0.65 * s.lamps);
    this.beamMat.opacity = 0.11 * s.lamps;
    this.poolMat.opacity = 0.3 * s.lamps;
    this.glowMat.opacity = 0.9 * s.lamps;
    this.renderer.toneMappingExposure = s.exposure;
    this.calib.setStyle({ color: s.overlay, strength: s.overlayStrength, additive: s.additive, glow: s.additive });
  }

  update() {
    /* el escenario sólo cambia con el avance */
  }

  dispose() {
    disposeTree(this.world);
    disposeTree(this.overlay);
  }
}
