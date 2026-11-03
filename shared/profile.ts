// Perfiles de calibración versionados del Dog Bot.
//
// Un perfil describe, por articulación representada: canal PCA9685, estado
// del canal (probado / propuesto / sin asignar), límites calibrados en µs,
// banda de exploración para calibrar, convención visual y procedencia.
//
// Reglas clave (dossier):
//  - Canales 0–5: probados (dos patas delanteras), SIN calibración definitiva.
//  - Posteriores: sin asignación física confirmada; 6–11 sólo como propuesta.
//  - Canales 12–15: fuera del perfil (rechazados).
//  - Los límites históricos son referencia, NO autorización de movimiento.

import {
  ALL_JOINTS,
  JointId,
  MAX_ROBOT_CHANNEL,
  PULSE_ABS_MAX,
  PULSE_ABS_MIN,
  PULSE_SIGNAL_CENTER,
  isJointId,
  jointKind,
  jointLabel,
  jointLeg,
} from './joints';

export const PROFILE_SCHEMA = 'dogbot-perfil';
export const PROFILE_VERSION = 1;

export type ChannelStatus = 'probado' | 'propuesto' | 'sin-asignar';
export type CalState = 'sin-calibrar' | 'en-progreso' | 'calibrado';

export interface UsBand {
  minUs: number;
  refUs: number;
  maxUs: number;
}

export interface HistoricRef {
  minUs: number;
  maxUs: number;
  fuente: string;
}

export interface JointConfig {
  joint: JointId;
  /** Canal PCA9685 (0–11) o null si no hay asignación. */
  canal: number | null;
  canalEstado: ChannelStatus;
  /** El operador permite que este canal reciba órdenes en ROBOT REAL. */
  transmisionPermitida: boolean;
  /** Efecto observado o esperado al aumentar el pulso. */
  efectoPulsoMas: string | null;
  /** true sólo si el efecto fue comprobado físicamente por el usuario. */
  efectoConfirmado: boolean;
  /** Límites calibrados (µs). null = pendiente. */
  minUs: number | null;
  refUs: number | null;
  maxUs: number | null;
  /** Banda de exploración elegida por el operador para el modo calibración. */
  exploracion: UsBand | null;
  calibracion: {
    estado: CalState;
    fecha: string | null;
    origen: string | null;
    notas: string;
  };
  /** Convención para dibujar el ángulo ESTIMADO (no medido). */
  visual: {
    /** +1/-1: signo entre +µs y el sentido anatómico positivo del modelo. */
    signo: 1 | -1;
    /** µs por grado estimado (interpolación nominal 2000 µs / 180°). */
    usPorGrado: number;
    /** Ángulo visual (grados) que se dibuja cuando el pulso vale la referencia. */
    offsetGrados: number;
    fuenteSigno: string;
  };
  historico: HistoricRef[];
}

export interface DogBotProfile {
  schema: typeof PROFILE_SCHEMA;
  version: typeof PROFILE_VERSION;
  id: string;
  nombre: string;
  robot: string;
  creado: string;
  modificado: string;
  notas: string;
  joints: JointConfig[];
}

export type IssueLevel = 'error' | 'aviso';
export interface ProfileIssue {
  level: IssueLevel;
  joint?: JointId;
  campo?: string;
  mensaje: string;
}

const NOMINAL_US_PER_DEG = 2000 / 180;

const HIST_FLUIDA: HistoricRef = {
  minUs: 1300,
  maxUs: 1700,
  fuente: 'CAMINATA_FLUIDA_PROBADA.ino: banda global de software (no límite mecánico)',
};
const HIST_20_MIN = [1250, 1200, 1400, 1250, 1200, 1400];
const HIST_20_MAX = [1750, 1800, 1600, 1750, 1800, 1600];

function hist20(ch: number): HistoricRef {
  return {
    minUs: HIST_20_MIN[ch],
    maxUs: HIST_20_MAX[ch],
    fuente: 'CAMINATA_2_0_EXPERIMENTAL.ino: límites provisionales NO probados',
  };
}

/** Ángulo visual dibujado en la referencia: postura agachada supuesta. */
const VISUAL_OFFSET: Record<string, number> = { cadera: 0, superior: -30, inferior: 60 };

