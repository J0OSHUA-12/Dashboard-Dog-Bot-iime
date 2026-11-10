// Pruebas del cliente con un FIRMWARE SIMULADO (transporte simulado, sin hardware).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtocolClient } from '../shared/protocolClient';
import { FakeFirmware } from './support/fakeFirmware';

function setup(opts: { proto?: number; silent?: boolean; mcu?: string | null; fw?: string } = {}) {
  const fw = new FakeFirmware();
  if (opts.proto) fw.proto = opts.proto;
  if (opts.mcu !== undefined) fw.mcu = opts.mcu;
  if (opts.fw) fw.fw = opts.fw;
  if (opts.silent) fw.silent = true;
  const states: string[] = [];
  const resets: string[] = [];
  const client = new ProtocolClient(
    { send: (line, priority) => fw.receive(line, priority) },
    { onState: (s) => states.push(s), onReset: (w) => resets.push(w) },
    { bootWaitMs: 100, flushIntervalMs: 50, requestTimeoutMs: 300, heartbeatMs: 500 },
  );
  fw.out = (l) => client.handleLine(l);
  return { fw, client, states, resets };
}

async function flushAll(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function armWithChannel(fw: FakeFirmware, client: ProtocolClient, ch = 1) {
  client.attach();
  await flushAll(120);
  await client.sendLimit(ch, 1300, 1500, 1700);
  await client.arm();
  await client.enable(ch, 1500);
  fw.received.length = 0;
}

describe('ProtocolClient (firmware simulado)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('al conectar sólo identifica: no envía movimientos', async () => {
    const { fw, client } = setup();
    client.attach();
    await flushAll(120);
    expect(client.state).toBe('desarmado');
    expect(client.firmware?.fw).toBe('0.2.0');
    expect(client.firmware?.mcu).toBe('UNO');
    expect(fw.received.map((r) => r.line.split(' ')[1])).toEqual(['HELLO', 'STATUS']);
  });

  it('un ESP32 con el mismo protocolo se identifica igual y sólo cambia la placa informada', async () => {
    const { fw, client } = setup({ mcu: 'ESP32' });
    client.attach();
    await flushAll(120);
    expect(client.state).toBe('desarmado');
    expect(client.firmware).toMatchObject({ dev: 'DOGBOT', proto: 1, mcu: 'ESP32', freeRam: 287654 });
    expect(fw.received.map((r) => r.line.split(' ')[1])).toEqual(['HELLO', 'STATUS']);
  });

  it('firmware 0.1.0 (sin mcu=) sigue siendo compatible: placa desconocida', async () => {
    const { client } = setup({ mcu: null, fw: '0.1.0' });
    client.attach();
    await flushAll(120);
    expect(client.state).toBe('desarmado');
    expect(client.firmware?.fw).toBe('0.1.0');
    expect(client.firmware?.mcu).toBeNull();
  });

  it('el texto del cargador de arranque del ESP32 antes de BOOT no confunde al cliente', async () => {
    const { fw, client, states } = setup({ mcu: 'ESP32' });
    client.attach();
    for (const l of ['ets Jul 29 2019 12:21:46', '', 'rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)', 'mode:DIO, clock div:1', 'load:0x3fff0030,len:4832', 'entry 0x400805f0', '']) client.handleLine(l);
    expect(client.state).toBe('identificando');
    fw.reboot('E5F6');
    await flushAll(20);
    expect(client.state).toBe('desarmado');
    expect(client.firmware).toMatchObject({ boot: 'E5F6', mcu: 'ESP32' });
    expect(states).not.toContain('firmware-desconocido');
  });

  it('firmware sin protocolo => desconocido, controles bloqueados', async () => {
    const { client } = setup({ silent: true });
    client.attach();
    await flushAll(120);
    await flushAll(400);
    expect(client.state).toBe('firmware-desconocido');
    expect(client.setTarget(1, 1600)).toBe(false);
  });

  it('protocolo distinto => incompatible', async () => {
    const { client } = setup({ proto: 2 });
    client.attach();
    await flushAll(120);
    expect(client.state).toBe('incompatible');
    await expect(client.arm()).rejects.toThrow();
  });

  it('consolida cientos de movimientos de slider en pocas órdenes con la última consigna', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    for (let i = 0; i < 300; i++) client.setTarget(1, 1500 + (i % 150));
    client.setTarget(1, 1650);
    await flushAll(60);
    await flushAll(60);
    const moves = fw.received.filter((r) => r.line.includes(' MOVE '));
    expect(moves.length).toBeLessThanOrEqual(2);
    expect(moves[moves.length - 1].line.endsWith('1 1650')).toBe(true);
    expect(client.confirmed.get(1)).toBe(1650);
  });

  it('DETENER tiene prioridad y descarta consignas pendientes', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    client.setTarget(1, 1690);
    const p = client.stop();
    expect(client.pendingTargets.size).toBe(0);
    await flushAll(60);
    await p;
    const stop = fw.received.find((r) => r.line.includes(' STOP'));
    expect(stop?.priority).toBe(true);
    expect(fw.received.some((r) => r.line.includes(' MOVE '))).toBe(false);
  });

  it('PWM OFF también es prioritario', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    await Promise.all([client.pwmOff('ALL'), flushAll(10)]);
    expect(fw.received.find((r) => r.line.endsWith('OFF ALL'))?.priority).toBe(true);
    expect(client.enabled.size).toBe(0);
  });

  it('rechazo de rango del firmware llega como error claro', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    const p = expect(client.moveNow([{ ch: 1, us: 1800 }], 200)).rejects.toMatchObject({ code: 'RANGE' });
    await flushAll(5);
    await p;
  });

  it('reinicio del firmware: limpia colas, desarma y no reenvía consignas antiguas', async () => {
    const { fw, client, resets } = setup();
    await armWithChannel(fw, client);
    client.setTarget(1, 1600);
    fw.reboot();
    await flushAll(5);
    expect(resets.length).toBe(1);
    await flushAll(100);
    expect(client.state).toBe('desarmado');
    expect(client.enabled.size).toBe(0);
    expect(client.confirmed.size).toBe(0);
    expect(client.pendingTargets.size).toBe(0);
    await flushAll(500);
    expect(fw.received.some((r) => r.line.includes(' MOVE ') || r.line.includes(' ENABLE '))).toBe(false);
  });

  it('reconectar no reproduce consignas anteriores', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    client.setTarget(1, 1620);
    await client.pwmOff('ALL').catch(() => undefined);
    await client.disarm();
    client.detach('Puerto cerrado');
    fw.received.length = 0;
    client.attach();
    await flushAll(120);
    await flushAll(300);
    expect(fw.received.map((r) => r.line.split(' ')[1])).toEqual(['HELLO', 'STATUS']);
    expect(client.state).toBe('desarmado');
  });

  it('si la placa no se reinició y sigue armada: detiene trayectorias, no corta PWM ni reenvía consignas', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    client.setTarget(1, 1620);
    client.detach('Puerto cerrado');
    fw.received.length = 0;
    client.attach();
    await flushAll(120);
    await flushAll(300);
    const cmds = fw.received.map((r) => r.line.split(' ')[1]);
    expect(cmds).toEqual(['HELLO', 'STATUS', 'STOP', 'PULSES']);
    expect(fw.received.find((r) => r.line.endsWith('STOP'))?.priority).toBe(true);
    expect(client.state).toBe('armado');
    expect([...client.enabled]).toEqual([1]);
    expect(client.pendingTargets.size).toBe(0);
  });

  it('líneas corruptas no rompen el cliente', async () => {
    const { fw, client } = setup();
    client.attach();
    await flushAll(120);
    client.handleLine('OK 1 \u0002\u0003');
    client.handleLine('ER zz');
    client.handleLine('PW 10 99:1');
    expect(client.state).toBe('desarmado');
    void fw;
  });

  it('tres solicitudes sin respuesta => fallo de comunicación', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    fw.silent = true;
    const ps = [client.request('STATUS'), client.request('STATUS'), client.request('STATUS')].map((p) => p.catch((e) => e));
    await flushAll(400);
    const errs = await Promise.all(ps);
    expect(errs.every((e) => e.code === 'TIMEOUT')).toBe(true);
    expect(client.state).toBe('fallo');
  });

  it('heartbeat periódico mientras está armado', async () => {
    const { fw, client } = setup();
    await armWithChannel(fw, client);
    await flushAll(1100);
    expect(fw.received.filter((r) => r.line.endsWith(' HB')).length).toBeGreaterThanOrEqual(2);
  });
});
