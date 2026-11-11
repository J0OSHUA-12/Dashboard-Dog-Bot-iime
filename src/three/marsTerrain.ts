// Relieve procedural del entorno marciano. Funciones puras (sin DOM ni three.js) para
// poder comprobarlas en pruebas: la zona bajo el robot es plana y a cota 0, de modo que
// el apoyo dibujado no depende del relieve.
//
// Unidades de escena: 1 u = 100 mm (igual que el modelo del robot).

/** Radio (u) de la zona nivelada bajo el robot: 1,05 m (cubre los anillos de calibración). */
export const PAD_RADIUS = 10.5;
/** Radio (u) a partir del cual el relieve alcanza su amplitud completa. */
export const PAD_BLEND = 26;
/** Radio (u) del disco de terreno. */
export const WORLD_RADIUS = 340;

// Relieve que avanza con la caminata: campo periódico en X, muestreado en una rejilla.
/** Periodo (u) del relieve desplazable a lo largo de X. */
export const FIELD_PERIOD = 256;
/** Paso (u) de la rejilla del campo. */
export const FIELD_STEP = 0.5;
/** Semiancho (u) del campo en Z. */
export const FIELD_HALF_Z = 112;
export const FIELD_NX = FIELD_PERIOD / FIELD_STEP;
export const FIELD_NZ = (FIELD_HALF_Z * 2) / FIELD_STEP + 1;
/** Entre estos radios el relieve desplazable se funde con el estático del horizonte. */
export const NEAR_FADE_START = 72;
export const NEAR_FADE_END = 104;

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

/** Relieve abierto (dunas y ondulaciones de arena) sin la zona nivelada. */
function openTerrain(x: number, z: number): number {
  return fbm(x * 0.03 + 11.3, z * 0.03 - 4.7, 4) * 3.2 + noise2(x * 0.32, z * 0.32) * 0.22 + noise2(x * 1.05 + 3.1, z * 1.05) * 0.05;
}

/** Tono del suelo en [0, 1]: manchas de arena clara y de basalto. */
function patchTone(x: number, z: number): number {
  return fbm(x * 0.022 + 5.1, z * 0.022 - 8.3, 3) * 0.5 + 0.5;
}

/**
 * Campo del relieve desplazable: por celda, altura, pendientes en X y Z, y tono.
 * Es periódico en X (los últimos 48 u se funden con el inicio), de modo que el terreno
 * puede avanzar indefinidamente bajo el robot.
 */
export interface TerrainField {
  /** RGBA por celda: altura, dh/dx, dh/dz, tono. Fila = z, columna = x. */
  data: Float32Array;
}

let field: TerrainField | null = null;

export function terrainField(): TerrainField {
  if (field) return field;
  const h = new Float32Array(FIELD_NX * FIELD_NZ);
  const tone = new Float32Array(FIELD_NX * FIELD_NZ);
  const SEAM = 48;
  for (let j = 0; j < FIELD_NZ; j++) {
    const z = -FIELD_HALF_Z + j * FIELD_STEP;
    for (let i = 0; i < FIELD_NX; i++) {
      const x = i * FIELD_STEP;
      const w = smoothstep(FIELD_PERIOD - SEAM, FIELD_PERIOD, x);
      const k = j * FIELD_NX + i;
      h[k] = w > 0 ? openTerrain(x, z) * (1 - w) + openTerrain(x - FIELD_PERIOD, z) * w : openTerrain(x, z);
      tone[k] = w > 0 ? patchTone(x, z) * (1 - w) + patchTone(x - FIELD_PERIOD, z) * w : patchTone(x, z);
    }
  }
  const data = new Float32Array(FIELD_NX * FIELD_NZ * 4);
  for (let j = 0; j < FIELD_NZ; j++) {
    const jm = Math.max(0, j - 1);
    const jp = Math.min(FIELD_NZ - 1, j + 1);
    for (let i = 0; i < FIELD_NX; i++) {
      const im = (i + FIELD_NX - 1) % FIELD_NX;
      const ip = (i + 1) % FIELD_NX;
      const k = j * FIELD_NX + i;
      data[k * 4] = h[k];
      data[k * 4 + 1] = (h[j * FIELD_NX + ip] - h[j * FIELD_NX + im]) / (2 * FIELD_STEP);
      data[k * 4 + 2] = (h[jp * FIELD_NX + i] - h[jm * FIELD_NX + i]) / ((jp - jm) * FIELD_STEP);
      data[k * 4 + 3] = tone[k];
    }
  }
  field = { data };
  return field;
}

/** Altura del relieve desplazable en coordenadas de terreno (interpolación bilineal). */
function fieldHeight(xw: number, z: number): number {
  const d = terrainField().data;
  const fx = (((xw % FIELD_PERIOD) + FIELD_PERIOD) % FIELD_PERIOD) / FIELD_STEP;
  const fz = Math.min(FIELD_NZ - 1, Math.max(0, (z + FIELD_HALF_Z) / FIELD_STEP));
  const i0 = Math.floor(fx) % FIELD_NX;
  const i1 = (i0 + 1) % FIELD_NX;
  const j0 = Math.min(FIELD_NZ - 2, Math.floor(fz));
  const tx = fx - Math.floor(fx);
  const tz = fz - j0;
  const a = d[(j0 * FIELD_NX + i0) * 4] * (1 - tx) + d[(j0 * FIELD_NX + i1) * 4] * tx;
  const b = d[((j0 + 1) * FIELD_NX + i0) * 4] * (1 - tx) + d[((j0 + 1) * FIELD_NX + i1) * 4] * tx;
  return a * (1 - tz) + b * tz;
}

/** Amplitud del relieve según la distancia al robot: nula en la zona nivelada, completa lejos. */
export function reliefEnvelope(r: number): number {
  return smoothstep(PAD_RADIUS, PAD_BLEND, r) * (0.3 + 0.7 * smoothstep(12, 80, r));
}

/** Peso del relieve desplazable (1 cerca, 0 en el horizonte estático). */
export function nearWeight(r: number): number {
  return 1 - smoothstep(NEAR_FADE_START, NEAR_FADE_END, r);
}

/**
 * Parte ESTÁTICA de la cota (u): dunas lejanas y cordilleras del horizonte. No depende del
 * avance: es lo que guarda la geometría del terreno.
 */
export function staticHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= NEAR_FADE_START) return 0;
  const farDunes = (1 - nearWeight(r)) * reliefEnvelope(r) * openTerrain(x, z);
  // Cordilleras en el horizonte: ruido "ridged" con picos afilados.
  const far = smoothstep(95, 250, r);
  if (far <= 0) return farDunes;
  const rn = 1 - Math.abs(fbm(x * 0.0085 - 2.2, z * 0.0085 + 7.9, 4));
  return farDunes + Math.pow(rn, 2.6) * 46 * far * (0.55 + 0.45 * noise2(x * 0.004 + 40, z * 0.004));
}

/**
 * Cota del terreno (u) en el punto (x, z) relativo al robot, tras avanzar `travel` u en +X.
 * Exactamente 0 dentro de la zona nivelada, sea cual sea el avance.
 */
export function heightAt(x: number, z: number, travel = 0): number {
  const r = Math.hypot(x, z);
  if (r <= PAD_RADIUS) return 0;
  const near = nearWeight(r);
  const moving = near > 0 ? near * reliefEnvelope(r) * fieldHeight(x + travel, z) : 0;
  return moving + staticHeightAt(x, z);
}
