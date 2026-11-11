// Trazos de calibración sobre el suelo (capa «Rejilla»), compartidos por los escenarios:
// anillos de alcance, rejilla de datos, ejes, regla graduada, marca de frente y la
// proyección de cada pie. Están a escala del modelo: 1 u = 100 mm.
import * as THREE from 'three';
import { smoothstep } from './marsTerrain';

/** Elevación (u) de los trazos sobre el suelo para que no se mezclen con él. */
const LIFT = 0.025;
/** Anillos de alcance: 250 mm, 500 mm, 750 mm y 1 m. */
const RINGS: [number, string][] = [
  [2.5, '250 mm'],
  [5, '500 mm'],
  [7.5, '750 mm'],
  [10, '1 m'],
];

export type HeightFn = (x: number, z: number) => number;

export interface OverlayStyle {
  color: number;
  /** Multiplicador de opacidad (0–1). */
  strength: number;
  /** Mezcla aditiva (trazo luminoso sobre fondo oscuro) o normal (tinta sobre fondo claro). */
  additive: boolean;
  /** Resplandor suave bajo el robot. */
  glow: boolean;
}

export function softDotTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rótulo de regla dibujado en lienzo (se vuelve a dibujar cuando carga la tipografía). */
function labelSprite(text: string, material: THREE.SpriteMaterial): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.font = '600 40px Rajdhani, "JetBrains Mono", monospace';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(text.toUpperCase(), 6, 34);
    tex.needsUpdate = true;
  };
  draw();
  void document.fonts?.load('600 40px Rajdhani').then(draw, () => undefined);
  const m = material.clone();
  m.map = tex;
  const s = new THREE.Sprite(m);
  s.center.set(0, 0.5);
  s.scale.set(0.84, 0.21, 1);
  return s;
}

export class CalibrationOverlay {
  readonly group = new THREE.Group();
  private mats: { m: THREE.Material & { color: THREE.Color; opacity: number }; opacity: number }[] = [];
  private footMarks: THREE.Mesh[] = [];
  private glow: THREE.Mesh;

  constructor(private heightAt: HeightFn) {
    // Resplandor suave bajo el robot.
    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(5.7, 48),
      new THREE.MeshBasicMaterial({
        map: softDotTexture('rgba(255,190,110,0.5)', 'rgba(255,150,60,0)'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.012;
    this.group.add(this.glow);

    // Anillos de alcance: trazo fino y un halo ancho y tenue que simula el brillo.
    RINGS.forEach(([r], i) => {
      const k = 1 - i * 0.17;
      this.group.add(new THREE.Mesh(this.ringRibbon(r, 0.028), this.material(0.8 * k)));
      this.group.add(new THREE.Mesh(this.ringRibbon(r, 0.2, 160, LIFT * 0.8), this.material(0.1 * k)));
    });

    // Rejilla de datos cada 100 mm (más marcada cada 500 mm), desvanecida con la distancia.
    const gp: number[] = [];
    const gc: number[] = [];
    const EXT = 10;
    const STEPS = 50;
    const line = (fixed: number, alongX: boolean) => {
      const major = Math.round(fixed) % 5 === 0;
      for (let s = 0; s < STEPS; s++) {
        for (const t of [s, s + 1]) {
          const v = -EXT + (t / STEPS) * EXT * 2;
          const x = alongX ? v : fixed;
          const z = alongX ? fixed : v;
          const fade = Math.pow(1 - smoothstep(1.5, EXT, Math.hypot(x, z)), 1.4);
          gp.push(x, heightAt(x, z) + LIFT * 0.6, z);
          gc.push(1, 1, 1, fade * (major ? 0.55 : 0.2));
        }
      }
    };
    for (let i = -EXT; i <= EXT; i++) {
      line(i, true);
      line(i, false);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 4));
    const gm = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
    this.mats.push({ m: gm, opacity: 1 });
    this.group.add(new THREE.LineSegments(gg, gm));

    // Ejes de calibración (longitudinal X, a trazos, y transversal Z) y regla graduada sobre +Z.
    const ap: number[] = [];
    const ai: number[] = [];
    for (let v = -10; v < 10; v += 0.5) this.quad(ap, ai, v + 0.14, 0, 0.14, 0.008);
    for (let v = 0; v < 10.4; v += 0.4) this.quad(ap, ai, 0, v + 0.2, 0.008, 0.2);
    for (let v = 0.5; v <= 10; v += 0.5) {
      const major = Math.abs(v % 2.5) < 1e-6;
      this.quad(ap, ai, major ? 0.2 : 0.09, v, major ? 0.2 : 0.09, 0.011);
    }
    // Marca de frente (+X): punta de flecha sobre el anillo de 500 mm.
    const k = ap.length / 3;
    ap.push(5.75, LIFT, 0, 5.25, LIFT, 0.2, 5.25, LIFT, -0.2);
    ai.push(k, k + 1, k + 2);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
    ag.setIndex(ai);
    this.group.add(new THREE.Mesh(ag, this.material(0.7)));

    // Rótulos de escala junto a la regla.
    const spriteMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const addLabel = (text: string, x: number, z: number) => {
      const s = labelSprite(text, spriteMat);
      this.mats.push({ m: s.material, opacity: 0.95 });
      s.position.set(x, heightAt(x, z) + 0.14, z);
      this.group.add(s);
    };
    for (const [r, text] of RINGS) addLabel(text, 0.5, r);
    addLabel('Frente', 5.95, 0);

    // Marcas de proyección de cada pie sobre el suelo (siguen al modelo, no indican contacto).
    for (let i = 0; i < 4; i++) {
      const mark = new THREE.Mesh(this.ringRibbon(0.27, 0.024, 40, 0, true), this.material(0.9));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), this.material(0.9));
      dot.rotation.x = -Math.PI / 2;
      mark.add(dot);
      mark.position.y = LIFT;
      this.group.add(mark);
      this.footMarks.push(mark);
    }
  }

