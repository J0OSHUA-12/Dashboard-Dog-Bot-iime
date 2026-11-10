// Acciones de alto nivel invocadas por el operador (barra superior, teclado).
import { createElement as h } from 'react';
import { useApp } from '../state/store';
import { confirmDialog, toast } from '../components/Dialog';
import { ALL_JOINTS, jointLabel } from '../../shared/joints';
import { getJoint, jointEligibility, TxMode } from '../../shared/profile';
import { stopSequence } from './player';
import { armRobot, client, closePort, disarmRobot, enableJoint, openPort, pwmOffAll, stopReal } from './robotLink';
import { service } from './serviceClient';

const st = () => useApp.getState();

/** DETENER trayectoria: prioridad máxima. No desenergiza servos. */
export async function stopAll() {
  stopSequence('DETENER');
  if (st().mode === 'real' && client.isCompatible) {
    try {
      await stopReal();
      st().addEvent('aviso', 'robot', 'DETENER enviado: trayectorias canceladas; los servos mantienen la última consigna escrita (pueden seguir haciendo fuerza).');
      toast('DETENER: movimiento cancelado. Los servos mantienen su posición (usa PWM OFF para soltarlos).', 'ok');
    } catch (e) {
      st().addEvent('error', 'robot', 'DETENER sin confirmación: ' + (e as Error).message + '. Usa el interruptor físico si es necesario.');
      toast('DETENER sin confirmación del robot: ' + (e as Error).message, 'error');
    }
  } else {
    st().addEvent('info', st().mode === 'sim' ? 'simulación' : 'interfaz', 'DETENER: trayectoria detenida.');
    toast('DETENER: secuencia detenida.', 'ok');
  }
}

/**
 * Interruptor PWM de la barra superior. Con algún canal energizado, corta la
 * señal en TODOS (inmediato, sin diálogo). Sin canales energizados, arma si
 * hace falta y habilita de una vez todos los canales elegibles en su pulso de
 * referencia, tras una única confirmación.
 */
export async function togglePwmAll() {
  if (st().link.enabled.length > 0) return pwmOff();
  return enableAllFlow();
}

export async function enableAllFlow() {
  const s = st();
  if (s.mode !== 'real' || !client.isCompatible) {
    toast('Conecta el robot real (firmware DOGBOT identificado) para habilitar canales.', 'error');
    return;
  }
  const armed = client.state === 'armado';
  const eligibleIn = (m: TxMode) => ALL_JOINTS.filter((id) => jointEligibility(s.profile, id, m).ok).length;
  // Ya armado: se respeta el modo del firmware. Si no, ejecución salvo que la
  // sesión de calibración esté activa o que sólo haya bandas de exploración.
  const mode: TxMode = armed
    ? s.link.fwMode === 'CAL'
      ? 'calibracion'
      : 'coordinado'
    : s.calibrationActive || eligibleIn('calibracion') > eligibleIn('coordinado')
      ? 'calibracion'
      : 'coordinado';
  const rows = ALL_JOINTS.map((id) => ({ id, cfg: getJoint(s.profile, id), e: jointEligibility(s.profile, id, mode) })).filter((x) => x.cfg.canal !== null);
  const todo = rows.filter((x) => x.e.ok && x.e.band && !client.enabled.has(x.cfg.canal!));
  const skipped = rows.filter((x) => !x.e.ok);
  if (!todo.length) {
    toast(skipped.length ? `Ningún canal se puede habilitar. ${jointLabel(skipped[0].id)}: ${skipped[0].e.motivo}` : 'No hay canales asignados en el perfil.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: `Habilitar PWM en ${todo.length} canal(es)`,
    danger: true,
    body: h(
      'div',
      { className: 'list' },
      h(
        'div',
        null,
        armed ? 'El robot ya está armado.' : `Se armará el robot en modo ${mode === 'calibracion' ? 'CALIBRACIÓN' : 'EJECUCIÓN'} y `,
        `se habilitarán estos canales en su pulso de referencia:`,
      ),
      h(
        'div',
        { className: 'mono', style: { fontSize: 12 } },
        todo.map((x) => h('div', { key: x.id }, `CH ${x.cfg.canal} · ${jointLabel(x.id)} → ${x.e.band!.refUs} µs`)),
      ),
      skipped.length
        ? h(
            'div',
            { className: 'note' },
            h('div', null, 'Se omiten:'),
            skipped.map((x) => h('div', { key: x.id }, `CH ${x.cfg.canal} · ${jointLabel(x.id)}: ${x.e.motivo}`)),
          )
        : null,
      h('div', { className: 'note warn' }, 'Sin sensor angular no se conoce la posición física: al habilitar, cada servo va directo a su referencia y puede dar un salto.'),
    ),
    checks: ['Robot sostenido en el soporte, patas libres y zona despejada.', 'Tengo acceso al interruptor físico de la alimentación de servos.'],
    confirmLabel: 'Habilitar todos',
  });
  if (!ok) return;
  try {
    if (client.state !== 'armado') await armRobot(mode);
  } catch (e) {
    st().addEvent('error', 'robot', 'No se pudo armar: ' + (e as Error).message);
    toast('No se pudo armar: ' + (e as Error).message, 'error');
    return;
  }
  const failed: string[] = [];
  for (const x of todo) {
    if (client.state !== 'armado') {
      failed.push(`${jointLabel(x.id)}: el robot dejó de estar armado`);
      continue;
    }
    try {
      await enableJoint(x.id, x.e.band!.refUs);
    } catch (e) {
      failed.push(`${jointLabel(x.id)}: ${(e as Error).message}`);
    }
  }
  const done = todo.length - failed.length;
  if (failed.length) {
    st().addEvent('error', 'robot', `PWM habilitado en ${done}/${todo.length} canal(es). Fallaron: ${failed.join('; ')}`);
    toast(`Habilitados ${done}/${todo.length}. Revisa el registro de eventos.`, 'error');
  } else {
    toast(`PWM habilitado en ${done} canal(es).`, 'ok');
  }
}

