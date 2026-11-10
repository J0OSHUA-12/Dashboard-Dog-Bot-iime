// Servicio local: compilación/carga con un Arduino CLI FALSO (runner simulado),
// puerto serie simulado, rutas y seguridad. No ejecuta Arduino CLI real.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildManager, JobError, hashBuild } from '../service/src/buildManager';
import { CommandRunner, RunResult } from '../service/src/runner';
import { SerialManager, PortLike, boardHint, diagnoseOpenError } from '../service/src/serialManager';
import { SketchStore } from '../service/src/sketches';
import { makePaths, safeJoin } from '../service/src/paths';
import { makeSecurity, hostAllowed, originAllowed, tokenMatches } from '../service/src/security';
import { binaryName, coreArgs, detectTools, diagnoseCompile, parseCoreVersion, parseLibVersion, parseSizes, uploadArgs, diagnoseUpload } from '../service/src/arduinoCli';
import { BOARDS, CORES, boardByFqbn, coreById, familyOfMcu } from '../shared/boards';
import { isValidSketchName, TOKEN_HEADER } from '../shared/serviceApi';
import { createServer } from '../service/src/server';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';

function tmp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

class FakeCli implements CommandRunner {
  calls: { exe: string; args: string[] }[] = [];
  compileFails = false;
  uploadFails = false;
  /** Core ESP32 sin instalar: compile falla como lo hace Arduino CLI. */
  esp32CoreMissing = false;
  /** Cores que `core list` informa como instalados. */
  installedCores: string[] = [];
  async run(exe: string, args: string[]): Promise<RunResult> {
    this.calls.push({ exe, args });
    if (args[0] === 'compile') {
      if (this.compileFails) return { code: 1, stdout: '', stderr: "error: 'pwmm' was not declared in this scope", spawnError: null, timedOut: false };
      const out = args[args.indexOf('--output-dir') + 1];
      const sketchDir = args[args.length - 1];
      const name = path.basename(sketchDir);
      fs.mkdirSync(out, { recursive: true });
      if (args[args.indexOf('--fqbn') + 1].startsWith('esp32:')) {
        if (this.esp32CoreMissing) return { code: 1, stdout: '', stderr: 'Error during build: Platform \'esp32:esp32\' not found: platform not installed', spawnError: null, timedOut: false };
        // El core del ESP32 deja .bin (más el cargador de arranque y la tabla de particiones), no .hex.
        for (const f of ['.ino.bin', '.ino.bootloader.bin', '.ino.partitions.bin']) fs.writeFileSync(path.join(out, name + f), 'bin');
        return {
          code: 0,
          stdout:
            'Sketch uses 289621 bytes (22%) of program storage space. Maximum is 1310720 bytes.\nGlobal variables use 21604 bytes (6%) of dynamic memory, leaving 306076 bytes for local variables. Maximum is 327680 bytes.\n',
          stderr: '',
          spawnError: null,
          timedOut: false,
        };
      }
      fs.writeFileSync(path.join(out, `${name}.ino.hex`), ':00000001FF\n');
      return {
        code: 0,
        stdout:
          'Sketch uses 13920 bytes (43%) of program storage space. Maximum is 32256 bytes.\nGlobal variables use 838 bytes (40%) of dynamic memory, leaving 1210 bytes for local variables. Maximum is 2048 bytes.\n',
        stderr: '',
        spawnError: null,
        timedOut: false,
      };
    }
    if (args[0] === 'upload' && this.uploadFails && args[args.indexOf('--fqbn') + 1].startsWith('esp32:')) {
      return { code: 2, stdout: 'Connecting......................................', stderr: 'A fatal error occurred: Failed to connect to ESP32: Wrong boot mode detected (0x13)! The chip needs to be in download mode.', spawnError: null, timedOut: false };
    }
    if (args[0] === 'core' && args[1] === 'list') {
      return { code: 0, stdout: JSON.stringify({ platforms: this.installedCores.map((id) => ({ id, installed_version: '9.9.9' })) }), stderr: '', spawnError: null, timedOut: false };
    }
    if (args[0] === 'upload') {
      if (this.uploadFails) return { code: 1, stdout: '', stderr: 'avrdude: ser_open(): can\'t open device "\\\\.\\COM3": Access is denied.', spawnError: null, timedOut: false };
      return { code: 0, stdout: 'avrdude done.  Thank you.', stderr: '', spawnError: null, timedOut: false };
    }
    return { code: 0, stdout: '{}', stderr: '', spawnError: null, timedOut: false };
  }
}

