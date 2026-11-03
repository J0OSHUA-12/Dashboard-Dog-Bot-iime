// Integración con Arduino CLI: detección, compilación y carga.
// Todas las invocaciones usan argumentos estructurados (sin shell).

import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_CORE, REQUIRED_LIB, ToolsStatus } from '../../shared/serviceApi';
import { CommandRunner } from './runner';

export const ALLOWED_FQBN = ['arduino:avr:uno', 'arduino:avr:nano', 'arduino:avr:mega:cpu=atmega2560'];

/** Rutas candidatas del ejecutable (Arduino IDE 2 incluye arduino-cli). */
export function cliCandidates(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string[] {
  const list: string[] = [];
  if (env.DOGBOT_ARDUINO_CLI) list.push(env.DOGBOT_ARDUINO_CLI);
  if (platform === 'win32') {
    const ideRel = ['resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe'];
    if (env.LOCALAPPDATA) list.push(path.join(env.LOCALAPPDATA, 'Programs', 'Arduino IDE', ...ideRel));
    if (env.ProgramFiles) list.push(path.join(env.ProgramFiles, 'Arduino IDE', ...ideRel));
    if (env.LOCALAPPDATA) list.push(path.join(env.LOCALAPPDATA, 'Programs', 'arduino-cli', 'arduino-cli.exe'));
  }
  list.push('arduino-cli');
  return list;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseVersion(json: unknown): string | null {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const v = o.VersionString ?? o.version_string ?? o.version;
    if (typeof v === 'string') return v;
  }
  return null;
}

/** Soporta formato 1.x ({platforms:[...]}) y 0.x ([...]). */
export function parseCoreVersion(json: unknown, coreId = REQUIRED_CORE): string | null {
  const arr = Array.isArray(json) ? json : (json as { platforms?: unknown[] } | null)?.platforms;
  if (!Array.isArray(arr)) return null;
  for (const p of arr) {
    const o = p as Record<string, unknown>;
    if (o.id === coreId) {
      const v = o.installed_version ?? o.installed ?? (o.release as Record<string, unknown> | undefined)?.version;
      return typeof v === 'string' ? v : 'instalado';
    }
  }
  return null;
}

export function parseLibVersion(json: unknown, libName = REQUIRED_LIB): string | null {
  const arr = Array.isArray(json) ? json : (json as { installed_libraries?: unknown[] } | null)?.installed_libraries;
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    const lib = ((item as Record<string, unknown>).library ?? item) as Record<string, unknown>;
    if (typeof lib.name === 'string' && lib.name.toLowerCase() === libName.toLowerCase()) {
      return typeof lib.version === 'string' ? lib.version : 'instalada';
    }
  }
  return null;
}

export function parseBoards(json: unknown): ToolsStatus['boards'] {
  const arr = Array.isArray(json) ? json : (json as { detected_ports?: unknown[] } | null)?.detected_ports;
  if (!Array.isArray(arr)) return [];
  const out: ToolsStatus['boards'] = [];
  for (const item of arr) {
    const o = item as Record<string, unknown>;
    const port = (o.port ?? o) as Record<string, unknown>;
    const address = (port.address ?? port.label) as string | undefined;
    if (!address) continue;
    const boards = (o.matching_boards ?? o.boards ?? []) as Record<string, unknown>[];
    const b = boards[0];
    out.push({ port: address, name: (b?.name as string) ?? null, fqbn: (b?.fqbn as string) ?? null });
  }
  return out;
}

export interface SizeInfo {
  flashBytes: number | null;
  flashMax: number | null;
  ramBytes: number | null;
  ramMax: number | null;
}

export function parseSizes(text: string): SizeInfo {
  const flash = /uses\s+(\d+)\s+bytes\s+\(\d+%\)\s+of program storage space\.\s+Maximum is\s+(\d+)/i.exec(text);
  const ram = /Global variables use\s+(\d+)\s+bytes\s+\(\d+%\)\s+of dynamic memory.*?Maximum is\s+(\d+)/is.exec(text);
  return {
    flashBytes: flash ? Number(flash[1]) : null,
    flashMax: flash ? Number(flash[2]) : null,
    ramBytes: ram ? Number(ram[1]) : null,
    ramMax: ram ? Number(ram[2]) : null,
  };
}

