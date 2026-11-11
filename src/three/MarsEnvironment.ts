// Entorno del visor: terreno marciano procedural (sin recursos externos), cielo con bruma,
// rocas, polvo en suspensión y los trazos dorados de calibración sobre el suelo.
//
// Es un escenario visual: no modela contacto, fricción ni dinámica. La zona bajo el robot
// es plana (cota 0); los anillos y la regla sí están a escala (1 u = 100 mm).
import * as THREE from 'three';
import { CalibrationOverlay, SceneEnvironment, disposeTree, softDotTexture } from './CalibrationOverlay';
import { PAD_RADIUS, WORLD_RADIUS, fbm, heightAt, noise2, seededRandom, smoothstep } from './marsTerrain';

export type EnvTheme = 'dark' | 'light';

interface EnvSpec {
  zenith: number;
  mid: number;
  horizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  sunGlow: number;
  sunDir: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fill: number;
  fillIntensity: number;
  exposure: number;
  overlay: number;
  overlayStrength: number;
  additive: boolean;
  dust: number;
  dustOpacity: number;
}

// Oscuro = atardecer ámbar con sombras largas; claro = mediodía color caramelo.
const SPEC: Record<EnvTheme, EnvSpec> = {
  dark: {
    zenith: 0x4a3238,
    mid: 0xa8694a,
    horizon: 0xe6a878,
    fog: 0xd49a6e,
    fogNear: 30,
    fogFar: 470,
    sun: 0xffd3a8,
    sunIntensity: 4.2,
    sunGlow: 0xffd9ae,
    // Sol bajo, lateral y algo por detrás: sombras largas hacia la derecha de la vista inicial.
    sunDir: [-0.88, 0.34, 0.42],
    hemiSky: 0xffe2cc,
    hemiGround: 0x7a4a36,
    hemiIntensity: 0.95,
    fill: 0xfff0e4,
    fillIntensity: 0.8,
    exposure: 1,
    overlay: 0xffc56e,
    overlayStrength: 1,
    additive: true,
    dust: 0xffe2c2,
    dustOpacity: 0.3,
  },
  light: {
    zenith: 0xbf9c7e,
    mid: 0xe0bd9b,
    horizon: 0xf4dcbf,
    fog: 0xefd2b2,
    fogNear: 36,
    fogFar: 500,
    sun: 0xfff4e6,
    sunIntensity: 3.2,
    sunGlow: 0xfff6e8,
    sunDir: [-0.5, 0.78, 0.38],
    hemiSky: 0xfff0e0,
    hemiGround: 0xa87552,
    hemiIntensity: 1.5,
    fill: 0xffffff,
    fillIntensity: 0.7,
    exposure: 1,
    overlay: 0x5e2c05,
    overlayStrength: 0.9,
    additive: false,
    dust: 0xfff6ea,
    dustOpacity: 0.2,
  },
};

function grainTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = seededRandom(7);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 205 + Math.floor(rnd() * 50);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Guijarros y manchas, repetidos en los bordes para que la textura sea continua.
  const blob = (x: number, y: number, r: number, shade: number, alpha: number) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, `rgba(${shade},${shade},${shade},${alpha})`);
        grd.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  for (let i = 0; i < 70; i++) blob(rnd() * size, rnd() * size, 24 + rnd() * 60, rnd() < 0.5 ? 150 : 255, 0.16);
  for (let i = 0; i < 420; i++) blob(rnd() * size, rnd() * size, 1.5 + rnd() * 4.5, 70 + Math.floor(rnd() * 60), 0.55);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.3 * noise2(v.x * 1.5 + seed, v.y * 1.5 - seed) + 0.16 * noise2(v.z * 2.6 + seed, v.x * 2.6) + 0.07 * noise2(v.y * 6 - seed, v.z * 6);
    v.multiplyScalar(n);
    v.y *= 0.6;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
  col = mix(col, uZenith, smoothstep(0.12, 0.75, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 5.0) * 0.22 + pow(s, 48.0) * 0.5 + smoothstep(0.99955, 0.9998, s) * 1.6);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class MarsEnvironment implements SceneEnvironment {
  /** Terreno, cielo, rocas y polvo: siempre visibles. */
  readonly world = new THREE.Group();
  private calib = new CalibrationOverlay(heightAt);
  /** Trazos de calibración (anillos, rejilla, regla, marcas de pie): capa «Rejilla». */
  readonly overlay = this.calib.group;
  readonly fog: THREE.Fog;
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private sky: THREE.ShaderMaterial;
  private dust: THREE.Points;
  private dustVel: Float32Array;
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  theme: EnvTheme = 'dark';

  constructor(private renderer: THREE.WebGLRenderer) {
    const spec = SPEC.dark;
    this.fog = new THREE.Fog(spec.fog, spec.fogNear, spec.fogFar);

    // --- Luz: sol bajo y cálido, cielo ambiente y un relleno frío tenue desde el lado opuesto.
    this.hemi = new THREE.HemisphereLight(spec.hemiSky, spec.hemiGround, spec.hemiIntensity);
    this.sun = new THREE.DirectionalLight(spec.sun, spec.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 9;
    sc.bottom = -9;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.fill = new THREE.DirectionalLight(spec.fill, spec.fillIntensity);
    this.fill.position.set(7, 5, 8);
    this.world.add(this.hemi, this.sun, this.sun.target, this.fill);

    // --- Cielo
    this.sky = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 20), this.sky);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.world.add(dome);

    this.world.add(this.buildTerrain());
    this.buildRocks();
    this.dust = this.buildDust();
    this.dustVel = new Float32Array((this.dust.geometry.attributes.position as THREE.BufferAttribute).count);
    const rnd = seededRandom(99);
    for (let i = 0; i < this.dustVel.length; i++) this.dustVel[i] = 0.35 + rnd() * 0.9;
    this.world.add(this.dust);

    this.setTheme('dark');
  }

  private buildTerrain(): THREE.Mesh {
    const R = 170;
    const SG = 240;
    const pos = new Float32Array((1 + R * SG) * 3);
    const uv = new Float32Array((1 + R * SG) * 2);
    const idx: number[] = [];
    let k = 1;
    for (let i = 1; i <= R; i++) {
      const t = i / R;
      const r = WORLD_RADIUS * (0.08 * t + 0.92 * Math.pow(t, 2.4));
      for (let j = 0; j < SG; j++) {
        // Medio paso de desfase en anillos alternos: evita filas de triángulos alineadas.
        const a = ((j + (i % 2) * 0.5) / SG) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos[k * 3] = x;
        pos[k * 3 + 1] = heightAt(x, z);
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 7;
        uv[k * 2 + 1] = z / 7;
        k++;
      }
    }
    for (let j = 0; j < SG; j++) idx.push(0, 1 + ((j + 1) % SG), 1 + j);
    for (let i = 1; i < R; i++) {
      const a0 = 1 + (i - 1) * SG;
      const b0 = 1 + i * SG;
      for (let j = 0; j < SG; j++) {
        const j1 = (j + 1) % SG;
        idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    // Color por vértice: polvo óxido, arena clara en las crestas suaves y basalto en las pendientes.
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.length);
    const rust = new THREE.Color(0xa9634a);
    const sand = new THREE.Color(0xcf9a74);
    const basalt = new THREE.Color(0x6b4436);
    const dustTop = new THREE.Color(0xc09478);
    const c = new THREE.Color();
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const patch = fbm(x * 0.022 + 5.1, z * 0.022 - 8.3, 3) * 0.5 + 0.5;
      c.copy(rust).lerp(sand, smoothstep(0.35, 0.75, patch));
      c.lerp(basalt, smoothstep(0.42, 0.18, patch) * 0.45);
      c.lerp(basalt, smoothstep(0.93, 0.62, nrm.getY(i)) * 0.85);
      c.lerp(dustTop, smoothstep(12, 46, y) * 0.5);
      const speck = 0.94 + 0.06 * noise2(x * 0.9, z * 0.9);
      col[i * 3] = c.r * speck;
      col[i * 3 + 1] = c.g * speck;
      col[i * 3 + 2] = c.b * speck;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const grain = grainTexture();
    grain.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, bumpMap: grain, bumpScale: 2.2, roughness: 0.97, metalness: 0 });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildRocks() {
    const rnd = seededRandom(2031);
    const tints = [0x8a5a44, 0xa46a4c, 0x74483a, 0xb07a58];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let v = 0; v < 3; v++) {
      const count = 96;
      const mesh = new THREE.InstancedMesh(rockGeometry(v * 13.7 + 1), new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0 }), count);
      for (let i = 0; i < count; i++) {
        // Densidad mayor cerca; nada dentro del área que pisan las patas.
        const far = rnd() < 0.14;
        const r = far ? 45 + rnd() * 150 : PAD_RADIUS * 0.8 + Math.pow(rnd(), 1.5) * 52;
        const a = rnd() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const s = far ? 1.4 + rnd() * 4 : 0.05 + Math.pow(rnd(), 2.6) * (0.16 + r * 0.03);
        dummy.position.set(x, heightAt(x, z) + s * 0.12, z);
        dummy.rotation.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
        dummy.scale.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.5));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setHex(tints[Math.floor(rnd() * tints.length)]).multiplyScalar(0.85 + rnd() * 0.3);
        mesh.setColorAt(i, color);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.world.add(mesh);
    }
  }

  private buildDust(): THREE.Points {
    const n = 360;
    const rnd = seededRandom(404);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 44;
      pos[i * 3 + 1] = 0.15 + Math.pow(rnd(), 1.6) * 7;
      pos[i * 3 + 2] = (rnd() - 0.5) * 44;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      size: 0.11,
      map: softDotTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  setFootMark(i: number, x: number, z: number) {
    this.calib.setFootMark(i, x, z);
  }

  heightAt(x: number, z: number) {
    return heightAt(x, z);
  }

  setTheme(theme: EnvTheme) {
    this.theme = theme;
    const s = SPEC[theme];
    this.fog.color.setHex(s.fog);
    this.fog.near = s.fogNear;
    this.fog.far = s.fogFar;
    this.hemi.color.setHex(s.hemiSky);
    this.hemi.groundColor.setHex(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.sun.color.setHex(s.sun);
    this.sun.intensity = s.sunIntensity;
    const dir = new THREE.Vector3(...s.sunDir).normalize();
    this.sun.position.copy(dir).multiplyScalar(45);
    this.sun.target.position.set(0, 0, 0);
    this.fill.color.setHex(s.fill);
    this.fill.intensity = s.fillIntensity;
    const u = this.sky.uniforms;
    (u.uZenith.value as THREE.Color).setHex(s.zenith);
    (u.uMid.value as THREE.Color).setHex(s.mid);
    (u.uHorizon.value as THREE.Color).setHex(s.horizon);
    (u.uSunColor.value as THREE.Color).setHex(s.sunGlow);
    (u.uSunDir.value as THREE.Vector3).copy(dir);
    this.renderer.toneMappingExposure = s.exposure;
    this.calib.setStyle({ color: s.overlay, strength: s.overlayStrength, additive: s.additive, glow: s.additive });
    const dm = this.dust.material as THREE.PointsMaterial;
    dm.color.setHex(s.dust);
    dm.opacity = s.dustOpacity;
  }

  /** Deriva lenta del polvo en suspensión (se omite con «reducir movimiento»). */
  update(dt: number) {
    if (this.reducedMotion) return;
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < p.count; i++) {
      let x = a[i * 3] + this.dustVel[i] * dt * 0.5;
      if (x > 22) x -= 44;
      a[i * 3] = x;
      a[i * 3 + 2] += Math.sin(x * 0.4 + i) * dt * 0.06;
    }
    p.needsUpdate = true;
  }

  dispose() {
    disposeTree(this.world);
    disposeTree(this.overlay);
  }
}
