import { useApp } from '../state/store';
import { useEditor } from '../state/editorStore';
import { closeProgram, stopAll, togglePwmAll } from '../services/actions';
import { ConnectionFlow, LinkStateTag, LinkStatus, ModeSwitch, isCompatible } from './ConnectionFlow';
import { HelpTip } from './Disclosure';
import { ICode, IExit, IMoon, IPaw, IPower, IStop, ISun } from './icons';

/**
 * `hud` (escritorio): marca y modo a la izquierda, acciones encapsuladas a la derecha;
 * el flujo de conexión vive en el panel «Conexión» del riel.
 * `bar` (ventanas estrechas): barra clásica con el flujo de conexión en línea.
 */
export function TopBar({ variant = 'bar', editorOpen, onToggleEditor }: { variant?: 'hud' | 'bar'; editorOpen?: boolean; onToggleEditor?: () => void }) {
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const editorBusy = useEditor((s) => !!s.job);
  const theme = useApp((s) => s.ui.theme);
  const setUi = useApp((s) => s.setUi);
  const real = mode === 'real';
  const st = link.state;
  const compatible = isCompatible(st);
  const pwmCount = link.enabled.length;
  const pwmOn = real && pwmCount > 0;
  const hud = variant === 'hud';
  // Al pulsar PWM ON el visor deja la caminata de reposo; si no llega a activarse (se canceló
  // el diálogo o no había canales elegibles), la retoma.
  const pressPwmOn = () => {
    const app = useApp.getState();
    app.setManualControl(true);
    void togglePwmAll().finally(() => {
      if (useApp.getState().link.enabled.length === 0) useApp.getState().setManualControl(false);
    });
  };

  return (
    <header className={`topbar ${hud ? 'hud-top' : ''}`}>
      <div className="top-cluster">
        <div className="brand">
          <div className="logo">
            <IPaw size={17} color="#1a0e05" />
          </div>
          <div className="brand-name">
            Dog Bot Control
            <small>Estación de control · v0.1</small>
          </div>
        </div>

        {__PREVIEW_BUILD__ && (
          <span className="tag sim tb-hide-narrow" title="Esta vista previa no tiene servicio local: sin COM, sin Arduino CLI. Instala la app en Windows para usar el robot.">
            Vista previa web
          </span>
        )}

        {hud ? (
          <div className="top-mode">
            <ModeSwitch />
            {real && <LinkStateTag />}
          </div>
        ) : (
          <>
            <ConnectionFlow layout="bar" />
            <LinkStatus layout="bar" />
          </>
        )}
      </div>

      <div className="spacer" />

      <div className="top-actions">
        {onToggleEditor && (
          <button className={`btn sm editor-toggle ${editorOpen ? 'active' : ''}`} onClick={onToggleEditor} aria-pressed={!!editorOpen} title={editorOpen ? 'Cerrar el editor de sketches' : 'Abrir el editor de sketches'}>
            <ICode size={14} /> Editor
            {editorBusy && <span className="dot orange" aria-label="Trabajo de Arduino CLI en curso" />}
          </button>
        )}

        <div className="stop-cluster">
          {pwmOn ? (
            <button
              className="btn sm danger-quiet"
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
              onClick={pressPwmOn}
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
          <span className="tb-hide-narrow">
            <HelpTip label="Corte de energía: sin hardware">
              No hay hardware de corte de energía controlado por software. Usa el interruptor físico de la batería/regulador.
            </HelpTip>
          </span>
          <button
            className="btn stop"
            onClick={stopAll}
            title="Parada de emergencia (Esc): cancela la secuencia/trayectoria en curso. NO cierra el programa ni desenergiza los servos (para eso: PWM OFF o Salir)."
          >
            <IStop size={14} /> DETENER
            <kbd className="tb-wide">Esc</kbd>
          </button>
          <button
            className="btn sm icon ghost"
            onClick={() => setUi({ theme: theme === 'dark' ? 'light' : 'dark' })}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? <ISun size={15} /> : <IMoon size={15} />}
          </button>
          <button className="btn sm" onClick={closeProgram} title="Salir: detiene, desarma, libera el COM y apaga el servicio local.">
            <IExit size={14} /> <span className="tb-wide">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
