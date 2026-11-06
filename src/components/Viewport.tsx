import { useEffect, useRef, useState } from 'react';
import { jointLabel, JOINT_DESCRIPTION, jointKind } from '../../shared/joints';
import { estimatedAngleDeg, getJoint, isCalibrated } from '../../shared/profile';
import { getSequence } from '../../shared/sequences';
import { realDisplayUs, useApp } from '../state/store';
import { DogBotScene, ViewName } from '../three/Scene';
import { IAlert, IChevron, IInfo, ITarget } from './icons';

let sceneRef: DogBotScene | null = null;
export function getScene() {
  return sceneRef;
}

function Kpis() {
  const mode = useApp((s) => s.mode);
  const profile = useApp((s) => s.profile);
  const link = useApp((s) => s.link);
  const seq = useApp((s) => s.seq);
  const tested = profile.joints.filter((j) => j.canalEstado === 'probado').length;
  const assigned = profile.joints.filter((j) => j.canal !== null).length;
  const calibrated = profile.joints.filter(isCalibrated).length;
  const seqDef = seq.id ? getSequence(seq.id) : null;
  return (
    <div className="kpis" role="group" aria-label="Indicadores">
      <div className="kpi">
        <div className="k">Articulaciones</div>
        <div className="v">
          12<small>4 × 3</small>
        </div>
      </div>
      <div className="kpi" title="Canales 0–5 probados con el robot suspendido (dossier). No implica calibración.">
        <div className="k">Canales probados</div>
        <div className="v">
          {tested}/{assigned}
          <small>de 12</small>
        </div>
      </div>
      <div className="kpi">
        <div className="k">Calibrados</div>
        <div className="v">
          {calibrated}/12{calibrated ? null : <small className="pending">pendiente</small>}
        </div>
      </div>
      <div className="kpi optional">
        <div className="k">PWM</div>
        <div className={`v ${mode === 'real' && link.enabled.length > 0 ? 'live' : ''}`}>{mode === 'real' ? `${link.enabled.length} canal(es)` : <span className="na">— sim</span>}</div>
      </div>
      <div className="kpi">
        <div className="k">Secuencia</div>
        <div className={`v seq ${seq.playing ? 'live' : ''}`}>{seq.playing && seqDef ? (seq.phase === 'transicion' ? 'Transición…' : seqDef.nombre.split('·')[0]) : 'Ninguna'}</div>
      </div>
      <div className="kpi optional" title="Ida y vuelta de HB medido por la PC (sólo con firmware conectado)">
        <div className="k">Enlace RTT</div>
        <div className="v">{mode === 'real' && link.rttMs !== null ? `${link.rttMs} ms` : <span className="na">—</span>}</div>
      </div>
    </div>
  );
}

