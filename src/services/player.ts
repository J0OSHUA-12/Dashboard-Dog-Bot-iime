// Reproductor de secuencias y generador de telemetría SIMULADA.
//  - SIMULACIÓN: mueve el modelo; nunca transmite.
//  - ROBOT REAL: envía fotogramas (MOVE con duración) cada 100 ms sólo si el
//    perfil está calibrado para todas las articulaciones de la secuencia.
import { JointId, jointLabel } from '../../shared/joints';
import { coordinatedReady, getJoint } from '../../shared/profile';
import { Pose, blendPose, getSequence } from '../../shared/sequences';
import { useApp } from '../state/store';
import { pushSample } from '../state/series';
import { client } from './robotLink';

const st = () => useApp.getState();
const TRANSITION_MS = 1500;
const FRAME_MS = 100;

let timer: ReturnType<typeof setInterval> | null = null;
let startPose: Pose = {};
let t0 = 0;
let runToken = 0;

function currentSimPose(ids: readonly JointId[]): Pose {
  const out: Pose = {};
  for (const id of ids) out[id] = st().joints[id].simUs;
  return out;
}

export function stopSequence(reason: string) {
  runToken++;
  if (timer) clearInterval(timer);
  timer = null;
  const s = st().seq;
  if (s.playing) st().addEvent('info', st().mode === 'sim' ? 'simulación' : 'robot', `Secuencia detenida: ${reason}`);
  st().setSeq({ playing: false, phase: null, startedAt: null });
}

export function canRunPhysically(seqId: string): { ok: boolean; motivo: string } {
  const def = getSequence(seqId);
  if (!def) return { ok: false, motivo: 'Secuencia desconocida' };
  if (!def.fisicoPermitido) return { ok: false, motivo: 'Secuencia sólo de simulación (PROPUESTA).' };
  const r = coordinatedReady(st().profile, def.joints);
  if (!r.ok) return { ok: false, motivo: `Perfil no validado: ${jointLabel(r.faltan[0].joint)} — ${r.faltan[0].motivo}` };
  if (client.state !== 'armado') return { ok: false, motivo: 'El robot debe estar armado.' };
  if (st().link.fwMode !== 'RUN') return { ok: false, motivo: 'Firmware en modo calibración: arma en modo ejecución.' };
  for (const id of def.joints) {
    const c = getJoint(st().profile, id).canal;
    if (c === null || !client.enabled.has(c)) return { ok: false, motivo: `${jointLabel(id)} no está habilitado.` };
  }
  return { ok: true, motivo: '' };
}

export function startSequence(seqId: string) {
  const def = getSequence(seqId);
  if (!def) return;
  stopSequence('reinicio');
  const token = ++runToken;
  const mode = st().mode;
  const amplitude = st().seq.amplitude;
  const ctx = { profile: st().profile, amplitude, bandMode: mode === 'sim' ? ('sim' as const) : ('fisico' as const) };
  const first = def.sample(0, ctx);
  st().setSeq({ id: seqId, playing: true, startedAt: Date.now(), phase: 'transicion' });
  st().addEvent('info', mode === 'sim' ? 'simulación' : 'robot', `Inicio: ${def.nombre} (amplitud ${Math.round(amplitude * 100)} %).`);

  if (mode === 'sim') {
    startPose = currentSimPose(def.joints);
    t0 = performance.now();
    timer = setInterval(() => {
      if (token !== runToken) return;
      const el = performance.now() - t0;
      if (el < TRANSITION_MS) {
        st().setSimPose(blendPose(startPose, first, el / TRANSITION_MS));
        return;
      }
      if (st().seq.phase !== 'secuencia') st().setSeq({ phase: 'secuencia' });
      const t = el - TRANSITION_MS;
      if (t >= def.durationMs) {
        st().setSimPose(def.sample(def.durationMs - 1, ctx));
        stopSequence('completada');
        return;
      }
      st().setSimPose(def.sample(t, ctx));
    }, 30);
    return;
  }

  // ROBOT REAL
  const chk = canRunPhysically(seqId);
  if (!chk.ok) {
    st().addEvent('error', 'robot', 'Secuencia bloqueada: ' + chk.motivo);
    st().setSeq({ playing: false, phase: null });
    return;
  }
  const toTargets = (pose: Pose) =>
    (Object.entries(pose) as [JointId, number][]).map(([id, us]) => ({ ch: getJoint(st().profile, id).canal!, us }));
  client.moveNow(toTargets(first), TRANSITION_MS).catch((e) => {
    st().addEvent('error', 'robot', 'Transición inicial rechazada: ' + (e as Error).message);
    stopSequence('error');
  });
  t0 = performance.now();
  timer = setInterval(() => {
    if (token !== runToken) return;
    if (client.state !== 'armado') {
      stopSequence('enlace no armado');
      return;
    }
    const el = performance.now() - t0;
    if (el < TRANSITION_MS) return;
    if (st().seq.phase !== 'secuencia') st().setSeq({ phase: 'secuencia' });
    const t = el - TRANSITION_MS + FRAME_MS;
    if (t >= def.durationMs + FRAME_MS) {
      stopSequence('completada');
      return;
    }
    const pose = def.sample(Math.min(t, def.durationMs - 1), ctx);
    client.moveNow(toTargets(pose), FRAME_MS).catch((e) => {
      st().addEvent('error', 'robot', 'Fotograma rechazado: ' + (e as Error).message);
      stopSequence('error de firmware');
    });
  }, FRAME_MS);
}