function baseJoint(joint: JointId): JointConfig {
  return {
    joint,
    canal: null,
    canalEstado: 'sin-asignar',
    transmisionPermitida: false,
    efectoPulsoMas: null,
    efectoConfirmado: false,
    minUs: null,
    refUs: null,
    maxUs: null,
    exploracion: null,
    calibracion: { estado: 'sin-calibrar', fecha: null, origen: null, notas: '' },
    visual: {
      signo: 1,
      usPorGrado: NOMINAL_US_PER_DEG,
      offsetGrados: VISUAL_OFFSET[jointKind(joint)],
      fuenteSigno: 'Supuesto visual (sin dato físico)',
    },
    historico: [],
  };
}

/**
 * Perfil inicial: seis canales conocidos (0–5) sin calibrar; posteriores sin
 * asignación. No autoriza ningún movimiento por sí mismo.
 */
export function createInitialProfile(now = new Date()): DogBotProfile {
  const fecha = now.toISOString();
  const joints = ALL_JOINTS.map((j) => baseJoint(j));
  const set = (id: JointId, patch: Partial<JointConfig>) => {
    const i = joints.findIndex((x) => x.joint === id);
    joints[i] = { ...joints[i], ...patch };
  };
  // Pata delantera 1 — dirección comprobada por el usuario.
  set('D1-superior', {
    canal: 0,
    canalEstado: 'probado',
    transmisionPermitida: true,
    efectoPulsoMas: 'Hacia atrás (comprobado por el usuario)',
    efectoConfirmado: true,
    visual: { signo: -1, usPorGrado: NOMINAL_US_PER_DEG, offsetGrados: VISUAL_OFFSET.superior, fuenteSigno: 'Dossier: +µs mueve hacia atrás' },
    historico: [HIST_FLUIDA, hist20(0)],
  });
  set('D1-inferior', {
    canal: 1,
    canalEstado: 'probado',
    transmisionPermitida: true,
    efectoPulsoMas: 'Extiende (comprobado por el usuario)',
    efectoConfirmado: true,
    visual: { signo: -1, usPorGrado: NOMINAL_US_PER_DEG, offsetGrados: VISUAL_OFFSET.inferior, fuenteSigno: 'Dossier: +µs extiende' },
    historico: [HIST_FLUIDA, hist20(1)],
  });
  set('D1-cadera', {
    canal: 2,
    canalEstado: 'probado',
    transmisionPermitida: true,
    efectoPulsoMas: 'Hacia afuera del cuerpo (comprobado por el usuario)',
    efectoConfirmado: true,
    visual: { signo: 1, usPorGrado: NOMINAL_US_PER_DEG, offsetGrados: VISUAL_OFFSET.cadera, fuenteSigno: 'Dossier: +µs abre hacia afuera' },
    historico: [HIST_FLUIDA, hist20(2)],
  });
  // Pata delantera 2 — espejo programado; falta tabla individual.
  const mirrorNote = 'Hipótesis: espejo programado de la pata 1 (sin tabla individual)';
  set('D2-superior', {
    canal: 3,
    canalEstado: 'probado',
    transmisionPermitida: true,
    efectoPulsoMas: 'Esperado: hacia adelante (espejo de canal 0) — sin confirmar',
    visual: { signo: 1, usPorGrado: NOMINAL_US_PER_DEG, offsetGrados: VISUAL_OFFSET.superior, fuenteSigno: mirrorNote },
    historico: [HIST_FLUIDA, hist20(3)],
  });
  set('D2-inferior', {
    canal: 4,
    canalEstado: 'probado',
    transmisionPermitida: true,
    efectoPulsoMas: 'Esperado: flexiona (espejo de canal 1) — sin confirmar',
    visual: { signo: 1, usPorGrado: NOMINAL_US_PER_DEG, offsetGrados: VISUAL_OFFSET.inferior, fuenteSigno: mirrorNote },
    historico: [HIST_FLUIDA, hist20(4)],
  });
  set('D2-cadera', {
    canal: 5,
    canalEstado: 'probado',
    transmisionPermitida: true,
    efectoPulsoMas: 'Esperado: hacia adentro (espejo de canal 2) — sin confirmar',
    visual: { signo: -1, usPorGrado: NOMINAL_US_PER_DEG, offsetGrados: VISUAL_OFFSET.cadera, fuenteSigno: mirrorNote },
    historico: [HIST_FLUIDA, hist20(5)],
  });
  // Posteriores: copia visual de las delanteras como supuesto; sin canal.
  for (const [rear, front] of [
    ['P1', 'D1'],
    ['P2', 'D2'],
  ] as const) {
    for (const k of ['cadera', 'superior', 'inferior'] as const) {
      const f = joints.find((x) => x.joint === `${front}-${k}`)!;
      set(`${rear}-${k}` as JointId, {
        visual: { ...f.visual, fuenteSigno: 'Supuesto visual copiado de ' + front + ' (sin dato físico)' },
      });
    }
  }
  return {
    schema: PROFILE_SCHEMA,
    version: PROFILE_VERSION,
    id: 'dogbot-inicial',
    nombre: 'Perfil inicial — 6 canales probados, sin calibrar',
    robot: 'Dog Bot (Arduino UNO + PCA9685 0x40, 50 Hz)',
    creado: fecha,
    modificado: fecha,
    notas:
      'Canales 0–5 probados suspendidos; límites, referencias y sentidos de 3/4/5 pendientes. ' +
      'Posteriores sin asignación física. Los límites históricos no son límites mecánicos validados.',
    joints,
  };
}

