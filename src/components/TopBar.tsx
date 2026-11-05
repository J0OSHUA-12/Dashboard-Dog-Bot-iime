import { useApp } from '../state/store';
import { LINK_STATE_LABEL } from '../../shared/protocolClient';
import { armFlow, closeProgram, connect, disarmFlow, disconnect, stopAll, switchMode, togglePwmAll } from '../services/actions';
import { client, refreshPorts } from '../services/robotLink';
import { IAlert, IChip, IExit, IMoon, IPaw, IPlug, IPower, IRefresh, IStop, ISun } from './icons';

export function TopBar() {
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const setLink = useApp((s) => s.setLink);
  const calib = useApp((s) => s.calibrationActive);
  const theme = useApp((s) => s.ui.theme);
  const setUi = useApp((s) => s.setUi);
  const real = mode === 'real';
  const open = link.serial.state === 'abierto';
  const st = link.state;
  const compatible = st === 'desarmado' || st === 'armado' || st === 'enlace-perdido';
  const pwmCount = link.enabled.length;
  const pwmOn = real && pwmCount > 0;
  const stateTone =
    st === 'armado' ? 'orange' : st === 'desarmado' ? 'ok' : st === 'fallo' || st === 'incompatible' || st === 'enlace-perdido' ? 'err' : st === 'firmware-desconocido' ? 'warn' : '';

  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo">
          <IPaw size={18} color="#1a0e05" />
        </div>
        <div>
          Dog Bot Control
          <small>ESTACIÓN DE CONTROL · v0.1</small>
        </div>
      </div>

      {__PREVIEW_BUILD__ && (
        <span className="tag sim" title="Esta vista previa no tiene servicio local: sin COM, sin Arduino CLI. Instala la app en Windows para usar el robot.">
          VISTA PREVIA WEB
        </span>
      )}
      <div className="tb-group">
        <div className="mode-switch" role="group" aria-label="Modo">
          <button className={`sim ${!real ? 'on' : ''}`} onClick={() => switchMode('sim')} aria-pressed={!real}>
            SIMULACIÓN
          </button>
          <button
            className={`real ${real ? 'on' : ''}`}
            onClick={() => switchMode('real')}
            aria-pressed={real}
            disabled={__PREVIEW_BUILD__}
            title={__PREVIEW_BUILD__ ? 'Vista previa web: el modo ROBOT REAL requiere el servicio local en Windows' : ''}
          >
            ROBOT REAL
          </button>
        </div>
      </div>

      <div className="tb-group" title={link.serviceAvailable ? `Servicio local ${link.serviceVersion ?? ''}` : 'Servicio local no disponible'}>
        <span className={`dot ${link.serviceAvailable ? 'ok' : 'err'}`} />
        <span className="tb-label tb-hide-narrow tb-wide">Servicio</span>
        <span className="tb-hide-narrow tb-wide" style={{ color: link.serviceAvailable ? 'var(--text2)' : 'var(--muted)', fontSize: 12 }}>
          {link.serviceAvailable ? (link.controller ? 'local · control' : 'local · sólo vista') : 'no disponible'}
        </span>
      </div>

      <div className="tb-group">
        <span className="tb-label tb-wide">COM</span>
        <select
          className="field mono"
          style={{ width: 112 }}
          value={link.port}
          disabled={!link.serviceAvailable || open}
          onChange={(e) => setLink({ port: e.target.value })}
          aria-label="Puerto COM"
        >
          {link.ports.length === 0 && <option value="">{link.serviceAvailable ? 'Sin puertos' : '—'}</option>}
          {link.ports.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
              {p.likelyArduino ? ' · Arduino' : ''}
            </option>
          ))}
        </select>
        <select
          className="field mono tb-hide-narrow tb-wide"
          style={{ width: 74 }}
          value={link.baud}
          disabled={!link.serviceAvailable || open}
          onChange={(e) => setLink({ baud: Number(e.target.value) })}
          aria-label="Baudios"
          title="115200 = firmware DogBotDashboard · 9600 = sketches históricos"
        >
          {[115200, 57600, 9600].map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <button className="btn sm icon ghost" onClick={refreshPorts} disabled={!link.serviceAvailable} title="Actualizar puertos" aria-label="Actualizar puertos">
          <IRefresh size={14} />
        </button>
        {!open ? (
          <button className="btn sm" disabled={!real || !link.serviceAvailable || !link.controller} onClick={connect} title={!real ? 'Disponible en modo ROBOT REAL' : ''}>
            <IPlug size={14} /> Conectar
          </button>
        ) : (
          <button className="btn sm" onClick={disconnect} title="Desconectar">
            <IPlug size={14} /> <span className="tb-wide">Desconectar</span>
            <span className="tb-narrow-only">Desc.</span>
          </button>
        )}
      </div>

      <div className="tb-group" style={{ minWidth: 0 }}>
        <IChip size={15} color="var(--text2)" className="tb-wide" />
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
            {real ? (link.firmware ? `UNO · ${link.firmware.dev} fw ${link.firmware.fw} · p${link.firmware.proto}` : open ? 'Firmware sin identificar' : 'Sin conexión') : 'Arduino UNO · simulado'}
          </div>
          <div className="tb-wide" style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{real ? (link.firmware ? `boot ${link.firmware.boot} · RAM libre ${link.firmware.freeRam ?? '—'} B` : 'PCA9685 0x40 · 50 Hz') : 'sin hardware'}</div>
        </div>
        {real && (
          <span className={`tag ${stateTone}`} title={LINK_STATE_LABEL[st]}>
            {(st === 'fallo' || st === 'incompatible' || st === 'enlace-perdido') && <IAlert size={11} />}
            {LINK_STATE_LABEL[st].toUpperCase()}
          </span>
        )}
        {real && compatible && st !== 'armado' && (
          <button className="btn sm" onClick={armFlow} title={calib ? 'Armar para calibración' : 'Armar para ejecución'}>
            Armar{calib ? ' (calib.)' : ''}
          </button>
        )}
        {real && st === 'armado' && (
          <button className="btn sm" onClick={disarmFlow}>
            Desarmar
          </button>
        )}
        {real && (st === 'firmware-desconocido' || st === 'fallo') && open && (
          <button className="btn sm" onClick={() => client.identify().catch(() => undefined)}>
            Reintentar identificación
          </button>
        )}
      </div>

      <div className="spacer" />

      <div className="stop-cluster">
        <button className="btn stop" onClick={stopAll} title="Parada de emergencia (Esc): cancela la secuencia/trayectoria en curso. NO cierra el programa ni desenergiza los servos (para eso: PWM OFF o Cerrar).">
          <IStop size={13} /> DETENER
        </button>
        {pwmOn ? (
          <button
            className="btn danger sm"
            onClick={togglePwmAll}
            aria-pressed
            title={`PWM activo en ${pwmCount} canal(es). Clic: desactivar la señal en TODOS. Los servos pueden ceder: el robot puede perder apoyo.`}
          >
            <IPower size={13} /> PWM OFF
            <span className="tb-wide mono" style={{ opacity: 0.75 }}>· {pwmCount}</span>
          </button>
        ) : (
          <button
            className="btn sm pwm-on"
            onClick={togglePwmAll}
            aria-pressed={false}
            disabled={!real || !compatible || st === 'enlace-perdido' || !link.controller}
            title={
              !real
                ? 'Disponible en modo ROBOT REAL'
                : !compatible
                  ? 'Conecta el robot y espera a que se identifique el firmware DOGBOT'
                  : 'Armar (si hace falta) y habilitar PWM en todos los canales elegibles, en su pulso de referencia. Pide confirmación.'
            }
          >
            <IPower size={13} /> PWM ON
          </button>
        )}
        <button
          className="btn sm tb-hide-narrow"
          disabled
          title="No hay hardware de corte de energía controlado por software. Usa el interruptor físico de la batería/regulador."
        >
          Corte energía: sin HW
        </button>
        <button
          className="btn sm icon ghost"
          onClick={() => setUi({ theme: theme === 'dark' ? 'light' : 'dark' })}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? <ISun size={15} /> : <IMoon size={15} />}
        </button>
        <button className="btn sm" onClick={closeProgram} title="Cerrar el programa: detiene, desarma, libera el COM y apaga el servicio local.">
          <IExit size={14} /> <span className="tb-wide">Cerrar</span>
        </button>
      </div>
    </header>
  );
}
