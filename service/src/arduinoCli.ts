// Integración con Arduino CLI: detección, compilación y carga.
// Todas las invocaciones usan argumentos estructurados (sin shell).

import fs from 'node:fs';
import path from 'node:path';
import { BOARDS, BoardDef, CORES, CoreDef, boardByFqbn, coreById } from '../../shared/boards';
import { REQUIRED_LIB, ToolsStatus } from '../../shared/serviceApi';
import { CommandRunner } from './runner';

/** Lista blanca de placas: solo las del catálogo compartido. */
export const ALLOWED_FQBN = BOARDS.map((b) => b.fqbn);

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
export function parseCoreVersion(json: unknown, coreId = CORES[0].id): string | null {
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
export function diagnoseUpload(text: string, board: BoardDef | null = null): string | null {
  const t = text.toLowerCase();
  if (/access is denied|acceso denegado|resource busy|device or resource busy|permission denied|can't open device|could not open port/.test(t)) {
    return 'El puerto está ocupado o sin permiso. Cierra el Monitor Serie de Arduino IDE (u otra app que use el COM) y reintenta.';
  }
  if (/not in sync|stk500_getsync|programmer is not responding/.test(t)) {
    return 'Sin respuesta del bootloader: revisa que la placa elegida sea la conectada (este binario es para una placa AVR como el Arduino UNO), el puerto COM y el cable USB. Algunos clones requieren otro driver (CH340).';
  }
  // esptool (ESP32): la placa no entró en modo de carga o no es un ESP32.
  if (/failed to connect to esp32|timed out waiting for packet header|wrong boot mode detected|no serial data received|invalid head of packet/.test(t)) {
    return 'El ESP32 no entró en modo de carga. Mantén pulsado el botón BOOT (IO0) de la placa cuando la consola muestre «Connecting…» y suéltalo cuando empiece a escribir. Revisa también que la placa elegida sea la conectada, que el cable USB sea de datos y el driver del adaptador (CP210x o CH340).';
  }
  if (/a fatal error occurred/.test(t) && board?.family === 'esp32') {
    return 'esptool no pudo completar la carga. Reintenta con el botón BOOT pulsado al empezar, acerca la placa con un cable USB corto y comprueba el puerto.';
  }
  if (/no such file|cannot find the file|port.*not found|no se puede encontrar/.test(t)) {
    return 'Puerto no encontrado: actualiza la lista de puertos y reconecta la placa.';
  }
  return null;
}

/** Errores de compilación que no son del código: falta el core o la biblioteca. */
export function diagnoseCompile(text: string, board: BoardDef | null): string | null {
  const t = text.toLowerCase();
  if (/platform not installed|platform .* not found|unknown fqbn|error resolving fqbn|invalid fqbn/.test(t)) {
    const core = board ? coreById(board.core) : null;
    return core
      ? `Falta el core ${core.id} (${core.label}). Ábrelo en «Diagnóstico Arduino CLI» → Instalar core.`
      : 'Arduino CLI no reconoce la placa seleccionada: revisa el core en «Diagnóstico Arduino CLI».';
  }
  if (/adafruit_pwmservodriver\.h: no such file/.test(t)) {
    return `Falta la biblioteca "${REQUIRED_LIB}": instálala desde «Diagnóstico Arduino CLI».`;
  }
  return null;
}

function coreMissingDetail(c: CoreDef): string {
  return `Falta el core ${c.id} (${c.usedBy})`;
}

export async function detectTools(runner: CommandRunner, candidates: string[]): Promise<ToolsStatus> {
  const status: ToolsStatus = {
    checkedAt: new Date().toISOString(),
    cliPath: candidates[candidates.length - 1],
    cli: { ok: false, detail: 'Arduino CLI no encontrado', version: null },
    cores: CORES.map((c) => ({ id: c.id, ok: false, detail: 'No comprobado', version: null })),
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
    for (const c of status.cores) c.detail = 'Requiere Arduino CLI';
    status.lib.detail = 'Requiere Arduino CLI';
    return status;
  }
  const core = await runner.run(exe, ['core', 'list', '--format', 'json'], { timeoutMs: 30000 });
  const coreJson = core.code === 0 ? tryJson(core.stdout) : null;
  status.cores = CORES.map((c) => {
    const v = parseCoreVersion(coreJson, c.id);
    // Solo hace falta el core de la placa que se use: los demás son opcionales.
    if (!v) status.missing.push(`Core ${c.id} (solo para ${c.usedBy})`);
    return v ? { id: c.id, ok: true, detail: `Core ${c.id} ${v}`, version: v } : { id: c.id, ok: false, detail: coreMissingDetail(c), version: null };
  });
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

/** Nombre del binario principal que deja `compile --output-dir` para esa placa. */
export function binaryName(sketchName: string, fqbn: string): string {
  const core = coreById(boardByFqbn(fqbn)?.core ?? '');
  return `${sketchName}.ino${core?.binExt ?? '.hex'}`;
}

/** Argumentos para instalar un core o actualizar el índice (con su URL adicional si la necesita). */
export function coreArgs(action: 'install' | 'update-index', core: CoreDef): string[] {
  const extra = core.indexUrl ? ['--additional-urls', core.indexUrl] : [];
  return action === 'install' ? ['core', 'install', core.id, ...extra] : ['core', 'update-index', ...extra];
}

export function compileArgs(fqbn: string, buildPath: string, outputDir: string, sketchDir: string): string[] {
  return ['compile', '--fqbn', fqbn, '--build-path', buildPath, '--output-dir', outputDir, '--warnings', 'default', sketchDir];
}

/** upload con --input-dir: sube SOLO los binarios de esa compilación, sin recompilar. */
export function uploadArgs(fqbn: string, port: string, inputDir: string, sketchDir: string): string[] {
  return ['upload', '-p', port, '--fqbn', fqbn, '--input-dir', inputDir, sketchDir];
}
