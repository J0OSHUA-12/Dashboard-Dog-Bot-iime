import { useEffect, useState } from 'react';
import { useApp } from './state/store';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { Viewport } from './components/Viewport';
import { EditorPanel } from './components/EditorPanel';
import { BottomPanel } from './components/BottomPanel';
import { DialogHost } from './components/Dialog';
import { IChart, IChevron, ICode, ICube, ISliders } from './components/icons';
import { BottomTab } from './state/store';
import { stopAll } from './services/actions';
import { initService } from './services/robotLink';
import { startSimTelemetry } from './services/player';

function useNarrow() {
  const q = '(max-width: 1099px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return narrow;
}

function Resizer({ dir, onDrag }: { dir: 'v' | 'h'; onDrag: (delta: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`resizer ${dir} ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        let last = dir === 'v' ? e.clientX : e.clientY;
        const move = (ev: PointerEvent) => {
          const cur = dir === 'v' ? ev.clientX : ev.clientY;
          onDrag(cur - last);
          last = cur;
        };
        const up = () => {
          setDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

function Rail({ label, onOpen, side }: { label: string; onOpen: () => void; side: 'left' | 'right' }) {
  return (
    <div className={`rail ${side}`}>
      <button className="btn sm icon ghost" onClick={onOpen} aria-label={`Mostrar ${label}`} title={`Mostrar ${label}`}>
        <IChevron dir={side === 'left' ? 'right' : 'left'} size={14} />
      </button>
      <span className="rail-label" onClick={onOpen}>
        {label}
      </span>
    </div>
  );
}

const DOCK_TABS: [BottomTab, string][] = [
  ['telemetria', 'Telemetría'],
  ['eventos', 'Eventos'],
  ['serie', 'Monitor serie'],
  ['ensayos', 'Registro de ensayos'],
  ['mediciones', 'Mediciones'],
];

/** Panel inferior minimizado: las pestañas siguen a un clic y el contador de errores sigue visible. */
function BottomDock() {
  const setUi = useApp((s) => s.setUi);
  const errors = useApp((s) => s.events.filter((e) => e.level === 'error').length);
  return (
    <div className="bottom dock" role="toolbar" aria-label="Panel inferior minimizado">
      {DOCK_TABS.map(([k, l]) => (
        <button key={k} className="dock-tab" onClick={() => setUi({ bottomOpen: true, bottomTab: k })}>
          {l}
          {k === 'eventos' && errors > 0 && <span className="tag err count">{errors}</span>}
        </button>
      ))}
      <span className="spacer" />
      <button className="btn xs ghost icon" onClick={() => setUi({ bottomOpen: true })} title="Mostrar panel inferior" aria-label="Mostrar panel inferior">
        <IChevron dir="up" size={13} />
      </button>
    </div>
  );
}

export function App() {
  const ui = useApp((s) => s.ui);
  const setUi = useApp((s) => s.setUi);
  const narrow = useNarrow();
  // Editor de sketches como cajón lateral: cerrado al iniciar, siempre montado
  // para conservar pestañas, deshacer/rehacer y la consola de Arduino CLI.
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    initService();
    startSimTelemetry();
    useApp.getState().addEvent('info', 'interfaz', 'Dog Bot Control iniciado en SIMULACIÓN. Abrir la aplicación no mueve el robot.');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-back')) void stopAll();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (narrow) {
    const tab = ui.mobileTab;
    return (
      <div className="app">
        <TopBar />
        <main className="main mobile">
          {tab === '3d' && <Viewport />}
          {tab === 'controles' && <LeftPanel />}
          {tab === 'editor' && <EditorPanel />}
          {tab === 'datos' && <BottomPanel />}
        </main>
        <nav className="mobile-nav" aria-label="Secciones">
          {(
            [
              ['3d', 'Modelo 3D', <ICube key="a" size={17} />],
              ['controles', 'Controles', <ISliders key="b" size={17} />],
              ['editor', 'Editor', <ICode key="c" size={17} />],
              ['datos', 'Datos', <IChart key="d" size={17} />],
            ] as const
          ).map(([k, l, icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setUi({ mobileTab: k })}>
              {icon}
              {l}
            </button>
          ))}
        </nav>
        <DialogHost />
      </div>
    );
  }

  const leftW = ui.leftOpen ? ui.leftW : 40;
  const clampW = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

  return (
    <div className="app">
      <TopBar editorOpen={editorOpen} onToggleEditor={() => setEditorOpen((v) => !v)} />
      <main className="main desk" style={{ gridTemplateColumns: `${leftW}px ${ui.leftOpen ? 5 : 0}px minmax(420px, 1fr)` }}>
        {ui.leftOpen ? <LeftPanel onCollapse={() => setUi({ leftOpen: false })} /> : <Rail label="Patas y servos" side="left" onOpen={() => setUi({ leftOpen: true })} />}
        {ui.leftOpen ? <Resizer dir="v" onDrag={(d) => setUi({ leftW: clampW(useApp.getState().ui.leftW + d, 270, 520) })} /> : <div />}
        <div className="center" style={{ gridTemplateRows: ui.bottomOpen ? `minmax(240px, 1fr) 5px ${ui.bottomH}px` : 'minmax(240px, 1fr) 0px 40px' }}>
          <Viewport />
          {ui.bottomOpen ? <Resizer dir="h" onDrag={(d) => setUi({ bottomH: clampW(useApp.getState().ui.bottomH - d, 150, 560) })} /> : <div />}
          {ui.bottomOpen ? <BottomPanel onCollapse={() => setUi({ bottomOpen: false })} /> : <BottomDock />}
        </div>
        <aside className={`drawer ${editorOpen ? 'open' : ''}`} style={{ width: ui.rightW }} inert={!editorOpen} aria-label="Editor de sketches">
          <Resizer dir="v" onDrag={(d) => setUi({ rightW: clampW(useApp.getState().ui.rightW - d, 340, 860) })} />
          <EditorPanel onCollapse={() => setEditorOpen(false)} />
        </aside>
      </main>
      <DialogHost />
    </div>
  );
}
