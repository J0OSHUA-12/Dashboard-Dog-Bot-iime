// Estado de la aplicación (zustand). Separa: modo, perfil, consignas simuladas,
// consignas reales (solicitada / confirmada / escrita), enlace, eventos y UI.
import { create } from 'zustand';
import { ALL_JOINTS, JointId } from '../../shared/joints';
import {
  DogBotProfile,
  JointConfig,
  ProfileIssue,
  createInitialProfile,
  getJoint,
  parseProfileJson,
  sliderRange,
  touch,
  validateProfile,
  visualRefUs,
} from '../../shared/profile';
import { SavedPose } from '../../shared/sequences';
import { FirmwareInfo, LinkState } from '../../shared/protocolClient';
import { PortInfo, SerialStatus } from '../../shared/serviceApi';
import { HistoricMeasurement } from '../../shared/telemetry';
import { DEFAULT_MODEL_PARAMS, ModelParams, sanitizeModelParams } from '../three/modelParams';
import { load, save } from './persist';

export type Mode = 'sim' | 'real';
export type EventLevel = 'info' | 'ok' | 'aviso' | 'error';
export type EventSource = 'simulación' | 'robot' | 'servicio' | 'interfaz' | 'compilación' | 'perfil';

export interface EventEntry {
  id: number;
  at: number;
  level: EventLevel;
  source: EventSource;
  mode: Mode;
  text: string;
}

export interface SerialEntry {
  id: number;
  at: number;
  dir: 'rx' | 'tx' | 'info';
  text: string;
}

export interface JointRt {
  /** Consigna en simulación (µs). */
  simUs: number;
  /** ROBOT REAL: consigna solicitada desde la interfaz. */
  reqUs: number | null;
  /** ROBOT REAL: última consigna confirmada por el firmware (OK), no medición. */
  confUs: number | null;
  confAt: number | null;
  /** ROBOT REAL: consigna PWM escrita reportada por el firmware (PW). */
  pwUs: number | null;
  pwAt: number | null;
}

export interface TestRecord {
  id: string;
  fecha: string;
  modo: Mode;
  montaje: string;
  carga: string;
  alimentacion: string;
  sketch: string;
  perfil: string;
  medicion: string;
  instrumento: string;
  resultado: 'correcto' | 'parcial' | 'fallo' | 'sin evaluar';
  notas: string;
}

export type ManualMeasurement = HistoricMeasurement;

export type LeftTab = 'articulaciones' | 'calibracion' | 'poses' | 'perfil';
export type BottomTab = 'telemetria' | 'eventos' | 'serie' | 'ensayos' | 'mediciones';
export type MobileTab = '3d' | 'controles' | 'editor' | 'datos';

export interface UiState {
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  leftW: number;
  rightW: number;
  bottomH: number;
  leftTab: LeftTab;
  bottomTab: BottomTab;
  mobileTab: MobileTab;
  showCover: boolean;
  showGrid: boolean;
  showAxes: boolean;
  showLabels: boolean;
  showGhost: boolean;
  stepUs: number;
  theme: Theme;
}

export type Theme = 'dark' | 'light';

export interface LinkUi {
  serviceAvailable: boolean;
  serviceChecked: boolean;
  serviceVersion: string | null;
  controller: boolean;
  ports: PortInfo[];
  port: string;
  baud: number;
  serial: SerialStatus;
  state: LinkState;
  firmware: FirmwareInfo | null;
  enabled: number[];
  rttMs: number | null;
  rttAt: number | null;
  lastRxAt: number | null;
  fwMode: 'RUN' | 'CAL';
  linkMs: number;
  linkPolicy: 'HOLD' | 'OFF';
}

export interface SeqUi {
  id: string | null;
  playing: boolean;
  amplitude: number;
  startedAt: number | null;
  phase: 'transicion' | 'secuencia' | null;
}

const initialProfile = (() => {
  const stored = load<string | null>('profile', null);
  if (stored) {
    try {
      return parseProfileJson(stored).profile;
    } catch {
      /* perfil guardado inválido: se usa el inicial */
    }
  }
  return createInitialProfile();
})();

