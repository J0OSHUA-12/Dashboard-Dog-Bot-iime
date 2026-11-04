import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_JOINTS, jointLabel } from '../../shared/joints';
import { DOSSIER_MEASUREMENTS, PHYSICAL_SIGNALS, SOURCE_LABEL, VALIDITY_LABEL, validityFor } from '../../shared/telemetry';
import { BottomTab, EventEntry, TestRecord, uid, useApp } from '../state/store';
import { allSeries, getSeries } from '../state/series';
import { downloadText, stamp, toCsv } from '../state/persist';
import { service } from '../services/serviceClient';
import { client } from '../services/robotLink';
import { ChartSeries, LineChart } from './Chart';
import { toast } from './Dialog';
import { IAlert, IBattery, IChevron, IDownload, IError, IGauge, IInfo, ICheck, IThermo, ITrash } from './icons';

const TABS: [BottomTab, string][] = [
  ['telemetria', 'Telemetría'],
  ['eventos', 'Eventos'],
  ['serie', 'Monitor serie'],
  ['ensayos', 'Registro de ensayos'],
  ['mediciones', 'Mediciones'],
];

const CH_COLORS = ['#ff7a1a', '#ef3e36', '#ffb15c', '#e8c547', '#ff5a8a', '#c5a3ff', '#7cc4ff', '#57c78f', '#a8adb8', '#f08c5a', '#b9e06b', '#6fd3d0'];

