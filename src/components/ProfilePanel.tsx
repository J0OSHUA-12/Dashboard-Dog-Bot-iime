import { jointLabel } from '../../shared/joints';
import { ProfileImportError, applyRearChannelProposal, createInitialProfile, hasErrors, isCalibrated, parseProfileJson, serializeProfile } from '../../shared/profile';
import { useApp } from '../state/store';
import { downloadText, pickFile, stamp } from '../state/persist';
import { MODEL_PARAM_LABEL, MODEL_PARAM_RANGE, ModelParams, DEFAULT_MODEL_PARAMS } from '../three/modelParams';
import { confirmDialog, toast } from './Dialog';
import { IAlert, ICheck, IDownload, IError, IFolder } from './icons';
import { Disclosure, HelpTip } from './Disclosure';

export function ProfilePanel() {
  const profile = useApp((s) => s.profile);
  const issues = useApp((s) => s.issues);
  const link = useApp((s) => s.link);
  const setLink = useApp((s) => s.setLink);
  const model = useApp((s) => s.modelParams);
  const setModel = useApp((s) => s.setModelParams);
  const armed = link.state === 'armado';
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'aviso');

  const importProfile = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const { profile: p, issues: iss } = parseProfileJson(f.text);
      if (armed) {
        toast('Desarma antes de cambiar de perfil.', 'error');
        return;
      }
      useApp.getState().setProfile(p, `Perfil importado: ${p.nombre} (${iss.length} aviso(s)). No se ejecutó ningún movimiento.`);
      toast('Perfil importado', 'ok');
    } catch (e) {
      const err = e as ProfileImportError;
      const detail = err.issues?.length ? ' — ' + err.issues.slice(0, 3).map((i) => i.mensaje).join(' · ') : '';
      useApp.getState().addEvent('error', 'perfil', `Importación rechazada: ${err.message}${detail}`);
      toast(`Rechazado: ${err.message}${detail}`, 'error');
    }
  };

  return (
    <div>
      <div className="section">
        <h4>Perfil de calibración</h4>
        <label className="fl">
          Nombre
          <input
            className="field"
            value={profile.nombre}
            onChange={(e) => useApp.getState().setProfile({ ...profile, nombre: e.target.value, modificado: new Date().toISOString() }, 'Nombre de perfil actualizado')}
          />
        </label>
        <div className="hint" style={{ marginTop: 6 }}>
          Esquema <span className="mono">{profile.schema} v{profile.version}</span> · modificado {new Date(profile.modificado).toLocaleString()}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => downloadText(`dogbot-perfil-${stamp()}.json`, serializeProfile(profile), 'application/json')}>
            <IDownload size={13} /> Exportar JSON
          </button>
          <button className="btn sm" onClick={importProfile} disabled={armed}>
            <IFolder size={13} /> Importar…
          </button>
          <button
            className="btn sm ghost"
            disabled={armed}
            onClick={async () => {
              const ok = await confirmDialog({ title: 'Restablecer perfil inicial', body: <div>Se perderán límites y cambios no exportados de este perfil.</div>, confirmLabel: 'Restablecer', danger: true });
              if (ok) useApp.getState().setProfile(createInitialProfile(), 'Perfil inicial restablecido.');
            }}
          >
            Restablecer
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          {errors.length === 0 ? (
            <div className="note">
              <ICheck size={13} color="var(--ok)" /> Sin errores de validación{warns.length ? ` · ${warns.length} aviso(s)` : ''}.
            </div>
          ) : (
            <div className="note err">
              <IAlert size={13} /> {errors.length} error(es): la ejecución física queda bloqueada en las articulaciones afectadas.
            </div>
          )}
          {issues.slice(0, 8).map((i, k) => (
            <div key={k} className={`hint ${i.level === 'error' ? 'err-text' : 'warn-text'}`} style={{ marginTop: 4 }}>
              {i.level === 'error' ? <IError size={12} /> : <IAlert size={12} />} {i.mensaje}
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h4>
          Canales (12 articulaciones)
          <HelpTip label="Canales">Canales 12–15 quedan fuera del perfil. Sin canal asignado, una articulación sólo se mueve en simulación.</HelpTip>
        </h4>
        <table className="tbl">
          <thead>
            <tr>
              <th>Articulación</th>
              <th>CH</th>
              <th>Estado</th>
              <th>Tx</th>
              <th>Calib.</th>
            </tr>
          </thead>
          <tbody>
            {profile.joints.map((j) => (
              <tr key={j.joint} onClick={() => useApp.getState().select(j.joint)} style={{ cursor: 'pointer' }}>
                <td>{jointLabel(j.joint)}</td>
                <td className="mono">{j.canal ?? '—'}</td>
                <td>{j.canalEstado}</td>
                <td>{j.transmisionPermitida ? 'sí' : 'no'}</td>
                <td>{isCalibrated(j) ? <span className="ok-text"><ICheck size={11} /> sí</span> : <span style={{ color: 'var(--muted)' }}>no</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn sm"
            disabled={armed || profile.joints.some((j) => j.joint.startsWith('P') && j.canal !== null)}
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Asignar propuesta 6–11 a posteriores',
                body: <div>Se asignarán canales 6–11 como PROPUESTA (sin cableado confirmado) con transmisión desactivada. Confirma el cableado real antes de permitir transmisión.</div>,
                confirmLabel: 'Asignar propuesta',
              });
              if (ok) useApp.getState().setProfile(applyRearChannelProposal(profile), 'Propuesta de canales 6–11 para patas posteriores (sin cableado confirmado).');
            }}
          >
            Proponer 6–11 para posteriores
          </button>
        </div>
      </div>

      <div className="section">
        <h4>
          Enlace y pérdida de comunicación
          <HelpTip label="HOLD u OFF">
            HOLD: detiene la trayectoria y mantiene la última consigna; los servos siguen haciendo fuerza (calor). OFF: corta la señal; el robot puede caer si no está sostenido. Ninguna es universalmente segura: pruébalas con el robot sostenido.
          </HelpTip>
        </h4>
        <div className="grid2">
          <label className="fl">
            Política si se pierde el enlace
            <select className="field" value={link.linkPolicy} disabled={armed} onChange={(e) => setLink({ linkPolicy: e.target.value as 'HOLD' | 'OFF' })}>
              <option value="HOLD">Mantener consigna (HOLD)</option>
              <option value="OFF">Cortar PWM (OFF)</option>
            </select>
          </label>
          <label className="fl">
            Tiempo sin datos (ms)
            <input
              className="field num mono"
              type="number"
              min={200}
              max={10000}
              value={link.linkMs}
              disabled={armed}
              onChange={(e) => setLink({ linkMs: Math.min(10000, Math.max(200, Number(e.target.value) || 1500)) })}
            />
          </label>
        </div>
      </div>

      <div className="section">
        <Disclosure summary="Modelo 3D (aproximado)" meta="dimensiones en mm" className="section-disclosure">
        <div className="hint" style={{ marginBottom: 8 }}>
          Dimensiones estimadas a partir de fotografías, en mm. Pendientes de medir en el robot.
        </div>
        <div className="grid2">
          {(Object.keys(MODEL_PARAM_LABEL) as (keyof ModelParams)[]).map((k) => (
            <label key={k} className="fl">
              {MODEL_PARAM_LABEL[k]}
              <input
                className="field num mono"
                type="number"
                min={MODEL_PARAM_RANGE[k][0]}
                max={MODEL_PARAM_RANGE[k][1]}
                value={model[k]}
                onChange={(e) => setModel({ [k]: Number(e.target.value) } as Partial<ModelParams>)}
              />
            </label>
          ))}
        </div>
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setModel(DEFAULT_MODEL_PARAMS)}>
          Valores por defecto
        </button>
        </Disclosure>
      </div>
      {hasErrors(issues) && <div style={{ height: 4 }} />}
    </div>
  );
}