function makeBM(cli: FakeCli, serialEvents: string[] = []) {
  const dir = tmp('dogbot builds ');
  const bm = new BuildManager({
    buildsDir: dir,
    runner: cli,
    cliPath: () => 'C:\\Program Files\\Arduino IDE\\arduino-cli.exe',
    reopenDelayMs: 1,
    serial: {
      async releaseForUpload() {
        serialEvents.push('release');
        return { path: 'COM3', baud: 115200 };
      },
      async reopenAfterUpload() {
        serialEvents.push('reopen');
      },
    },
  });
  return { bm, dir };
}

function waitJob(bm: BuildManager, id: string) {
  return new Promise<void>((resolve) => {
    const f = (job: { id: string; state: string }) => {
      if (job.id === id && job.state !== 'en-curso') {
        bm.off('job', f);
        resolve();
      }
    };
    bm.on('job', f);
  });
}

describe('BuildManager (Arduino CLI simulado)', () => {
  it('compila una instantánea en carpeta de sketch válida, con rutas con espacios y sin shell', async () => {
    const cli = new FakeCli();
    const { bm, dir } = makeBM(cli);
    expect(dir).toContain(' ');
    const src = 'void setup(){}\nvoid loop(){}\n';
    const { job, build } = bm.compile('Mi_Sketch', 'arduino:avr:uno', src);
    await waitJob(bm, job.id);
    const rec = bm.builds.get(build.id)!;
    expect(rec.state).toBe('ok');
    expect(rec.flashBytes).toBe(13920);
    expect(rec.contentHash).toBe(hashBuild('Mi_Sketch', 'arduino:avr:uno', src));
    const call = cli.calls[0];
    expect(call.exe).toContain('Program Files');
    expect(call.args.slice(0, 3)).toEqual(['compile', '--fqbn', 'arduino:avr:uno']);
    expect(path.basename(call.args[call.args.length - 1])).toBe('Mi_Sketch');
    expect(fs.readFileSync(path.join(call.args[call.args.length - 1], 'Mi_Sketch.ino'), 'utf8')).toBe(src);
  });

  it('error de compilación impide subir', async () => {
    const cli = new FakeCli();
    cli.compileFails = true;
    const { bm } = makeBM(cli);
    const src = 'void setup(){ pwmm.begin(); }';
    const { job, build } = bm.compile('Roto', 'arduino:avr:uno', src);
    await waitJob(bm, job.id);
    expect(bm.builds.get(build.id)!.state).toBe('error');
    expect(() => bm.upload(build.id, hashBuild('Roto', 'arduino:avr:uno', src), 'arduino:avr:uno', 'COM3')).toThrow(/falló/);
    expect(cli.calls.some((c) => c.args[0] === 'upload')).toBe(false);
  });

  it('editar después de compilar marca la compilación como obsoleta', async () => {
    const cli = new FakeCli();
    const { bm } = makeBM(cli);
    const { job, build } = bm.compile('A', 'arduino:avr:uno', 'v1');
    await waitJob(bm, job.id);
    expect(() => bm.upload(build.id, hashBuild('A', 'arduino:avr:uno', 'v2'), 'arduino:avr:uno', 'COM3')).toThrow(/OBSOLETA/);
    expect(() => bm.upload(build.id, hashBuild('A', 'arduino:avr:uno', 'v1'), 'arduino:avr:mega:cpu=atmega2560', 'COM3')).toThrow(/placa/);
    expect(() => bm.upload(build.id, hashBuild('A', 'arduino:avr:uno', 'v1'), 'arduino:avr:uno', 'COM3 & del')).toThrow(/Puerto inválido/);
  });

  it('sube sólo el binario compilado (--input-dir), liberando y reabriendo el COM', async () => {
    const cli = new FakeCli();
    const ev: string[] = [];
    const { bm } = makeBM(cli, ev);
    const { job, build } = bm.compile('A', 'arduino:avr:uno', 'v1');
    await waitJob(bm, job.id);
    const up = bm.upload(build.id, hashBuild('A', 'arduino:avr:uno', 'v1'), 'arduino:avr:uno', 'COM3');
    await waitJob(bm, up.id);
    expect(up.state).toBe('ok');
    const u = cli.calls.find((c) => c.args[0] === 'upload')!;
    expect(u.args).toContain('--input-dir');
    expect(u.args).not.toContain('compile');
    expect(ev).toEqual(['release', 'reopen']);
    expect(cli.calls.filter((c) => c.args[0] === 'compile').length).toBe(1);
  });

  it('diagnostica puerto ocupado al subir', async () => {
    const cli = new FakeCli();
    cli.uploadFails = true;
    const { bm } = makeBM(cli);
    const { job, build } = bm.compile('A', 'arduino:avr:uno', 'v1');
    await waitJob(bm, job.id);
    const up = bm.upload(build.id, hashBuild('A', 'arduino:avr:uno', 'v1'), 'arduino:avr:uno', 'COM3');
    await waitJob(bm, up.id);
    expect(up.state).toBe('error');
    expect(up.summary).toMatch(/Monitor Serie/);
  });

  it('una sola operación a la vez y nombres de sketch válidos', async () => {
    const cli = new FakeCli();
    const { bm } = makeBM(cli);
    const first = bm.compile('A', 'arduino:avr:uno', 'v1');
    expect(() => bm.compile('B', 'arduino:avr:uno', 'v1')).toThrow(JobError);
    await waitJob(bm, first.job.id);
    expect(() => bm.compile('../evil', 'arduino:avr:uno', 'x')).toThrow(/inválido/);
    expect(() => bm.compile('con espacio', 'arduino:avr:uno', 'x')).toThrow(/inválido/);
    expect(() => bm.compile('A', 'esp32:esp32:x', 'x')).toThrow(/no permitida/);
  });
});

