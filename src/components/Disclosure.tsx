// Revelación progresiva: acordeones cerrados por defecto y ayudas contextuales "?".
// Componentes puramente visuales: no leen ni modifican el estado de la aplicación.
import { ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IChevron, IHelp } from './icons';

export function Disclosure({
  summary,
  meta,
  tone,
  icon,
  className,
  children,
}: {
  summary: ReactNode;
  meta?: ReactNode;
  tone?: 'warn' | 'err' | 'sim';
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details className={`disclosure ${tone ?? ''} ${className ?? ''}`}>
      <summary>
        <span className="disclosure-chev" aria-hidden="true">
          <IChevron size={12} />
        </span>
        {icon}
        <span className="disclosure-title">{summary}</span>
        {meta && <span className="disclosure-meta">{meta}</span>}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

const POP_W = 300;

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(POP_W, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left - 12), window.innerWidth - w - 8);
    const h = pop.current?.offsetHeight ?? 120;
    const above = r.bottom + 8 + h > window.innerHeight - 8 && r.top - 8 - h > 8;
    setPos({ left, top: above ? r.top - 8 - h : r.bottom + 8, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`help-btn ${open ? 'on' : ''}`}
        aria-label={`Ayuda: ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <IHelp size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="note"
            className="help-pop"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: Math.min(POP_W, window.innerWidth - 16) }}
          >
            <div className="help-pop-title">{label}</div>
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
