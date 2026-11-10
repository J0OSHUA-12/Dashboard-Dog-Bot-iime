// Compilación y carga ligadas a una instantánea del código.
//
// Reglas:
//  - Cada compilación guarda una copia del código (carpeta de sketch válida),
//    la placa (FQBN) y un hash SHA-256 de todo ello.
//  - La carga exige: compilación correcta, hash igual al del documento
//    actual (si se editó, la compilación es OBSOLETA), misma placa y binario
//    presente. Se sube con --input-dir: nunca se recompila ni se sube otro.
//  - Antes de cargar se libera el COM; después se reabre si estaba abierto.
//  - El binario depende de la placa: .hex en AVR (UNO), .bin en ESP32.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { CORES, boardByFqbn, coreById, coreOfBoard } from '../../shared/boards';
import { BuildRecord, JobInfo, JobKind, REQUIRED_LIB, buildKey, isValidSketchName } from '../../shared/serviceApi';
import { ALLOWED_FQBN, binaryName, compileArgs, coreArgs, diagnoseCompile, diagnoseUpload, parseSizes, uploadArgs } from './arduinoCli';
import { CommandRunner } from './runner';
import { safeJoin } from './paths';

export interface SerialControl {
  /** Libera el puerto si está abierto; devuelve lo necesario para reabrirlo. */
  releaseForUpload(): Promise<{ path: string; baud: number } | null>;
  reopenAfterUpload(prev: { path: string; baud: number } | null): Promise<void>;
}

export class JobError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const PORT_RE = /^(COM\d{1,3}|\/dev\/(tty|cu)[A-Za-z0-9._-]{1,40})$/i;

export function hashBuild(sketchName: string, fqbn: string, content: string): string {
  return crypto.createHash('sha256').update(buildKey(sketchName, fqbn, content), 'utf8').digest('hex');
}

export interface BuildManagerOptions {
  buildsDir: string;
  runner: CommandRunner;
  cliPath: () => string;
  serial: SerialControl;
  reopenDelayMs?: number;
  compileTimeoutMs?: number;
}

type LogFn = (stream: 'stdout' | 'stderr' | 'info', text: string) => void;

export class BuildManager extends EventEmitter {
  readonly builds = new Map<string, BuildRecord & { sketchDir: string; outDir: string }>();
  readonly jobs = new Map<string, JobInfo>();
  private busy: string | null = null;

  constructor(private o: BuildManagerOptions) {
    super();
  }

  get busyJob(): JobInfo | null {
    return this.busy ? (this.jobs.get(this.busy) ?? null) : null;
  }

  private startJob(kind: JobKind, title: string, extra: Partial<JobInfo> = {}): JobInfo {
    if (this.busy) throw new JobError('Hay otra operación en curso: ' + (this.jobs.get(this.busy)?.title ?? ''), 409);
    const job: JobInfo = {
      id: crypto.randomUUID(),
      kind,
      state: 'en-curso',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      title,
      buildId: null,
      port: null,
      exitCode: null,
      summary: '',
      ...extra,
    };
    this.jobs.set(job.id, job);
    this.busy = job.id;
    this.emit('job', job);
    return job;
  }

  private finishJob(job: JobInfo, ok: boolean, summary: string, exitCode: number | null, build?: BuildRecord) {
    job.state = ok ? 'ok' : 'error';
    job.finishedAt = new Date().toISOString();
    job.summary = summary;
    job.exitCode = exitCode;
    if (this.busy === job.id) this.busy = null;
    this.emit('job', job, build);
  }

  private logger(job: JobInfo): LogFn {
    return (stream, text) => this.emit('job-log', job.id, stream, text);
  }

  /** Inicia una compilación (asíncrona). Devuelve el trabajo y el registro de compilación. */
  compile(sketchName: string, fqbn: string, content: string): { job: JobInfo; build: BuildRecord } {
    if (!isValidSketchName(sketchName)) throw new JobError('Nombre de sketch inválido. Usa letras, números, "_", "-" o "." (sin espacios).');
    if (!ALLOWED_FQBN.includes(fqbn)) throw new JobError('Placa no permitida: ' + fqbn);
    if (typeof content !== 'string' || content.length === 0) throw new JobError('El sketch está vacío.');
    if (content.length > 400_000) throw new JobError('Sketch demasiado grande.');
    const id = crypto.randomUUID();
    const base = safeJoin(this.o.buildsDir, id);
    const sketchDir = safeJoin(base, 'sketch', sketchName);
    const outDir = safeJoin(base, 'out');
    const buildPath = safeJoin(base, 'build');
    const rec: BuildRecord & { sketchDir: string; outDir: string } = {
      id,
      sketchName,
      fqbn,
      contentHash: hashBuild(sketchName, fqbn, content),
      createdAt: new Date().toISOString(),
      state: 'en-curso',
      flashBytes: null,
      flashMax: null,
      ramBytes: null,
      ramMax: null,
      exitCode: null,
      sketchDir,
      outDir,
    };
    const job = this.startJob('compile', `Compilar ${sketchName}`, { buildId: id });
    this.builds.set(id, rec);
    void this.runCompile(job, rec, content, buildPath);
    return { job, build: this.publicBuild(rec) };
  }