describe('ESP32 (Arduino CLI simulado)', () => {
  const ESP = 'esp32:esp32:esp32';

  it('el catálogo incluye UNO y ESP32, cada uno con su core y su tipo de binario', () => {
    expect(BOARDS.map((b) => b.fqbn)).toEqual(expect.arrayContaining(['arduino:avr:uno', ESP]));
    expect(boardByFqbn(ESP)).toMatchObject({ family: 'esp32', core: 'esp32:esp32', short: 'ESP32' });
    expect(coreById('esp32:esp32')).toMatchObject({ binExt: '.bin', heavy: true });
    expect(binaryName('S', ESP)).toBe('S.ino.bin');
    expect(binaryName('S', 'arduino:avr:uno')).toBe('S.ino.hex');
    expect(familyOfMcu('ESP32')).toBe('esp32');
    expect(familyOfMcu('UNO')).toBe('avr');
    expect(familyOfMcu(null)).toBeNull();
    for (const b of BOARDS) expect(CORES.some((c) => c.id === b.core)).toBe(true);
  });

  it('compila para ESP32: binario .bin, tamaños del ESP32 y hash ligado a la placa', async () => {
    const cli = new FakeCli();
    const { bm } = makeBM(cli);
    const { job, build } = bm.compile('DogBotDashboard', ESP, 'v1');
    await waitJob(bm, job.id);
    const rec = bm.builds.get(build.id)!;
    expect(rec.state).toBe('ok');
    expect(rec).toMatchObject({ flashBytes: 289621, flashMax: 1310720, ramBytes: 21604, ramMax: 327680 });
    expect(cli.calls[0].args.slice(0, 3)).toEqual(['compile', '--fqbn', ESP]);
    expect(fs.existsSync(path.join(rec.outDir, 'DogBotDashboard.ino.bin'))).toBe(true);
    expect(rec.contentHash).not.toBe(hashBuild('DogBotDashboard', 'arduino:avr:uno', 'v1'));
  });

  it('un binario compilado para UNO no se sube como ESP32 (ni al revés)', async () => {
    const cli = new FakeCli();
    const { bm } = makeBM(cli);
    const uno = bm.compile('A', 'arduino:avr:uno', 'v1');
    await waitJob(bm, uno.job.id);
    expect(() => bm.upload(uno.build.id, hashBuild('A', 'arduino:avr:uno', 'v1'), ESP, 'COM4')).toThrow(/placa/);
    expect(() => bm.upload(uno.build.id, hashBuild('A', ESP, 'v1'), ESP, 'COM4')).toThrow(/OBSOLETA/);
    const esp = bm.compile('A', ESP, 'v1');
    await waitJob(bm, esp.job.id);
    expect(() => bm.upload(esp.build.id, hashBuild('A', ESP, 'v1'), 'arduino:avr:uno', 'COM4')).toThrow(/placa/);
    expect(cli.calls.some((c) => c.args[0] === 'upload')).toBe(false);
  });

  it('sube al ESP32 sólo su binario, con su FQBN, liberando y reabriendo el COM', async () => {
    const cli = new FakeCli();
    const ev: string[] = [];
    const { bm } = makeBM(cli, ev);
    const { job, build } = bm.compile('A', ESP, 'v1');
    await waitJob(bm, job.id);
    const up = bm.upload(build.id, hashBuild('A', ESP, 'v1'), ESP, 'COM4');
    await waitJob(bm, up.id);
    expect(up.state).toBe('ok');
    const u = cli.calls.find((c) => c.args[0] === 'upload')!;
    expect(u.args.slice(0, 6)).toEqual(['upload', '-p', 'COM4', '--fqbn', ESP, '--input-dir']);
    expect(ev).toEqual(['release', 'reopen']);
  });

  it('si el ESP32 no entra en modo de carga, explica el botón BOOT', async () => {
    const cli = new FakeCli();
    cli.uploadFails = true;
    const { bm } = makeBM(cli);
    const { job, build } = bm.compile('A', ESP, 'v1');
    await waitJob(bm, job.id);
    const up = bm.upload(build.id, hashBuild('A', ESP, 'v1'), ESP, 'COM4');
    await waitJob(bm, up.id);
    expect(up.state).toBe('error');
    expect(up.summary).toMatch(/BOOT/);
    expect(diagnoseUpload('A fatal error occurred: Failed to connect to ESP32: Timed out waiting for packet header')).toMatch(/BOOT/);
    expect(diagnoseUpload('A fatal error occurred: MD5 of file does not match data in flash!', boardByFqbn(ESP))).toMatch(/esptool/);
    expect(diagnoseUpload('avrdude: stk500_getsync() attempt 1 of 10: not in sync')).not.toMatch(/BOOT/);
  });

  it('si falta el core del ESP32, la compilación falla diciendo cómo instalarlo', async () => {
    const cli = new FakeCli();
    cli.esp32CoreMissing = true;
    const { bm } = makeBM(cli);
    const { job, build } = bm.compile('A', ESP, 'v1');
    await waitJob(bm, job.id);
    expect(bm.builds.get(build.id)!.state).toBe('error');
    expect(job.summary).toMatch(/Falta el core esp32:esp32/);
    expect(diagnoseCompile("error: 'pwmm' was not declared in this scope", boardByFqbn(ESP))).toBeNull();
    expect(diagnoseCompile('fatal error: Adafruit_PWMServoDriver.h: No such file or directory', boardByFqbn(ESP))).toMatch(/biblioteca/);
  });

  it('instala cada core con argumentos fijos; el del ESP32 lleva su índice adicional', async () => {
    expect(coreArgs('install', coreById('arduino:avr')!)).toEqual(['core', 'install', 'arduino:avr']);
    expect(coreArgs('install', coreById('esp32:esp32')!)).toEqual(['core', 'install', 'esp32:esp32', '--additional-urls', 'https://espressif.github.io/arduino-esp32/package_esp32_index.json']);
    expect(coreArgs('update-index', coreById('arduino:avr')!)).toEqual(['core', 'update-index']);
    const cli = new FakeCli();
    const { bm } = makeBM(cli);
    const job = bm.install('install-core', 'esp32:esp32');
    await waitJob(bm, job.id);
    expect(job.title).toBe('Instalar core esp32:esp32');
    expect(cli.calls[0].args.slice(0, 3)).toEqual(['core', 'install', 'esp32:esp32']);
    expect(() => bm.install('install-core', 'evil:core --config-file x')).toThrow(/no permitido/);
    const def = bm.install('install-core');
    await waitJob(bm, def.id);
    expect(cli.calls[1].args).toEqual(['core', 'install', 'arduino:avr']);
  });

  it('el diagnóstico informa cada core por separado', async () => {
    const cli = new FakeCli();
    cli.installedCores = ['arduino:avr'];
    const st = await detectTools(cli, ['arduino-cli']);
    expect(st.cores.map((c) => [c.id, c.ok])).toEqual([
      ['arduino:avr', true],
      ['esp32:esp32', false],
    ]);
    expect(st.cores[1].detail).toMatch(/Falta el core esp32:esp32/);
    cli.installedCores = ['arduino:avr', 'esp32:esp32'];
    expect((await detectTools(cli, ['arduino-cli'])).cores.every((c) => c.ok)).toBe(true);
  });
});

