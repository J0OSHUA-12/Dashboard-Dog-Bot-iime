// Modelo 3D y secuencias: cada control mueve la articulación correcta.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ALL_JOINTS, JointId } from '../shared/joints';
import { createInitialProfile, estimatedAngleDeg, getJoint } from '../shared/profile';
import { SEQUENCES, fluidLegOffsets, getSequence } from '../shared/sequences';
import { DogBotModel } from '../src/three/DogBotModel';
import { DEFAULT_MODEL_PARAMS } from '../src/three/modelParams';

function snapshot(m: DogBotModel) {
  const out: Record<string, number[]> = {};
  for (const [leg, rig] of m.legs) {
    out[leg] = [rig.hip.rotation.x, rig.upper.rotation.z, rig.knee.rotation.z];
  }
  return out;
}

describe('modelo 3D articulado', () => {
  const m = new DogBotModel(DEFAULT_MODEL_PARAMS);
  m.indexMeshes();

  it('tiene 4 patas con 3 pivotes y mallas seleccionables por articulación', () => {
    expect(m.legs.size).toBe(4);
    expect(m.pivots.size).toBe(12);
    for (const id of ALL_JOINTS) expect(m.jointMeshes.get(id)?.length ?? 0).toBeGreaterThan(0);
  });

  it('cada uno de los 12 controles gira sólo su propio pivote', () => {
    for (const id of ALL_JOINTS) {
      for (const j of ALL_JOINTS) m.setJointAngle(j, 0);
      const before = snapshot(m);
      m.setJointAngle(id, 25);
      const after = snapshot(m);
      const [leg, kind] = id.split('-');
      const idx = kind === 'cadera' ? 0 : kind === 'superior' ? 1 : 2;
      for (const l of Object.keys(after)) {
        for (let k = 0; k < 3; k++) {
          const changed = Math.abs(after[l][k] - before[l][k]) > 1e-9;
          expect(changed).toBe(l === leg && k === idx);
        }
      }
    }
  });

  it('los pivotes son articulaciones (rodilla al final del tramo superior), no centros de pieza', () => {
    const rig = m.legs.get('D1')!;
    expect(rig.knee.position.y).toBeCloseTo(-DEFAULT_MODEL_PARAMS.thighLength * 0.01, 5);
    // La rodilla gira alrededor de su pivote: el pivote no se desplaza al cambiar su propio ángulo.
    m.setJointAngle('D1-inferior', 0);
    m.root.updateMatrixWorld(true);
    const p0 = rig.knee.getWorldPosition(new THREE.Vector3());
    m.setJointAngle('D1-inferior', 40);
    m.root.updateMatrixWorld(true);
    const p1 = rig.knee.getWorldPosition(new THREE.Vector3());
    expect(p0.distanceTo(p1)).toBeLessThan(1e-9);
  });

  it('abducción positiva lleva la pata hacia afuera en ambos lados', () => {
    for (const leg of ['D1', 'D2'] as const) {
      const rig = m.legs.get(leg)!;
      for (const j of ALL_JOINTS) m.setJointAngle(j, 0);
      m.root.updateMatrixWorld(true);
      const a = rig.foot.getWorldPosition(new THREE.Vector3()).z;
      m.setJointAngle(`${leg}-cadera` as JointId, 20);
      m.root.updateMatrixWorld(true);
      const b = rig.foot.getWorldPosition(new THREE.Vector3()).z;
      expect(Math.sign(b - a)).toBe(rig.side);
    }
  });
});

describe('relación pulso → ángulo ESTIMADO', () => {
  const p = createInitialProfile();
  it('canal 1: +µs extiende (reduce la flexión dibujada)', () => {
    const j = getJoint(p, 'D1-inferior');
    expect(estimatedAngleDeg(j, 1600)).toBeLessThan(estimatedAngleDeg(j, 1500));
  });
  it('canal 0: +µs lleva la pata hacia atrás', () => {
    const j = getJoint(p, 'D1-superior');
    expect(estimatedAngleDeg(j, 1600)).toBeLessThan(estimatedAngleDeg(j, 1500));
  });
  it('canal 2: +µs abre hacia afuera', () => {
    const j = getJoint(p, 'D1-cadera');
    expect(estimatedAngleDeg(j, 1600)).toBeGreaterThan(estimatedAngleDeg(j, 1500));
  });
});

describe('secuencias', () => {
  it('reproduce la fórmula del sketch fluido', () => {
    // fase 0: avance = -190, sin elevación
    expect(fluidLegOffsets(0)).toEqual({ avance: -190, flexion: 0, apertura: 0 });
    // mitad del vuelo: elevación máxima (FLEXION=175, APERTURA=45)
    const mid = fluidLegOffsets(0.215);
    expect(mid.flexion).toBeCloseTo(175, 5);
    expect(mid.apertura).toBeCloseTo(45, 5);
  });

  it('la secuencia delantera usa la referencia del perfil y respeta límites calibrados en modo físico', () => {
    const p = createInitialProfile();
    for (const id of ['D1-superior', 'D1-inferior', 'D1-cadera', 'D2-superior', 'D2-inferior', 'D2-cadera'] as const) {
      Object.assign(getJoint(p, id), { minUs: 1450, refUs: 1500, maxUs: 1550, calibracion: { estado: 'calibrado', fecha: 'x', origen: 'test', notas: '' } });
    }
    const seq = getSequence('ensayo-suspendido-delanteras')!;
    for (let t = 0; t < seq.durationMs; t += 50) {
      const pose = seq.sample(t, { profile: p, amplitude: 1, bandMode: 'fisico' });
      expect(Object.keys(pose).every((k) => k.startsWith('D'))).toBe(true);
      for (const v of Object.values(pose)) {
        expect(v).toBeGreaterThanOrEqual(1450);
        expect(v).toBeLessThanOrEqual(1550);
      }
    }
  });

  it('la propuesta de 4 patas no es transmisible', () => {
    expect(SEQUENCES.find((s) => s.id === 'propuesta-trote-4-patas')!.fisicoPermitido).toBe(false);
  });
});
