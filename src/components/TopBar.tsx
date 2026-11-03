import { useApp } from '../state/store';
import { LINK_STATE_LABEL } from '../../shared/protocolClient';
import { armFlow, connect, disarmFlow, disconnect, pwmOff, stopAll, switchMode } from '../services/actions';
import { client, refreshPorts } from '../services/robotLink';
import { IAlert, IChip, IPaw, IPlug, IPower, IRefresh, IStop } from './icons';

export function TopBar() {
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const setLink = useApp((s) => s.setLink);
  const calib = useApp((s) => s.calibrationActive);
  const real = mode === 'real';
  const open = link.serial.state === 'abierto';
  const st = link.state;
  const compatible = st === 'desarmado' || st === 'armado' || st === 'enlace-perdido';
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

      <div className="tb-group">
        <div className="mode-switch" role="group" aria-label="Modo">
          <button className={`sim ${!real ? 'on' : ''}`} onClick={() => switchMode('sim')} aria-pressed={!real}>
            SIMULACIÓN
          </button>
          <button className={`real ${real ? 'on' : ''}`} onClick={() => switchMode('real')} aria-pressed={real}>
            ROBOT REAL
          </button>
        </div>
      </div>

      <div className="tb-group" title={link.serviceAvailable ? `Servicio local ${link.serviceVersion ?? ''}` : 'Servicio local no disponible'}>
        <span className={`dot ${link.serviceAvailable ? 'ok' : 'err'}`} />
        <span className="tb-label tb-hide-narrow">Servicio</span>
        <span className="tb-hide-narrow tb-wide" style={{ color: link.serviceAvailable ? 'var(--text2)' : 'var(--muted)', fontSize: 12 }}>
          {link.serviceAvailable ? (link.controller ? 'local · control' : 'local · sólo vista') : 'no disponible'}
        </span>
      </div>

      <div className="tb-group">
        <span className="tb-label">COM</span>
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
          <button className="btn sm" onClick={disconnect}>
            <IPlug size={14} /> Desconectar
          </button>
        )}
      </div>

      <div className="tb-group" style={{ minWidth: 0 }}>
        <IChip size={15} color="var(--text2)" />
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
            {real ? (link.firmware ? `UNO · ${link.firmware.dev} fw ${link.firmware.fw} · p${link.firmware.proto}` : open ? 'Firmware sin identificar' : 'Sin conexión') : 'Arduino UNO · simulado'}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{real ? (link.firmware ? `boot ${link.firmware.boot} · RAM libre ${link.firmware.freeRam ?? '—'} B` : 'PCA9685 0x40 · 50 Hz') : 'sin hardware'}</div>
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
        <button className="btn stop" onClick={stopAll} title="Detener trayectoria y vaciar la cola (Esc). No desenergiza los servos.">
          <IStop size={13} /> DETENER
        </button>
        <button
          className="btn danger sm"
          onClick={pwmOff}
          disabled={!real || !compatible}
          title="Desactivar señal PWM en todos los canales. Los servos pueden ceder: el robot puede perder apoyo."
        >
          <IPower size={13} /> PWM OFF
        </button>
        <button
          className="btn sm tb-hide-narrow"
          disabled
          title="No hay hardware de corte de energía controlado por software. Usa el interruptor físico de la batería/regulador."
        >
          Corte energía: sin HW
        </button>
      </div>
    </header>
  );
}
