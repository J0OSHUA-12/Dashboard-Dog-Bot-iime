// Puesta en marcha: 1 modo → 2 puerto → 3 armar, y estado del servicio/firmware.
// Mismos controles y acciones en la barra superior (ventanas estrechas) y en el
// panel «Conexión» del HUD; sólo cambia la disposición.
import { useApp } from '../state/store';
import { LINK_STATE_LABEL, LinkState } from '../../shared/protocolClient';
import { armFlow, connect, disarmFlow, disconnect, switchMode } from '../services/actions';
import { client, refreshPorts } from '../services/robotLink';
import { IAlert, IChip, IPlug, IRefresh } from './icons';

export function linkTone(st: LinkState): '' | 'orange' | 'ok' | 'err' | 'warn' {
  return st === 'armado' ? 'orange' : st === 'desarmado' ? 'ok' : st === 'fallo' || st === 'incompatible' || st === 'enlace-perdido' ? 'err' : st === 'firmware-desconocido' ? 'warn' : '';
}

export function isCompatible(st: LinkState) {
  return st === 'desarmado' || st === 'armado' || st === 'enlace-perdido';
}

export function ModeSwitch() {
  const real = useApp((s) => s.mode === 'real');
  return (
    <div className="mode-switch" role="group" aria-label="Modo">
      <button className={`sim ${!real ? 'on' : ''}`} onClick={() => switchMode('sim')} aria-pressed={!real}>
        Simulación
      </button>
      <button
        className={`real ${real ? 'on' : ''}`}
        onClick={() => switchMode('real')}
        aria-pressed={real}
        disabled={__PREVIEW_BUILD__}
        title={__PREVIEW_BUILD__ ? 'Vista previa web: el modo ROBOT REAL requiere el servicio local en Windows' : ''}
      >
        Robot real
      </button>
    </div>
  );
}

export function LinkStateTag() {
  const st = useApp((s) => s.link.state);
  return (
    <span className={`tag ${linkTone(st)}`} title={LINK_STATE_LABEL[st]}>
      {(st === 'fallo' || st === 'incompatible' || st === 'enlace-perdido') && <IAlert size={11} />}
      {LINK_STATE_LABEL[st]}
    </span>
  );
}