function fmtTime(at: number) {
  const d = new Date(at);
  return d.toLocaleTimeString('es-BO', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0').slice(0, 1);
}

function LevelIcon({ l }: { l: EventEntry['level'] }) {
  if (l === 'error') return <IError size={13} color="var(--err)" aria-label="error" />;
  if (l === 'aviso') return <IAlert size={13} color="var(--warn)" aria-label="aviso" />;
  if (l === 'ok') return <ICheck size={13} color="var(--ok)" aria-label="correcto" />;
  return <IInfo size={13} color="var(--text2)" aria-label="info" />;
}

function exportSession() {
  const s = useApp.getState();
  const rows: unknown[][] = [];
  for (const e of s.events) rows.push([new Date(e.at).toISOString(), e.mode === 'sim' ? 'SIMULACION' : 'ROBOT_REAL', 'evento', '', '', e.source, e.level, e.text]);
  for (const space of ['sim', 'real'] as const) {
    for (const [id, data] of allSeries(space)) {
      const fuente = space === 'sim' ? (id === 'banco_v' || id === 'corriente_a' ? 'SIMULADO (sintético)' : 'consigna simulada') : id === 'rtt' ? 'PC (RTT HB)' : 'firmware (consigna escrita)';
      for (const p of data) rows.push([new Date(p.t).toISOString(), space === 'sim' ? 'SIMULACION' : 'ROBOT_REAL', 'serie', id, p.v ?? '', fuente, p.v === null ? 'sin-dato' : 'valido', '']);
    }
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  downloadText(`dogbot-sesion-${stamp()}.csv`, toCsv(['timestamp', 'modo', 'tipo', 'canal_o_senal', 'valor', 'fuente', 'validez', 'detalle'], rows), 'text/csv');
}

function Telemetry() {
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const profile = useApp((s) => s.profile);
  const selected = useApp((s) => s.selected);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const sim = mode === 'sim';
  const now = Date.now();
  const channels = profile.joints.filter((j) => j.canal !== null).map((j) => j.canal!) as number[];
  const selCh = profile.joints.find((j) => j.joint === selected)?.canal;
  const shown = useMemo(() => {
    const base = channels.filter((c) => c <= 5);
    if (selCh !== null && selCh !== undefined && !base.includes(selCh)) base.push(selCh);
    return base.slice(0, 7);
  }, [channels.join(','), selCh]);

  const consignaSeries: ChartSeries[] = useMemo(
    () => shown.map((c) => ({ label: `CH${c}`, color: CH_COLORS[c % CH_COLORS.length], data: () => getSeries(sim ? 'sim' : 'real', `ch${c}`) })),
    [shown.join(','), sim],
  );
  const bankSeries: ChartSeries[] = useMemo(
    () => [
      { label: 'Tensión (V) SIMULADA', color: '#ffb15c', data: () => getSeries('sim', 'banco_v') },
    ],
    [],
  );
  const currSeries: ChartSeries[] = useMemo(() => [{ label: 'Corriente (A) SIMULADA', color: '#ef3e36', data: () => getSeries('sim', 'corriente_a') }], []);
  const rttSeries: ChartSeries[] = useMemo(() => [{ label: 'RTT (ms)', color: '#ff7a1a', data: () => getSeries('real', 'rtt') }], []);
  const rttValidity = validityFor(link.rttAt, now, 500);
  const pwValidity = validityFor(link.lastRxAt, now, 500);

  const icons: Record<string, ReactNode> = {
    bateria_v: <IBattery size={12} />,
    banco_v: <IGauge size={12} />,
    corriente_total_a: <IGauge size={12} />,
    corriente_servo_a: <IGauge size={12} />,
    temp_c: <IThermo size={12} />,
  };

  return (
    <div className="tele">
      <div className="cards" aria-label="Señales">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="k">Enlace / firmware</div>
          {sim ? (
            <div className="v na">Simulación: sin enlace con hardware</div>
          ) : (
            <>
              <div className="v" style={{ fontSize: 12.5 }}>
                {link.state} · {link.firmware ? `fw ${link.firmware.fw}` : 'sin identificar'} · RTT {link.rttMs ?? '—'} ms
              </div>
              <div className="s">
                Fuente: PC/firmware · {link.rttAt ? `hace ${Math.round((now - link.rttAt) / 1000)} s` : 'sin datos'} · {VALIDITY_LABEL[rttValidity]} · PW {VALIDITY_LABEL[pwValidity]}
              </div>
            </>
          )}
        </div>
        {PHYSICAL_SIGNALS.filter((s) => s.id !== 'angulo' && s.id !== 'imu').map((s) => (
          <div className="card" key={s.id} title={s.nota}>
            <div className="k">
              {icons[s.id]} {s.label}
            </div>
            <div className="v na">Sin sensor</div>
            <div className="s">
              {s.unit} · {s.nota}
            </div>
          </div>
        ))}
        <div className="card" title="Servos de 3 hilos sin feedback">
          <div className="k">Ángulo físico / IMU</div>
          <div className="v na">No disponible</div>
          <div className="s">Sólo ángulo ESTIMADO visual</div>
        </div>
      </div>
      <div className="charts">
        <div className="chart">
          <div className="chart-head">
            <span className="t">{sim ? 'Consigna simulada por canal' : 'Consigna escrita por el firmware (PW)'}</span>
            <span className="spacer" />
            <span className={`tag ${sim ? 'sim' : 'real'}`}>{sim ? 'SIMULACIÓN' : 'FIRMWARE'}</span>
          </div>
          {!sim && channels.length > 0 && getSeries('real', `ch${shown[0]}`).length === 0 ? (
            <div className="empty">Sin datos del firmware. Las consignas aparecen al habilitar canales (no son posiciones medidas).</div>
          ) : (
            <LineChart series={consignaSeries} unit="µs" yMin={1300} yMax={1700} gapMs={sim ? 1500 : 1200} />
          )}
          <div className="legend">
            {consignaSeries.map((s) => (
              <span key={s.label}>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="t">{sim ? 'Banco de servos — tensión' : 'Tensión del banco'}</span>
            <span className="spacer" />
            {sim ? <span className="tag sim">SIMULADO</span> : <span className="tag muted">sin sensor</span>}
          </div>
          {sim ? (
            <>
              <LineChart series={bankSeries} unit="V" yMin={6.9} yMax={7.1} />
              <div className="legend">
                <span>Señal sintética para explorar la interfaz. No representa el robot.</span>
              </div>
            </>
          ) : (
            <div className="empty">No hay sensor de tensión conectado al Arduino. Consulta las mediciones manuales (pestaña Mediciones).</div>
          )}
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="t">{sim ? 'Banco de servos — corriente' : 'Latencia de enlace (HB)'}</span>
            <span className="spacer" />
            {sim ? <span className="tag sim">SIMULADO</span> : <span className="tag">PC</span>}
          </div>
          {sim ? (
            <>
              <LineChart series={currSeries} unit="A" yMin={0} yMax={0.6} />
              <div className="legend">
                <span>Sintética. Las corrientes reales requieren un sensor; no se reparte la total entre servos.</span>
              </div>
            </>
          ) : getSeries('real', 'rtt').length === 0 ? (
            <div className="empty">Sin heartbeat: el RTT se mide sólo con el robot armado.</div>
          ) : (
            <LineChart series={rttSeries} unit="ms" yMin={0} yMax={60} gapMs={1500} />
          )}
        </div>
      </div>
    </div>
  );
}

function Events() {
  const events = useApp((s) => s.events);
  const [filter, setFilter] = useState<'todos' | 'error' | 'aviso'>('todos');
  const ref = useRef<HTMLDivElement>(null);
  const list = events.filter((e) => filter === 'todos' || e.level === filter || (filter === 'aviso' && e.level === 'error'));
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [list.length]);
  return (
    <div className="fill">
      <div className="row" style={{ padding: '6px 10px' }}>
        {(['todos', 'aviso', 'error'] as const).map((f) => (
          <button key={f} className={`btn xs ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'todos' ? 'Todos' : f === 'aviso' ? 'Avisos y errores' : 'Sólo errores'}
          </button>
        ))}
        <span className="spacer" />
        <span className="hint">{events.length} eventos</span>
      </div>
      <div className="loglist" ref={ref} role="log">
        {list.map((e) => (
          <div key={e.id} className={`logline ${e.level}`}>
            <span className="t">{fmtTime(e.at)}</span>
            <LevelIcon l={e.level} />
            <span className="src">
              {e.mode === 'sim' ? 'SIM' : 'REAL'} · {e.source}
            </span>
            <span className="msg">
              {e.level === 'error' ? 'ERROR: ' : ''}
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SerialMonitor() {
  const lines = useApp((s) => s.serial);
  const link = useApp((s) => s.link);
  const mode = useApp((s) => s.mode);
  const [txt, setTxt] = useState('');
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (auto) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length, auto]);
  const open = link.serial.state === 'abierto';
  const armed = link.state === 'armado';
  const send = () => {
    const l = txt.trim();
    if (!l) return;
    // eslint-disable-next-line no-control-regex
    if (l.length > 200 || /[^\x20-\x7E]/.test(l)) {
      toast('Sólo ASCII imprimible, máx. 200 caracteres.', 'error');
      return;
    }
    if (!service.send({ t: 'send', line: l, priority: false })) toast('Servicio no disponible', 'error');
    setTxt('');
  };
  return (
    <div className="fill">
      <div className="row" style={{ padding: '6px 10px' }}>
        <span className={`dot ${open ? 'ok' : ''}`} />
        <span className="hint">
          {open ? `${link.serial.path} · ${link.serial.baud} baudios` : mode === 'sim' ? 'Simulación: sin puerto serie' : 'Puerto cerrado'}
          {link.serial.diagnostic ? ` · ${link.serial.diagnostic}` : ''}
        </span>
        <span className="spacer" />
        <label className="chk" title="Velocidad usada al conectar: 115200 para DogBotDashboard, 9600 para los sketches históricos">
          Baudios
          <select className="field mono" style={{ width: 84, height: 24 }} value={link.baud} disabled={open} onChange={(e) => useApp.getState().setLink({ baud: Number(e.target.value) })}>
            {[115200, 57600, 9600].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="chk">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> autodesplazar
        </label>
        <button className="btn xs ghost" onClick={() => useApp.getState().clearSerial()}>
          Limpiar
        </button>
        <button
          className="btn xs ghost"
          onClick={() => downloadText(`dogbot-serie-${stamp()}.txt`, lines.map((l) => `${new Date(l.at).toISOString()} ${l.dir.toUpperCase()} ${l.text}`).join('\n') + '\n')}
        >
          <IDownload size={11} /> Guardar
        </button>
      </div>
      <div className="loglist" ref={ref} role="log" aria-label="Monitor serie">
        {lines.length === 0 && <div className="hint" style={{ padding: '4px 10px' }}>Sin tráfico. TX = enviado por la PC, RX = recibido de la placa.</div>}
        {lines.map((l) => (
          <div key={l.id} className={`serline ${l.dir}`}>
            <span className="t">{fmtTime(l.at)}</span>
            <span className="d">{l.dir === 'rx' ? 'RX' : l.dir === 'tx' ? 'TX' : '··'}</span>
            <span className="m">{l.text}</span>
          </div>
        ))}
      </div>
      <div className="sendbar">
        <input
          className="field mono"
          style={{ flex: 1 }}
          placeholder={armed ? 'Envío manual bloqueado mientras está armado: usa los controles' : 'Línea a enviar (p. ej. "1 STATUS" o comandos de un sketch histórico)'}
          value={txt}
          disabled={!open || armed}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn sm" disabled={!open || armed} onClick={send}>
          Enviar
        </button>
      </div>
      {client.state === 'firmware-desconocido' && (
        <div className="note warn" style={{ margin: '0 10px 6px' }}>
          Firmware sin protocolo DOGBOT: los controles están bloqueados. El monitor sigue disponible.
        </div>
      )}
    </div>
  );
}

const EMPTY_TEST = (): TestRecord => ({
  id: uid('ens'),
  fecha: new Date().toISOString().slice(0, 16),
  modo: useApp.getState().mode,
  montaje: 'suspendido en soporte',
  carga: 'sin carga (patas en el aire)',
  alimentacion: 'LiPo 3S → regulador delantero ~7 V',
  sketch: 'DogBotDashboard 0.1.0',
  perfil: useApp.getState().profile.nombre,
  medicion: '',
  instrumento: '',
  resultado: 'sin evaluar',
  notas: '',
});

function Tests() {
  const tests = useApp((s) => s.tests);
  const [draft, setDraft] = useState<TestRecord>(EMPTY_TEST);
  const f = (k: keyof TestRecord, label: string, opts?: string[]) => (
    <label className="fl" key={k}>
      {label}
      {opts ? (
        <select className="field" value={draft[k] as string} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}>
          {opts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input className="field" type={k === 'fecha' ? 'datetime-local' : 'text'} value={draft[k] as string} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      )}
    </label>
  );
  return (
    <div className="split2">
      <div style={{ padding: 10 }}>
        <div className="grid2">
          {f('fecha', 'Fecha y hora')}
          {f('modo', 'Modo', ['sim', 'real'])}
          {f('montaje', 'Montaje / apoyo', ['suspendido en soporte', 'apoyado en mesa (carga parcial)', 'libre sobre el suelo', 'otro'])}
          {f('carga', 'Carga')}
          {f('alimentacion', 'Alimentación')}
          {f('sketch', 'Sketch / firmware')}
          {f('perfil', 'Perfil')}
          {f('resultado', 'Resultado', ['sin evaluar', 'correcto', 'parcial', 'fallo'])}
          {f('medicion', 'Medición visible (con unidad)')}
          {f('instrumento', 'Instrumento')}
        </div>
        <label className="fl" style={{ marginTop: 6 }}>
          Notas
          <textarea className="field" rows={2} value={draft.notas} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} />
        </label>
        <div className="row" style={{ marginTop: 6 }}>
          <button
            className="btn sm primary"
            onClick={() => {
              useApp.getState().addTest(draft);
              setDraft(EMPTY_TEST());
              toast('Ensayo registrado', 'ok');
            }}
          >
            Registrar ensayo
          </button>
          <button
            className="btn sm ghost"
            onClick={() =>
              downloadText(
                `dogbot-ensayos-${stamp()}.csv`,
                toCsv(
                  ['fecha', 'modo', 'montaje', 'carga', 'alimentacion', 'sketch', 'perfil', 'medicion', 'instrumento', 'resultado', 'notas'],
                  tests.map((t) => [t.fecha, t.modo, t.montaje, t.carga, t.alimentacion, t.sketch, t.perfil, t.medicion, t.instrumento, t.resultado, t.notas]),
                ),
                'text/csv',
              )
            }
          >
            <IDownload size={12} /> CSV
          </button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>Un ensayo simulado nunca cuenta como avance físico. Registra montaje y condiciones de cada prueba real.</div>
      </div>
      <div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Modo</th>
              <th>Montaje</th>
              <th>Sketch</th>
              <th>Medición</th>
              <th>Resultado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 && (
              <tr>
                <td colSpan={7} className="hint">
                  Sin ensayos registrados.
                </td>
              </tr>
            )}
            {tests.map((t) => (
              <tr key={t.id} title={t.notas}>
                <td className="mono">{t.fecha.replace('T', ' ')}</td>
                <td>{t.modo === 'sim' ? <span className="tag sim">SIM</span> : <span className="tag real">REAL</span>}</td>
                <td>{t.montaje}</td>
                <td>{t.sketch}</td>
                <td className="mono">{t.medicion || '—'}</td>
                <td>{t.resultado}</td>
                <td>
                  <button className="btn xs ghost" onClick={() => useApp.getState().deleteTest(t.id)} aria-label="Eliminar">
                    <ITrash size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Measurements() {
  const manual = useApp((s) => s.measurements);
  const [d, setD] = useState({ magnitud: 'corriente', valor: '', unidad: 'A', condicion: '', montaje: 'suspendido', instrumento: '', nota: '' });
  return (
    <div className="split2">
      <div style={{ padding: 10 }}>
        <div className="note" style={{ marginBottom: 8 }}>
          Mediciones manuales con instrumento externo. Se guardan separadas del histórico del dossier y nunca se mezclan con datos simulados.
        </div>
        <div className="grid2">
          <label className="fl">
            Magnitud
            <select className="field" value={d.magnitud} onChange={(e) => setD({ ...d, magnitud: e.target.value, unidad: e.target.value === 'corriente' ? 'A' : 'V' })}>
              <option value="corriente">corriente</option>
              <option value="tension">tensión</option>
            </select>
          </label>
          <label className="fl">
            Valor ({d.unidad})
            <input className="field mono" value={d.valor} onChange={(e) => setD({ ...d, valor: e.target.value })} placeholder="p. ej. 0,41" />
          </label>
          <label className="fl">
            Montaje
            <select className="field" value={d.montaje} onChange={(e) => setD({ ...d, montaje: e.target.value })}>
              <option value="suspendido">suspendido</option>
              <option value="carga parcial">carga parcial</option>
              <option value="desconocido">desconocido</option>
            </select>
          </label>
          <label className="fl">
            Instrumento / punto de medida
            <input className="field" value={d.instrumento} onChange={(e) => setD({ ...d, instrumento: e.target.value })} />
          </label>
        </div>
        <label className="fl" style={{ marginTop: 6 }}>
          Condición del ensayo
          <input className="field" value={d.condicion} onChange={(e) => setD({ ...d, condicion: e.target.value })} placeholder="qué se movía, cuántos servos…" />
        </label>
        <button
          className="btn sm primary"
          style={{ marginTop: 6 }}
          disabled={!d.valor.trim() || !d.condicion.trim()}
          onClick={() => {
            useApp.getState().addMeasurement({
              id: uid('med'),
              fecha: new Date().toISOString().slice(0, 10),
              magnitud: d.magnitud as 'corriente' | 'tension',
              valor: d.valor.trim(),
              unidad: d.unidad,
              condicion: d.condicion.trim(),
              montaje: d.montaje as 'suspendido' | 'carga parcial' | 'desconocido',
              instrumento: d.instrumento.trim(),
              nota: 'Registro manual',
            });
            setD({ ...d, valor: '', condicion: '' });
          }}
        >
          Añadir medición manual
        </button>
      </div>
      <div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Fecha</th>
              <th>Magnitud</th>
              <th>Valor</th>
              <th>Condición</th>
              <th>Montaje</th>
              <th>Nota</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {manual.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="tag orange">{SOURCE_LABEL.manual}</span>
                </td>
                <td className="mono">{m.fecha}</td>
                <td>{m.magnitud}</td>
                <td className="mono num">
                  {m.valor} {m.unidad}
                </td>
                <td>{m.condicion}</td>
                <td>{m.montaje}</td>
                <td className="hint">{m.instrumento}</td>
                <td>
                  <button className="btn xs ghost" onClick={() => useApp.getState().deleteMeasurement(m.id)} aria-label="Eliminar">
                    <ITrash size={11} />
                  </button>
                </td>
              </tr>
            ))}
            {DOSSIER_MEASUREMENTS.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="tag muted">Histórico dossier</span>
                </td>
                <td className="mono">{m.fecha}</td>
                <td>{m.magnitud}</td>
                <td className="mono num">
                  {m.valor} {m.unidad}
                </td>
                <td>{m.condicion}</td>
                <td>{m.montaje === 'carga parcial' ? <span className="tag warn">carga parcial</span> : m.montaje}</td>
                <td className="hint">{m.nota}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BottomPanel({ onCollapse }: { onCollapse?: () => void }) {
  const tab = useApp((s) => s.ui.bottomTab);
  const setUi = useApp((s) => s.setUi);
  const mode = useApp((s) => s.mode);
  const errors = useApp((s) => s.events.filter((e) => e.level === 'error').length);
  return (
    <section className="bottom" aria-label="Información y registros">
      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setUi({ bottomTab: k })}>
            {l}
            {k === 'eventos' && errors > 0 && (
              <span className="tag err count">
                {errors}
              </span>
            )}
          </button>
        ))}
        <span className="spacer" />
        {mode === 'sim' && <span className="tag sim">DATOS SIMULADOS</span>}
        <button className="btn xs ghost" onClick={exportSession} title="Exportar sesión (eventos y series, con modo y fuente)">
          <IDownload size={11} /> Sesión CSV
        </button>
        {onCollapse && (
          <button className="btn xs ghost icon" onClick={onCollapse} title="Plegar panel inferior" aria-label="Plegar panel inferior">
            <IChevron dir="down" size={13} />
          </button>
        )}
      </div>
      <div className="fill">
        {tab === 'telemetria' && <Telemetry />}
        {tab === 'eventos' && <Events />}
        {tab === 'serie' && <SerialMonitor />}
        {tab === 'ensayos' && <Tests />}
        {tab === 'mediciones' && <Measurements />}
      </div>
      {false && ALL_JOINTS.map((j) => jointLabel(j))}
    </section>
  );
}
