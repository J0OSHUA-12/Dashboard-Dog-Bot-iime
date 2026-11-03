// Acciones de alto nivel invocadas por el operador (barra superior, teclado).
import { createElement as h } from 'react';
import { useApp } from '../state/store';
import { confirmDialog, toast } from '../components/Dialog';
import { stopSequence } from './player';
import { armRobot, client, closePort, disarmRobot, openPort, pwmOffAll, stopReal } from './robotLink';

const st = () => useApp.getState();

/** DETENER trayectoria: prioridad máxima. No desenergiza servos. */
export async function stopAll() {
  stopSequence('DETENER');
  if (st().mode === 'real' && client.isCompatible) {
    try {
      await stopReal();
      st().addEvent('aviso', 'robot', 'DETENER enviado: trayectorias canceladas; los servos mantienen la última consigna escrita (pueden seguir haciendo fuerza).');
    } catch (e) {
      st().addEvent('error', 'robot', 'DETENER sin confirmación: ' + (e as Error).message + '. Usa el interruptor físico si es necesario.');
    }
  } else {
    st().addEvent('info', st().mode === 'sim' ? 'simulación' : 'interfaz', 'DETENER: trayectoria detenida.');
  }
}

export async function pwmOff() {
  stopSequence('Desactivar PWM');
  if (st().mode !== 'real' || !client.isCompatible) return;
  try {
    await pwmOffAll();
    st().addEvent('aviso', 'robot', 'Señal PWM desactivada en todos los canales. Los servos pueden ceder: el robot puede perder apoyo.');
  } catch (e) {
    st().addEvent('error', 'robot', 'Desactivar PWM sin confirmación: ' + (e as Error).message + '. Corta la alimentación física si es necesario.');
  }
}

export async function switchMode(mode: 'sim' | 'real') {
  const s = st();
  if (mode === s.mode) return;
  if (mode === 'sim') {
    if (client.state === 'armado') {
      toast('Desarma el robot antes de cambiar a simulación.', 'error');
      return;
    }
    stopSequence('cambio de modo');
    if (s.link.serial.state === 'abierto') closePort();
    client.detach('Cambio a simulación');
    s.setMode('sim');
    return;
  }
  const ok = await confirmDialog({
    title: 'Cambiar a ROBOT REAL',
    body: h(
      'div',
      { className: 'list' },
      h('div', null, 'La pose de la simulación NO se transfiere al robot. Nada se moverá hasta que armes y habilites canales de forma explícita.'),
      h(
        'div',
        { className: 'note warn' },
        'Abrir el puerto COM suele REINICIAR el Arduino UNO. Si la placa tiene cargado CAMINATA_FLUIDA_PROBADA o CAMINATA_2_0, su setup() moverá los servos por su cuenta. Comprueba qué firmware está cargado.',
      ),
    ),
    confirmLabel: 'Entrar en modo ROBOT REAL',
  });
  if (!ok) return;
  stopSequence('cambio de modo');
  s.setMode('real');
}

export async function connect() {
  const s = st();
  if (!s.link.serviceAvailable) {
    toast('Servicio local no disponible: inicia INICIAR_DOGBOT.bat en la computadora con el Arduino.', 'error');
    return;
  }
  if (!s.link.port) {
    toast('Selecciona un puerto COM.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: `Conectar a ${s.link.port}`,
    body: h(
      'div',
      { className: 'list' },
      h('div', null, `Velocidad ${s.link.baud} baudios. El servicio será el único propietario del puerto: cierra el Monitor Serie de Arduino IDE.`),
      h('div', { className: 'note warn' }, 'Al abrir el puerto la placa puede reiniciarse. Un sketch histórico puede moverse solo al arrancar.'),
    ),
    checks: ['El robot está sostenido en el soporte (patas en el aire) o la alimentación de servos está desconectada.'],
    confirmLabel: 'Conectar',
  });
  if (ok) openPort(s.link.port, s.link.baud);
}

export function disconnect() {
  if (client.state === 'armado') {
    toast('Desarma antes de desconectar (o usa DETENER / PWM OFF).', 'error');
    return;
  }
  stopSequence('desconexión');
  closePort();
}

export async function armFlow() {
  const s = st();
  const calib = s.calibrationActive;
  const ok = await confirmDialog({
    title: calib ? 'Armar en modo CALIBRACIÓN' : 'Armar en modo EJECUCIÓN',
    danger: true,
    body: h(
      'div',
      { className: 'list' },
      h(
        'div',
        null,
        calib
          ? 'Calibración: el firmware sólo acepta un canal por orden y pasos ≤ 50 µs, dentro de la banda de exploración que definiste.'
          : 'Ejecución: sólo canales con calibración completa (mínimo < referencia < máximo) reciben límites y pueden moverse.',
      ),
      h(
        'div',
        { className: 'note' },
        `Pérdida de enlace: ${s.link.linkPolicy === 'HOLD' ? 'MANTENER consigna (los servos siguen haciendo fuerza)' : 'CORTAR PWM (el robot puede caer)'} tras ${s.link.linkMs} ms. Ninguna política es segura en todos los ensayos; cámbiala en Perfil → Enlace.`,
      ),
      h('div', null, 'Armar no mueve nada. Después habilita cada canal con un pulso inicial revisado (sin sensor, la primera habilitación puede producir un salto).'),
    ),
    checks: ['Robot sostenido en soporte, patas libres y zona despejada.', 'Alimentación de servos revisada (LiPo/regulador) y acceso al interruptor físico.', 'Firmware DOGBOT identificado en la barra superior.'],
    confirmLabel: 'Armar',
  });
  if (!ok) return;
  try {
    await armRobot(calib ? 'calibracion' : 'coordinado');
  } catch (e) {
    st().addEvent('error', 'robot', 'No se pudo armar: ' + (e as Error).message);
    toast('No se pudo armar: ' + (e as Error).message, 'error');
  }
}

export async function disarmFlow() {
  stopSequence('desarmar');
  try {
    await disarmRobot();
    st().addEvent('aviso', 'robot', 'Desarmado: trayectorias detenidas y señal PWM desactivada en todos los canales.');
  } catch (e) {
    st().addEvent('error', 'robot', 'Desarmar sin confirmación: ' + (e as Error).message);
  }
}
