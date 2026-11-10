// Puente entre el estado de la interfaz, el cliente de protocolo y el
// servicio local. Sólo actúa en modo ROBOT REAL y por acción del operador.
import { ALL_JOINTS, JointId, jointLabel } from '../../shared/joints';
import { getJoint, jointEligibility, TxMode } from '../../shared/profile';
import { FIRMWARE_BAUD } from '../../shared/protocol';
import { LINK_STATE_LABEL, ProtocolClient } from '../../shared/protocolClient';
import { useApp } from '../state/store';
import { clearSpace, pushSample } from '../state/series';
import { service } from './serviceClient';

const st = () => useApp.getState();

export const client = new ProtocolClient(
  {
    send(line, priority) {
      if (!service.send({ t: 'send', line, priority })) {
        st().addEvent('error', 'servicio', `No se pudo enviar "${line}": servicio desconectado.`);
      }
    },
  },
  {
    onState(s, why) {
      st().setLink({ state: s });
      const level = s === 'fallo' || s === 'enlace-perdido' || s === 'incompatible' ? 'error' : s === 'firmware-desconocido' ? 'aviso' : 'info';
      st().addEvent(level, 'robot', `Enlace: ${LINK_STATE_LABEL[s]} — ${why}`);
      if (s !== 'armado') {
        // Sin reenvío de consignas antiguas: se olvidan las solicitudes.
        for (const id of ALL_JOINTS) st().patchJointRt(id, { reqUs: null });
      }
    },
    onLog(l) {
      if (l.level === 'tx' || l.level === 'rx') return;
      st().addEvent(l.level === 'error' ? 'error' : l.level === 'aviso' ? 'aviso' : 'info', 'robot', l.text);
    },
    onFirmware(info) {
      st().setLink({ firmware: info });
      if (info) st().addEvent('ok', 'robot', `Firmware ${info.dev} v${info.fw} (protocolo ${info.proto}, boot ${info.boot}).`);
    },
    onConfirmed(ch, us, at) {
      const j = jointForChannel(ch);
      if (j) st().patchJointRt(j, { confUs: us, confAt: at });
    },
    onPulses(pulses, _fwMillis, at) {
      st().setLink({ lastRxAt: at });
      for (const [chS, us] of Object.entries(pulses)) {
        const ch = Number(chS);
        const j = jointForChannel(ch);
        if (j) st().patchJointRt(j, { pwUs: us, pwAt: at });
        pushSample('real', `ch${ch}`, at, us);
      }
    },
    onEnabled(set) {
      st().setLink({ enabled: [...set].sort((a, b) => a - b) });
    },
    onReset(why) {
      st().addEvent('aviso', 'robot', `${why}. Las consignas pendientes se descartaron; el robot queda desarmado.`);
      for (const id of ALL_JOINTS) st().patchJointRt(id, { reqUs: null, confUs: null, confAt: null, pwUs: null, pwAt: null });
    },
    onRtt(ms, at) {
      st().setLink({ rttMs: ms, rttAt: at, lastRxAt: at });
      pushSample('real', 'rtt', at, ms);
    },
  },
);

export function jointForChannel(ch: number): JointId | null {
  const j = st().profile.joints.find((x) => x.canal === ch);
  return j ? j.joint : null;
}

let wired = false;
export function initService() {
  if (wired) return;
  wired = true;
  service.onStatus((up) => {
    st().setLink({ serviceAvailable: up, serviceChecked: true });
    if (up) {
      st().addEvent('ok', 'servicio', 'Servicio local conectado.');
      service.send({ t: 'list-ports' });
    } else if (st().link.serviceChecked) {
      if (client.state !== 'desconectado') client.detach('Servicio local desconectado');
    }
  });
  service.on((m) => {
    switch (m.t) {
      case 'hello':
        st().setLink({ controller: m.controller, serviceVersion: m.service });
        break;
      case 'control':
        st().setLink({ controller: m.controller });
        st().addEvent(m.controller ? 'info' : 'aviso', 'servicio', m.controller ? 'Esta pestaña controla el robot.' : 'Otra pestaña tomó el control.');
        break;
      case 'ports': {
        st().setLink({ ports: m.ports });
        // El puerto recordado puede ya no existir (p. ej. COM7 de otra sesión o de otra placa). Un <select>
        // cuyo valor no está en la lista MUESTRA la primera opción pero conserva el valor viejo, y ese
        // valor fantasma es el que se usaría para conectar y para subir. Se reemplaza por uno real.
        const cur = st().link.port;
        if (m.ports.length && !m.ports.some((x) => x.path === cur)) {
          const p = m.ports.find((x) => x.likelyBoard) ?? m.ports[0];
          st().setLink({ port: p.path });
        } else if (!m.ports.length && cur) {
          st().setLink({ port: '' });
        }
        break;
      }
      case 'serial': {
        const prev = st().link.serial.state;
        st().setLink({ serial: m.status });
        if (m.status.state === 'abierto' && prev !== 'abierto') {
          st().addSerial('info', `Puerto ${m.status.path} abierto a ${m.status.baud} baudios.`);
          clearSpace('real');
          if (st().mode === 'real') client.attach();
        } else if (m.status.state === 'liberado-para-carga') {
          client.markUploading();
        } else if (m.status.state !== 'abierto' && prev === 'abierto') {
          client.detach(m.status.error ?? 'Puerto cerrado', m.status.state === 'error' ? 'fallo' : 'desconectado');
          if (m.status.diagnostic) st().addEvent('error', 'robot', m.status.diagnostic);
        } else if (m.status.state === 'error' && m.status.diagnostic) {
          st().addEvent('error', 'robot', `${m.status.error ?? ''} — ${m.status.diagnostic}`);
        }
        break;
      }
      case 'rx':
        st().addSerial('rx', m.line);
        st().setLink({ lastRxAt: m.at });
        if (st().mode === 'real') client.handleLine(m.line);
        break;
      case 'tx':
        st().addSerial('tx', m.line + (m.priority ? '   [prioridad]' : ''));
        break;
      case 'dropped':
        st().addEvent('aviso', 'servicio', `${m.count} orden(es) descartadas: ${m.reason}`);
        break;
      case 'error':
        st().addEvent('error', 'servicio', m.message);
        break;
    }
  });
  service.start();
}