  private material(opacity: number): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mats.push({ m, opacity });
    return m;
  }

  /** Cinta plana que sigue el suelo entre dos radios (anillo de medición). */
  private ringRibbon(radius: number, width: number, segments = 160, lift = LIFT, flat = false): THREE.BufferGeometry {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      for (const r of [radius - width / 2, radius + width / 2]) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos.push(x, (flat ? 0 : this.heightAt(x, z)) + lift, z);
      }
      if (i < segments) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  /** Rectángulo plano sobre el suelo (marca de regla), centrado en (x, z). */
  private quad(pos: number[], idx: number[], x: number, z: number, hx: number, hz: number) {
    const k = pos.length / 3;
    for (const [dx, dz] of [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ]) {
      pos.push(x + dx, this.heightAt(x + dx, z + dz) + LIFT, z + dz);
    }
    idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }

  /** Coloca la marca de proyección de un pie en su vertical sobre el suelo. */
  setFootMark(i: number, x: number, z: number) {
    const m = this.footMarks[i];
    if (m) m.position.set(x, this.heightAt(x, z) + LIFT, z);
  }

  setStyle(s: OverlayStyle) {
    for (const { m, opacity } of this.mats) {
      m.color.setHex(s.color);
      m.opacity = Math.min(1, opacity * s.strength);
      m.blending = s.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    this.glow.visible = s.glow;
  }
}

/** Interfaz común de los escenarios del visor. */
export interface SceneEnvironment {
  /** Suelo, fondo, luces y ambiente: siempre visibles. */
  readonly world: THREE.Group;
  /** Trazos de calibración: capa «Rejilla». */
  readonly overlay: THREE.Group;
  readonly fog: THREE.Fog;
  setTheme(theme: 'dark' | 'light'): void;
  setFootMark(i: number, x: number, z: number): void;
  /** Cota del suelo en (x, z): la cámara no baja de ahí. */
  heightAt(x: number, z: number): number;
  update(dt: number): void;
  dispose(): void;
}

/** Libera geometrías, materiales y texturas de un grupo. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as (THREE.Material & { map?: THREE.Texture | null })[];
    for (const mm of mats) {
      mm.map?.dispose();
      mm.dispose();
    }
  });
}
