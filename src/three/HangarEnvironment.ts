// Escenario «Hangar / Laboratorio»: nave de pruebas con suelo industrial oscuro y mate,
// pórtico de luz cenital sobre el robot, sombras suaves y fondo en penumbra.
// Igual que el terreno marciano, es un escenario visual: el suelo es plano (cota 0) y no
// se simula contacto ni dinámica. Los trazos de calibración sí están a escala (1 u = 100 mm).
import * as THREE from 'three';
import { CalibrationOverlay, SceneEnvironment, disposeTree } from './CalibrationOverlay';
import { seededRandom } from './marsTerrain';

type EnvTheme = 'dark' | 'light';

interface HangarSpec {
  backdrop: number;
  fogNear: number;
  fogFar: number;
  floor: number;
  wall: number;
  steel: number;
  paint: number;
  strip: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  spot: number;
  spotIntensity: number;
  rim: number;
  rimIntensity: number;
  beam: number;
  exposure: number;
  overlay: number;
  overlayStrength: number;
  additive: boolean;
}

// Oscuro = nave en penumbra con un foco sobre el robot; claro = laboratorio con las luces dadas.
const SPEC: Record<EnvTheme, HangarSpec> = {
  dark: {
    backdrop: 0x0b0a09,
    fogNear: 28,
    fogFar: 150,
    floor: 0x6f6a64,
    wall: 0x3d3a37,
    steel: 0x3a3836,
    paint: 0xa07c40,
    strip: 0xffc98f,
    hemiSky: 0xbfc4cc,
    hemiGround: 0x1a1612,
    hemiIntensity: 0.4,
    spot: 0xfff1df,
    spotIntensity: 5200,
    rim: 0xffb070,
    rimIntensity: 420,
    beam: 0.085,
    exposure: 1,
    overlay: 0xd9a55a,
    overlayStrength: 0.72,
    additive: true,
  },
  light: {
    backdrop: 0xc9c5be,
    fogNear: 40,
    fogFar: 170,
    floor: 0xb9b4ad,
    wall: 0xdedad3,
    steel: 0x9a968f,
    paint: 0x9a6a1c,
    strip: 0xfff6e8,
    hemiSky: 0xffffff,
    hemiGround: 0x9a958c,
    hemiIntensity: 1.5,
    spot: 0xffffff,
    spotIntensity: 2600,
    rim: 0xffffff,
    rimIntensity: 0,
    beam: 0,
    exposure: 0.96,
    overlay: 0x5a3a08,
    overlayStrength: 0.85,
    additive: false,
  },
};

/** Altura (u) del pórtico de luces: por encima de cualquier posición de la cámara. */
const RIG_Y = 30;
/** Media anchura (u) de la zona de pruebas marcada en el suelo. */
const BAY = 14;
/** Media anchura (u) de la nave. */
const HALL = 64;
/** Lado (u) de cada losa del suelo: 600 mm. */
const SLAB = 6;

/** Hormigón pulido: grano fino, juntas de losa y roces. Una losa por repetición. */
function slabTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = seededRandom(31);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 196 + Math.floor(rnd() * 40);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 30 + rnd() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const shade = rnd() < 0.55 ? 120 : 255;
    grd.addColorStop(0, `rgba(${shade},${shade},${shade},0.12)`);
    grd.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  // Roces finos de rodadura.
  g.strokeStyle = 'rgba(70,70,70,0.16)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 160, y + (rnd() - 0.5) * 40);
    g.stroke();
  }
  // Junta de la losa en el borde de la textura.
  g.strokeStyle = 'rgba(40,38,36,0.9)';
  g.lineWidth = 5;
  g.strokeRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Paneles verticales de chapa para las paredes. */
function panelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d2d2d2';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const grd = g.createLinearGradient(x, 0, x + 32, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.26)');
    grd.addColorStop(0.1, 'rgba(255,255,255,0.1)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 32, 256);
  }
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 256, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Degradado vertical para el haz de luz simulado (más denso arriba). */
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HangarEnvironment implements SceneEnvironment {
  readonly world = new THREE.Group();
  private calib = new CalibrationOverlay(() => 0);
  readonly overlay = this.calib.group;
  readonly fog: THREE.Fog;
  private hemi: THREE.HemisphereLight;
  private spot: THREE.SpotLight;
  private rims: THREE.SpotLight[] = [];
  private backdrop: THREE.MeshBasicMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private wallMat: THREE.MeshStandardMaterial;
  private paintMat: THREE.MeshStandardMaterial;
  private stripMat: THREE.MeshBasicMaterial;
  private steelMats: THREE.MeshStandardMaterial[] = [];
  private beamMat: THREE.MeshBasicMaterial;

  constructor(private renderer: THREE.WebGLRenderer) {
    const spec = SPEC.dark;
    this.fog = new THREE.Fog(spec.backdrop, spec.fogNear, spec.fogFar);

    // --- Luz: un foco cenital sobre el robot, ambiente tenue y dos contras cálidos.
    this.hemi = new THREE.HemisphereLight(spec.hemiSky, spec.hemiGround, spec.hemiIntensity);
    this.spot = new THREE.SpotLight(spec.spot, spec.spotIntensity, 0, 0.42, 0.85, 2);
    this.spot.position.set(2.5, RIG_Y, 3.5);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(2048, 2048);
    this.spot.shadow.camera.near = 8;
    this.spot.shadow.camera.far = 60;
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.02;
    this.spot.shadow.radius = 7;
    this.spot.shadow.blurSamples = 20;
    this.world.add(this.hemi, this.spot, this.spot.target);
    for (const [x, z] of [
      [-22, -14],
      [20, -18],
    ]) {
      const rim = new THREE.SpotLight(spec.rim, spec.rimIntensity, 0, 0.5, 1, 2);
      rim.position.set(x, 9, z);
      rim.target.position.set(0, 1.2, 0);
      this.rims.push(rim);
      this.world.add(rim, rim.target);
    }

    // --- Fondo: cúpula del color de la penumbra (las paredes se funden con ella).
    this.backdrop = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), this.backdrop);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.world.add(dome);

    // --- Suelo industrial mate, por losas de 600 mm.
    const slab = slabTexture();
    slab.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    slab.repeat.set((HALL * 2) / SLAB, (HALL * 2) / SLAB);
    this.floorMat = new THREE.MeshStandardMaterial({ map: slab, bumpMap: slab, bumpScale: 0.6, roughness: 0.86, metalness: 0.04 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL * 2, HALL * 2), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.world.add(floor);

    // --- Pintura de suelo: zona de pruebas con esquinas marcadas y pasillo hacia el frente (+X).
    this.paintMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const paint = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.paintMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.006, z);
      m.receiveShadow = true;
      this.world.add(m);
    };
    // Perímetro discontinuo.
    for (let v = -BAY + 1.2; v < BAY - 1; v += 2.4) {
      for (const s of [-1, 1]) {
        paint(v + 0.6, s * BAY, 1.2, 0.1);
        paint(s * BAY, v + 0.6, 0.1, 1.2);
      }
    }
    // Esquinas en escuadra.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        paint(sx * (BAY - 1.1), sz * BAY, 2.4, 0.26);
        paint(sx * BAY, sz * (BAY - 1.1), 0.26, 2.4);
      }
    }
    // Pasillo: dos líneas continuas y franjas de aviso al salir de la zona.
    for (const s of [-1, 1]) paint(BAY + 17, s * 4.5, 34, 0.14);
    for (let i = 0; i < 7; i++) paint(BAY + 1.2, -3.6 + i * 1.2, 0.9, 0.5);

    // --- Nave: paredes de chapa, tiras de luz, columnas y pórtico.
    const panels = panelTexture();
    panels.repeat.set(HALL / 4, 1);
    this.wallMat = new THREE.MeshStandardMaterial({ map: panels, roughness: 0.82, metalness: 0.25 });
    this.stripMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const wallH = 44;
    for (let i = 0; i < 4; i++) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALL * 2, wallH), this.wallMat);
      const a = (i * Math.PI) / 2;
      wall.position.set(Math.sin(a) * HALL, wallH / 2, Math.cos(a) * HALL);
      wall.rotation.y = a + Math.PI;
      this.world.add(wall);
      // Tiras de luz horizontales a dos alturas.
      for (const [y, h] of [
        [7.5, 0.16],
        [19, 0.1],
      ]) {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(HALL * 2 - 6, h), this.stripMat);
        strip.position.set(Math.sin(a) * (HALL - 0.2), y, Math.cos(a) * (HALL - 0.2));
        strip.rotation.y = a + Math.PI;
        this.world.add(strip);
      }
    }
    const steel = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.5 });
    this.steelMats.push(steel);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = steel) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.world.add(mesh);
      return mesh;
    };
    // Columnas perimetrales con baliza.
    for (let v = -HALL + 8; v <= HALL - 8; v += 16) {
      for (const s of [-1, 1]) {
        box(1.4, wallH, 1.4, v, wallH / 2, s * (HALL - 1.2));
        box(1.4, wallH, 1.4, s * (HALL - 1.2), wallH / 2, v);
        box(0.12, 5, 0.12, v, 4.5, s * (HALL - 2), this.stripMat);
        box(0.12, 5, 0.12, s * (HALL - 2), 4.5, v, this.stripMat);
      }
    }
    // Marco de luminarias suspendido sobre la zona de pruebas (sin pilares: nada tapa al robot).
    const P = BAY + 3;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(0.08, wallH - RIG_Y, 0.08, sx * P, (wallH + RIG_Y) / 2 + 1, sz * P);
      box(0.6, 0.9, P * 2, sx * P, RIG_Y + 1, 0);
      box(P * 2, 0.9, 0.6, 0, RIG_Y + 1, sx * P);
      box(0.4, 0.5, P * 2, sx * 5, RIG_Y + 1, 0);
    }
    for (const [x, z] of [
      [2.5, 3.5],
      [-5, -5],
      [5, -5],
      [-5, 5],
    ]) {
      box(2.6, 0.3, 2.6, x, RIG_Y + 0.4, z);
      box(2.2, 0.06, 2.2, x, RIG_Y + 0.2, z, this.stripMat);
    }
    // Bastidores de equipos al fondo, con testigos.
    const rackMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.45 });
    this.steelMats.push(rackMat);
    const rnd = seededRandom(77);
    for (let i = 0; i < 9; i++) {
      const x = -34 + i * 8.5 + rnd() * 1.5;
      const h = 9 + rnd() * 7;
      box(5, h, 3, x, h / 2, -HALL + 3.2, rackMat);
      for (let k = 0; k < 4; k++) box(0.18, 0.18, 0.05, x - 1.6 + k * 0.5, h - 1.2 - (k % 2) * 0.6, -HALL + 4.75, this.stripMat);
    }

    // --- Haz de luz simulado bajo el foco principal (sólo en penumbra).
    this.beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 11, RIG_Y, 40, 1, true), this.beamMat);
    beam.position.set(1.25, RIG_Y / 2, 1.75);
    beam.rotation.set(-0.058, 0, 0.042);
    this.world.add(beam);

    this.setTheme('dark');
  }

  setFootMark(i: number, x: number, z: number) {
    this.calib.setFootMark(i, x, z);
  }

  heightAt() {
    return 0;
  }

  setTheme(theme: EnvTheme) {
    const s = SPEC[theme];
    this.fog.color.setHex(s.backdrop);
    this.fog.near = s.fogNear;
    this.fog.far = s.fogFar;
    this.backdrop.color.setHex(s.backdrop);
    this.floorMat.color.setHex(s.floor);
    this.wallMat.color.setHex(s.wall);
    this.paintMat.color.setHex(s.paint);
    this.stripMat.color.setHex(s.strip);
    for (const m of this.steelMats) m.color.setHex(s.steel);
    this.hemi.color.setHex(s.hemiSky);
    this.hemi.groundColor.setHex(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.spot.color.setHex(s.spot);
    this.spot.intensity = s.spotIntensity;
    for (const rim of this.rims) {
      rim.color.setHex(s.rim);
      rim.intensity = s.rimIntensity;
    }
    this.beamMat.opacity = s.beam;
    this.beamMat.visible = s.beam > 0;
    this.renderer.toneMappingExposure = s.exposure;
    this.calib.setStyle({ color: s.overlay, strength: s.overlayStrength, additive: s.additive, glow: false });
  }

  update() {
    /* escenario estático */
  }

  dispose() {
    disposeTree(this.world);
    disposeTree(this.overlay);
  }
}
