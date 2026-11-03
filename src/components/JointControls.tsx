import { memo, useEffect, useRef } from 'react';
import { JOINT_KINDS, JOINT_LABEL, JointId, LEGS, LEG_LABEL, LegId } from '../../shared/joints';
import { JointConfig, estimatedAngleDeg, getJoint, isCalibrated, jointEligibility, sliderRange } from '../../shared/profile';
import { useApp } from '../state/store';
import { disableJoint, enableJoint, requestReal } from '../services/robotLink';
import { toast } from './Dialog';
import { IPower } from './icons';
import { createElement as h } from 'react';

function ago(at: number | null): string {
  if (at === null) return '';
  const s = Math.round((Date.now() - at) / 1000);
  return s < 1 ? 'ahora' : `hace ${s} s`;
}

function calTag(j: JointConfig) {
  if (isCalibrated(j)) return <span className="tag ok">calibrado</span>;
  if (j.calibracion.estado === 'en-progreso') return <span className="tag warn">calibrando</span>;
  return <span className="tag muted">sin calibrar</span>;
}

export function ChannelBadge({ j }: { j: JointConfig }) {
  if (j.canal === null) return <span className="ch none" title="Sin asignación física confirmada">sin canal</span>;
  return (
    <span className={`ch ${j.canalEstado === 'probado' ? 'tested' : ''}`} title={j.canalEstado === 'probado' ? 'Canal probado (suspendido)' : 'Canal PROPUESTO, sin cableado confirmado'}>
      CH {j.canal}
      {j.canalEstado === 'propuesto' ? '?' : ''}
    </span>
  );
}

async function askEnable(id: JointId) {
  const s = useApp.getState();
  const cfg = getJoint(s.profile, id);
  const mode = s.link.fwMode === 'CAL' ? 'calibracion' : 'coordinado';
  const e = jointEligibility(s.profile, id, mode);
  const band = e.band;
  if (!e.ok || !band) {
    toast(e.motivo, 'error');
    return;
  }
  const v = await import('./Dialog').then((m) =>
    m.promptDialog({
      title: `Habilitar ${cfg.joint} (canal ${cfg.canal})`,
      danger: true,
      body: h(
        'div',
        { className: 'list' },
        h('div', null, `Banda permitida: ${band.minUs}–${band.maxUs} µs (${e.motivo}). Referencia: ${band.refUs} µs.`),
        h('div', { className: 'note warn' }, 'Sin sensor angular no se conoce la posición física actual: al habilitar, el servo irá directamente al pulso inicial y puede dar un salto.'),
      ),
      input: {
        label: 'Pulso inicial (µs)',
        initial: String(band.refUs),
        validate: (x) => {
          const n = Number(x);
          if (!Number.isInteger(n)) return 'Entero en µs';
          if (n < band.minUs || n > band.maxUs) return `Fuera de ${band.minUs}–${band.maxUs}`;
          return null;
        },
      },
      checks: ['Robot sostenido y nada puede chocar con la pata.'],
      confirmLabel: 'Habilitar canal',
    }),
  );
  if (v === null) return;
  try {
    await enableJoint(id, Number(v));
  } catch (err) {
    toast('No se habilitó: ' + (err as Error).message, 'error');
  }
}

