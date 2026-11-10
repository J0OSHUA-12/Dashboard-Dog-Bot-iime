// Controles del robot. En el HUD de escritorio: riel de botones con icono y un panel
// flotante que se abre al lado. En ventanas estrechas: panel con pestañas.
import type { ReactNode } from 'react';
import { LeftTab, useApp } from '../state/store';
import { CalibrationPanel } from './CalibrationPanel';
import { ConnectionPanel, linkTone } from './ConnectionFlow';
import { JointControls } from './JointControls';
import { PosesPanel } from './PosesPanel';
import { ProfilePanel } from './ProfilePanel';
import { ICrosshair, IJoint, IPlug, IPose, IProfile, ISequence, IX } from './icons';

interface Section {
  id: LeftTab;
  /** Rótulo del botón del riel. */
  label: string;
  title: string;
  sub: string;
  icon: (size: number) => ReactNode;
}

const SECTIONS: Section[] = [
  { id: 'articulaciones', label: 'Articulaciones', title: 'Articulaciones', sub: '12 servos', icon: (s) => <IJoint size={s} strokeWidth={1.7} /> },
  { id: 'calibracion', label: 'Calibración', title: 'Calibración', sub: 'límites por servo', icon: (s) => <ICrosshair size={s} strokeWidth={1.7} /> },
  { id: 'poses', label: 'Poses', title: 'Poses', sub: 'integradas y guardadas', icon: (s) => <IPose size={s} strokeWidth={1.7} /> },
  { id: 'secuencia', label: 'Secuencia', title: 'Secuencias', sub: 'ensayos de movimiento', icon: (s) => <ISequence size={s} strokeWidth={1.7} /> },
  { id: 'perfil', label: 'Perfil', title: 'Perfil', sub: 'canales y modelo', icon: (s) => <IProfile size={s} strokeWidth={1.7} /> },
  { id: 'conexion', label: 'Conectar', title: 'Conexión', sub: 'modo, puerto y armado', icon: (s) => <IPlug size={s} strokeWidth={1.7} /> },
];

function SectionBody({ tab }: { tab: LeftTab }) {
  if (tab === 'articulaciones') return <JointControls />;
  if (tab === 'calibracion') return <CalibrationPanel />;
  if (tab === 'poses') return <PosesPanel part="poses" />;
  if (tab === 'secuencia') return <PosesPanel part="secuencias" />;
  if (tab === 'perfil') return <ProfilePanel />;
  return <ConnectionPanel />;
}

/** Punto de estado del botón «Conectar»: refleja el enlace sin abrir el panel. */
function LinkDot() {
  const real = useApp((s) => s.mode === 'real');
  const st = useApp((s) => s.link.state);
  const open = useApp((s) => s.link.serial.state === 'abierto');
  if (!real) return null;
  const tone = linkTone(st) || (open ? 'warn' : '');
  return <span className={`dot rail-dot ${tone}`} aria-hidden="true" />;
}

/** Riel vertical del HUD. Un clic abre el panel de esa sección; otro clic lo cierra. */
export function HudRail() {
  const tab = useApp((s) => s.ui.leftTab);
  const open = useApp((s) => s.ui.leftOpen);
  const setUi = useApp((s) => s.setUi);
  return (
    <nav className="hud-rail" aria-label="Controles del robot">
      {SECTIONS.map((s) => {
        const on = open && tab === s.id;
        return (
          <button
            key={s.id}
            className={`rail-btn ${on ? 'on' : ''}`}
            aria-expanded={on}
            aria-controls="hud-flyout"
            onClick={() => setUi(on ? { leftOpen: false } : { leftOpen: true, leftTab: s.id })}
          >
            {s.icon(21)}
            <span>{s.label}</span>
            {s.id === 'conexion' && <LinkDot />}
          </button>
        );
      })}
    </nav>
  );
}

/** Panel flotante del HUD con la sección elegida en el riel. */
export function ControlFlyout({ onClose }: { onClose: () => void }) {
  const tab = useApp((s) => s.ui.leftTab);
  const sec = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0];
  return (
    <section className="panel flyout" id="hud-flyout" aria-label={sec.title}>
      <div className="panel-head">
        <span className="panel-icon" aria-hidden="true">
          {sec.icon(16)}
        </span>
        <span className="panel-title">{sec.title}</span>
        <span className="panel-sub">{sec.sub}</span>
        <span className="spacer" />
        <button className="btn sm icon ghost" onClick={onClose} title="Cerrar panel" aria-label={`Cerrar ${sec.title}`}>
          <IX size={14} />
        </button>
      </div>
      <div className="panel-body" key={sec.id}>
        <SectionBody tab={sec.id} />
      </div>
    </section>
  );
}

// La conexión va en la barra superior cuando la ventana es estrecha.
const MOBILE_TABS = SECTIONS.filter((s) => s.id !== 'conexion');

export function LeftPanel() {
  const stored = useApp((s) => s.ui.leftTab);
  const setUi = useApp((s) => s.setUi);
  const tab = stored === 'conexion' ? 'articulaciones' : stored;
  return (
    <section className="panel left" aria-label="Controles">
      <div className="tabs" role="tablist">
        {MOBILE_TABS.map((s) => (
          <button key={s.id} role="tab" aria-selected={tab === s.id} className={tab === s.id ? 'on' : ''} onClick={() => setUi({ leftTab: s.id })}>
            {s.title}
          </button>
        ))}
      </div>
      <div className="panel-body">
        <SectionBody tab={tab} />
      </div>
    </section>
  );
}