/** Propuesta explícita (no cableado conocido) de canales 6–11 para posteriores. */
export function applyRearChannelProposal(p: DogBotProfile): DogBotProfile {
  const proposal: Record<string, number> = {
    'P1-superior': 6,
    'P1-inferior': 7,
    'P1-cadera': 8,
    'P2-superior': 9,
    'P2-inferior': 10,
    'P2-cadera': 11,
  };
  return touch({
    ...p,
    joints: p.joints.map((j) =>
      j.joint in proposal
        ? {
            ...j,
            canal: proposal[j.joint],
            canalEstado: 'propuesto',
            transmisionPermitida: false,
            efectoPulsoMas: 'Desconocido — propuesta sin cableado confirmado',
            efectoConfirmado: false,
          }
        : j,
    ),
  });
}

export function touch(p: DogBotProfile, now = new Date()): DogBotProfile {
  return { ...p, modificado: now.toISOString() };
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function inAbs(v: number): boolean {
  return v >= PULSE_ABS_MIN && v <= PULSE_ABS_MAX;
}

function checkBand(
  issues: ProfileIssue[],
  joint: JointId,
  campo: string,
  minUs: number | null,
  refUs: number | null,
  maxUs: number | null,
  required: boolean,
) {
  const vals = [minUs, refUs, maxUs];
  const present = vals.filter((v) => v !== null).length;
  if (present === 0) {
    if (required) issues.push({ level: 'error', joint, campo, mensaje: `${jointLabel(joint)}: faltan mínimo, referencia y máximo.` });
    return;
  }
  if (present < 3) {
    issues.push({
      level: required ? 'error' : 'aviso',
      joint,
      campo,
      mensaje: `${jointLabel(joint)}: rango incompleto (min/ref/max).`,
    });
    return;
  }
  for (const v of vals) {
    if (!isInt(v) || !inAbs(v!)) {
      issues.push({ level: 'error', joint, campo, mensaje: `${jointLabel(joint)}: valor ${v} fuera de ${PULSE_ABS_MIN}–${PULSE_ABS_MAX} µs.` });
      return;
    }
  }
  if (!(minUs! < refUs! && refUs! < maxUs!)) {
    issues.push({
      level: 'error',
      joint,
      campo,
      mensaje: `${jointLabel(joint)}: se requiere mínimo < referencia < máximo (${minUs} / ${refUs} / ${maxUs}).`,
    });
  }
}

/** Valida un perfil ya tipado. Devuelve errores y avisos. */
export function validateProfile(p: DogBotProfile): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const seen = new Map<number, JointId>();
  const ids = new Set<string>();
  for (const j of p.joints) {
    if (ids.has(j.joint)) issues.push({ level: 'error', joint: j.joint, mensaje: `Articulación repetida: ${j.joint}.` });
    ids.add(j.joint);
    if (j.canal !== null) {
      if (!isInt(j.canal) || j.canal < 0 || j.canal > 15) {
        issues.push({ level: 'error', joint: j.joint, campo: 'canal', mensaje: `${jointLabel(j.joint)}: canal inválido (${j.canal}).` });
      } else if (j.canal > MAX_ROBOT_CHANNEL) {
        issues.push({
          level: 'error',
          joint: j.joint,
          campo: 'canal',
          mensaje: `${jointLabel(j.joint)}: canal ${j.canal} pertenece a 12–15, fuera del perfil de 12 servos.`,
        });
      } else if (seen.has(j.canal)) {
        issues.push({
          level: 'error',
          joint: j.joint,
          campo: 'canal',
          mensaje: `Canal ${j.canal} duplicado: ${jointLabel(seen.get(j.canal)!)} y ${jointLabel(j.joint)}.`,
        });
      } else seen.set(j.canal, j.joint);
    }
    if (j.canal === null && j.canalEstado !== 'sin-asignar') {
      issues.push({ level: 'error', joint: j.joint, campo: 'canalEstado', mensaje: `${jointLabel(j.joint)}: estado "${j.canalEstado}" sin canal.` });
    }
    if (j.canal !== null && j.canalEstado === 'sin-asignar') {
      issues.push({ level: 'aviso', joint: j.joint, campo: 'canalEstado', mensaje: `${jointLabel(j.joint)}: tiene canal pero figura sin asignar.` });
    }
    if (j.transmisionPermitida && j.canalEstado === 'propuesto') {
      issues.push({
        level: 'aviso',
        joint: j.joint,
        mensaje: `${jointLabel(j.joint)}: transmisión permitida en un canal sólo propuesto. Confirma el cableado antes de usarlo.`,
      });
    }
    const calibrated = j.calibracion.estado === 'calibrado';
    checkBand(issues, j.joint, 'limites', j.minUs, j.refUs, j.maxUs, calibrated);
    if (j.exploracion) checkBand(issues, j.joint, 'exploracion', j.exploracion.minUs, j.exploracion.refUs, j.exploracion.maxUs, true);
    if (calibrated && !j.calibracion.fecha) {
      issues.push({ level: 'error', joint: j.joint, campo: 'calibracion', mensaje: `${jointLabel(j.joint)}: calibrado sin fecha.` });
    }
    if (calibrated && j.canal === null) {
      issues.push({ level: 'error', joint: j.joint, campo: 'calibracion', mensaje: `${jointLabel(j.joint)}: calibrado sin canal.` });
    }
    if (!(j.visual.usPorGrado > 0)) {
      issues.push({ level: 'error', joint: j.joint, campo: 'visual', mensaje: `${jointLabel(j.joint)}: µs por grado debe ser > 0.` });
    }
  }
  for (const id of ALL_JOINTS) {
    if (!ids.has(id)) issues.push({ level: 'error', joint: id, mensaje: `Falta la articulación ${id}.` });
  }
  return issues;
}