const JointRow = memo(function JointRow({ id }: { id: JointId }) {
  const cfg = useApp((s) => getJoint(s.profile, id));
  const rt = useApp((s) => s.joints[id]);
  const selected = useApp((s) => s.selected === id);
  const mode = useApp((s) => s.mode);
  const linkState = useApp((s) => s.link.state);
  const fwMode = useApp((s) => s.link.fwMode);
  const enabledList = useApp((s) => s.link.enabled);
  const step = useApp((s) => s.ui.stepUs);
  const profile = useApp((s) => s.profile);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const real = mode === 'real';
  const enabled = cfg.canal !== null && enabledList.includes(cfg.canal);
  const elig = jointEligibility(profile, id, fwMode === 'CAL' ? 'calibracion' : 'coordinado');
  const range = real ? (elig.band ? { min: elig.band.minUs, max: elig.band.maxUs, fuente: elig.motivo } : { min: 500, max: 2500, fuente: elig.motivo }) : sliderRange(cfg);
  const value = real ? (rt.reqUs ?? rt.confUs ?? rt.pwUs ?? elig.band?.refUs ?? 1500) : rt.simUs;
  const canMove = !real || (linkState === 'armado' && enabled);
  const sliderDisabled = real && (!canMove || fwMode === 'CAL');
  const pct = ((value - range.min) / Math.max(1, range.max - range.min)) * 100;

  const set = (us: number) => {
    const v = Math.round(Math.min(range.max, Math.max(range.min, us)));
    if (!real) useApp.getState().setSimUs(id, v);
    else if (!requestReal(id, v)) toast('Orden no enviada: el canal debe estar habilitado y el robot armado.', 'error');
  };
  const stepBy = (d: number) => set(value + d);

  return (
    <div ref={ref} className={`joint ${selected ? 'selected' : ''}`} onClick={() => useApp.getState().select(id)} data-joint={id}>
      <div className="joint-top">
        <span className="joint-name">{JOINT_LABEL[cfg.joint.split('-')[1] as keyof typeof JOINT_LABEL]}</span>
        <ChannelBadge j={cfg} />
        <span className="spacer" />
        {calTag(cfg)}
        {real && cfg.canal !== null && (enabled ? <span className="tag orange">PWM ON</span> : <span className="tag muted">PWM off</span>)}
      </div>
      <div className="joint-row" onClick={(e) => e.stopPropagation()}>
        <button className="btn xs" onClick={() => stepBy(-step)} disabled={real && !canMove} aria-label={`Restar ${step} µs`}>
          −{step}
        </button>
        <input
          type="range"
          className="slider"
          min={range.min}
          max={range.max}
          step={1}
          value={value}
          disabled={sliderDisabled}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => set(Number(e.target.value))}
          onFocus={() => useApp.getState().select(id)}
          aria-label={`${id} pulso µs`}
        />
        <button className="btn xs" onClick={() => stepBy(step)} disabled={real && !canMove} aria-label={`Sumar ${step} µs`}>
          +{step}
        </button>
        <input
          className="field num mono"
          type="number"
          value={value}
          min={range.min}
          max={range.max}
          disabled={real && !canMove}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) set(n);
          }}
          aria-label={`${id} valor µs`}
        />
        <span className="unit">µs</span>
      </div>
      <div className="joint-meta">
        <span>
          rango <b>{range.min}–{range.max}</b> <span title={range.fuente}>({real ? 'perfil' : range.fuente === 'banda eléctrica (sólo simulación)' ? 'banda eléctrica' : range.fuente})</span>
        </span>
        <span title="Interpolación visual, no medición">
          ≈ <b>{estimatedAngleDeg(cfg, value).toFixed(0)}°</b> estimado
        </span>
        {real && (
          <>
            <span>
              confirmada <b>{rt.confUs ?? '—'}</b> {ago(rt.confAt)}
            </span>
            <span>
              escrita <b>{rt.pwUs ?? '—'}</b>
            </span>
          </>
        )}
      </div>
      {real && (
        <div className="joint-row" onClick={(e) => e.stopPropagation()}>
          {!elig.ok ? (
            <span className="hint" style={{ color: 'var(--warn)' }}>
              ⚠ {elig.motivo}
            </span>
          ) : enabled ? (
            <button className="btn xs danger" onClick={() => disableJoint(id).catch((e) => toast((e as Error).message, 'error'))}>
              <IPower size={11} /> PWM off canal
            </button>
          ) : (
            <button className="btn xs" disabled={linkState !== 'armado'} onClick={() => askEnable(id)} title={linkState !== 'armado' ? 'Arma el robot primero' : ''}>
              Habilitar canal…
            </button>
          )}
          {fwMode === 'CAL' && enabled && <span className="hint">Calibración: usa pasos ≤ 50 µs.</span>}
        </div>
      )}
    </div>
  );
});

function LegCard({ leg }: { leg: LegId }) {
  const profile = useApp((s) => s.profile);
  const joints = profile.joints.filter((j) => j.joint.startsWith(leg));
  const chans = joints.map((j) => j.canal).filter((c) => c !== null);
  const front = leg[0] === 'D';
  return (
    <div className="leg-card">
      <div className="leg-card-head">
        {leg} · {LEG_LABEL[leg]}
        <span className="spacer" />
        {front ? (
          <span className="tag orange" title="Dossier: dos patas delanteras probadas suspendidas">
            probada suspendida
          </span>
        ) : (
          <span className="tag muted" title="Sin asignación física confirmada">
            {chans.length ? 'canales propuestos' : 'sin canales'}
          </span>
        )}
      </div>
      {['superior', 'inferior', 'cadera'].map((k) => (
        <JointRow key={k} id={`${leg}-${k}` as JointId} />
      ))}
    </div>
  );
}

export function JointControls() {
  const step = useApp((s) => s.ui.stepUs);
  const setUi = useApp((s) => s.setUi);
  const mode = useApp((s) => s.mode);
  return (
    <div className="legs">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="hint">Paso</span>
          {[1, 5, 10, 25, 50].map((v) => (
            <button key={v} className={`btn xs ${step === v ? 'active' : ''}`} onClick={() => setUi({ stepUs: v })}>
              {v}
            </button>
          ))}
          <span className="unit">µs</span>
        </div>
        <button className="btn xs" onClick={() => useApp.getState().select('D1-inferior')} title="Canal 1: articulación inferior de D1 (prioritaria)">
          Ir a canal 1
        </button>
      </div>
      {mode === 'sim' ? (
        <div className="note sim">Simulación: los sliders mueven sólo el modelo. Sin calibrar, el rango es la banda eléctrica 500–2500 µs, no un límite mecánico.</div>
      ) : (
        <div className="note warn">Robot real: los sliders envían consignas consolidadas (máx. ~16/s) sólo a canales armados y habilitados, dentro de los límites que también aplica el firmware.</div>
      )}
      {LEGS.map((l) => (
        <LegCard key={l} leg={l} />
      ))}
      <div className="hint" style={{ padding: '2px 4px 8px' }}>
        Orden de filas: {JOINT_KINDS.map((k) => JOINT_LABEL[k]).join(' / ')}. Selecciona en la lista o haciendo clic sobre la pieza en el 3D.
      </div>
    </div>
  );
}
