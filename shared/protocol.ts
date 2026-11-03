// Protocolo DOGBOT v1 (PC <-> firmware DogBotDashboard.ino).
// Líneas ASCII terminadas en '\n'. Ver docs/PROTOCOLO.md.

export const PROTOCOL_DEVICE = 'DOGBOT';
export const PROTOCOL_VERSION = 1;
export const FIRMWARE_BAUD = 115200;
/** Máximo de caracteres por orden hacia el firmware (sin '\n'). */
export const MAX_REQUEST_LEN = 63;
/** Máximo aceptado por la PC para líneas recibidas. */
export const MAX_RESPONSE_LEN = 240;
export const MAX_MOVE_PAIRS = 5; // garantiza líneas <= 63 caracteres
export const MAX_MOVE_MS = 20000;
export const CAL_MAX_STEP_US = 50;

export type Command =
  | 'HELLO'
  | 'STATUS'
  | 'LIMIT'
  | 'ARM'
  | 'DISARM'
  | 'ENABLE'
  | 'MOVE'
  | 'STOP'
  | 'OFF'
  | 'MODE'
  | 'LINK'
  | 'HB'
  | 'RATE'
  | 'SLEW'
  | 'PULSES';

export const ERROR_TEXT: Record<string, string> = {
  SYNTAX: 'Sintaxis inválida',
  UNKNOWN: 'Comando desconocido',
  ARGS: 'Argumentos inválidos',
  CHANNEL: 'Canal inválido (0–11)',
  NOLIMIT: 'Canal sin límites configurados',
  RANGE: 'Pulso fuera de límites',
  ORDER: 'Límites no cumplen mínimo < referencia < máximo',
  STATE: 'Estado no permite la orden',
  DISABLED: 'Canal no habilitado',
  CALSTEP: 'Paso no permitido en modo calibración',
  OVERFLOW: 'Línea demasiado larga',
};

export interface Request {
  id: number;
  cmd: Command;
  args: (string | number)[];
}

export class ProtocolEncodeError extends Error {}

const TOKEN_RE = /^[A-Za-z0-9]+$/;

export function encodeRequest(req: Request): string {
  if (!Number.isInteger(req.id) || req.id < 1 || req.id > 65535) throw new ProtocolEncodeError('id fuera de 1–65535');
  const parts = [String(req.id), req.cmd];
  for (const a of req.args) {
    const s = String(a);
    if (!TOKEN_RE.test(s)) throw new ProtocolEncodeError(`argumento inválido: "${s}"`);
    parts.push(s);
  }
  const line = parts.join(' ');
  if (line.length > MAX_REQUEST_LEN) throw new ProtocolEncodeError(`orden de ${line.length} caracteres (> ${MAX_REQUEST_LEN})`);
  return line;
}

export type FwMessage =
  | { kind: 'boot'; proto: number | null; fw: string | null; boot: string | null; raw: string }
  | { kind: 'ok'; id: number; cmd: string; fields: Record<string, string>; raw: string }
  | { kind: 'err'; id: number; code: string; detail: string; raw: string }
  | { kind: 'event'; name: string; fields: Record<string, string>; raw: string }
  | { kind: 'pulses'; fwMillis: number; pulses: Record<number, number>; raw: string }
  | { kind: 'text'; raw: string }
  | { kind: 'invalid'; reason: string; raw: string };

function parseFields(tokens: string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const t of tokens) {
    const eq = t.indexOf('=');
    if (eq <= 0) return null;
    out[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return out;
}

const UINT_RE = /^\d{1,10}$/;

/**
 * Interpreta una línea recibida. Las líneas que no siguen el protocolo se
 * devuelven como 'text' (p. ej. sketches históricos) o 'invalid' si llegan
 * datos corruptos que parecen del protocolo.
 */
export function parseFirmwareLine(rawIn: string): FwMessage {
  const raw = rawIn.replace(/\r$/, '');
  if (raw.length > MAX_RESPONSE_LEN) return { kind: 'invalid', reason: 'línea demasiado larga', raw: raw.slice(0, 80) + '…' };
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7E]/.test(raw)) return { kind: 'invalid', reason: 'caracteres no imprimibles (datos corruptos o baudios distintos)', raw };
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: 'text', raw };
  const head = tokens[0];
  switch (head) {
    case 'BOOT': {
      if (tokens[1] !== 'DOGBOT') return { kind: 'text', raw };
      const f = parseFields(tokens.slice(2));
      if (!f) return { kind: 'invalid', reason: 'BOOT mal formado', raw };
      const proto = f.proto && UINT_RE.test(f.proto) ? Number(f.proto) : null;
      return { kind: 'boot', proto, fw: f.fw ?? null, boot: f.boot ?? null, raw };
    }
    case 'OK': {
      if (tokens.length < 3 || !UINT_RE.test(tokens[1])) return { kind: 'invalid', reason: 'OK mal formado', raw };
      const f = parseFields(tokens.slice(3));
      if (!f) return { kind: 'invalid', reason: 'campos OK mal formados', raw };
      return { kind: 'ok', id: Number(tokens[1]), cmd: tokens[2], fields: f, raw };
    }
    case 'ER': {
      if (tokens.length < 3 || !UINT_RE.test(tokens[1])) return { kind: 'invalid', reason: 'ER mal formado', raw };
      return { kind: 'err', id: Number(tokens[1]), code: tokens[2], detail: tokens.slice(3).join(' '), raw };
    }
    case 'EV': {
      if (tokens.length < 2) return { kind: 'invalid', reason: 'EV mal formado', raw };
      const f = parseFields(tokens.slice(2));
      if (!f) return { kind: 'invalid', reason: 'campos EV mal formados', raw };
      return { kind: 'event', name: tokens[1], fields: f, raw };
    }
    case 'PW': {
      if (tokens.length < 2 || !UINT_RE.test(tokens[1])) return { kind: 'invalid', reason: 'PW mal formado', raw };
      const pulses: Record<number, number> = {};
      for (const t of tokens.slice(2)) {
        const m = /^(\d{1,2}):(\d{1,4})$/.exec(t);
        if (!m) return { kind: 'invalid', reason: 'PW: par canal:µs inválido', raw };
        const c = Number(m[1]);
        const us = Number(m[2]);
        if (c > 15 || us > 4095) return { kind: 'invalid', reason: 'PW: valor fuera de rango', raw };
        pulses[c] = us;
      }
      return { kind: 'pulses', fwMillis: Number(tokens[1]), pulses, raw };
    }
    default:
      return { kind: 'text', raw };
  }
}

export function describeError(code: string, detail: string): string {
  return `${ERROR_TEXT[code] ?? code}${detail ? ' — ' + detail : ''}`;
}

/** Divide órdenes MOVE en líneas que respetan el límite de longitud. */
export function buildMoveRequests(
  nextId: () => number,
  ms: number,
  targets: { ch: number; us: number }[],
): Request[] {
  const out: Request[] = [];
  const dur = Math.max(0, Math.min(MAX_MOVE_MS, Math.round(ms)));
  for (let i = 0; i < targets.length; i += MAX_MOVE_PAIRS) {
    const chunk = targets.slice(i, i + MAX_MOVE_PAIRS);
    const args: number[] = [dur];
    for (const t of chunk) args.push(t.ch, Math.round(t.us));
    out.push({ id: nextId(), cmd: 'MOVE', args });
  }
  return out;
}