export function refreshPorts() {
  service.send({ t: 'list-ports' });
}

export function openPort(path: string, baud = FIRMWARE_BAUD) {
  if (st().mode !== 'real') return;
  st().addEvent('info', 'robot', `Conectando a ${path} (${baud} baudios). La placa puede reiniciarse al abrir el puerto.`);
  service.send({ t: 'open', path, baud });
}

export function closePort() {
  service.send({ t: 'close' });
}

/** Envía LIMIT para las articulaciones elegibles en el modo dado. Nada se mueve. */
export async function pushLimits(mode: TxMode): Promise<number> {
  const p = st().profile;
  let n = 0;
  for (const id of ALL_JOINTS) {
    const j = getJoint(p, id);
    const e = jointEligibility(p, id, mode);
    if (!e.ok || !e.band || j.canal === null) continue;
    if (client.enabled.has(j.canal)) continue;
    await client.sendLimit(j.canal, e.band.minUs, e.band.refUs, e.band.maxUs);
    n++;
  }
  return n;
}

export async function armRobot(mode: TxMode) {
  const l = st().link;
  await client.configure(l.linkMs, l.linkPolicy, 250, 20);
  const fwMode = mode === 'calibracion' ? 'CAL' : 'RUN';
  await client.setMode(fwMode);
  st().setLink({ fwMode });
  const n = await pushLimits(mode);
  await client.arm();
  st().addEvent('ok', 'robot', `Armado en modo ${fwMode === 'CAL' ? 'CALIBRACIÓN (pasos ≤ 50 µs, un canal por orden)' : 'EJECUCIÓN'}; ${n} canal(es) con límites enviados. Ningún canal habilitado todavía.`);
}

export async function enableJoint(id: JointId, us: number) {
  const j = getJoint(st().profile, id);
  if (j.canal === null) throw new Error('Sin canal');
  const mode: TxMode = st().link.fwMode === 'CAL' ? 'calibracion' : 'coordinado';
  const e = jointEligibility(st().profile, id, mode);
  if (!e.ok || !e.band) throw new Error(e.motivo);
  if (!client.enabled.has(j.canal)) await client.sendLimit(j.canal, e.band.minUs, e.band.refUs, e.band.maxUs);
  await client.enable(j.canal, us);
  st().patchJointRt(id, { reqUs: us });
  st().addEvent('ok', 'robot', `${jointLabel(id)} (canal ${j.canal}) habilitado en ${us} µs.`);
}

export async function disableJoint(id: JointId) {
  const j = getJoint(st().profile, id);
  if (j.canal === null) return;
  await client.pwmOff(j.canal);
  st().patchJointRt(id, { reqUs: null, pwUs: null });
  st().addEvent('aviso', 'robot', `${jointLabel(id)}: señal PWM desactivada (el servo puede ceder).`);
}

/** Slider en ROBOT REAL: consigna consolidada (no se encolan cientos de órdenes). */
export function requestReal(id: JointId, us: number): boolean {
  const j = getJoint(st().profile, id);
  if (j.canal === null) return false;
  const ok = client.setTarget(j.canal, us);
  if (ok) st().patchJointRt(id, { reqUs: Math.round(us) });
  return ok;
}

export async function stopReal() {
  await client.stop();
}

export async function pwmOffAll() {
  await client.pwmOff('ALL');
  for (const id of ALL_JOINTS) st().patchJointRt(id, { reqUs: null, pwUs: null });
}

export async function disarmRobot() {
  await client.disarm();
  for (const id of ALL_JOINTS) st().patchJointRt(id, { reqUs: null, pwUs: null });
}