export async function pwmOff() {
  stopSequence('Desactivar PWM');
  if (st().mode !== 'real' || !client.isCompatible) return;
  try {
    await pwmOffAll();
    st().addEvent('aviso', 'robot', 'Señal PWM desactivada en todos los canales. Los servos pueden ceder: el robot puede perder apoyo.');
    toast('PWM desactivado en todos los canales.', 'ok');
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
        'Abrir el puerto COM REINICIA el Arduino UNO (un ESP32 puede reiniciarse o no). Si la placa tiene cargado CAMINATA_FLUIDA_PROBADA o CAMINATA_2_0, su setup() moverá los servos por su cuenta. Comprueba qué firmware está cargado.',
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
    toast('Servicio local no disponible: inicia INICIAR_DOGBOT.bat en la computadora donde está conectada la placa.', 'error');
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

/**
 * Cerrar el programa: detiene todo, desarma (corta PWM) si hace falta, libera
 * el puerto COM y apaga el servicio local. La ventana de INICIAR_DOGBOT se
 * cierra sola; la pestaña del navegador se cierra si el navegador lo permite.
 */
export async function closeProgram() {
  const s = st();
  const real = s.mode === 'real' && client.isCompatible;
  const energized = real && (client.state === 'armado' || s.link.enabled.length > 0);
  const ok = await confirmDialog({
    title: 'Cerrar Dog Bot Control',
    danger: energized,
    body: h(
      'div',
      { className: 'list' },
      h('div', null, 'Se detendrá cualquier secuencia, se cerrará el puerto COM y se apagará el servicio local (la ventana negra de INICIAR_DOGBOT).'),
      energized ? h('div', { className: 'note warn' }, 'El robot está armado: se desarmará y se cortará el PWM en todos los canales. Los servos pueden ceder y el robot puede perder apoyo.') : null,
      h('div', null, 'Para volver a usarlo, ejecuta de nuevo INICIAR_DOGBOT.bat.'),
    ),
    confirmLabel: 'Cerrar programa',
  });
  if (!ok) return;
  stopSequence('cerrar programa');
  if (real) {
    try {
      if (client.state === 'armado') await disarmRobot();
      else if (s.link.enabled.length) await pwmOffAll();
    } catch (e) {
      st().addEvent('error', 'robot', 'Al cerrar, el robot no confirmó el desarme: ' + (e as Error).message);
    }
  }
  if (s.link.serial.state === 'abierto') closePort();
  if (service.hasToken) {
    try {
      await service.api('/api/shutdown', { method: 'POST' });
    } catch (e) {
      toast('No se pudo cerrar el servicio local: ' + (e as Error).message, 'error');
      return;
    }
    service.stop();
  }
  st().setClosed(true);
  // Sólo funciona si el navegador lo permite (p. ej. pestaña abierta por script).
  setTimeout(() => window.close(), 300);
}
