import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_LEN, ProtocolEncodeError, buildMoveRequests, encodeRequest, parseFirmwareLine } from '../shared/protocol';

describe('codificación', () => {
  it('codifica órdenes acotadas', () => {
    expect(encodeRequest({ id: 7, cmd: 'MOVE', args: [300, 1, 1600] })).toBe('7 MOVE 300 1 1600');
  });
  it('rechaza ids, argumentos o longitudes inválidas', () => {
    expect(() => encodeRequest({ id: 0, cmd: 'HB', args: [] })).toThrow(ProtocolEncodeError);
    expect(() => encodeRequest({ id: 1, cmd: 'HB', args: ['a b'] })).toThrow(ProtocolEncodeError);
    expect(() => encodeRequest({ id: 1, cmd: 'HB', args: ['x\n2 OFF ALL'] })).toThrow(ProtocolEncodeError);
    expect(() => encodeRequest({ id: 1, cmd: 'MOVE', args: Array(30).fill(1000) })).toThrow(/caracteres/);
  });
  it('divide MOVE en líneas que siempre caben en el búfer del firmware', () => {
    let id = 65530;
    const targets = Array.from({ length: 12 }, (_, i) => ({ ch: 11 - i, us: 2500 }));
    const reqs = buildMoveRequests(() => id++, 20000, targets);
    expect(reqs.length).toBe(3);
    for (const r of reqs) expect(encodeRequest(r).length).toBeLessThanOrEqual(MAX_REQUEST_LEN);
  });
});

describe('interpretación de líneas del firmware', () => {
  it('reconoce OK, ER, EV, BOOT y PW', () => {
    expect(parseFirmwareLine('OK 3 HELLO dev=DOGBOT proto=1 fw=0.1.0 boot=93AF ses=4 ch=12')).toMatchObject({ kind: 'ok', id: 3, cmd: 'HELLO', fields: { proto: '1', boot: '93AF' } });
    expect(parseFirmwareLine('ER 9 RANGE fuera de limites')).toMatchObject({ kind: 'err', id: 9, code: 'RANGE', detail: 'fuera de limites' });
    expect(parseFirmwareLine('EV LINKLOST llp=HOLD')).toMatchObject({ kind: 'event', name: 'LINKLOST', fields: { llp: 'HOLD' } });
    expect(parseFirmwareLine('BOOT DOGBOT proto=1 fw=0.1.0 boot=93AF')).toMatchObject({ kind: 'boot', proto: 1, boot: '93AF' });
    expect(parseFirmwareLine('OK 3 HELLO dev=DOGBOT proto=1 fw=0.2.0 boot=6F80 ses=4 ch=12 calstep=50 fr=287654 mcu=ESP32')).toMatchObject({ kind: 'ok', fields: { fr: '287654', mcu: 'ESP32' } });
    expect(parseFirmwareLine('PW 1600 0:1500 1:1562')).toMatchObject({ kind: 'pulses', fwMillis: 1600, pulses: { 0: 1500, 1: 1562 } });
  });
  it('trata la salida de sketches históricos como texto', () => {
    expect(parseFirmwareLine('DOG BOT LISTO').kind).toBe('text');
    expect(parseFirmwareLine('CANAL 1 = 1500 us').kind).toBe('text');
  });
  it('rechaza datos corruptos', () => {
    expect(parseFirmwareLine('OK 3 HE\u0001LLO').kind).toBe('invalid');
    expect(parseFirmwareLine('OK abc HELLO').kind).toBe('invalid');
    expect(parseFirmwareLine('PW 10 1:99999').kind).toBe('invalid');
    expect(parseFirmwareLine('PW 10 33:1500').kind).toBe('invalid');
    expect(parseFirmwareLine('OK 1 STATUS arm').kind).toBe('invalid');
    expect(parseFirmwareLine('x'.repeat(500)).kind).toBe('invalid');
  });
});
