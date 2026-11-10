// Relieve procedural del entorno marciano. Funciones puras (sin DOM ni three.js) para
// poder comprobarlas en pruebas: la zona bajo el robot es plana y a cota 0, de modo que
// el apoyo dibujado no depende del relieve.
//
// Unidades de escena: 1 u = 100 mm (igual que el modelo del robot).

/** Radio (u) de la zona nivelada bajo el robot: 600 mm. */
export const PAD_RADIUS = 6;
/** Radio (u) a partir del cual el relieve alcanza su amplitud completa. */
export const PAD_BLEND = 20;
/** Radio (u) del disco de terreno. */
export const WORLD_RADIUS = 340;

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generador pseudoaleatorio determinista (misma escena en cada arranque). */
export function seededRandom(seed: number) {
  return mulberry32(seed);
}

const GRAD: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071, 0.7071],
  [-0.7071, 0.7071],
  [0.7071, -0.7071],
  [-0.7071, -0.7071],
];

const PERM = (() => {
  const rnd = mulberry32(0x4d415253); // "MARS"
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ruido de gradiente 2D en [-1, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & 255;
  const Y = yi & 255;
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const v = GRAD[PERM[PERM[ix] + iy] & 7];
    return v[0] * dx + v[1] * dy;
  };
  const u = fade(xf);
  const v = fade(yf);
  const a = lerp(g(X, Y, xf, yf), g(X + 1, Y, xf - 1, yf), u);
  const b = lerp(g(X, Y + 1, xf, yf - 1), g(X + 1, Y + 1, xf - 1, yf - 1), u);
  return lerp(a, b, v) * 1.41;
}

export function fbm(x: number, y: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Cota del terreno (u) en el punto (x, z). Exactamente 0 dentro de la zona nivelada. */
export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= PAD_RADIUS) return 0;
  const mask = smoothstep(PAD_RADIUS, PAD_BLEND, r);
  // Dunas suaves que crecen al alejarse; ondulaciones de arena sólo cerca (lejos se pierden en la bruma).
  const dunes = fbm(x * 0.03 + 11.3, z * 0.03 - 4.7, 4) * 3.2 * (0.25 + 0.75 * smoothstep(12, 80, r));
  const near = 1 - smoothstep(30, 90, r);
  const ripples = (noise2(x * 0.32, z * 0.32) * 0.2 + noise2(x * 1.05 + 3.1, z * 1.05) * 0.05) * near;
  // Cordilleras en el horizonte: ruido "ridged" con picos afilados.
  const far = smoothstep(95, 250, r);
  const rn = 1 - Math.abs(fbm(x * 0.0085 - 2.2, z * 0.0085 + 7.9, 4));
  const ridge = Math.pow(rn, 2.6) * 46 * far * (0.55 + 0.45 * noise2(x * 0.004 + 40, z * 0.004));
  return mask * (dunes + ripples) + ridge;
}
