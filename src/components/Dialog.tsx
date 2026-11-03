// Diálogos de confirmación (con lista de comprobación obligatoria) y avisos.
import { ReactNode, useEffect, useState } from 'react';
import { create } from 'zustand';
import { IAlert, ICheck, IError, IInfo } from './icons';

interface ConfirmOpts {
  title: string;
  body: ReactNode;
  checks?: string[];
  confirmLabel?: string;
  danger?: boolean;
  input?: { label: string; initial: string; validate?: (v: string) => string | null };
}

interface DialogState {
  current: (ConfirmOpts & { resolve: (v: string | boolean | null) => void }) | null;
  toasts: { id: number; level: 'info' | 'ok' | 'error'; text: string }[];
}

const useDialog = create<DialogState>(() => ({ current: null, toasts: [] }));
let tid = 1;

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.setState({ current: { ...opts, resolve: (v) => resolve(v === true) } });
  });
}

export function promptDialog(opts: ConfirmOpts & { input: NonNullable<ConfirmOpts['input']> }): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.setState({ current: { ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) } });
  });
}

export function toast(text: string, level: 'info' | 'ok' | 'error' = 'info') {
  const id = tid++;
  useDialog.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, level, text }] }));
  setTimeout(() => useDialog.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), level === 'error' ? 7000 : 4000);
}

export function DialogHost() {
  const cur = useDialog((s) => s.current);
  const toasts = useDialog((s) => s.toasts);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [value, setValue] = useState('');
  useEffect(() => {
    setChecked((cur?.checks ?? []).map(() => false));
    setValue(cur?.input?.initial ?? '');
  }, [cur]);
  const close = (v: string | boolean | null) => {
    cur?.resolve(v);
    useDialog.setState({ current: null });
  };
  const inputErr = cur?.input?.validate ? cur.input.validate(value) : null;
  const allChecked = checked.every(Boolean);
  const canConfirm = allChecked && !inputErr;
  return (
    <>
      {cur && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
          <div
            className={`modal ${cur.danger ? 'danger' : ''}`}
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === 'Escape') close(null);
            }}
          >
            <div className="modal-head">
              {cur.danger ? <IAlert size={18} color="var(--warn)" /> : <IInfo size={18} color="var(--sel)" />}
              {cur.title}
            </div>
            <div className="modal-body">
              {cur.body}
              {cur.input && (
                <label className="fl">
                  {cur.input.label}
                  <input
                    className={`field ${inputErr ? 'invalid' : ''}`}
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canConfirm) close(value);
                    }}
                  />
                  {inputErr && <span style={{ color: 'var(--err)' }}>⚠ {inputErr}</span>}
                </label>
              )}
              {cur.checks && cur.checks.length > 0 && (
                <div className="checks">
                  {cur.checks.map((c, i) => (
                    <label key={i} className="chk">
                      <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked((p) => p.map((x, k) => (k === i ? e.target.checked : x)))} />
                      {c}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => close(null)}>
                Cancelar
              </button>
              <button className={`btn ${cur.danger ? 'danger' : 'primary'}`} disabled={!canConfirm} onClick={() => close(cur.input ? value : true)}>
                {cur.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.level}`}>
            {t.level === 'error' ? <IError size={15} color="var(--err)" /> : t.level === 'ok' ? <ICheck size={15} color="var(--ok)" /> : <IInfo size={15} color="var(--sel)" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