describe('detección de herramientas', () => {
  it('interpreta formatos 1.x y 0.x de Arduino CLI', () => {
    expect(parseCoreVersion({ platforms: [{ id: 'arduino:avr', installed_version: '1.8.6' }] })).toBe('1.8.6');
    expect(parseCoreVersion([{ id: 'arduino:avr', installed: '1.8.5' }])).toBe('1.8.5');
    expect(parseLibVersion({ installed_libraries: [{ library: { name: 'Adafruit PWM Servo Driver Library', version: '3.0.2' } }] })).toBe('3.0.2');
    expect(parseLibVersion([])).toBeNull();
    expect(parseSizes('Sketch uses 100 bytes (1%) of program storage space. Maximum is 32256 bytes.').flashBytes).toBe(100);
    expect(diagnoseUpload('stk500_getsync() attempt 10 of 10: not in sync')).toMatch(/bootloader/);
    expect(uploadArgs('arduino:avr:uno', 'COM3', 'C:\\a b\\out', 'C:\\a b\\S')).toEqual(['upload', '-p', 'COM3', '--fqbn', 'arduino:avr:uno', '--input-dir', 'C:\\a b\\out', 'C:\\a b\\S']);
  });
  it('informa qué falta si no hay Arduino CLI', async () => {
    const runner: CommandRunner = { run: async () => ({ code: null, stdout: '', stderr: '', spawnError: 'ENOENT', timedOut: false }) };
    const st = await detectTools(runner, ['arduino-cli']);
    expect(st.cli.ok).toBe(false);
    expect(st.missing[0]).toMatch(/Arduino CLI/);
  });
});

