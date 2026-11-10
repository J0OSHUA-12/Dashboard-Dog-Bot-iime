// Ejecuta el firmware REAL (DogBotDashboard.ino) compilado para la PC con un
// entorno Arduino simulado (firmware/pruebas_host). Prueba lógica de software:
// no demuestra comportamiento eléctrico ni mecánico.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
// El MISMO .ino se compila dos veces: como lo vería el UNO y como lo vería el
// ESP32 (-DESP32 activa sus ramas: pines I2C, memoria libre, id de arranque).
// Así toda la batería de pruebas cubre las dos variantes del firmware.
const VARIANTS = [
  { mcu: 'UNO', flag: '-DARDUINO_AVR_UNO' },
  { mcu: 'ESP32', flag: '-DESP32' },
];
const exeFor = (mcu: string) => path.join(os.tmpdir(), `dogbot-fw-host-${process.pid}-${mcu}${process.platform === 'win32' ? '.exe' : ''}`);
let exe = '';
let hasCompiler = true;
try {
  execFileSync('g++', ['--version'], { stdio: 'ignore' });
} catch {
  hasCompiler = false;
}

function run(script: string[]): string[] {
  const r = spawnSync(exe, [], { input: script.join('\n') + '\n', encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.split('\n').filter(Boolean);
}

function pwm(lines: string[], idx = -1): Record<string, string> {
  const all = lines.filter((l) => l.startsWith('PWMSTATE'));
  const l = all[idx < 0 ? all.length + idx : idx];
  return Object.fromEntries(l.split(' ').slice(1).map((p) => p.split(':')));
}

describe.skipIf(!hasCompiler).each(VARIANTS)('firmware DogBotDashboard (arnés en PC, variante $mcu)', ({ mcu, flag }) => {
  beforeAll(() => {
    exe = exeFor(mcu);
    execFileSync('g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', flag, '-I', path.join(root, 'firmware/pruebas_host'), path.join(root, 'firmware/pruebas_host/harness.cpp'), '-o', exe]);
    expect(fs.existsSync(exe)).toBe(true);
  });

  it('se identifica con la placa para la que se compiló', () => {
    const out = run(['> 1 HELLO 4711']);
    const hello = out.find((l) => l.startsWith('OK 1 HELLO'))!;
    expect(hello).toMatch(new RegExp(`^OK 1 HELLO dev=DOGBOT proto=1 fw=0\\.2\\.0 boot=[0-9A-F]{4} ses=4711 ch=12 calstep=50 fr=-?\\d+ mcu=${mcu}$`));
    // UNO: pines I2C fijos de la placa. ESP32: GPIO21/22 pedidos de forma explícita.
    expect(out).toContain(mcu === 'ESP32' ? '# i2c sda=21 scl=22' : '# i2c sda=-1 scl=-1');
    // En el ESP32 la memoria libre es el heap (cientos de kB); el arnés no la mide en el UNO.
    expect(Number(/fr=(-?\d+)/.exec(hello)![1])).toBe(mcu === 'ESP32' ? 287654 : -1);
  });

  it('arranca sin mover nada: todos los canales en full OFF y desarmado', () => {
    const out = run(['p', '> 1 STATUS']);
    expect(out[0]).toMatch(/^BOOT DOGBOT proto=1 fw=0\.2\.0 boot=[0-9A-F]{4}$/);
    expect(out[0]).not.toMatch(/boot=0000/);
    expect(out).toContain('# allOffWrites=1');
    expect(Object.values(pwm(out)).every((v) => v === 'off')).toBe(true);
    expect(out.find((l) => l.startsWith('OK 1 STATUS'))).toMatch(/arm=0 .*en=0000/);
  });

  it('rechaza órdenes inválidas con códigos claros', () => {
    const out = run([
      '> 1 MOVE 100 1 1600',
      '> 2 LIMIT 1 1600 1500 1700',
      '> 3 LIMIT 12 1300 1500 1700',
      '> 4 LIMIT 1 400 1500 1700',
      '> 5 ARM',
      '> 6 ENABLE 1 1500',
      '> 7 LIMIT 1 1300 1500 1700',
      '> 8 ENABLE 1 1800',
      '> 9 ENABLE 1 1500',
      '> 10 MOVE 100 1 1750',
      '> 11 MOVE 100 0 1500',
      '> 12 BAILAR',
      '> abc HELLO',
      '> 13 MOVE 100 1 1600 1 1650',
      '> 14 LIMIT 1 1200 1500 1800',
    ]);
    const codes = Object.fromEntries(out.filter((l) => l.startsWith('ER')).map((l) => [l.split(' ')[1], l.split(' ')[2]]));
    expect(codes).toMatchObject({ '1': 'STATE', '2': 'ORDER', '3': 'CHANNEL', '4': 'RANGE', '6': 'NOLIMIT', '8': 'RANGE', '10': 'RANGE', '11': 'DISABLED', '12': 'UNKNOWN', '0': 'SYNTAX', '13': 'ARGS', '14': 'STATE' });
  });

  it('movimiento no bloqueante: STOP se atiende a mitad de trayectoria', () => {
    const out = run(['> 1 LIMIT 1 1000 1500 2000', '> 2 ARM', '> 3 ENABLE 1 1500', '> 4 MOVE 4000 1 2000', 't 500', 'p', '> 5 STOP', 't 1500', 'p']);
    expect(out).toContain('OK 5 STOP');
    const mid = Number(pwm(out, 0)['1']);
    const after = Number(pwm(out, 1)['1']);
    expect(mid).toBeGreaterThan(1500);
    expect(mid).toBeLessThan(1700);
    expect(after).toBe(mid);
  });

  it('respeta el límite de velocidad (slew) aunque la duración sea 0', () => {
    const out = run(['> 1 LIMIT 0 1000 1500 2000', '> 2 ARM', '> 3 ENABLE 0 1000', '> 4 SLEW 10', '> 6 LINK 10000 HOLD', '> 5 MOVE 0 0 2000', 't 100', 'p', 't 3000', 'p']);
    expect(Number(pwm(out, 0)['0'])).toBeLessThanOrEqual(1060);
    expect(pwm(out, 1)['0']).toBe('2000');
    expect(out.some((l) => l === 'EV DONE id=5')).toBe(true);
  });

  it('modo calibración: un canal por orden y pasos ≤ 50 µs', () => {
    const out = run([
      '> 1 LIMIT 1 1300 1500 1700',
      '> 2 LIMIT 0 1300 1500 1700',
      '> 3 MODE CAL',
      '> 4 ARM',
      '> 5 ENABLE 1 1500',
      '> 6 ENABLE 0 1500',
      '> 7 MOVE 100 1 1560',
      '> 8 MOVE 100 1 1550',
      '> 9 MOVE 100 1 1550 0 1520',
    ]);
    expect(out.find((l) => l.startsWith('ER 7'))).toMatch(/CALSTEP/);
    expect(out).toContain('OK 8 MOVE n=1');
    expect(out.find((l) => l.startsWith('ER 9'))).toMatch(/CALSTEP/);
  });

  it('pérdida de enlace HOLD: detiene trayectoria, mantiene consigna y exige ARM', () => {
    const out = run(['> 1 LIMIT 1 1000 1500 2000', '> 2 ARM', '> 3 ENABLE 1 1500', '> 4 MOVE 5000 1 2000', 't 1000', 't 1200', 'p', '> 5 MOVE 100 1 1600', '> 6 ARM', '> 7 MOVE 100 1 1600']);
    expect(out).toContain('EV LINKLOST llp=HOLD');
    expect(pwm(out)['1']).not.toBe('off');
    expect(out.find((l) => l.startsWith('ER 5'))).toMatch(/STATE/);
    expect(out).toContain('OK 7 MOVE n=1');
  });

  it('pérdida de enlace OFF: corta PWM y desarma', () => {
    const out = run(['> 1 LINK 300 OFF', '> 2 LIMIT 1 1000 1500 2000', '> 3 ARM', '> 4 ENABLE 1 1500', 't 400', 'p', '> 5 STATUS']);
    expect(out).toContain('EV LINKLOST llp=OFF');
    expect(pwm(out)['1']).toBe('off');
    expect(out.find((l) => l.startsWith('OK 5 STATUS'))).toMatch(/arm=0/);
  });

  it('heartbeat evita la pérdida de enlace', () => {
    const script = ['> 1 LIMIT 1 1000 1500 2000', '> 2 ARM', '> 3 ENABLE 1 1500'];
    for (let i = 0; i < 8; i++) script.push('t 500', `> ${10 + i} HB`);
    const out = run(script);
    expect(out.some((l) => l.startsWith('EV LINKLOST'))).toBe(false);
  });

  it('línea demasiado larga y bytes corruptos se rechazan sin bloquear', () => {
    const out = run(['> ' + '9'.repeat(80), '~ 31 20 48 FF 0A', '> 3 HELLO']);
    expect(out).toContain('ER 0 OVERFLOW linea > 63');
    expect(out).toContain('ER 0 SYNTAX caracter invalido');
    expect(out.some((l) => l.startsWith('OK 3 HELLO'))).toBe(true);
  });

  it('DISARM y OFF desactivan señal; PULSES informa consignas escritas', () => {
    const out = run(['> 1 LIMIT 1 1000 1500 2000', '> 2 LIMIT 2 1000 1500 2000', '> 3 ARM', '> 4 ENABLE 1 1500', '> 5 ENABLE 2 1400', '> 6 PULSES', '> 7 OFF 1', 'p', '> 8 DISARM', 'p']);
    expect(out.some((l) => /^PW \d+ 1:1500 2:1400$/.test(l))).toBe(true);
    expect(pwm(out, 0)['1']).toBe('off');
    expect(pwm(out, 0)['2']).toBe('1400');
    expect(pwm(out, 1)['2']).toBe('off');
  });
});
