// Definición de patas y articulaciones del Dog Bot.
//
// Nomenclatura: "D1"/"D2" = delantera 1/2, "P1"/"P2" = posterior 1/2.
// NO se asigna izquierda/derecha física: el dossier no la confirma. La
// ubicación de cada pata en la escena 3D es una convención visual.

export type LegId = 'D1' | 'D2' | 'P1' | 'P2';
export type JointKind = 'cadera' | 'superior' | 'inferior';
export type JointId = `${LegId}-${JointKind}`;

export const LEGS: readonly LegId[] = ['D1', 'D2', 'P1', 'P2'] as const;
export const JOINT_KINDS: readonly JointKind[] = ['cadera', 'superior', 'inferior'] as const;

export const LEG_LABEL: Record<LegId, string> = {
  D1: 'Delantera 1',
  D2: 'Delantera 2',
  P1: 'Posterior 1',
  P2: 'Posterior 2',
};

export const JOINT_LABEL: Record<JointKind, string> = {
  cadera: 'Cadera',
  superior: 'Superior',
  inferior: 'Inferior',
};

/** Descripción del eje según el dossier (pata delantera 1). */
export const JOINT_DESCRIPTION: Record<JointKind, string> = {
  cadera: 'Servo de cadera: unión al cuerpo; abre/cierra la pata respecto al chasis.',
  superior: 'Servo superior: tramo superior de la pata; la lleva adelante/atrás.',
  inferior: 'Servo inferior: articulación de la parte larga; flexiona/extiende.',
};

export const ALL_JOINTS: readonly JointId[] = LEGS.flatMap((leg) =>
  JOINT_KINDS.map((k) => `${leg}-${k}` as JointId),
);

export function jointLeg(id: JointId): LegId {
  return id.split('-')[0] as LegId;
}
export function jointKind(id: JointId): JointKind {
  return id.split('-')[1] as JointKind;
}
export function jointLabel(id: JointId): string {
  return `${jointLeg(id)} · ${JOINT_LABEL[jointKind(id)]}`;
}
export function isJointId(v: unknown): v is JointId {
  return typeof v === 'string' && (ALL_JOINTS as readonly string[]).includes(v);
}
export function isFrontLeg(leg: LegId): boolean {
  return leg === 'D1' || leg === 'D2';
}

/** Límites eléctricos de la banda de comandos (no mecánicos). */
export const PULSE_ABS_MIN = 500;
export const PULSE_ABS_MAX = 2500;
/** Centro de señal de referencia. NO es la postura recta de la estructura. */
export const PULSE_SIGNAL_CENTER = 1500;
/** Canales que pueden pertenecer a los 12 servos previstos. */
export const MAX_ROBOT_CHANNEL = 11;