function SelectionCard() {
  const selected = useApp((s) => s.selected);
  const profile = useApp((s) => s.profile);
  const rt = useApp((s) => s.joints[s.selected]);
  const mode = useApp((s) => s.mode);
  const cfg = getJoint(profile, selected);
  const us = mode === 'sim' ? rt.simUs : realDisplayUs(rt).us;
  const ang = us !== null ? estimatedAngleDeg(cfg, us) : null;
  return (
    <div className="sel-card" aria-live="polite">
      <div style={{ fontWeight: 650, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
        {jointLabel(selected)}
        <span className={`ch ${cfg.canalEstado === 'probado' ? 'tested' : cfg.canal === null ? 'none' : ''}`}>{cfg.canal === null ? 'sin canal' : `CH ${cfg.canal}`}</span>
      </div>
      <div className="row">
        <span>{mode === 'sim' ? 'Consigna simulada' : 'Consigna (firmware)'}</span>
        <b>{us ?? '—'} µs</b>
      </div>
      {mode === 'real' && (
        <div className="row">
          <span>Solicitada</span>
          <b>{rt.reqUs ?? '—'} µs</b>
        </div>
      )}
      <div className="row">
        <span>Ángulo estimado (visual)</span>
        <b>{ang === null ? '—' : `${ang.toFixed(1)}°`}</b>
      </div>
      <div className="row">
        <span>Ángulo medido</span>
        <b style={{ color: 'var(--muted)' }}>Sin sensor</b>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>
        {JOINT_DESCRIPTION[jointKind(selected)]}
      </div>
    </div>
  );
}

function SelChip() {
  const selected = useApp((s) => s.selected);
  const profile = useApp((s) => s.profile);
  const rt = useApp((s) => s.joints[s.selected]);
  const mode = useApp((s) => s.mode);
  const cfg = getJoint(profile, selected);
  const us = mode === 'sim' ? rt.simUs : realDisplayUs(rt).us;
  return (
    <span className="sel-chip" aria-live="polite">
      <ITarget size={11} /> {jointLabel(selected)} · {cfg.canal === null ? 'sin canal' : `CH ${cfg.canal}`} · <b>{us ?? '—'} µs</b>
      {us !== null && <span>≈ {estimatedAngleDeg(cfg, us).toFixed(0)}° est.</span>}
    </span>
  );
}

export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const params = useApp((s) => s.modelParams);
  const ui = useApp((s) => s.ui);
  const setUi = useApp((s) => s.setUi);
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);

  useEffect(() => {
    if (!host.current) return;
    const sc = new DogBotScene(host.current, useApp.getState().modelParams);
    sceneRef = sc;
    return () => {
      sc.dispose();
      sceneRef = null;
    };
  }, []);
  useEffect(() => {
    sceneRef?.setParams(params);
  }, [params]);

  const view = (v: ViewName) => sceneRef?.setView(v);
  const toggles: [keyof typeof ui, string][] = [
    ['showCover', 'Tapa'],
    ['showGrid', 'Rejilla'],
    ['showAxes', 'Ejes'],
    ['showLabels', 'Etiquetas'],
    ['showGhost', 'Objetivo'],
  ];
  const unknownPose = mode === 'real' && link.enabled.length === 0;
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="viewport" ref={host}>
      <Kpis />
      <div className="sim-banner">
        {mode === 'sim' ? <span className="tag sim">SIMULACIÓN · sin hardware</span> : <span className="tag real">ROBOT REAL · pose = consigna, no medición</span>}
        <SelChip />
      </div>
      <SelectionCard />
      <div className="view-note">
        {unknownPose && (
          <span className="view-warn">
            <IAlert size={12} /> Pose física desconocida: patas translúcidas hasta recibir consignas del firmware.
          </span>
        )}
        {noteOpen && (
          <div className="view-note-body" id="view-note-body">
            <span>
              <b>Dimensiones pendientes.</b> Ángulos estimados desde µs (sin calibrar). No es un simulador dinámico: no modela contacto, equilibrio ni torque.
            </span>
            <span>D1/D2/P1/P2: ubicación izquierda/derecha convencional, no confirmada en el robot.</span>
          </div>
        )}
        <button className="view-note-toggle" onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen} aria-controls="view-note-body">
          <IInfo size={12} /> Modelo aproximado
          <span className="disclosure-chev" style={{ transform: noteOpen ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
            <IChevron size={11} />
          </span>
        </button>
      </div>
      <div className="view-tools" role="toolbar" aria-label="Vista 3D">
        {(
          [
            ['iso', 'Isométrica'],
            ['frontal', 'Frontal'],
            ['lateral', 'Lateral'],
            ['superior', 'Superior'],
          ] as [ViewName, string][]
        ).map(([v, l]) => (
          <button key={v} className="btn xs ghost" onClick={() => view(v)}>
            {l}
          </button>
        ))}
        <button className="btn xs ghost" onClick={() => view('iso')} title="Restaurar cámara">
          Restaurar
        </button>
        <span className="tb-sep" />
        {toggles.map(([k, l]) => (
          <button key={k} className={`btn xs ${ui[k] ? 'active' : 'ghost'}`} onClick={() => setUi({ [k]: !ui[k] } as Partial<typeof ui>)} aria-pressed={!!ui[k]}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