export function hasErrors(issues: ProfileIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

export class ProfileImportError extends Error {
  constructor(
    message: string,
    public issues: ProfileIssue[] = [],
  ) {
    super(message);
  }
}

function numOrNull(v: unknown, path: string): number | null {
  if (v === null || v === undefined) return null;
  if (!isInt(v)) throw new ProfileImportError(`${path}: se esperaba entero o null.`);
  return v;
}

function parseBand(v: unknown, path: string): UsBand | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') throw new ProfileImportError(`${path}: se esperaba objeto o null.`);
  const o = v as Record<string, unknown>;
  const minUs = numOrNull(o.minUs, `${path}.minUs`);
  const refUs = numOrNull(o.refUs, `${path}.refUs`);
  const maxUs = numOrNull(o.maxUs, `${path}.maxUs`);
  if (minUs === null || refUs === null || maxUs === null) throw new ProfileImportError(`${path}: banda incompleta.`);
  return { minUs, refUs, maxUs };
}

/**
 * Importa un perfil desde texto JSON. Rechaza con mensajes claros si el
 * formato, la versión o la coherencia de canales/límites no son válidos.
 */
export function parseProfileJson(text: string): { profile: DogBotProfile; issues: ProfileIssue[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ProfileImportError('El archivo no es JSON válido: ' + (e as Error).message);
  }
  if (!raw || typeof raw !== 'object') throw new ProfileImportError('El perfil debe ser un objeto JSON.');
  const o = raw as Record<string, unknown>;
  if (o.schema !== PROFILE_SCHEMA) throw new ProfileImportError(`Esquema desconocido: se esperaba "${PROFILE_SCHEMA}".`);
  if (o.version !== PROFILE_VERSION) throw new ProfileImportError(`Versión de perfil no soportada: ${String(o.version)} (soportada: ${PROFILE_VERSION}).`);
  if (!Array.isArray(o.joints)) throw new ProfileImportError('Falta la lista "joints".');
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const joints: JointConfig[] = o.joints.map((rj: unknown, i: number) => {
    const p = `joints[${i}]`;
    if (!rj || typeof rj !== 'object') throw new ProfileImportError(`${p}: se esperaba objeto.`);
    const j = rj as Record<string, unknown>;
    if (!isJointId(j.joint)) throw new ProfileImportError(`${p}.joint: articulación desconocida "${String(j.joint)}".`);
    const canal = numOrNull(j.canal, `${p}.canal`);
    const est = j.canalEstado;
    if (est !== 'probado' && est !== 'propuesto' && est !== 'sin-asignar') throw new ProfileImportError(`${p}.canalEstado inválido.`);
    const cal = (j.calibracion ?? {}) as Record<string, unknown>;
    const calEst = cal.estado ?? 'sin-calibrar';
    if (calEst !== 'sin-calibrar' && calEst !== 'en-progreso' && calEst !== 'calibrado') throw new ProfileImportError(`${p}.calibracion.estado inválido.`);
    const vis = (j.visual ?? {}) as Record<string, unknown>;
    const signo = vis.signo === -1 ? -1 : vis.signo === 1 ? 1 : null;
    if (signo === null) throw new ProfileImportError(`${p}.visual.signo debe ser 1 o -1.`);
    const usPorGrado = typeof vis.usPorGrado === 'number' ? vis.usPorGrado : NOMINAL_US_PER_DEG;
    const offsetGrados = typeof vis.offsetGrados === 'number' ? vis.offsetGrados : 0;
    const historico = Array.isArray(j.historico)
      ? j.historico.map((h: unknown, k: number) => {
          const ho = (h ?? {}) as Record<string, unknown>;
          const minUs = numOrNull(ho.minUs, `${p}.historico[${k}].minUs`);
          const maxUs = numOrNull(ho.maxUs, `${p}.historico[${k}].maxUs`);
          if (minUs === null || maxUs === null) throw new ProfileImportError(`${p}.historico[${k}] incompleto.`);
          return { minUs, maxUs, fuente: str(ho.fuente) };
        })
      : [];
    return {
      joint: j.joint,
      canal,
      canalEstado: est,
      transmisionPermitida: j.transmisionPermitida === true,
      efectoPulsoMas: typeof j.efectoPulsoMas === 'string' ? j.efectoPulsoMas : null,
      efectoConfirmado: j.efectoConfirmado === true,
      minUs: numOrNull(j.minUs, `${p}.minUs`),
      refUs: numOrNull(j.refUs, `${p}.refUs`),
      maxUs: numOrNull(j.maxUs, `${p}.maxUs`),
      exploracion: parseBand(j.exploracion, `${p}.exploracion`),
      calibracion: {
        estado: calEst,
        fecha: typeof cal.fecha === 'string' ? cal.fecha : null,
        origen: typeof cal.origen === 'string' ? cal.origen : null,
        notas: str(cal.notas),
      },
      visual: { signo, usPorGrado, offsetGrados, fuenteSigno: str(vis.fuenteSigno, 'Importado') },
      historico,
    } satisfies JointConfig;
  });
  const profile: DogBotProfile = {
    schema: PROFILE_SCHEMA,
    version: PROFILE_VERSION,
    id: str(o.id, 'importado'),
    nombre: str(o.nombre, 'Perfil importado'),
    robot: str(o.robot, 'Dog Bot'),
    creado: str(o.creado, new Date().toISOString()),
    modificado: str(o.modificado, new Date().toISOString()),
    notas: str(o.notas),
    joints,
  };
  const issues = validateProfile(profile);
  if (hasErrors(issues)) {
    throw new ProfileImportError('El perfil contiene errores y no se importó.', issues);
  }
  // Orden canónico.
  profile.joints.sort((a, b) => ALL_JOINTS.indexOf(a.joint) - ALL_JOINTS.indexOf(b.joint));
  return { profile, issues };
}

