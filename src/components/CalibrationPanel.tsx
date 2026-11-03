import { useState } from 'react';
import { ALL_JOINTS, JointId, jointLabel } from '../../shared/joints';
import { ChannelStatus, getJoint, isCalibrated, jointEligibility } from '../../shared/profile';
import { useApp } from '../state/store';
import { requestReal } from '../services/robotLink';
import { confirmDialog, toast } from './Dialog';
import { ChannelBadge } from './JointControls';
import { IAlert, ICheck } from './icons';

function NumField({ label, value, onChange, disabled }: { label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? (value === null ? '' : String(value));
  return (
    <label className="fl">
      {label}
      <input
        className="field num mono"
        value={shown}
        disabled={disabled}
        placeholder="—"
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          if (txt === null) return;
          const t = txt.trim();
          setTxt(null);
          if (t === '') onChange(null);
          else if (/^\d{3,4}$/.test(t)) onChange(Number(t));
          else toast('Valor inválido: entero en µs', 'error');
        }}
      />
    </label>
  );
}

export function CalibrationPanel() {
  const id = useApp((s) => s.selected);
  const profile = useApp((s) => s.profile);
  const issues = useApp((s) => s.issues);
  const rt = useApp((s) => s.joints[s.selected]);
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const calActive = useApp((s) => s.calibrationActive);
  const setCal = useApp((s) => s.setCalibrationActive);
  const update = useApp((s) => s.updateJointConfig);
  const cfg = getJoint(profile, id);
  const real = mode === 'real';
  const enabled = cfg.canal !== null && link.enabled.includes(cfg.canal);
  const cur = real ? (rt.reqUs ?? rt.confUs ?? rt.pwUs) : rt.simUs;
  const elig = jointEligibility(profile, id, 'calibracion');
  const jointIssues = issues.filter((i) => i.joint === id);
  const armed = link.state === 'armado';

  const step = (d: number) => {
    if (cur === null) return;
    if (!real) {
      useApp.getState().setSimUs(id, cur + d);
      return;
    }
    if (!armed || !enabled) {
      toast('Arma el robot y habilita este canal (pestaña Articulaciones).', 'error');
      return;
    }
    const band = elig.band;
    const v = cur + d;
    if (band && (v < band.minUs || v > band.maxUs)) {
      toast(`Fuera de la banda de exploración ${band.minUs}–${band.maxUs} µs.`, 'error');
      return;
    }
    requestReal(id, v);
  };

  const capture = (field: 'minUs' | 'refUs' | 'maxUs') => {
    if (cur === null) return;
    update(id, { [field]: cur, calibracion: { ...cfg.calibracion, estado: cfg.calibracion.estado === 'calibrado' ? 'en-progreso' : 'en-progreso' } });
    useApp.getState().addEvent('info', 'perfil', `${jointLabel(id)}: ${field === 'minUs' ? 'mínimo' : field === 'refUs' ? 'referencia' : 'máximo'} = ${cur} µs (${real ? 'consigna en robot real' : 'valor en simulación'}).`);
  };

  const markCalibrated = async () => {
    const { minUs, refUs, maxUs } = cfg;
    if (minUs === null || refUs === null || maxUs === null || !(minUs < refUs && refUs < maxUs)) {
      toast('Se requiere mínimo < referencia < máximo.', 'error');
      return;
    }
    if (cfg.canal === null) {
      toast('Asigna un canal antes de marcar calibrado.', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: `Marcar ${jointLabel(id)} como calibrado`,
      body: (
        <div className="list">
          <div className="kv">
            <span>Canal</span>
            <span>{cfg.canal}</span>
            <span>Mínimo</span>
            <span>{minUs} µs</span>
            <span>Referencia</span>
            <span>{refUs} µs</span>
            <span>Máximo</span>
            <span>{maxUs} µs</span>
          </div>
          {!real && <div className="note warn">Estás en SIMULACIÓN: confirma sólo si estos valores provienen de una prueba física previa.</div>}
          <div>Con estos límites, la ejecución coordinada podrá mover este canal. No son límites de seguridad absolutos: revisa topes y cargas.</div>
        </div>
      ),
      checks: ['Los valores se obtuvieron sin forzar topes mecánicos, con el robot sostenido.'],
      confirmLabel: 'Marcar calibrado',
    });
    if (!ok) return;
    update(id, {
      calibracion: {
        estado: 'calibrado',
        fecha: new Date().toISOString(),
        origen: real ? `Dashboard · robot real · firmware ${link.firmware?.fw ?? '?'}` : 'Dashboard · ingreso manual (simulación)',
        notas: cfg.calibracion.notas,
      },
    });
    useApp.getState().addEvent('ok', 'perfil', `${jointLabel(id)} marcado como calibrado (${minUs}/${refUs}/${maxUs} µs).`);
  };

  return (
    <div>
      <div className="section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="chk" title={armed ? 'Desarma para cambiar el modo del firmware' : ''}>
            <input type="checkbox" checked={calActive} disabled={armed} onChange={(e) => setCal(e.target.checked)} />
            <b style={{ color: 'var(--text)' }}>Sesión de calibración</b>
          </label>
          <span className={`tag ${calActive ? 'warn' : 'muted'}`}>{calActive ? 'armará en modo CAL' : 'armará en modo EJECUCIÓN'}</span>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Modo separado de la ejecución coordinada: el firmware acepta un canal por orden y pasos ≤ 50 µs, dentro de la banda de exploración.
        </div>
      </div>

      <div className="section">
        <h4>Procedimiento</h4>
        <ol className="hint" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Robot sostenido en soporte; para explorar extremos, desacopla el brazo del servo.</li>
          <li>Define una banda de exploración conservadora (p. ej. la histórica 1300–1700 µs).</li>
          <li>Activa la sesión, arma y habilita sólo este canal en la referencia.</li>
          <li>Avanza en pasos pequeños observando la pata. Nunca hasta topar.</li>
          <li>Marca mínimo, referencia y máximo seguros y anota el efecto de +µs.</li>
          <li>Marca calibrado y exporta el perfil (pestaña Perfil).</li>
        </ol>
      </div>

      <div className="section">
        <h4>Articulación</h4>
        <div className="row">
          <select className="field" value={id} onChange={(e) => useApp.getState().select(e.target.value as JointId)} style={{ flex: 1 }}>
            {ALL_JOINTS.map((j) => (
              <option key={j} value={j}>
                {jointLabel(j)} — {getJoint(profile, j).canal === null ? 'sin canal' : `canal ${getJoint(profile, j).canal}`}
              </option>
            ))}
          </select>
          <ChannelBadge j={cfg} />
          {isCalibrated(cfg) ? <span className="tag ok">calibrado</span> : <span className="tag muted">{cfg.calibracion.estado}</span>}
        </div>
        <div className="grid3" style={{ marginTop: 8 }}>
          <label className="fl">
            Canal
            <select
              className="field mono"
              value={cfg.canal ?? ''}
              disabled={enabled}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                update(id, { canal: v, canalEstado: v === null ? 'sin-asignar' : cfg.canalEstado === 'sin-asignar' ? 'propuesto' : cfg.canalEstado });
              }}
            >
              <option value="">—</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="fl">
            Estado del canal
            <select className="field" value={cfg.canalEstado} disabled={enabled} onChange={(e) => update(id, { canalEstado: e.target.value as ChannelStatus })}>
              <option value="probado">probado</option>
              <option value="propuesto">propuesto</option>
              <option value="sin-asignar">sin asignar</option>
            </select>
          </label>
          <label className="fl">
            Transmisión
            <label className="chk" style={{ height: 28 }}>
              <input type="checkbox" checked={cfg.transmisionPermitida} disabled={enabled} onChange={(e) => update(id, { transmisionPermitida: e.target.checked })} />
              permitida
            </label>
          </label>
        </div>
        {jointIssues.map((i, k) => (
          <div key={k} className={`note ${i.level === 'error' ? 'err' : 'warn'}`} style={{ marginTop: 6 }}>
            <IAlert size={13} /> {i.level === 'error' ? 'ERROR: ' : 'Aviso: '}
            {i.mensaje}
          </div>
        ))}
      </div>

      <div className="section">
        <h4>Banda de exploración</h4>
        <div className="grid3">
          {(['minUs', 'refUs', 'maxUs'] as const).map((f) => (
            <NumField
              key={f}
              label={f === 'minUs' ? 'Mínimo' : f === 'refUs' ? 'Referencia' : 'Máximo'}
              value={cfg.exploracion?.[f] ?? null}
              disabled={enabled}
              onChange={(v) => {
                const b = cfg.exploracion ?? { minUs: 1300, refUs: 1500, maxUs: 1700 };
                if (v === null) update(id, { exploracion: null });
                else update(id, { exploracion: { ...b, [f]: v } });
              }}
            />
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn xs" disabled={enabled} onClick={() => update(id, { exploracion: { minUs: 1300, refUs: 1500, maxUs: 1700 } })}>
            Usar 1300–1700 (histórica)
          </button>
          <button className="btn xs ghost" disabled={enabled || !cfg.exploracion} onClick={() => update(id, { exploracion: null })}>
            Quitar
          </button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          {elig.ok ? `Elegible para calibración: ${elig.motivo}.` : `No elegible: ${elig.motivo}`} {enabled && 'Desactiva el canal para cambiar límites.'}
        </div>
        {cfg.historico.length > 0 && (
          <div className="hint" style={{ marginTop: 6 }}>
            Referencias históricas (no autorizan movimiento):
            {cfg.historico.map((hh, i) => (
              <div key={i}>
                · <span className="mono">{hh.minUs}–{hh.maxUs} µs</span> — {hh.fuente}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h4>Exploración por pasos</h4>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="hint">{real ? 'Consigna solicitada/confirmada' : 'Consigna simulada'}</span>
          <span className="mono" style={{ fontSize: 18, fontWeight: 650, color: 'var(--sel)' }}>
            {cur ?? '—'} <span className="unit">µs</span>
          </span>
        </div>
        <div className="steps" style={{ marginTop: 6 }}>
          {[-50, -25, -10, -5, -1].map((d) => (
            <button key={d} className="btn sm" style={{ flex: 1 }} onClick={() => step(d)} disabled={cur === null}>
              {d}
            </button>
          ))}
        </div>
        <div className="steps" style={{ marginTop: 4 }}>
          {[1, 5, 10, 25, 50].map((d) => (
            <button key={d} className="btn sm" style={{ flex: 1 }} onClick={() => step(d)} disabled={cur === null}>
              +{d}
            </button>
          ))}
        </div>
        <div className="grid3" style={{ marginTop: 8 }}>
          <button className="btn sm" style={{ padding: '0 4px' }} onClick={() => capture('minUs')} disabled={cur === null}>
            Marcar mín.
          </button>
          <button className="btn sm" style={{ padding: '0 4px' }} onClick={() => capture('refUs')} disabled={cur === null}>
            Marcar ref.
          </button>
          <button className="btn sm" style={{ padding: '0 4px' }} onClick={() => capture('maxUs')} disabled={cur === null}>
            Marcar máx.
          </button>
        </div>
        <div className="grid3" style={{ marginTop: 8 }}>
          {(['minUs', 'refUs', 'maxUs'] as const).map((f) => (
            <NumField key={f} label={f === 'minUs' ? 'Mínimo calibrado' : f === 'refUs' ? 'Referencia calibrada' : 'Máximo calibrado'} value={cfg[f]} onChange={(v) => update(id, { [f]: v })} />
          ))}
        </div>
      </div>

      <div className="section">
        <h4>Sentido y relación visual</h4>
        <label className="fl">
          Al aumentar el pulso (+µs)…
          <input className="field" value={cfg.efectoPulsoMas ?? ''} placeholder="p. ej. extiende / hacia atrás" onChange={(e) => update(id, { efectoPulsoMas: e.target.value || null })} />
        </label>
        <label className="chk" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={cfg.efectoConfirmado} onChange={(e) => update(id, { efectoConfirmado: e.target.checked })} />
          Efecto comprobado físicamente
        </label>
        <div className="grid3" style={{ marginTop: 8 }}>
          <label className="fl">
            Signo visual
            <select className="field" value={cfg.visual.signo} onChange={(e) => update(id, { visual: { ...cfg.visual, signo: Number(e.target.value) as 1 | -1, fuenteSigno: 'Editado en dashboard' } })}>
              <option value={1}>+1</option>
              <option value={-1}>−1</option>
            </select>
          </label>
          <label className="fl">
            µs por grado (est.)
            <input
              className="field num mono"
              type="number"
              step={0.1}
              value={Number(cfg.visual.usPorGrado.toFixed(2))}
              onChange={(e) => Number(e.target.value) > 0 && update(id, { visual: { ...cfg.visual, usPorGrado: Number(e.target.value) } })}
            />
          </label>
          <label className="fl">
            Offset visual (°)
            <input className="field num mono" type="number" value={cfg.visual.offsetGrados} onChange={(e) => update(id, { visual: { ...cfg.visual, offsetGrados: Number(e.target.value) || 0 } })} />
          </label>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Fuente del signo: {cfg.visual.fuenteSigno}. Estos valores sólo afectan al dibujo: no convierten µs en grados físicos.
        </div>
      </div>

      <div className="section">
        <div className="row">
          <button className="btn primary sm" onClick={markCalibrated}>
            <ICheck size={13} /> Marcar calibrado
          </button>
          <button
            className="btn sm"
            disabled={cfg.calibracion.estado === 'sin-calibrar'}
            onClick={() => update(id, { calibracion: { estado: 'sin-calibrar', fecha: null, origen: null, notas: cfg.calibracion.notas } })}
          >
            Volver a sin calibrar
          </button>
        </div>
        {cfg.calibracion.fecha && (
          <div className="hint" style={{ marginTop: 6 }}>
            Calibrado {new Date(cfg.calibracion.fecha).toLocaleString()} · {cfg.calibracion.origen}
          </div>
        )}
      </div>
    </div>
  );
}