  publicBuild(r: BuildRecord & { sketchDir?: string; outDir?: string }): BuildRecord {
    const { sketchDir: _s, outDir: _o, ...pub } = r as BuildRecord & { sketchDir: string; outDir: string };
    return pub;
  }

  private async runCompile(job: JobInfo, rec: BuildRecord & { sketchDir: string; outDir: string }, content: string, buildPath: string) {
    const log = this.logger(job);
    try {
      fs.mkdirSync(rec.sketchDir, { recursive: true });
      fs.mkdirSync(rec.outDir, { recursive: true });
      fs.mkdirSync(buildPath, { recursive: true });
      fs.writeFileSync(path.join(rec.sketchDir, `${rec.sketchName}.ino`), content, 'utf8');
      log('info', `Instantánea guardada (sha256 ${rec.contentHash.slice(0, 12)}…). Placa ${rec.fqbn}.\n`);
      const args = compileArgs(rec.fqbn, buildPath, rec.outDir, rec.sketchDir);
      log('info', `> arduino-cli ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}\n`);
      const board = boardByFqbn(rec.fqbn);
      const heavy = coreOfBoard(rec.fqbn)?.heavy ?? false;
      if (heavy) log('info', 'La primera compilación para esta placa compila todo el core y puede tardar varios minutos.\n');
      const r = await this.o.runner.run(this.o.cliPath(), args, {
        // El core del ESP32 es grande: la primera compilación puede tardar mucho más que en AVR.
        timeoutMs: this.o.compileTimeoutMs ?? (heavy ? 1_200_000 : 300_000),
        onStdout: (t) => log('stdout', t),
        onStderr: (t) => log('stderr', t),
      });
      if (r.spawnError) {
        rec.state = 'error';
        log('stderr', `No se pudo ejecutar Arduino CLI: ${r.spawnError}\n`);
        this.finishJob(job, false, 'Arduino CLI no disponible', null, this.publicBuild(rec));
        return;
      }
      const binName = binaryName(rec.sketchName, rec.fqbn);
      const bin = path.join(rec.outDir, binName);
      const ok = r.code === 0 && !r.timedOut && fs.existsSync(bin);
      Object.assign(rec, parseSizes(r.stdout + '\n' + r.stderr));
      rec.exitCode = r.code;
      rec.state = ok ? 'ok' : 'error';
      if (r.code === 0 && !fs.existsSync(bin)) log('stderr', `Arduino CLI terminó sin error pero no se encontró el binario esperado (${binName}).\n`);
      let summary = ok
        ? `Compilación correcta${rec.flashBytes !== null ? ` · flash ${rec.flashBytes}/${rec.flashMax} B · RAM global ${rec.ramBytes}/${rec.ramMax} B` : ''}`
        : r.timedOut
          ? 'Compilación cancelada por tiempo excedido'
          : `Error de compilación (código ${r.code})`;
      if (!ok && !r.timedOut) {
        const d = diagnoseCompile(r.stdout + '\n' + r.stderr, board);
        if (d) {
          log('info', `Diagnóstico: ${d}\n`);
          summary += ' · ' + d;
        }
      }
      this.finishJob(job, ok, summary, r.code, this.publicBuild(rec));
    } catch (e) {
      rec.state = 'error';
      log('stderr', `Error interno: ${(e as Error).message}\n`);
      this.finishJob(job, false, 'Error interno de compilación', null, this.publicBuild(rec));
    }
  }

