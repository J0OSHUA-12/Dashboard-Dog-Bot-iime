// Marcha de reposo del visor: trote en diagonal resuelto con cinemática inversa.
//
// Sólo dibujo. Trabaja en ángulos del modelo (no en µs ni con los signos del perfil), así
// que las cuatro patas se mueven igual sea cual sea la calibración guardada.
//
// En la fase de apoyo cada pie queda a la altura de la pose de referencia y retrocede a
// velocidad constante respecto al cuerpo: esa es la velocidad con la que el visor desplaza
// el suelo, de modo que el pie apoyado no patina.
import { JointId, LEGS, LegId } from '../../shared/joints';
import { FOOT_DROP, FOOT_FORWARD, S } from './DogBotModel';
import { ModelParams } from './modelParams';

/** Duración de un ciclo completo (ms). */
export const GAIT_CYCLE_MS = 1200;
/** Fracción del ciclo con el pie apoyado (> 0,5: las diagonales se solapan un instante). */
export const GAIT_DUTY = 0.56;
/** Zancada (mm): recorrido del pie respecto al cuerpo durante el apoyo. */
export const GAIT_STRIDE = 78;
/** Elevación máxima del pie en vuelo (mm). */
const SWING_LIFT = 30;
/** Abducción máxima de cadera en vuelo (grados): la pata se abre un poco al pasar. */
const SWING_ABDUCTION = 3.5;
/** Vaivén vertical del cuerpo (mm), dos veces por ciclo. */
const BODY_BOB = 1.6;

/** Pose de referencia del modelo: muslo −30°, rodilla +60° (la misma de `standHeight`). */
const REF_UPPER = (-30 * Math.PI) / 180;
const REF_KNEE = (60 * Math.PI) / 180;

/** Desfase de cada pata: trote = diagonales D1+P2 y D2+P1 a medio ciclo. */
const PHASE: Record<LegId, number> = { D1: 0, P2: 0, D2: 0.5, P1: 0.5 };

const DEG = 180 / Math.PI;

export interface GaitFrame {
  /** Ángulo del modelo (grados) por articulación. */
  angles: Record<JointId, number>;
  /** Desplazamiento vertical del cuerpo (u). */
  bob: number;
}

/** Velocidad de avance (u/s) que corresponde a la zancada: la del pie apoyado respecto al cuerpo. */
export const GAIT_SPEED = (GAIT_STRIDE * S) / ((GAIT_DUTY * GAIT_CYCLE_MS) / 1000);

interface LegGeometry {
  l1: number;
  l2: number;
  /** Ángulo fijo entre el eje del tramo inferior y la recta rodilla → pie. */
  delta: number;
  /** Pie en la pose de referencia, respecto al pivote superior (mm): avance y caída. */
  x0: number;
  h0: number;
}

function legGeometry(p: ModelParams): LegGeometry {
  const l1 = p.thighLength;
  const l2 = Math.hypot(FOOT_FORWARD, p.shinLength + FOOT_DROP);
  const delta = Math.atan2(FOOT_FORWARD, p.shinLength + FOOT_DROP);
  const a = REF_UPPER + REF_KNEE + delta;
  return { l1, l2, delta, x0: l1 * Math.sin(REF_UPPER) + l2 * Math.sin(a), h0: l1 * Math.cos(REF_UPPER) + l2 * Math.cos(a) };
}

/** Cinemática inversa de dos tramos: ángulos (rad) para llevar el pie a (x adelante, h abajo). */
function solveLeg(g: LegGeometry, x: number, h: number): { upper: number; knee: number } {
  const reach = g.l1 + g.l2 - 0.5;
  const d = Math.min(reach, Math.max(Math.abs(g.l1 - g.l2) + 0.5, Math.hypot(x, h)));
  const cosB = (d * d - g.l1 * g.l1 - g.l2 * g.l2) / (2 * g.l1 * g.l2);
  // Rodilla hacia atrás (flexión positiva), como en la pose de referencia.
  const beta = Math.acos(Math.min(1, Math.max(-1, cosB)));
  const upper = Math.atan2(x, h) - Math.atan2(g.l2 * Math.sin(beta), g.l1 + g.l2 * Math.cos(beta));
  return { upper, knee: beta - g.delta };
}

/** Trayectoria del pie (mm, respecto al pivote superior) en la fase `f` ∈ [0, 1) del ciclo. */
export function footTarget(f: number, g: { x0: number; h0: number }): { x: number; h: number; swing: number } {
  if (f < GAIT_DUTY) {
    // Apoyo: retrocede en línea recta a velocidad constante, sin separarse del suelo.
    return { x: g.x0 + GAIT_STRIDE / 2 - GAIT_STRIDE * (f / GAIT_DUTY), h: g.h0, swing: 0 };
  }
  // Vuelo: avanza con una curva de Hermite cuya velocidad al despegar y al posarse es la
  // del apoyo (sin tirones), y se eleva con velocidad vertical nula en ambos extremos.
  const u = (f - GAIT_DUTY) / (1 - GAIT_DUTY);
  const m = -(1 - GAIT_DUTY) / GAIT_DUTY;
  const u2 = u * u;
  const u3 = u2 * u;
  const adv = (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) + (u3 - u2) * m;
  const lift = (1 - Math.cos(2 * Math.PI * u)) / 2;
  return { x: g.x0 - GAIT_STRIDE / 2 + GAIT_STRIDE * adv, h: g.h0 - SWING_LIFT * lift, swing: lift };
}

/** Fase [0, 1) de una pata en el instante `tMs`: apoyo mientras sea menor que GAIT_DUTY. */
export function gaitPhase(tMs: number, leg: LegId): number {
  const cycle = (((tMs % GAIT_CYCLE_MS) + GAIT_CYCLE_MS) % GAIT_CYCLE_MS) / GAIT_CYCLE_MS;
  return (cycle + PHASE[leg]) % 1;
}

/** Pose de la marcha en el instante `tMs`. */
export function idleGait(tMs: number, p: ModelParams): GaitFrame {
  const g = legGeometry(p);
  const bob = BODY_BOB * Math.sin((4 * Math.PI * tMs) / GAIT_CYCLE_MS);
  const angles = {} as Record<JointId, number>;
  for (const leg of LEGS) {
    const t = footTarget(gaitPhase(tMs, leg), g);
    // El cuerpo sube `bob`: el pie debe quedar esa distancia más abajo respecto al pivote.
    const q = solveLeg(g, t.x, t.h + bob);
    angles[`${leg}-superior`] = q.upper * DEG;
    angles[`${leg}-inferior`] = q.knee * DEG;
    angles[`${leg}-cadera`] = SWING_ABDUCTION * t.swing;
  }
  return { angles, bob: bob * S };
}