export function serializeProfile(p: DogBotProfile): string {
  return JSON.stringify(p, null, 2) + '\n';
}

export function getJoint(p: DogBotProfile, id: JointId): JointConfig {
  const j = p.joints.find((x) => x.joint === id);
  if (!j) throw new Error('Articulación no encontrada en el perfil: ' + id);
  return j;
}

export function isCalibrated(j: JointConfig): boolean {
  return (
    j.calibracion.estado === 'calibrado' &&
    j.minUs !== null &&
    j.refUs !== null &&
    j.maxUs !== null &&
    j.minUs < j.refUs &&
    j.refUs < j.maxUs
  );
}

export type TxMode = 'calibracion' | 'coordinado';

export interface Eligibility {
  ok: boolean;
  motivo: string;
  band: UsBand | null;
}

/**
 * ¿Puede esta articulación recibir órdenes físicas en el modo dado?
 * - calibración: canal asignado, transmisión permitida, banda de exploración
 *   explícita (o límites calibrados).
 * - coordinado: además, calibración completa.
 */
export function jointEligibility(p: DogBotProfile, id: JointId, mode: TxMode): Eligibility {
  const issues = validateProfile(p);
  const jointErrors = issues.filter((i) => i.level === 'error' && (i.joint === id || i.joint === undefined));
  const j = getJoint(p, id);
  const no = (motivo: string): Eligibility => ({ ok: false, motivo, band: null });
  if (jointErrors.length) return no('Perfil con errores: ' + jointErrors[0].mensaje);
  if (j.canal === null || j.canalEstado === 'sin-asignar') return no('Sin canal físico asignado.');
  if (!j.transmisionPermitida) return no('Transmisión no permitida en el perfil para este canal.');
  if (mode === 'coordinado') {
    if (!isCalibrated(j)) return no('Canal sin calibrar: ejecución coordinada bloqueada.');
    return { ok: true, motivo: 'Calibrado', band: { minUs: j.minUs!, refUs: j.refUs!, maxUs: j.maxUs! } };
  }
  if (isCalibrated(j)) return { ok: true, motivo: 'Límites calibrados', band: { minUs: j.minUs!, refUs: j.refUs!, maxUs: j.maxUs! } };
  if (j.exploracion) return { ok: true, motivo: 'Banda de exploración del operador', band: j.exploracion };
  return no('Define una banda de exploración antes de calibrar este canal.');
}

