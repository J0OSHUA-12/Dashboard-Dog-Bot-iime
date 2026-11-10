// Contrato entre la interfaz web y el servicio local (HTTP + WebSocket).

export const SERVICE_PORT = 5178;
export const SERVICE_VERSION = '0.1.0';
export const TOKEN_HEADER = 'x-dogbot-token';
export { DEFAULT_FQBN } from './boards';
export const REQUIRED_LIB = 'Adafruit PWM Servo Driver Library';

export interface PortInfo {
  path: string;
  manufacturer: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  /** El adaptador USB parece el de una placa (Arduino, ESP32 o un USB-serie típico). */
  likelyBoard: boolean;
  /** Pista para el selector de puertos; orientativa, nunca una identificación. */
  hint: string | null;
}

export type SerialState = 'cerrado' | 'abriendo' | 'abierto' | 'error' | 'liberado-para-carga';

export interface SerialStatus {
  state: SerialState;
  path: string | null;
  baud: number | null;
  error: string | null;
  diagnostic: string | null;
}

export interface ToolCheck {
  ok: boolean;
  detail: string;
}

export interface CoreStatus extends ToolCheck {
  /** Identificador de plataforma, p. ej. arduino:avr o esp32:esp32. */
  id: string;
  version: string | null;
}

export interface ToolsStatus {
  checkedAt: string;
  cliPath: string;
  cli: ToolCheck & { version: string | null };
  /** Un elemento por core del catálogo (shared/boards.ts). Solo hace falta el de tu placa. */
  cores: CoreStatus[];
  lib: ToolCheck & { version: string | null };
  missing: string[];
  boards: { port: string; name: string | null; fqbn: string | null }[];
}

export type SketchSource = 'mis-sketches' | 'firmware' | 'originales';

export interface SketchEntry {
  source: SketchSource;
  name: string;
  readOnly: boolean;
  displayPath: string;
  ficha: string | null;
}

export type JobKind = 'compile' | 'upload' | 'install-core' | 'install-lib' | 'update-index';
export type JobState = 'en-curso' | 'ok' | 'error' | 'cancelado';

export interface BuildRecord {
  id: string;
  sketchName: string;
  fqbn: string;
  /** SHA-256 de (nombre + fqbn + contenido). */
  contentHash: string;
  createdAt: string;
  state: JobState;
  flashBytes: number | null;
  flashMax: number | null;
  ramBytes: number | null;
  ramMax: number | null;
  exitCode: number | null;
}

export interface JobInfo {
  id: string;
  kind: JobKind;
  state: JobState;
  startedAt: string;
  finishedAt: string | null;
  title: string;
  buildId: string | null;
  port: string | null;
  exitCode: number | null;
  summary: string;
}

export type ServerMsg =
  | { t: 'hello'; service: string; controller: boolean; clientId: string }
  | { t: 'control'; controller: boolean }
  | { t: 'ports'; ports: PortInfo[] }
  | { t: 'serial'; status: SerialStatus }
  | { t: 'rx'; line: string; at: number }
  | { t: 'tx'; line: string; at: number; priority: boolean }
  | { t: 'dropped'; count: number; reason: string }
  | { t: 'job'; job: JobInfo; build?: BuildRecord }
  | { t: 'job-log'; jobId: string; stream: 'stdout' | 'stderr' | 'info'; text: string }
  | { t: 'error'; message: string };

export type ClientMsg =
  | { t: 'list-ports' }
  | { t: 'open'; path: string; baud: number }
  | { t: 'close' }
  | { t: 'send'; line: string; priority: boolean }
  | { t: 'take-control' };

export const SKETCH_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/;

/** Nombre válido para carpeta/archivo de sketch (Arduino CLI exige carpeta = nombre). */
export function isValidSketchName(name: string): boolean {
  if (!SKETCH_NAME_RE.test(name)) return false;
  if (name.endsWith('.') || name.includes('..')) return false;
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  return !reserved.test(name);
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildKey(sketchName: string, fqbn: string, content: string): string {
  return `${sketchName}\u0000${fqbn}\u0000${content}`;
}