function initialJoints(p: DogBotProfile): Record<JointId, JointRt> {
  const out = {} as Record<JointId, JointRt>;
  for (const id of ALL_JOINTS) {
    out[id] = { simUs: visualRefUs(getJoint(p, id)), reqUs: null, confUs: null, confAt: null, pwUs: null, pwAt: null };
  }
  return out;
}

const DEFAULT_UI: UiState = {
  leftOpen: true,
  rightOpen: true,
  bottomOpen: true,
  leftW: 300,
  rightW: 400,
  bottomH: 262,
  leftTab: 'articulaciones',
  bottomTab: 'telemetria',
  mobileTab: '3d',
  showCover: false,
  showGrid: true,
  showAxes: false,
  showLabels: true,
  showGhost: true,
  stepUs: 10,
  theme: 'dark',
};

let evId = 1;
let serialId = 1;

export interface AppState {
  mode: Mode;
  profile: DogBotProfile;
  issues: ProfileIssue[];
  selected: JointId;
  hovered: JointId | null;
  joints: Record<JointId, JointRt>;
  link: LinkUi;
  seq: SeqUi;
  events: EventEntry[];
  serial: SerialEntry[];
  poses: SavedPose[];
  tests: TestRecord[];
  measurements: ManualMeasurement[];
  ui: UiState;
  modelParams: ModelParams;
  calibrationActive: boolean;
  /** El operador cerró el programa: la interfaz muestra la pantalla final. */
  closed: boolean;

  setClosed: (closed: boolean) => void;
  setMode: (m: Mode) => void;
  select: (j: JointId) => void;
  hover: (j: JointId | null) => void;
  setSimUs: (j: JointId, us: number) => void;
  setSimPose: (pose: Partial<Record<JointId, number>>) => void;
  patchJointRt: (j: JointId, patch: Partial<JointRt>) => void;
  setProfile: (p: DogBotProfile, why: string) => void;
  updateJointConfig: (j: JointId, patch: Partial<JointConfig>) => void;
  addEvent: (level: EventLevel, source: EventSource, text: string) => void;
  addSerial: (dir: SerialEntry['dir'], text: string) => void;
  clearSerial: () => void;
  setLink: (patch: Partial<LinkUi>) => void;
  setSeq: (patch: Partial<SeqUi>) => void;
  setUi: (patch: Partial<UiState>) => void;
  setModelParams: (p: Partial<ModelParams>) => void;
  savePose: (pose: SavedPose) => void;
  deletePose: (id: string) => void;
  addTest: (t: TestRecord) => void;
  deleteTest: (id: string) => void;
  addMeasurement: (m: ManualMeasurement) => void;
  deleteMeasurement: (id: string) => void;
  setCalibrationActive: (v: boolean) => void;
}

