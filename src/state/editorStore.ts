// Documentos del editor y su relación con compilaciones (instantáneas).
import { create } from 'zustand';
import { BuildRecord, JobInfo, SketchSource } from '../../shared/serviceApi';
import { DEFAULT_FQBN, boardByFqbn } from '../../shared/boards';
import { load, save } from './persist';

export type DocSource = SketchSource | 'local' | 'nuevo';

export interface EditorDoc {
  id: string;
  name: string; // nombre de sketch (carpeta = nombre)
  source: DocSource;
  readOnly: boolean;
  content: string;
  saved: string;
  ficha: string | null;
  /** hash de (nombre, placa, contenido) del estado actual */
  hash: string | null;
}

export interface DocBuild {
  build: BuildRecord;
  jobId: string;
}

export interface ConsoleLine {
  id: number;
  stream: 'stdout' | 'stderr' | 'info';
  text: string;
}

interface EditorState {
  docs: EditorDoc[];
  activeId: string | null;
  builds: Record<string, DocBuild>;
  fqbn: string;
  console: ConsoleLine[];
  job: JobInfo | null;
  open: (d: EditorDoc) => void;
  close: (id: string) => void;
  activate: (id: string) => void;
  patch: (id: string, p: Partial<EditorDoc>) => void;
  setBuild: (docId: string, b: DocBuild | null) => void;
  log: (stream: ConsoleLine['stream'], text: string) => void;
  clearConsole: () => void;
  setJob: (j: JobInfo | null) => void;
  setFqbn: (f: string) => void;
}

let lineId = 1;
const stored = load<{ docs: EditorDoc[]; activeId: string | null } | null>('editor', null);
// Placa elegida (UNO o ESP32): se recuerda entre sesiones; si no es del catálogo, UNO.
const storedBoard = load<string | null>('board', null);

function persist(docs: EditorDoc[], activeId: string | null) {
  // Guarda borradores (para no perder cambios al recargar). Límite prudente.
  const slim = docs.map((d) => ({ ...d, hash: null }));
  if (JSON.stringify(slim).length < 3_000_000) save('editor', { docs: slim, activeId });
}

export const useEditor = create<EditorState>((set, get) => ({
  docs: stored?.docs ?? [],
  activeId: stored?.activeId ?? null,
  builds: {},
  fqbn: storedBoard && boardByFqbn(storedBoard) ? storedBoard : DEFAULT_FQBN,
  console: [],
  job: null,
  open: (d) => {
    const existing = get().docs.find((x) => x.source === d.source && x.name === d.name && d.source !== 'nuevo' && d.source !== 'local');
    if (existing) {
      set({ activeId: existing.id });
      persist(get().docs, existing.id);
      return;
    }
    const docs = [...get().docs, d];
    set({ docs, activeId: d.id });
    persist(docs, d.id);
  },
  close: (id) => {
    const docs = get().docs.filter((d) => d.id !== id);
    const activeId = get().activeId === id ? (docs[docs.length - 1]?.id ?? null) : get().activeId;
    const builds = { ...get().builds };
    delete builds[id];
    set({ docs, activeId, builds });
    persist(docs, activeId);
  },
  activate: (id) => {
    set({ activeId: id });
    persist(get().docs, id);
  },
  patch: (id, p) => {
    const docs = get().docs.map((d) => (d.id === id ? { ...d, ...p } : d));
    set({ docs });
    if (p.content !== undefined || p.saved !== undefined || p.name !== undefined || p.source !== undefined) persist(docs, get().activeId);
  },
  setBuild: (docId, b) => {
    const builds = { ...get().builds };
    if (b) builds[docId] = b;
    else delete builds[docId];
    set({ builds });
  },
  log: (stream, text) => {
    const c = get().console;
    const next = c.length > 1500 ? c.slice(-1200) : c.slice();
    next.push({ id: lineId++, stream, text });
    set({ console: next });
  },
  clearConsole: () => set({ console: [] }),
  setJob: (j) => set({ job: j }),
  setFqbn: (f) => {
    if (!boardByFqbn(f)) return;
    save('board', f);
    set({ fqbn: f });
  },
}));
