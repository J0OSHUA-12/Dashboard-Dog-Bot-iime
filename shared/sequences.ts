// Secuencias y poses.
//
// Las secuencias producen consignas en µs por articulación en función del
// tiempo. Son trayectorias de ÓRDENES, no una simulación dinámica: no
// modelan contacto, equilibrio, fricción ni torque.

import { ALL_JOINTS, JointId, LegId, jointKind, jointLeg } from './joints';
import { DogBotProfile, JointConfig, getJoint, sliderRange, visualRefUs } from './profile';

export type Pose = Partial<Record<JointId, number>>;

export interface SavedPose {
  id: string;
  nombre: string;
  creado: string;
  pulses: Pose;
  notas: string;
}

export interface SequenceDef {
  id: string;
  nombre: string;
  descripcion: string;
  etiqueta: 'REPORTADO PROBADO (suspendido)' | 'PROPUESTO' | 'EXPERIMENTAL';
  /** Articulaciones que mueve. */
  joints: readonly JointId[];
  /** Si puede transmitirse al robot real (además exige perfil calibrado). */
  fisicoPermitido: boolean;
  durationMs: number;
  /** Consignas en el instante t (ms desde el inicio, tras la transición). */
  sample: (t: number, ctx: SequenceContext) => Pose;
}

export interface SequenceContext {
  profile: DogBotProfile;
  /** 0.3–1.0: escala de amplitud. */
  amplitude: number;
  /** 'sim': rango del slider; 'fisico': límites calibrados. */
  bandMode: 'sim' | 'fisico';
}

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function clampToBand(j: JointConfig, us: number, mode: 'sim' | 'fisico'): number {
  if (mode === 'fisico') {
    if (j.minUs === null || j.maxUs === null) return visualRefUs(j);
    return Math.round(Math.min(j.maxUs, Math.max(j.minUs, us)));
  }
  const r = sliderRange(j);
  return Math.round(Math.min(r.max, Math.max(r.min, us)));
}

/**
 * Fórmula de CAMINATA_FLUIDA_PROBADA.ino (pata en fase [0,1)):
 * vuelo 43 % con elevación sin²(πt) y avance smoothstep; apoyo 57 % retrocede.
 * Devuelve desplazamientos (µs) en convención del sketch antes de aplicar
 * signos por pata.
 */
export function fluidLegOffsets(fase: number) {
  const AVANCE = 190;
  const FLEXION = 175;
  const EXTENSION = 25;
  const APERTURA = 45;
  const FASE_VUELO = 0.43;
  let avance: number;
  let flexion: number;
  let apertura: number;
  if (fase < FASE_VUELO) {
    const t = fase / FASE_VUELO;
    avance = -AVANCE + 2 * AVANCE * smooth(t);
    let e = Math.sin(Math.PI * t);
    e *= e;
    flexion = FLEXION * e;
    apertura = APERTURA * e;
  } else {
    const t = (fase - FASE_VUELO) / (1 - FASE_VUELO);
    avance = AVANCE - 2 * AVANCE * smooth(t);
    let a = Math.sin(Math.PI * t);
    a *= a;
    flexion = -EXTENSION * a;
    apertura = 0;
  }
  return { avance, flexion, apertura };
}

/** Signos del sketch fluido: direccion[pata] = {superior, inferior, cadera}. */
const FLUID_DIR: Record<LegId, [number, number, number]> = {
  D1: [-1, -1, 1],
  D2: [1, 1, -1],
  // Posteriores: supuesto visual (sin datos físicos).
  P1: [-1, -1, 1],
  P2: [1, 1, -1],
};

function legPose(leg: LegId, fase: number, ctx: SequenceContext, out: Pose) {
  const o = fluidLegOffsets(fase);
  const dir = FLUID_DIR[leg];
  const vals: Record<string, number> = { superior: o.avance * dir[0], inferior: o.flexion * dir[1], cadera: o.apertura * dir[2] };
  for (const k of ['superior', 'inferior', 'cadera'] as const) {
    const id = `${leg}-${k}` as JointId;
    const j = getJoint(ctx.profile, id);
    out[id] = clampToBand(j, visualRefUs(j) + vals[k] * ctx.amplitude, ctx.bandMode);
  }
}

const CYCLE_MS = 2400;

export const SEQUENCES: SequenceDef[] = [
  {
    id: 'ensayo-suspendido-delanteras',
    nombre: 'Ensayo suspendido · delanteras (fluida)',
    descripcion:
      'Reproduce la fórmula de CAMINATA_FLUIDA_PROBADA (dos patas delanteras, desfase de medio ciclo, 3 ciclos de 2,4 s) ' +
      'alrededor de la referencia del perfil. Probada sólo con el robot suspendido en soporte.',
    etiqueta: 'REPORTADO PROBADO (suspendido)',
    joints: ALL_JOINTS.filter((j) => jointLeg(j) === 'D1' || jointLeg(j) === 'D2'),
    fisicoPermitido: true,
    durationMs: CYCLE_MS * 3,
    sample(t, ctx) {
      const fase = (t % CYCLE_MS) / CYCLE_MS;
      const out: Pose = {};
      legPose('D1', fase, ctx, out);
      legPose('D2', (fase + 0.5) % 1, ctx, out);
      return out;
    },
  },
  {
    id: 'propuesta-trote-4-patas',
    nombre: 'Propuesta · trote 4 patas (sólo simulación)',
    descripcion:
      'Patrón diagonal (D1+P2 / D2+P1) con la misma fórmula. Visualización de una idea futura; ' +
      'no transmisible hasta asignar, cablear y calibrar las patas posteriores. No demuestra locomoción.',
    etiqueta: 'PROPUESTO',
    joints: ALL_JOINTS,
    fisicoPermitido: false,
    durationMs: CYCLE_MS * 3,
    sample(t, ctx) {
      const fase = (t % CYCLE_MS) / CYCLE_MS;
      const out: Pose = {};
      legPose('D1', fase, ctx, out);
      legPose('P2', fase, ctx, out);
      legPose('D2', (fase + 0.5) % 1, ctx, out);
      legPose('P1', (fase + 0.5) % 1, ctx, out);
      return out;
    },
  },
];

export function getSequence(id: string): SequenceDef | undefined {
  return SEQUENCES.find((s) => s.id === id);
}

/** Pose de referencia del perfil (calibrada, exploración o 1500 µs). */
export function referencePose(p: DogBotProfile, joints: readonly JointId[] = ALL_JOINTS): Pose {
  const out: Pose = {};
  for (const id of joints) out[id] = visualRefUs(getJoint(p, id));
  return out;
}

/** Interpola dos poses (suavizado). */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const s = smooth(t);
  const out: Pose = {};
  for (const id of Object.keys(b) as JointId[]) {
    const from = a[id] ?? b[id]!;
    out[id] = Math.round(from + (b[id]! - from) * s);
  }
  return out;
}

export function describeJointKind(id: JointId) {
  return jointKind(id);
}