export const useApp = create<AppState>((set, get) => ({
  mode: 'sim',
  profile: initialProfile,
  issues: validateProfile(initialProfile),
  selected: load<JointId>('selected', 'D1-inferior'),
  hovered: null,
  joints: initialJoints(initialProfile),
  link: {
    serviceAvailable: false,
    serviceChecked: false,
    serviceVersion: null,
    controller: false,
    ports: [],
    port: load<string>('port', ''),
    baud: 115200,
    serial: { state: 'cerrado', path: null, baud: null, error: null, diagnostic: null },
    state: 'desconectado',
    firmware: null,
    enabled: [],
    rttMs: null,
    rttAt: null,
    lastRxAt: null,
    fwMode: 'RUN',
    linkMs: 1500,
    linkPolicy: 'HOLD',
  },
  seq: { id: null, playing: false, amplitude: 1, startedAt: null, phase: null },
  events: [],
  serial: [],
  poses: load<SavedPose[]>('poses', []),
  tests: load<TestRecord[]>('tests', []),
  measurements: load<ManualMeasurement[]>('measurements', []),
  ui: { ...DEFAULT_UI, ...load<Partial<UiState>>('ui', {}) },
  modelParams: sanitizeModelParams(load<Partial<ModelParams>>('model', DEFAULT_MODEL_PARAMS)),
  calibrationActive: false,
  closed: false,

  setClosed: (closed) => set({ closed }),

  setMode: (m) => {
    if (m === get().mode) return;
    set({ mode: m, seq: { ...get().seq, playing: false, id: null, phase: null, startedAt: null } });
    get().addEvent('info', 'interfaz', m === 'sim' ? 'Modo SIMULACIÓN: no se envían órdenes al hardware.' : 'Modo ROBOT REAL: la pose simulada NO se transfiere al robot.');
  },
  select: (j) => {
    set({ selected: j });
    save('selected', j);
  },
  hover: (j) => set({ hovered: j }),
  setSimUs: (j, us) => {
    const cfg = getJoint(get().profile, j);
    const r = sliderRange(cfg);
    const v = Math.round(Math.min(r.max, Math.max(r.min, us)));
    set({ joints: { ...get().joints, [j]: { ...get().joints[j], simUs: v } } });
  },
  setSimPose: (pose) => {
    const joints = { ...get().joints };
    for (const [j, us] of Object.entries(pose) as [JointId, number][]) {
      const r = sliderRange(getJoint(get().profile, j));
      joints[j] = { ...joints[j], simUs: Math.round(Math.min(r.max, Math.max(r.min, us))) };
    }
    set({ joints });
  },
  patchJointRt: (j, patch) => set({ joints: { ...get().joints, [j]: { ...get().joints[j], ...patch } } }),
  setProfile: (p, why) => {
    const issues = validateProfile(p);
    set({ profile: p, issues });
    save('profile', JSON.stringify(p));
    get().addEvent(issues.some((i) => i.level === 'error') ? 'aviso' : 'info', 'perfil', why);
  },
  updateJointConfig: (j, patch) => {
    const p = get().profile;
    const next = touch({ ...p, joints: p.joints.map((x) => (x.joint === j ? { ...x, ...patch } : x)) });
    const issues = validateProfile(next);
    set({ profile: next, issues });
    save('profile', JSON.stringify(next));
  },
  addEvent: (level, source, text) => {
    const e: EventEntry = { id: evId++, at: Date.now(), level, source, mode: get().mode, text };
    const events = get().events.length >= 600 ? [...get().events.slice(-500), e] : [...get().events, e];
    set({ events });
  },
  addSerial: (dir, text) => {
    const e: SerialEntry = { id: serialId++, at: Date.now(), dir, text };
    const serial = get().serial.length >= 1500 ? [...get().serial.slice(-1200), e] : [...get().serial, e];
    set({ serial });
  },
  clearSerial: () => set({ serial: [] }),
  setLink: (patch) => {
    set({ link: { ...get().link, ...patch } });
    if (patch.port !== undefined) save('port', patch.port);
  },
  setSeq: (patch) => set({ seq: { ...get().seq, ...patch } }),
  setUi: (patch) => {
    const ui = { ...get().ui, ...patch };
    set({ ui });
    save('ui', ui);
  },
  setModelParams: (p) => {
    const mp = sanitizeModelParams({ ...get().modelParams, ...p });
    set({ modelParams: mp });
    save('model', mp);
  },
  savePose: (pose) => {
    const poses = [...get().poses.filter((x) => x.id !== pose.id), pose];
    set({ poses });
    save('poses', poses);
  },
  deletePose: (id) => {
    const poses = get().poses.filter((x) => x.id !== id);
    set({ poses });
    save('poses', poses);
  },
  addTest: (t) => {
    const tests = [t, ...get().tests];
    set({ tests });
    save('tests', tests);
  },
  deleteTest: (id) => {
    const tests = get().tests.filter((t) => t.id !== id);
    set({ tests });
    save('tests', tests);
  },
  addMeasurement: (m) => {
    const measurements = [m, ...get().measurements];
    set({ measurements });
    save('measurements', measurements);
  },
  deleteMeasurement: (id) => {
    const measurements = get().measurements.filter((t) => t.id !== id);
    set({ measurements });
    save('measurements', measurements);
  },
  setCalibrationActive: (v) => set({ calibrationActive: v }),
}));

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Pose que se dibuja para una articulación en ROBOT REAL (escrita > confirmada > desconocida). */
export function realDisplayUs(rt: JointRt): { us: number | null; fuente: 'pw' | 'ok' | 'ninguna' } {
  if (rt.pwUs !== null) return { us: rt.pwUs, fuente: 'pw' };
  if (rt.confUs !== null) return { us: rt.confUs, fuente: 'ok' };
  return { us: null, fuente: 'ninguna' };
}