export function coordinatedReady(p: DogBotProfile, ids: readonly JointId[]): { ok: boolean; faltan: { joint: JointId; motivo: string }[] } {
  const faltan = ids
    .map((id) => ({ joint: id, e: jointEligibility(p, id, 'coordinado') }))
    .filter((x) => !x.e.ok)
    .map((x) => ({ joint: x.joint, motivo: x.e.motivo }));
  return { ok: faltan.length === 0, faltan };
}

/** Referencia de pulso usada para dibujar (calibrada, de exploración o 1500). */
export function visualRefUs(j: JointConfig): number {
  return j.refUs ?? j.exploracion?.refUs ?? PULSE_SIGNAL_CENTER;
}

/** Rango que muestran los sliders en simulación. */
export function sliderRange(j: JointConfig): { min: number; max: number; fuente: string } {
  if (isCalibrated(j)) return { min: j.minUs!, max: j.maxUs!, fuente: 'calibrado' };
  if (j.exploracion) return { min: j.exploracion.minUs, max: j.exploracion.maxUs, fuente: 'exploración' };
  return { min: PULSE_ABS_MIN, max: PULSE_ABS_MAX, fuente: 'banda eléctrica (sólo simulación)' };
}

/** Ángulo ESTIMADO para el dibujo (grados en convención anatómica del modelo). */
export function estimatedAngleDeg(j: JointConfig, us: number): number {
  return j.visual.offsetGrados + (j.visual.signo * (us - visualRefUs(j))) / j.visual.usPorGrado;
}

export function legOf(j: JointConfig) {
  return jointLeg(j.joint);
}