class FakePort implements PortLike {
  isOpen = false;
  written: string[] = [];
  lines: { dtr?: boolean; rts?: boolean }[] = [];
  set(opts: { dtr?: boolean; rts?: boolean }, cb?: (err: Error | null) => void) {
    this.lines.push(opts);
    cb?.(null);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: Record<string, ((...a: any[]) => void)[]> = {};
  failOpen: string | null = null;
  pendingWrites: (() => void)[] = [];
  open(cb: (err: Error | null) => void) {
    if (this.failOpen) return cb(new Error(this.failOpen));
    this.isOpen = true;
    cb(null);
  }
  close(cb?: (err: Error | null) => void) {
    this.isOpen = false;
    cb?.(null);
  }
  write(d: string, cb?: (err: Error | null | undefined) => void) {
    this.written.push(d);
    this.pendingWrites.push(() => cb?.(null));
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(ev: string, fn: (...a: any[]) => void) {
    (this.handlers[ev] ??= []).push(fn);
    return this;
  }
  emit(ev: string, ...a: unknown[]) {
    for (const f of this.handlers[ev] ?? []) f(...a);
  }
}

describe('SerialManager (puerto simulado)', () => {
  it('diagnostica puerto ocupado', async () => {
    const port = new FakePort();
    port.failOpen = 'Opening COM3: Access denied';
    const sm = new SerialManager({ create: () => port, list: async () => [] });
    await expect(sm.open('COM3', 115200)).rejects.toThrow();
    expect(sm.status.diagnostic).toMatch(/Monitor Serie/);
    expect(diagnoseOpenError('File not found')).toMatch(/no existe/);
  });

  it('al abrir deja DTR y RTS inactivos para que un ESP32 no arranque en modo de carga', async () => {
    const port = new FakePort();
    const sm = new SerialManager({ create: () => port, list: async () => [] });
    await sm.open('COM4', 115200);
    expect(port.lines).toEqual([{ dtr: false, rts: false }]);
    expect(sm.status.state).toBe('abierto');
    // Un puerto sin líneas de control (o que falla al fijarlas) se abre igual.
    const bare = new FakePort() as PortLike;
    bare.set = () => {
      throw new Error('no soportado');
    };
    const sm2 = new SerialManager({ create: () => bare, list: async () => [] });
    await sm2.open('COM5', 115200);
    expect(sm2.status.state).toBe('abierto');
  });

  it('da una pista de la placa según el adaptador USB, sin afirmar de más', () => {
    expect(boardHint('2341', 'Arduino LLC')).toBe('Arduino');
    expect(boardHint('303A', 'Espressif')).toBe('ESP32');
    expect(boardHint('10C4', 'Silicon Labs')).toBe('CP210x');
    expect(boardHint('1a86', 'wch.cn')).toBe('CH340');
    expect(boardHint(null, null)).toBeNull();
    expect(boardHint('8087', 'Intel')).toBeNull();
  });

  it('empuja la lectura con una línea vacía solo en reposo y a 115200 baudios', async () => {
    vi.useFakeTimers();
    try {
      const port = new FakePort();
      const sm = new SerialManager({ create: () => port, list: async () => [] }, { kickMs: 40 });
      await sm.open('COM6', 115200);
      vi.advanceTimersByTime(40);
      expect(port.written).toEqual(['\n']);
      // Con una orden en curso no se intercala nada.
      sm.send('1 HELLO 5', false);
      expect(port.written[1]).toBe('1 HELLO 5\n');
      vi.advanceTimersByTime(200);
      expect(port.written.length).toBe(2);
      port.pendingWrites.shift(); // el empujón anterior (sin esperar)
      port.pendingWrites.shift()!();
      vi.advanceTimersByTime(40);
      expect(port.written[2]).toBe('\n');
      // Al cerrar se detiene.
      await sm.close();
      const n = port.written.length;
      vi.advanceTimersByTime(400);
      expect(port.written.length).toBe(n);
      // Otras velocidades (sketches históricos) y kickMs 0: nada.
      for (const [ms, baud] of [[40, 9600], [0, 115200]] as const) {
        const p2 = new FakePort();
        const s2 = new SerialManager({ create: () => p2, list: async () => [] }, { kickMs: ms });
        await s2.open('COM7', baud);
        vi.advanceTimersByTime(400);
        expect(p2.written).toEqual([]);
        await s2.close();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('valida puerto y velocidad', async () => {
    const sm = new SerialManager({ create: () => new FakePort(), list: async () => [] });
    await expect(sm.open('COM3; rm -rf', 115200)).rejects.toThrow(/Puerto inválido/);
    await expect(sm.open('COM3', 12345)).rejects.toThrow(/Velocidad/);
  });

  it('cola corta; prioridad descarta lo pendiente; líneas divididas al recibir', async () => {
    const port = new FakePort();
    const sm = new SerialManager({ create: () => port, list: async () => [] });
    const lines: string[] = [];
    const dropped: number[] = [];
    sm.on('line', (l) => lines.push(l));
    sm.on('dropped', (n) => dropped.push(n));
    await sm.open('COM3', 115200);
    for (let i = 0; i < 30; i++) sm.send(`${i + 1} MOVE 60 1 1500`, false);
    expect(port.written.length).toBe(1); // esperando que termine la escritura
    sm.send('99 STOP', true);
    port.pendingWrites.shift()!();
    expect(port.written[1]).toBe('99 STOP\n');
    expect(dropped.reduce((a, b) => a + b, 0)).toBeGreaterThan(10);
    port.emit('data', Buffer.from('OK 1 HB up=1\r\nPW 10 1:15'));
    port.emit('data', Buffer.from('00\n'));
    expect(lines).toEqual(['OK 1 HB up=1', 'PW 10 1:1500']);
    expect(() => sm.send('bad\u0007', false)).toThrow();
  });
});

describe('sketches y rutas', () => {
  const root = tmp('dogbot repo ');
  fs.mkdirSync(path.join(root, 'firmware', 'DogBotDashboard'), { recursive: true });
  fs.writeFileSync(path.join(root, 'firmware', 'DogBotDashboard', 'DogBotDashboard.ino'), '// fw');
  fs.mkdirSync(path.join(root, 'DOGBOT_CLAUDE_CODE', 'originales'), { recursive: true });
  fs.writeFileSync(path.join(root, 'DOGBOT_CLAUDE_CODE', 'originales', 'CAMINATA_FLUIDA_PROBADA.ino'), '// orig');
  const store = new SketchStore(makePaths(root));

  it('lista orígenes con fichas y protege originales', () => {
    const l = store.list();
    const orig = l.find((e) => e.name === 'CAMINATA_FLUIDA_PROBADA')!;
    expect(orig.readOnly).toBe(true);
    expect(orig.ficha).toMatch(/AUTOMÁTICAMENTE/);
    expect(store.read('originales', 'CAMINATA_FLUIDA_PROBADA')).toBe('// orig');
  });
  it('guarda sólo en Mis sketches, sin sobrescribir sin permiso', () => {
    expect(store.save('Prueba_1', 'x', false)).toBe('sketches/Prueba_1/Prueba_1.ino');
    expect(() => store.save('Prueba_1', 'y', false)).toThrow(/Ya existe/);
    store.save('Prueba_1', 'y', true);
    expect(store.read('mis-sketches', 'Prueba_1')).toBe('y');
    expect(() => store.save('../../DOGBOT_CLAUDE_CODE/originales/CAMINATA_FLUIDA_PROBADA', 'z', true)).toThrow();
    expect(fs.readFileSync(path.join(root, 'DOGBOT_CLAUDE_CODE', 'originales', 'CAMINATA_FLUIDA_PROBADA.ino'), 'utf8')).toBe('// orig');
  });
  it('rutas seguras y nombres reservados de Windows', () => {
    expect(() => safeJoin(root, '..', 'x')).toThrow();
    expect(isValidSketchName('COM1')).toBe(false);
    expect(isValidSketchName('con.ino')).toBe(false);
    expect(isValidSketchName('DogBot_v2')).toBe(true);
  });
});

describe('seguridad del servicio', () => {
  const sec = makeSecurity(5178, 'a'.repeat(48), 5173);
  const req = (h: Record<string, string>) => ({ headers: h }) as unknown as IncomingMessage;
  it('sólo Host local y orígenes permitidos', () => {
    expect(hostAllowed(sec, req({ host: '127.0.0.1:5178' }))).toBe(true);
    expect(hostAllowed(sec, req({ host: 'evil.example:5178' }))).toBe(false);
    expect(originAllowed(sec, req({ origin: 'https://evil.example' }))).toBe(false);
    expect(originAllowed(sec, req({ origin: 'http://localhost:5173' }))).toBe(true);
  });
  it('token obligatorio', () => {
    expect(tokenMatches(sec, 'a'.repeat(48))).toBe(true);
    expect(tokenMatches(sec, 'b'.repeat(48))).toBe(false);
    expect(tokenMatches(sec, undefined)).toBe(false);
  });
});

describe('cierre del programa (POST /api/shutdown)', () => {
  async function start(onShutdown?: () => void) {
    const root = tmp('dogbot shutdown ');
    const token = 'c'.repeat(48);
    const sec = makeSecurity(1, token);
    const { bm } = makeBM(new FakeCli());
    const server = createServer({
      paths: makePaths(root),
      sec,
      serial: new SerialManager({ create: () => new FakePort(), list: async () => [] }),
      builds: bm,
      sketches: new SketchStore(makePaths(root)),
      detect: async () => {
        throw new Error('no usado');
      },
      onShutdown,
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    sec.allowedHosts.add(`127.0.0.1:${port}`);
    const post = (tok: string) => fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { [TOKEN_HEADER]: tok } });
    return { server, post, token };
  }

  it('exige token y llama al cierre ordenado', async () => {
    const onShutdown = vi.fn();
    const { server, post, token } = await start(onShutdown);
    try {
      expect((await post('x'.repeat(48))).status).toBe(401);
      expect(onShutdown).not.toHaveBeenCalled();
      const res = await post(token);
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 250));
      expect(onShutdown).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  });

  it('sin manejador de cierre responde 501', async () => {
    const { server, post, token } = await start();
    try {
      expect((await post(token)).status).toBe(501);
    } finally {
      server.close();
    }
  });
});

afterEach(() => vi.useRealTimers());
