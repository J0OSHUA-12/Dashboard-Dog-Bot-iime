import { useEffect, useState } from 'react';
import type React from 'react';
import { useApp } from './state/store';
import { TopBar } from './components/TopBar';
import { ControlFlyout, HudRail, LeftPanel } from './components/LeftPanel';
import { Kpis, Viewport } from './components/Viewport';
import { CameraDial } from './components/CameraDial';
import { EditorPanel } from './components/EditorPanel';
import { BottomPanel } from './components/BottomPanel';
import { DialogHost } from './components/Dialog';
import { IChart, ICode, ICube, IPaw, ISliders } from './components/icons';
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

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return w;
}

// Geometría del HUD (px). Debe coincidir con los valores de styles.css.
const HUD = {
  margin: 16,
  top: 72, // barra superior
  rail: 96, // riel de botones
  gap: 12,
  camera: 278, // bloque de cámara (vistas + dial + zoom)
  tabs: 46, // barra de pestañas de datos
  status: 36, // franja de indicadores
};

export function App() {
  const ui = useApp((s) => s.ui);
  const setUi = useApp((s) => s.setUi);
  const narrow = useNarrow();
  const winW = useWindowWidth();
  const closed = useApp((s) => s.closed);
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

  if (closed) {
    return (
      <div className="closed-screen" role="status">
        <div className="closed-card">
          <div className="closed-logo">
            <IPaw size={22} color="#1a0e05" />
          </div>
          <h1>Dog Bot Control cerrado</h1>
          <p>Se detuvo todo, se liberó el puerto COM y se apagó el servicio local. Ya puedes cerrar esta pestaña.</p>
          <p className="muted">Para volver a usarlo, ejecuta de nuevo INICIAR_DOGBOT.bat.</p>
        </div>
      </div>
    );
  }

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

  const clampW = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  // HUD: el visor 3D ocupa toda la ventana; los paneles de cristal flotan encima.
  const railEnd = HUD.margin + HUD.rail;
  const hudL = railEnd + HUD.gap + (ui.leftOpen ? ui.leftW + HUD.gap : 0);
  // El editor empuja la cámara y las pestañas si queda sitio; si no, se superpone.
  const editorSpan = ui.rightW + HUD.gap;
  const pushes = editorOpen && winW - hudL - editorSpan - HUD.margin - HUD.camera - HUD.gap >= 540;
  const hudR = pushes ? editorSpan : 0;
  const dockH = ui.bottomOpen ? ui.bottomH : 0;
  const hudVars = {
    '--hud-l': `${hudL}px`,
    '--hud-r': `${hudR}px`,
    '--flyout-w': `${ui.leftW}px`,
    '--editor-w': `${ui.rightW}px`,
    '--dock-h': `${dockH}px`,
  } as React.CSSProperties;
  const insets = {
    left: hudL - HUD.gap,
    right: HUD.margin + (editorOpen ? editorSpan : 0),
    top: HUD.top,
    bottom: HUD.status + HUD.tabs + HUD.gap + dockH,
  };

  return (
    <div className="app hud-app">
      <main className={`hud-stage ${ui.bottomOpen ? 'dock-open' : ''} ${editorOpen ? 'editor-open' : ''}`} style={hudVars}>
        <Viewport hud insets={insets} />
        <TopBar variant="hud" editorOpen={editorOpen} onToggleEditor={() => setEditorOpen((v) => !v)} />
        <HudRail />
        {ui.leftOpen && (
          <div className="hud hud-flyout">
            <ControlFlyout onClose={() => setUi({ leftOpen: false })} />
            <Resizer dir="v" onDrag={(d) => setUi({ leftW: clampW(useApp.getState().ui.leftW + d, 300, 520) })} />
          </div>
        )}
        <div className="hud hud-dock">
          <BottomPanel dock resizer={<Resizer dir="h" onDrag={(d) => setUi({ bottomH: clampW(useApp.getState().ui.bottomH - d, 160, 520) })} />} />
        </div>
        <Kpis className="hud-status" />
        <CameraDial />
        <aside className={`hud hud-editor ${editorOpen ? 'open' : ''}`} inert={!editorOpen} aria-label="Editor de sketches">
          <Resizer dir="v" onDrag={(d) => setUi({ rightW: clampW(useApp.getState().ui.rightW - d, 340, 860) })} />
          <EditorPanel onCollapse={() => setEditorOpen(false)} />
        </aside>
      </main>
      <DialogHost />
    </div>
  );
}