/** Traduce errores comunes de carga a un diagnóstico útil. */
export function diagnoseUpload(text: string): string | null {
  const t = text.toLowerCase();
  if (/access is denied|acceso denegado|resource busy|device or resource busy|permission denied|can't open device/.test(t)) {
    return 'El puerto está ocupado o sin permiso. Cierra el Monitor Serie de Arduino IDE (u otra app que use el COM) y reintenta.';
  }
  if (/not in sync|stk500_getsync|programmer is not responding/.test(t)) {
    return 'Sin respuesta del bootloader: revisa placa (Arduino UNO), puerto COM y cable USB. Algunos clones requieren otro driver (CH340).';
  }
  if (/no such file|cannot find the file|port.*not found|no se puede encontrar/.test(t)) {
    return 'Puerto no encontrado: actualiza la lista de puertos y reconecta la placa.';
  }
  return null;
}

export async function detectTools(runner: CommandRunner, candidates: string[]): Promise<ToolsStatus> {
  const status: ToolsStatus = {
    checkedAt: new Date().toISOString(),
    cliPath: candidates[candidates.length - 1],
    cli: { ok: false, detail: 'Arduino CLI no encontrado', version: null },
    core: { ok: false, detail: 'No comprobado', version: null },
    lib: { ok: false, detail: 'No comprobado', version: null },
    missing: [],
    boards: [],
  };
  let exe: string | null = null;
  for (const c of candidates) {
    if (c.includes(path.sep) && !fs.existsSync(c)) continue;
    const r = await runner.run(c, ['version', '--format', 'json'], { timeoutMs: 15000 });
    if (r.code === 0) {
      exe = c;
      status.cliPath = c;
      const v = parseVersion(tryJson(r.stdout));
      status.cli = { ok: true, detail: `Arduino CLI ${v ?? '(versión desconocida)'}`, version: v };
      break;
    }
  }
  if (!exe) {
    status.missing.push('Arduino CLI (instala Arduino IDE 2 o arduino-cli y reinicia el servicio)');
    status.core.detail = 'Requiere Arduino CLI';
    status.lib.detail = 'Requiere Arduino CLI';
    return status;
  }
  const core = await runner.run(exe, ['core', 'list', '--format', 'json'], { timeoutMs: 30000 });
  const coreV = core.code === 0 ? parseCoreVersion(tryJson(core.stdout)) : null;
  status.core = coreV
    ? { ok: true, detail: `Core ${REQUIRED_CORE} ${coreV}`, version: coreV }
    : { ok: false, detail: `Falta el core ${REQUIRED_CORE} (Arduino UNO)`, version: null };
  if (!coreV) status.missing.push(`Core ${REQUIRED_CORE}`);
  const lib = await runner.run(exe, ['lib', 'list', '--format', 'json'], { timeoutMs: 30000 });
  const libV = lib.code === 0 ? parseLibVersion(tryJson(lib.stdout)) : null;
  status.lib = libV
    ? { ok: true, detail: `${REQUIRED_LIB} ${libV}`, version: libV }
    : { ok: false, detail: `Falta la biblioteca "${REQUIRED_LIB}"`, version: null };
  if (!libV) status.missing.push(`Biblioteca ${REQUIRED_LIB}`);
  const boards = await runner.run(exe, ['board', 'list', '--format', 'json'], { timeoutMs: 20000 });
  if (boards.code === 0) status.boards = parseBoards(tryJson(boards.stdout));
  return status;
}

export function compileArgs(fqbn: string, buildPath: string, outputDir: string, sketchDir: string): string[] {
  return ['compile', '--fqbn', fqbn, '--build-path', buildPath, '--output-dir', outputDir, '--warnings', 'default', sketchDir];
}

/** upload con --input-dir: sube SOLO los binarios de esa compilación, sin recompilar. */
export function uploadArgs(fqbn: string, port: string, inputDir: string, sketchDir: string): string[] {
  return ['upload', '-p', port, '--fqbn', fqbn, '--input-dir', inputDir, sketchDir];
}
