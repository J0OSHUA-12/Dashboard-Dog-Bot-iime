// Caminata de reposo: cuándo se dibuja y cuándo cede el control. Es sólo dibujo: no debe
// escribir consignas en el estado.
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_JOINTS, LEGS, LegId } from '../shared/joints';
import { idleWalkActive, initIdleWalk } from '../src/services/idleWalk';
import { useApp } from '../src/state/store';
import { DogBotModel } from '../src/three/DogBotModel';
import { GAIT_CYCLE_MS, GAIT_DUTY, GAIT_SPEED, gaitPhase, idleGait } from '../src/three/idleGait';
import { DEFAULT_MODEL_PARAMS } from '../src/three/modelParams';

const st = () => useApp.getState();

describe('caminata de reposo', () => {
  let stop: () => void;
  beforeEach(() => {
    stop?.();
    st().setManualControl(false);
    st().setLink({ enabled: [] });
    st().setSeq({ playing: false });
    st().setCalibrationActive(false);
    st().setUi({ showIdle: true });
    stop = initIdleWalk();
  });

  it('está activa con PWM apagado y sin control manual', () => {
    expect(idleWalkActive(st())).toBe(true);
  });

  it('cede el control al mover un slider y no lo recupera sola', () => {
    st().setSimUs('D1-inferior', st().joints['D1-inferior'].simUs + 10);
    expect(st().manualControl).toBe(true);
    expect(idleWalkActive(st())).toBe(false);
  });

  it('se detiene en cuanto hay PWM en algún canal y se retoma al apagarlo', () => {
    st().setLink({ enabled: [1] });
    expect(idleWalkActive(st())).toBe(false);
    st().patchJointRt('D1-inferior', { reqUs: 1500, pwUs: 1500 });
    expect(st().manualControl).toBe(true);
    // PWM OFF: el firmware borra las consignas; eso no cuenta como control nuevo.
    for (const id of ALL_JOINTS) st().patchJointRt(id, { reqUs: null, pwUs: null });
    st().setLink({ enabled: [] });
    expect(st().manualControl).toBe(false);
    expect(idleWalkActive(st())).toBe(true);
  });

  it('no corre durante una secuencia, una sesión de calibración ni con la capa apagada', () => {
    st().setSeq({ playing: true });
    expect(idleWalkActive(st())).toBe(false);
    st().setSeq({ playing: false });
    st().setManualControl(false);
    st().setCalibrationActive(true);
    expect(idleWalkActive(st())).toBe(false);
    st().setCalibrationActive(false);
    st().setUi({ showIdle: false });
    expect(idleWalkActive(st())).toBe(false);
  });

  it('es sólo dibujo: muestrear la marcha no cambia las consignas ni toma el control', () => {
    const before = JSON.stringify(st().joints);
    for (let t = 0; t < 6000; t += 137) idleGait(t, DEFAULT_MODEL_PARAMS);
    expect(JSON.stringify(st().joints)).toBe(before);
    expect(st().manualControl).toBe(false);
  });
});

describe('marcha de reposo: contacto con el suelo', () => {
  const m = new DogBotModel(DEFAULT_MODEL_PARAMS);
  const footAt = (leg: LegId) => m.legs.get(leg)!.foot.getWorldPosition(new THREE.Vector3());
  const apply = (t: number) => {
    const g = idleGait(t, DEFAULT_MODEL_PARAMS);
    for (const id of ALL_JOINTS) m.setJointAngle(id, g.angles[id]);
    m.root.position.y = m.standHeight + g.bob;
    m.root.updateMatrixWorld(true);
  };
  // Altura del pie en la pose de referencia: la del apoyo.
  for (const id of ALL_JOINTS) m.setJointAngle(id, id.endsWith('superior') ? -30 : id.endsWith('inferior') ? 60 : 0);
  m.root.position.y = m.standHeight;
  m.root.updateMatrixWorld(true);
  const ground = Object.fromEntries(LEGS.map((l) => [l, footAt(l).y])) as Record<LegId, number>;

  it('en la pose de referencia las cuatro patas quedan a la misma altura', () => {
    for (const l of LEGS) expect(ground[l]).toBeCloseTo(ground.D1, 9);
  });

  it('en apoyo, las cuatro patas (D2 incluida) pisan al mismo nivel y no patinan', () => {
    const DT = 8;
    const prevX = {} as Record<LegId, number | null>;
    for (const l of LEGS) prevX[l] = null;
    const stanceSamples = {} as Record<LegId, number>;
    for (const l of LEGS) stanceSamples[l] = 0;
    for (let t = 0; t <= GAIT_CYCLE_MS * 2; t += DT) {
      apply(t);
      let down = 0;
      for (const l of LEGS) {
        const f = gaitPhase(t, l);
        const p = footAt(l);
        if (f < GAIT_DUTY) {
          down++;
          stanceSamples[l]++;
          // 1 u = 100 mm: tolerancia de 0,05 mm en altura.
          expect(Math.abs(p.y - ground[l])).toBeLessThan(5e-4);
          // El pie apoyado retrocede a la velocidad con la que avanza el suelo.
          if (prevX[l] !== null) expect((prevX[l]! - p.x) / (DT / 1000)).toBeCloseTo(GAIT_SPEED, 2);
          prevX[l] = p.x;
        } else {
          prevX[l] = null;
          expect(p.y).toBeGreaterThan(ground[l] - 5e-4);
        }
      }
      // Trote: siempre hay al menos una diagonal apoyada.
      expect(down).toBeGreaterThanOrEqual(2);
    }
    for (const l of LEGS) expect(stanceSamples[l]).toBe(stanceSamples.D1);
  });

  it('todas las patas hacen el mismo movimiento, desfasado por diagonales', () => {
    for (let t = 0; t < GAIT_CYCLE_MS; t += 50) {
      const a = idleGait(t, DEFAULT_MODEL_PARAMS).angles;
      const b = idleGait(t + GAIT_CYCLE_MS / 2, DEFAULT_MODEL_PARAMS).angles;
      for (const k of ['superior', 'inferior', 'cadera'] as const) {
        expect(a[`D2-${k}`]).toBeCloseTo(b[`D1-${k}`], 6);
        expect(a[`P1-${k}`]).toBeCloseTo(a[`D2-${k}`], 9);
        expect(a[`P2-${k}`]).toBeCloseTo(a[`D1-${k}`], 9);
      }
    }
  });
});
