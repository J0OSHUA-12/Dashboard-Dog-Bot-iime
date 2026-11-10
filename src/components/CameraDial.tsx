// Control de cámara del HUD: vistas predefinidas, dial de órbita y zoom.
// Sólo mueve la cámara del visor; no lee ni cambia el estado del robot.
import { useEffect, useRef } from 'react';
import type React from 'react';
import { getScene, ViewPresets } from './Viewport';
import { IChevron, IHome, IMinus, IPlus } from './icons';

const RATE = 1.5; // rad/s al mantener pulsada una flecha
const STEP = Math.PI / 12; // giro por pulsación de teclado

/** Repite `tick(dt)` mientras el puntero mantiene pulsado el botón. */
function useHold(tick: (dt: number) => void) {
  const raf = useRef(0);
  const stop = () => cancelAnimationFrame(raf.current);
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      let last = performance.now();
      const loop = (now: number) => {
        tick(Math.min(0.05, (now - last) / 1000));
        last = now;
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
  };
}

function Arrow({ dir, label, az, pol }: { dir: 'up' | 'down' | 'left' | 'right'; label: string; az: number; pol: number }) {
  const hold = useHold((dt) => getScene()?.orbit(az * RATE * dt, pol * RATE * dt));
  return (
    <button
      className={`dial-arrow ${dir}`}
      aria-label={label}
      title={label}
      {...hold}
      // El teclado (y los lectores de pantalla) giran un paso fijo por pulsación.
      onClick={(e) => e.detail === 0 && getScene()?.orbit(az * STEP, pol * STEP)}
    >
      <IChevron dir={dir} size={13} />
    </button>
  );
}

function Zoom({ factor, label, children }: { factor: number; label: string; children: React.ReactNode }) {
  const hold = useHold((dt) => getScene()?.zoom(Math.pow(factor, dt * 4)));
  return (
    <button className="dial-zoom" aria-label={label} title={label} {...hold} onClick={(e) => e.detail === 0 && getScene()?.zoom(factor)}>
      {children}
    </button>
  );
}

export function CameraDial() {
  const ring = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // La corona marca hacia dónde queda el frente del robot (+X) respecto a la vista.
  useEffect(() => {
    let raf = 0;
    let shown = NaN;
    const sync = () => {
      raf = requestAnimationFrame(sync);
      const sc = getScene();
      if (!sc || !ring.current) return;
      if (!sc.onCamera) {
        sc.onCamera = (p) => {
          const deg = (p.azimuth * 180) / Math.PI + 90;
          if (Math.abs(deg - shown) < 0.2 || !ring.current) return;
          shown = deg;
          ring.current.style.transform = `rotate(${deg.toFixed(1)}deg)`;
        };
      }
    };
    raf = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(raf);
      const sc = getScene();
      if (sc) sc.onCamera = null;
    };
  }, []);

  return (
    <div className="hud-camera" role="group" aria-label="Cámara">
      <div className="cam-views" role="toolbar" aria-label="Vistas">
        <span className="hud-label">Vista</span>
        <ViewPresets className="hud-link" />
      </div>
      <div className="cam-dial-wrap">
        <span className="hud-label">Cámara</span>
        <div
          className="cam-dial"
          title="Arrastra para rotar la cámara"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            getScene()?.orbit(-(e.clientX - drag.current.x) * 0.012, -(e.clientY - drag.current.y) * 0.008);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <div className="dial-ring" ref={ring} aria-hidden="true">
            <i className="dial-front" />
          </div>
          <Arrow dir="up" label="Subir la cámara" az={0} pol={-1} />
          <Arrow dir="right" label="Girar a la derecha" az={1} pol={0} />
          <Arrow dir="down" label="Bajar la cámara" az={0} pol={1} />
          <Arrow dir="left" label="Girar a la izquierda" az={-1} pol={0} />
          <button className="dial-home" onClick={() => getScene()?.setView('iso')} aria-label="Restaurar cámara" title="Restaurar cámara">
            <IHome size={14} />
          </button>
        </div>
        <span className="hud-caption">Arrastra para rotar</span>
      </div>
      <div className="cam-zoom">
        <Zoom factor={0.86} label="Acercar">
          <IPlus size={14} />
        </Zoom>
        <Zoom factor={1 / 0.86} label="Alejar">
          <IMinus size={14} />
        </Zoom>
      </div>
    </div>
  );
}