/** `bar`: fila compacta de la barra superior. `panel`: pasos apilados con título. */
export function ConnectionFlow({ layout }: { layout: 'bar' | 'panel' }) {
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const setLink = useApp((s) => s.setLink);
  const calib = useApp((s) => s.calibrationActive);
  const real = mode === 'real';
  const open = link.serial.state === 'abierto';
  const st = link.state;
  const compatible = isCompatible(st);
  const panel = layout === 'panel';

  // Paso siguiente del flujo de puesta en marcha (sólo indicación visual).
  const canConnect = real && link.serviceAvailable && link.controller;
  const next: 1 | 2 | 3 | 0 = !real ? 1 : !open ? 2 : compatible && st !== 'armado' ? 3 : 0;

  return (
    <div className={`flow ${panel ? 'stacked' : ''}`} role="group" aria-label="Puesta en marcha">
      <div className={`flow-step ${next === 1 ? 'next' : 'done'}`}>
        <span className="flow-num" aria-hidden="true">
          1
        </span>
        {panel && <span className="flow-title">Modo</span>}
        <div className="flow-controls">
          <ModeSwitch />
        </div>
      </div>

      <div className={`flow-step ${next === 2 ? 'next' : open ? 'done' : ''}`}>
        <span className="flow-num" aria-hidden="true">
          2
        </span>
        {panel && <span className="flow-title">Puerto serie</span>}
        <div className="flow-controls">
          <select
            className="field mono"
            style={{ width: panel ? undefined : 112 }}
            value={link.port}
            disabled={!link.serviceAvailable || open}
            onChange={(e) => setLink({ port: e.target.value })}
            aria-label="Puerto COM"
          >
            {link.ports.length === 0 && <option value="">{link.serviceAvailable ? 'Sin puertos' : 'COM —'}</option>}
            {link.ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
                {p.hint ? ` · ${p.hint}` : ''}
              </option>
            ))}
          </select>
          <select
            className={`field mono ${panel ? '' : 'tb-hide-narrow tb-wide'}`}
            style={{ width: panel ? 96 : 80 }}
            value={link.baud}
            disabled={!link.serviceAvailable || open}
            onChange={(e) => setLink({ baud: Number(e.target.value) })}
            aria-label="Baudios"
            title="115200 = firmware DogBotDashboard (UNO y ESP32) · 9600 = sketches históricos"
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
            <button className={`btn sm ${next === 2 && canConnect ? 'primary' : ''}`} disabled={!real || !link.serviceAvailable || !link.controller} onClick={connect} title={!real ? 'Disponible en modo ROBOT REAL' : ''}>
              <IPlug size={14} /> Conectar
            </button>
          ) : (
            <button className="btn sm" onClick={disconnect} title="Desconectar">
              <IPlug size={14} /> {panel ? 'Desconectar' : <span className="tb-wide">Desconectar</span>}
              {!panel && <span className="tb-narrow-only">Desc.</span>}
            </button>
          )}
        </div>
      </div>

      {(real || panel) && (
        <div className={`flow-step ${!real ? '' : next === 3 ? 'next' : st === 'armado' ? 'done' : ''}`}>
          <span className="flow-num" aria-hidden="true">
            3
          </span>
          {panel && <span className="flow-title">Armado</span>}
          <div className="flow-controls">
            {real ? (
              <>
                <LinkStateTag />
                {compatible && st !== 'armado' && (
                  <button className={`btn sm ${next === 3 ? 'primary' : ''}`} onClick={armFlow} title={calib ? 'Armar para calibración' : 'Armar para ejecución'}>
                    Armar{calib ? ' (calib.)' : ''}
                  </button>
                )}
                {st === 'armado' && (
                  <button className="btn sm" onClick={disarmFlow}>
                    Desarmar
                  </button>
                )}
                {(st === 'firmware-desconocido' || st === 'fallo') && open && (
                  <button className="btn sm" onClick={() => client.identify().catch(() => undefined)}>
                    Reintentar identificación
                  </button>
                )}
              </>
            ) : (
              <span className="hint">Disponible en modo ROBOT REAL, con el puerto abierto.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Estado del servicio local y del firmware identificado. */
export function LinkStatus({ layout }: { layout: 'bar' | 'panel' }) {
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const real = mode === 'real';
  const open = link.serial.state === 'abierto';
  const wide = layout === 'bar' ? 'tb-hide-narrow tb-wide' : '';
  return (
    <div className={`tb-status ${layout === 'panel' ? 'stacked' : ''}`}>
      <div className="tb-item" title={link.serviceAvailable ? `Servicio local ${link.serviceVersion ?? ''}` : 'Servicio local no disponible'}>
        <span className={`dot ${link.serviceAvailable ? 'ok' : 'err'}`} />
        <span className={`tb-label ${wide}`}>Servicio</span>
        <span className={`tb-value ${wide}`}>{link.serviceAvailable ? (link.controller ? 'local · control' : 'local · sólo vista') : 'no disponible'}</span>
      </div>
      <div className="tb-item tb-fw">
        <IChip size={15} color="var(--muted)" className={layout === 'bar' ? 'tb-wide' : ''} />
        <div style={{ minWidth: 0 }}>
          <div className="tb-value mono tb-ellipsis">
            {real ? (link.firmware ? `${link.firmware.mcu ?? 'Placa'} · ${link.firmware.dev} fw ${link.firmware.fw} · p${link.firmware.proto}` : open ? 'Firmware sin identificar' : 'Sin conexión') : 'Controlador simulado'}
          </div>
          <div className={`tb-sub tb-ellipsis ${layout === 'bar' ? 'tb-wide' : ''}`}>
            {real ? (link.firmware ? `boot ${link.firmware.boot} · RAM libre ${link.firmware.freeRam ?? '—'} B` : 'PCA9685 0x40 · 50 Hz') : 'sin hardware'}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Panel «Conexión» del HUD: los tres pasos y el estado del enlace. */
export function ConnectionPanel() {
  return (
    <div>
      <div className="section">
        <ConnectionFlow layout="panel" />
      </div>
      <div className="section">
        <h4>Enlace</h4>
        <LinkStatus layout="panel" />
      </div>
    </div>
  );
}
