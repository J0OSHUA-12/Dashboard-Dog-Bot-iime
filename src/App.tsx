import { useEffect, useState } from 'react';
import { useApp } from './state/store';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { Viewport } from './components/Viewport';
import { EditorPanel } from './components/EditorPanel';
import { BottomPanel } from './components/BottomPanel';
import { DialogHost } from './components/Dialog';
import { IChart, ICode, ICube, ISliders } from './components/icons';
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
    <div className="rail" style={{ borderRight: side === 'left' ? '1px solid var(--border-soft)' : undefined, borderLeft: side === 'right' ? '1px solid var(--border-soft)' : undefined }}>
      <button className="btn sm icon ghost" onClick={onOpen} aria-label={`Mostrar ${label}`} title={`Mostrar ${label}`}>
        {side === 'left' ? '»' : '«'}
      </button>
      <span className="rail-label" onClick={onOpen}>
        {label}
      </span>
    </div>
  );
}

export function App() {
  const ui = useApp((s) => s.ui);
  const setUi = useApp((s) => s.setUi);
  const narrow = useNarrow();

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

  const leftW = ui.leftOpen ? ui.leftW : 34;
  const rightW = ui.rightOpen ? ui.rightW : 34;
  const clampW = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

  return (
    <div className="app">
      <TopBar />
      <main className="main" style={{ gridTemplateColumns: `${leftW}px ${ui.leftOpen ? 5 : 0}px minmax(420px, 1fr) ${ui.rightOpen ? 5 : 0}px ${rightW}px` }}>
        {ui.leftOpen ? <LeftPanel onCollapse={() => setUi({ leftOpen: false })} /> : <Rail label="Patas y servos" side="left" onOpen={() => setUi({ leftOpen: true })} />}
        {ui.leftOpen ? <Resizer dir="v" onDrag={(d) => setUi({ leftW: clampW(useApp.getState().ui.leftW + d, 270, 520) })} /> : <div />}
        <div className="center" style={{ gridTemplateRows: ui.bottomOpen ? `minmax(240px, 1fr) 5px ${ui.bottomH}px` : 'minmax(240px, 1fr) 0px 34px' }}>
          <Viewport />
          {ui.bottomOpen ? <Resizer dir="h" onDrag={(d) => setUi({ bottomH: clampW(useApp.getState().ui.bottomH - d, 150, 560) })} /> : <div />}
          {ui.bottomOpen ? (
            <BottomPanel onCollapse={() => setUi({ bottomOpen: false })} />
          ) : (
            <div className="bottom" style={{ flexDirection: 'row', alignItems: 'center', padding: '0 10px', gap: 8 }}>
              <button className="btn xs ghost" onClick={() => setUi({ bottomOpen: true })}>
                ▲ Telemetría, eventos y monitor serie
              </button>
            </div>
          )}
        </div>
        {ui.rightOpen ? <Resizer dir="v" onDrag={(d) => setUi({ rightW: clampW(useApp.getState().ui.rightW - d, 340, 860) })} /> : <div />}
        {ui.rightOpen ? <EditorPanel onCollapse={() => setUi({ rightOpen: false })} /> : <Rail label="Editor de sketches" side="right" onOpen={() => setUi({ rightOpen: true })} />}
      </main>
      <DialogHost />
    </div>
  );
}
