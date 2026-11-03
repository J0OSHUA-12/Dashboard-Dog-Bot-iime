import { describe, expect, it } from 'vitest';
import {
  ProfileImportError,
  applyRearChannelProposal,
  coordinatedReady,
  createInitialProfile,
  getJoint,
  hasErrors,
  jointEligibility,
  parseProfileJson,
  serializeProfile,
  validateProfile,
} from '../shared/profile';
import { ALL_JOINTS } from '../shared/joints';

describe('perfil inicial', () => {
  it('tiene 12 articulaciones, canales 0–5 probados y posteriores sin asignar', () => {
    const p = createInitialProfile();
    expect(p.joints).toHaveLength(12);
    const chans = p.joints.filter((j) => j.canal !== null).map((j) => j.canal);
    expect(chans.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(p.joints.filter((j) => j.joint.startsWith('P')).every((j) => j.canal === null && j.canalEstado === 'sin-asignar')).toBe(true);
    expect(getJoint(p, 'D1-superior').canal).toBe(0);
    expect(getJoint(p, 'D1-inferior').canal).toBe(1);
    expect(getJoint(p, 'D1-cadera').canal).toBe(2);
    expect(hasErrors(validateProfile(p))).toBe(false);
  });

  it('no autoriza ejecución coordinada ni calibración física sin datos', () => {
    const p = createInitialProfile();
    for (const id of ALL_JOINTS) expect(jointEligibility(p, id, 'coordinado').ok).toBe(false);
    expect(jointEligibility(p, 'D1-inferior', 'calibracion').ok).toBe(false); // falta banda de exploración
    expect(coordinatedReady(p, ['D1-inferior']).ok).toBe(false);
  });

  it('un canal sin asignación nunca es elegible', () => {
    const p = createInitialProfile();
    expect(jointEligibility(p, 'P1-inferior', 'calibracion').motivo).toMatch(/Sin canal/);
  });

  it('la propuesta 6–11 queda como propuesta y sin transmisión', () => {
    const p = applyRearChannelProposal(createInitialProfile());
    const rear = p.joints.filter((j) => j.joint.startsWith('P'));
    expect(rear.map((j) => j.canal).sort((a, b) => a! - b!)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(rear.every((j) => j.canalEstado === 'propuesto' && !j.transmisionPermitida)).toBe(true);
    expect(jointEligibility(p, 'P1-inferior', 'calibracion').ok).toBe(false);
  });

  it('banda de exploración habilita sólo calibración; calibrado habilita coordinado', () => {
    const p = createInitialProfile();
    const j = p.joints.find((x) => x.joint === 'D1-inferior')!;
    j.exploracion = { minUs: 1300, refUs: 1500, maxUs: 1700 };
    expect(jointEligibility(p, 'D1-inferior', 'calibracion').ok).toBe(true);
    expect(jointEligibility(p, 'D1-inferior', 'coordinado').ok).toBe(false);
    Object.assign(j, { minUs: 1250, refUs: 1450, maxUs: 1760, calibracion: { estado: 'calibrado', fecha: '2026-11-04', origen: 'test', notas: '' } });
    const e = jointEligibility(p, 'D1-inferior', 'coordinado');
    expect(e.ok).toBe(true);
    expect(e.band).toEqual({ minUs: 1250, refUs: 1450, maxUs: 1760 });
  });
});

describe('validación e importación', () => {
  it('se guarda y recupera sin perder información', () => {
    const p = createInitialProfile();
    p.joints[1].exploracion = { minUs: 1300, refUs: 1500, maxUs: 1700 };
    p.joints[1].calibracion.notas = 'nota de prueba';
    const back = parseProfileJson(serializeProfile(p)).profile;
    expect(back).toEqual(p);
  });

  it('rechaza JSON inválido, esquema o versión desconocidos', () => {
    expect(() => parseProfileJson('{no json')).toThrow(ProfileImportError);
    expect(() => parseProfileJson(JSON.stringify({ schema: 'otro', version: 1, joints: [] }))).toThrow(/Esquema/);
    expect(() => parseProfileJson(JSON.stringify({ ...createInitialProfile(), version: 9 }))).toThrow(/Versión/);
  });

  it('rechaza canales duplicados', () => {
    const p = createInitialProfile();
    p.joints.find((j) => j.joint === 'D2-superior')!.canal = 0;
    try {
      parseProfileJson(JSON.stringify(p));
      throw new Error('debió rechazar');
    } catch (e) {
      expect(e).toBeInstanceOf(ProfileImportError);
      expect((e as ProfileImportError).issues.some((i) => /duplicado/.test(i.mensaje))).toBe(true);
    }
  });

  it('rechaza canales 12–15 y fuera de rango', () => {
    const p = createInitialProfile();
    p.joints.find((j) => j.joint === 'P1-cadera')!.canal = 13;
    p.joints.find((j) => j.joint === 'P1-cadera')!.canalEstado = 'propuesto';
    expect(() => parseProfileJson(JSON.stringify(p))).toThrow(ProfileImportError);
    const iss = validateProfile(p);
    expect(iss.some((i) => /12–15/.test(i.mensaje))).toBe(true);
  });

  it('rechaza límites desordenados o calibrado incompleto', () => {
    const p = createInitialProfile();
    Object.assign(p.joints[0], { minUs: 1600, refUs: 1500, maxUs: 1700, calibracion: { estado: 'calibrado', fecha: '2026-11-04', origen: 'x', notas: '' } });
    expect(validateProfile(p).some((i) => /mínimo < referencia < máximo/.test(i.mensaje))).toBe(true);
    const q = createInitialProfile();
    Object.assign(q.joints[0], { minUs: 1300, refUs: null, maxUs: 1700, calibracion: { estado: 'calibrado', fecha: '2026-11-04', origen: 'x', notas: '' } });
    expect(hasErrors(validateProfile(q))).toBe(true);
  });

  it('rechaza articulaciones faltantes o desconocidas', () => {
    const p = createInitialProfile();
    expect(() => parseProfileJson(JSON.stringify({ ...p, joints: p.joints.slice(1) }))).toThrow(ProfileImportError);
    const bad = JSON.parse(JSON.stringify(p));
    bad.joints[0].joint = 'D9-codo';
    expect(() => parseProfileJson(JSON.stringify(bad))).toThrow(/desconocida/);
  });
});