/** Transición a una pose. En ROBOT REAL exige perfil calibrado y canales habilitados. */
export async function applyPose(pose: Pose, nombre: string) {
  const ids = Object.keys(pose) as JointId[];
  stopSequence('se aplica una pose');
  if (st().mode === 'sim') {
    const from = currentSimPose(ids);
    const start = performance.now();
    const token = ++runToken;
    timer = setInterval(() => {
      if (token !== runToken) return;
      const k = (performance.now() - start) / TRANSITION_MS;
      st().setSimPose(blendPose(from, pose, Math.min(1, k)));
      if (k >= 1) {
        if (timer) clearInterval(timer);
        timer = null;
      }
    }, 30);
    st().addEvent('info', 'simulación', `Pose aplicada: ${nombre}`);
    return;
  }
  const r = coordinatedReady(st().profile, ids);
  if (!r.ok) throw new Error(`Perfil no validado para modo físico: ${jointLabel(r.faltan[0].joint)} — ${r.faltan[0].motivo}`);
  if (client.state !== 'armado') throw new Error('El robot debe estar armado.');
  const targets = ids.map((id) => ({ ch: getJoint(st().profile, id).canal!, us: pose[id]! }));
  for (const t of targets) if (!client.enabled.has(t.ch)) throw new Error(`Canal ${t.ch} no habilitado.`);
  await client.moveNow(targets, TRANSITION_MS);
  st().addEvent('ok', 'robot', `Pose enviada (${TRANSITION_MS} ms): ${nombre}`);
}

// ---------------------------------------------------------------- telemetría simulada
let simTimer: ReturnType<typeof setInterval> | null = null;
let prev: Record<string, number> = {};
let noise = 0;

export function startSimTelemetry() {
  if (simTimer) return;
  simTimer = setInterval(() => {
    const s = st();
    if (s.mode !== 'sim') return;
    const now = Date.now();
    let activity = 0;
    for (const j of s.profile.joints) {
      const us = s.joints[j.joint].simUs;
      if (j.canal !== null) pushSample('sim', `ch${j.canal}`, now, us);
      pushSample('sim', `j:${j.joint}`, now, us);
      activity += Math.abs(us - (prev[j.joint] ?? us));
      prev[j.joint] = us;
    }
    prev = { ...prev };
    noise = noise * 0.7 + (Math.random() - 0.5) * 0.3;
    const a = Math.min(1, activity / 400);
    // Señales SINTÉTICAS (no representan mediciones del robot).
    pushSample('sim', 'banco_v', now, +(7.04 - 0.09 * a + noise * 0.02).toFixed(3));
    pushSample('sim', 'corriente_a', now, +(0.2 + 0.25 * a + Math.abs(noise) * 0.03).toFixed(3));
  }, 200);
}
