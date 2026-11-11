// Caminata de reposo: cuándo se dibuja y cuándo cede el control. Es sólo dibujo: no debe
// escribir consignas en el estado.
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_JOINTS } from '../shared/joints';
import { getJoint, sliderRange } from '../shared/profile';
import { idleWalkActive, idleWalkPose, initIdleWalk } from '../src/services/idleWalk';
import { useApp } from '../src/state/store';

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

  it('es sólo dibujo: muestrear la marcha no cambia las consignas y respeta el rango de cada articulación', () => {
    const before = JSON.stringify(st().joints);
    for (let t = 0; t < 12000; t += 137) {
      const pose = idleWalkPose(t, st().profile);
      expect(Object.keys(pose).length).toBe(12);
      for (const id of ALL_JOINTS) {
        const r = sliderRange(getJoint(st().profile, id));
        expect(pose[id]!).toBeGreaterThanOrEqual(r.min);
        expect(pose[id]!).toBeLessThanOrEqual(r.max);
      }
    }
    expect(JSON.stringify(st().joints)).toBe(before);
    expect(st().manualControl).toBe(false);
  });
});