  /** Comprueba si un binario puede subirse con el documento actual. */
  checkUpload(buildId: string, currentHash: string, fqbn: string): BuildRecord & { sketchDir: string; outDir: string } {
    const b = this.builds.get(buildId);
    if (!b) throw new JobError('Compilación desconocida: compila antes de subir.');
    if (b.state !== 'ok') throw new JobError('La última compilación falló: no se sube ningún binario.');
    if (b.contentHash !== currentHash) throw new JobError('Compilación OBSOLETA: el código cambió después de compilar. Vuelve a compilar.');
    if (b.fqbn !== fqbn) throw new JobError('La placa seleccionada no coincide con la de la compilación.');
    if (!fs.existsSync(path.join(b.outDir, binaryName(b.sketchName, b.fqbn)))) throw new JobError('No se encuentra el binario de esa compilación.');
    return b;
  }

  upload(buildId: string, currentHash: string, fqbn: string, port: string): JobInfo {
    if (!PORT_RE.test(port)) throw new JobError('Puerto inválido: ' + port);
    const b = this.checkUpload(buildId, currentHash, fqbn);
    const job = this.startJob('upload', `Subir ${b.sketchName} a ${port}`, { buildId, port });
    void this.runUpload(job, b, port);
    return job;
  }

  private async runUpload(job: JobInfo, b: BuildRecord & { sketchDir: string; outDir: string }, port: string) {
    const log = this.logger(job);
    let prev: { path: string; baud: number } | null = null;
    try {
      prev = await this.o.serial.releaseForUpload();
      if (prev) log('info', `Puerto ${prev.path} liberado para la carga.\n`);
      const args = uploadArgs(b.fqbn, port, b.outDir, b.sketchDir);
      log('info', `Subiendo SOLO el binario de la compilación ${b.id.slice(0, 8)} (sha256 ${b.contentHash.slice(0, 12)}…)\n`);
      log('info', `> arduino-cli ${args.join(' ')}\n`);
      const r = await this.o.runner.run(this.o.cliPath(), args, {
        timeoutMs: 180_000,
        onStdout: (t) => log('stdout', t),
        onStderr: (t) => log('stderr', t),
      });
      const ok = r.code === 0 && !r.spawnError && !r.timedOut;
      let summary = ok ? 'Carga terminada. Verifica el protocolo del nuevo firmware antes de usar los controles.' : `Error de carga (código ${r.code ?? '—'})`;
      if (!ok) {
        const d = r.spawnError ? 'No se pudo ejecutar Arduino CLI: ' + r.spawnError : diagnoseUpload(r.stdout + '\n' + r.stderr, boardByFqbn(b.fqbn));
        if (d) {
          log('info', `Diagnóstico: ${d}\n`);
          summary += ' · ' + d;
        }
      }
      if (prev) {
        await new Promise((res) => setTimeout(res, this.o.reopenDelayMs ?? 2000));
        log('info', `Reabriendo ${prev.path}…\n`);
        await this.o.serial.reopenAfterUpload(prev).catch((e) => log('stderr', `No se pudo reabrir el puerto: ${(e as Error).message}\n`));
      }
      this.finishJob(job, ok, summary, r.code);
    } catch (e) {
      log('stderr', `Error interno: ${(e as Error).message}\n`);
      this.finishJob(job, false, 'Error interno de carga', null);
    }
  }

  /**
   * Instala un core o la biblioteca, o actualiza el índice de placas.
   * `coreId` debe ser un core del catálogo (por defecto, el de AVR): nunca se
   * pasa texto libre a Arduino CLI.
   */
  install(kind: 'install-core' | 'install-lib' | 'update-index', coreId: string = CORES[0].id): JobInfo {
    const core = coreById(coreId);
    if (!core) throw new JobError('Core no permitido: ' + coreId);
    const args = kind === 'update-index' ? coreArgs('update-index', core) : kind === 'install-core' ? coreArgs('install', core) : ['lib', 'install', REQUIRED_LIB];
    const title = kind === 'update-index' ? 'Actualizar índice de placas' : kind === 'install-core' ? `Instalar core ${core.id}` : `Instalar biblioteca ${REQUIRED_LIB}`;
    const job = this.startJob(kind, title);
    const log = this.logger(job);
    log('info', `> arduino-cli ${args.join(' ')}\n`);
    if (kind === 'install-core' && core.heavy) log('info', 'Este core es una descarga grande (cientos de MB): puede tardar bastante según la conexión.\n');
    void this.o.runner
      .run(this.o.cliPath(), args, { timeoutMs: core.heavy ? 2_700_000 : 600_000, onStdout: (t) => log('stdout', t), onStderr: (t) => log('stderr', t) })
      .then((r) => {
        const ok = r.code === 0 && !r.spawnError;
        this.finishJob(job, ok, ok ? 'Instalación terminada' : `Error (código ${r.code ?? '—'}) ${r.spawnError ?? ''}`, r.code);
      });
    return job;
  }
}
