// Caminata de reposo del visor.
//
// Mientras no hay PWM en ningún canal y el operador no ha tomado el control, el modelo 3D
// reproduce en bucle el trote de 4 patas ya definido en shared/sequences (la misma fórmula
// del sketch fluido). Es SÓLO dibujo: no escribe consignas en el estado, no toca la
// telemetría, no envía nada al robot y no representa la pose real.
//
// Se detiene al activarse PWM o al tomar el control (slider, pose, secuencia, consigna del
// firmware) y se retoma al desactivar PWM, al pulsar DETENER o al cambiar de modo.
import { ALL_JOINTS } from '../../shared/joints';
import { Pose, getSequence } from '../../shared/sequences';
import { DogBotProfile } from '../../shared/profile';
import { AppState, useApp } from '../state/store';

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TROT = getSequence('propuesta-trote-4-patas')!;

/** ¿Debe el visor dibujar la caminata de reposo en este instante? */
export function idleWalkActive(s: AppState): boolean {
  return s.ui.showIdle && !reducedMotion && !s.manualControl && s.link.enabled.length === 0 && !s.seq.playing && !s.calibrationActive;
}

/** Consignas (µs) del trote en el instante t (ms); el visor las convierte a ángulos estimados. */
export function idleWalkPose(tMs: number, profile: DogBotProfile): Pose {
  return TROT.sample(tMs % TROT.durationMs, { profile, amplitude: 1, bandMode: 'sim' });
}

/** Vigila el estado para saber cuándo el operador toma o suelta el control. */
export function initIdleWalk(): () => void {
  return useApp.subscribe((s, prev) => {
    // PWM desactivado en todos los canales, o cambio de modo: vuelve el reposo.
    if ((prev.link.enabled.length > 0 && s.link.enabled.length === 0) || s.mode !== prev.mode) {
      s.setManualControl(false);
      return;
    }
    if (s.manualControl) return;
    if (s.seq.playing && !prev.seq.playing) {
      s.setManualControl(true);
      return;
    }
    if (s.joints === prev.joints) return;
    for (const id of ALL_JOINTS) {
      const a = s.joints[id];
      const b = prev.joints[id];
      if (a === b) continue;
      // Una consigna nueva (no el borrado a null al cortar PWM) es control del operador o del firmware.
      const fresh = a.simUs !== b.simUs || (a.reqUs !== null && a.reqUs !== b.reqUs) || (a.confUs !== null && a.confUs !== b.confUs) || (a.pwUs !== null && a.pwUs !== b.pwUs);
      if (fresh) {
        s.setManualControl(true);
        return;
      }
    }
  });
}
