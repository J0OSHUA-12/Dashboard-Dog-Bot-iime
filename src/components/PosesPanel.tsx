import { ALL_JOINTS, JointId } from '../../shared/joints';
import { coordinatedReady, getJoint } from '../../shared/profile';
import { Pose, SEQUENCES, SavedPose, referencePose } from '../../shared/sequences';
import { realDisplayUs, uid, useApp } from '../state/store';
import { downloadText, pickFile, stamp } from '../state/persist';
import { applyPose, canRunPhysically, startSequence, stopSequence } from '../services/player';
import { confirmDialog, promptDialog, toast } from './Dialog';
import { IAlert, IDownload, IFolder, IPlay, IStop, ITrash } from './icons';
import { HelpTip } from './Disclosure';

function currentPose(): Pose {
  const s = useApp.getState();
  const out: Pose = {};
  for (const id of ALL_JOINTS) {
    const v = s.mode === 'sim' ? s.joints[id].simUs : realDisplayUs(s.joints[id]).us;
    if (v !== null) out[id] = v;
  }
  return out;
}

async function applyWithChecks(pose: Pose, nombre: string) {
  const s = useApp.getState();
  if (s.mode === 'real') {
    const ids = Object.keys(pose) as JointId[];
    const r = coordinatedReady(s.profile, ids);
    if (!r.ok) {
      toast(`Bloqueado en robot real: ${r.faltan[0].joint} — ${r.faltan[0].motivo}`, 'error');
      return;
    }
    const ok = await confirmDialog({
      title: `Aplicar pose "${nombre}" al robot`,
      danger: true,
      body: <div>Transición de 1,5 s desde la última consigna conocida (no medida) de cada canal habilitado.</div>,
      checks: ['Robot sostenido; trayectoria libre de choques.'],
      confirmLabel: 'Aplicar pose',
    });
    if (!ok) return;
  }
  try {
    await applyPose(pose, nombre);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

/** `part` limita el panel a una de sus dos secciones (el HUD las abre por separado). */
export function PosesPanel({ part }: { part?: 'secuencias' | 'poses' } = {}) {
  const poses = useApp((s) => s.poses);
  const profile = useApp((s) => s.profile);
  const mode = useApp((s) => s.mode);
  const seq = useApp((s) => s.seq);
  const setSeq = useApp((s) => s.setSeq);
  useApp((s) => s.link.state);

  const savePose = async () => {
    const name = await promptDialog({
      title: 'Guardar pose',
      body: <div>Se guardan las consignas {mode === 'sim' ? 'simuladas' : 'conocidas del firmware'} en µs. No son posiciones medidas.</div>,
      input: { label: 'Nombre', initial: `Pose ${poses.length + 1}`, validate: (v) => (v.trim().length < 1 ? 'Escribe un nombre' : null) },
      confirmLabel: 'Guardar',
    });
    if (!name) return;
    const p: SavedPose = { id: uid('pose'), nombre: name.trim(), creado: new Date().toISOString(), pulses: currentPose(), notas: mode === 'sim' ? 'Creada en simulación' : 'Creada en robot real' };
    useApp.getState().savePose(p);
    toast('Pose guardada', 'ok');
  };

  const runSeq = async (id: string) => {
    const def = SEQUENCES.find((s) => s.id === id)!;
    if (mode === 'real') {
      const chk = canRunPhysically(id);
      if (!chk.ok) {
        toast('Bloqueado: ' + chk.motivo, 'error');
        return;
      }
      const ok = await confirmDialog({
        title: `Ejecutar en el robot: ${def.nombre}`,
        danger: true,
        body: (
          <div className="list">
            <div>{def.descripcion}</div>
            <div className="note warn">Ensayo SUSPENDIDO: no demuestra que el robot pueda sostenerse ni caminar. Amplitud {Math.round(seq.amplitude * 100)} %.</div>
          </div>
        ),
        checks: ['El robot está sostenido en el soporte con las patas en el aire.', 'Tengo a mano DETENER (Esc) y el interruptor físico.'],
        confirmLabel: 'Ejecutar secuencia',
      });
      if (!ok) return;
    }
    startSequence(id);
  };

  const builtins: { nombre: string; pose: Pose; nota: string; simOnly: boolean }[] = [
    { nombre: 'Referencia del perfil', pose: referencePose(profile), nota: 'Referencia calibrada, de exploración o 1500 µs.', simOnly: false },
    {
      nombre: 'Centro de señal 1500 µs',
      pose: Object.fromEntries(ALL_JOINTS.map((j) => [j, 1500])) as Pose,
      nota: '1500 µs NO es necesariamente la postura recta.',
      simOnly: true,
    },
  ];

  return (
    <div>
      {part !== 'poses' && (
      <div className="section">
        <h4>Secuencias</h4>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="hint">Amplitud</span>
          <input
            type="range"
            className="slider"
            min={30}
            max={100}
            value={Math.round(seq.amplitude * 100)}
            disabled={seq.playing}
            style={{ ['--pct' as string]: `${((seq.amplitude * 100 - 30) / 70) * 100}%` }}
            onChange={(e) => setSeq({ amplitude: Number(e.target.value) / 100 })}
            aria-label="Amplitud de secuencia"
          />
          <span className="mono" style={{ width: 40, textAlign: 'right' }}>
            {Math.round(seq.amplitude * 100)}%
          </span>
        </div>
        <div className="list">
          {SEQUENCES.map((d) => {
            const playing = seq.playing && seq.id === d.id;
            const phys = mode === 'real' ? canRunPhysically(d.id) : { ok: true, motivo: '' };
            return (
              <div key={d.id} className="item">
                <div className="item-head">{d.nombre}</div>
                <span className={`tag ${d.etiqueta === 'PROPUESTO' ? 'warn' : 'orange'}`} style={{ marginTop: 4 }}>
                  {d.etiqueta}
                </span>
                <div className="hint" style={{ margin: '4px 0 6px' }}>
                  {d.descripcion}
                </div>
                <div className="row">
                  {playing ? (
                    <button className="btn sm stop" onClick={() => stopSequence('operador')}>
                      <IStop size={12} /> Detener
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => runSeq(d.id)} disabled={seq.playing || (mode === 'real' && !phys.ok)}>
                      <IPlay size={12} /> {mode === 'sim' ? 'Reproducir en simulación' : 'Ejecutar en robot…'}
                    </button>
                  )}
                  {playing && <span className="tag sim">{seq.phase === 'transicion' ? 'transición 1,5 s' : 'en curso'}</span>}
                </div>
                {mode === 'real' && !phys.ok && (
                  <div className="hint warn-text" style={{ marginTop: 6 }}>
                    <IAlert size={12} /> {phys.motivo}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {part !== 'secuencias' && (
      <div className="section">
        <h4>
          Poses
          <HelpTip label="Poses y secuencias en robot real">
            En robot real, las poses y secuencias exigen perfil calibrado en todas sus articulaciones, canales habilitados y confirmación. Cargar un perfil o una pose nunca ejecuta movimiento.
          </HelpTip>
        </h4>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn sm" onClick={savePose}>
            Guardar pose actual
          </button>
          <button className="btn sm ghost" onClick={() => downloadText(`dogbot-poses-${stamp()}.json`, JSON.stringify({ schema: 'dogbot-poses', version: 1, poses }, null, 2), 'application/json')}>
            <IDownload size={13} /> Exportar
          </button>
          <button
            className="btn sm ghost"
            onClick={async () => {
              const f = await pickFile('.json,application/json');
              if (!f) return;
              try {
                const o = JSON.parse(f.text);
                if (o.schema !== 'dogbot-poses' || !Array.isArray(o.poses)) throw new Error('Formato no reconocido');
                let n = 0;
                for (const p of o.poses) {
                  if (typeof p?.nombre !== 'string' || typeof p?.pulses !== 'object') continue;
                  const pulses: Pose = {};
                  for (const [k, v] of Object.entries(p.pulses)) if (ALL_JOINTS.includes(k as JointId) && Number.isInteger(v) && (v as number) >= 500 && (v as number) <= 2500) pulses[k as JointId] = v as number;
                  useApp.getState().savePose({ id: uid('pose'), nombre: p.nombre, creado: p.creado ?? new Date().toISOString(), pulses, notas: 'Importada' });
                  n++;
                }
                toast(`${n} pose(s) importadas`, 'ok');
              } catch (e) {
                toast('Importación rechazada: ' + (e as Error).message, 'error');
              }
            }}
          >
            <IFolder size={13} /> Importar
          </button>
        </div>
        <div className="list">
          {builtins.map((b) => (
            <div key={b.nombre} className="item">
              <div className="item-head">
                {b.nombre}
                <span className="spacer" />
                <span className="tag muted">integrada</span>
              </div>
              <div className="hint" style={{ margin: '3px 0 6px' }}>
                {b.nota}
              </div>
              <button className="btn xs" disabled={b.simOnly && mode === 'real'} onClick={() => applyWithChecks(b.pose, b.nombre)}>
                Aplicar{b.simOnly && mode === 'real' ? ' (sólo simulación)' : ''}
              </button>
            </div>
          ))}
          {poses.map((p) => {
            const ids = Object.keys(p.pulses) as JointId[];
            return (
              <div key={p.id} className="item">
                <div className="item-head">
                  {p.nombre}
                  <span className="spacer" />
                  <span className="hint">{ids.length} art.</span>
                </div>
                <div className="hint mono" style={{ margin: '3px 0 6px', wordBreak: 'break-all' }}>
                  {ids
                    .slice(0, 6)
                    .map((j) => `${getJoint(profile, j).canal ?? j}:${p.pulses[j]}`)
                    .join(' ')}
                  {ids.length > 6 ? ' …' : ''}
                </div>
                <div className="row">
                  <button className="btn xs" onClick={() => applyWithChecks(p.pulses, p.nombre)}>
                    Aplicar
                  </button>
                  <button className="btn xs ghost" onClick={() => useApp.getState().deletePose(p.id)} aria-label="Eliminar pose">
                    <ITrash size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
