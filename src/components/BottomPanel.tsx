import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { DOSSIER_MEASUREMENTS, PHYSICAL_SIGNALS, SOURCE_LABEL, VALIDITY_LABEL, validityFor } from '../../shared/telemetry';
import { BottomTab, EventEntry, TestRecord, uid, useApp } from '../state/store';
import { allSeries, getSeries } from '../state/series';
import { downloadText, stamp, toCsv } from '../state/persist';
import { service } from '../services/serviceClient';
import { client } from '../services/robotLink';
import { ChartSeries, LineChart } from './Chart';
import { toast } from './Dialog';
import { HelpTip } from './Disclosure';
import { IAlert, IBattery, IChevron, IClipboard, IDownload, IError, IGauge, IInfo, ICheck, IList, IPulse, IRuler, ITerminal, IThermo, ITrash } from './icons';

// [pestaña, rótulo, rótulo corto para barras estrechas, icono]
const TABS: [BottomTab, string, string, ReactNode][] = [
  ['telemetria', 'Telemetría', 'Telemetría', <IPulse key="i" size={14} />],
  ['eventos', 'Eventos', 'Eventos', <IList key="i" size={14} />],
  ['serie', 'Monitor serie', 'Serie', <ITerminal key="i" size={14} />],
  ['ensayos', 'Registro de ensayos', 'Ensayos', <IClipboard key="i" size={14} />],
  ['mediciones', 'Mediciones', 'Medidas', <IRuler key="i" size={14} />],
];

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

/** Último valor válido de una serie (sólo lectura, para mostrarlo en grande). */
function lastValue(space: 'sim' | 'real', id: string): number | null {
  const d = getSeries(space, id);
  for (let i = d.length - 1; i >= 0; i--) if (d[i].v !== null) return d[i].v;
  return null;
}

// Diseño por excepción: canales en gris; sólo el canal seleccionado en ámbar.
const CH_DIM = '#7d6f64';
const CH_SEL = '#ffb15c';

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
    () =>
      [...shown]
        .sort((a, b) => (a === selCh ? 1 : b === selCh ? -1 : 0))
        .map((c) => ({ label: `CH${c}`, color: c === selCh ? CH_SEL : CH_DIM, data: () => getSeries(sim ? 'sim' : 'real', `ch${c}`) })),
    [shown.join(','), sim, selCh],
  );
  const bankSeries: ChartSeries[] = useMemo(
    () => [
      { label: 'Tensión (V) SIMULADA', color: '#ffb15c', data: () => getSeries('sim', 'banco_v') },
    ],
    [],
  );
  const currSeries: ChartSeries[] = useMemo(() => [{ label: 'Corriente (A) SIMULADA', color: '#ff8a5c', data: () => getSeries('sim', 'corriente_a') }], []);
  const rttSeries: ChartSeries[] = useMemo(() => [{ label: 'RTT (ms)', color: '#ffb15c', data: () => getSeries('real', 'rtt') }], []);
  const rttValidity = validityFor(link.rttAt, now, 500);
  const pwValidity = validityFor(link.lastRxAt, now, 500);

  const bankV = sim ? lastValue('sim', 'banco_v') : null;
  const currA = sim ? lastValue('sim', 'corriente_a') : null;
  const selUs = selCh !== null && selCh !== undefined ? lastValue(sim ? 'sim' : 'real', `ch${selCh}`) : null;

  const icons: Record<string, ReactNode> = {
    bateria_v: <IBattery size={12} />,
    banco_v: <IGauge size={12} />,
    corriente_total_a: <IGauge size={12} />,
    corriente_servo_a: <IGauge size={12} />,
    temp_c: <IThermo size={12} />,
  };

  return (
    <div className="tele">
      <div className="charts">
        <div className="chart primary">
          <div className="chart-head">
            <span className="t">Tensión del banco</span>
            {!sim && <span className="tag muted">sin sensor</span>}
            <span className="spacer" />
            {sim && (
              <HelpTip label="Tensión simulada">Señal sintética para explorar la interfaz. No representa el robot.</HelpTip>
            )}
          </div>
          {sim ? (
            <>
              <div className="chart-value">
                {bankV === null ? '—' : bankV.toFixed(2)}
                <small>V</small>
                <span className="tag sim">SIMULADO</span>
              </div>
              <LineChart series={bankSeries} unit="V" yMin={6.9} yMax={7.1} />
            </>
          ) : (
            <div className="empty">No hay sensor de tensión conectado al Arduino. Consulta las mediciones manuales (pestaña Mediciones).</div>
          )}
        </div>
        <div className="chart primary">
          <div className="chart-head">
            <span className="t">{sim ? 'Corriente del banco' : 'Latencia de enlace (HB)'}</span>
            {!sim && <span className="tag">PC</span>}
            <span className="spacer" />
            {sim && (
              <HelpTip label="Corriente simulada">Sintética. Las corrientes reales requieren un sensor; no se reparte la total entre servos.</HelpTip>
            )}
          </div>
          {sim ? (
            <>
              <div className="chart-value">
                {currA === null ? '—' : currA.toFixed(2)}
                <small>A</small>
                <span className="tag sim">SIMULADO</span>
              </div>
              <LineChart series={currSeries} unit="A" yMin={0} yMax={0.6} />
            </>
          ) : getSeries('real', 'rtt').length === 0 ? (
            <div className="empty">Sin heartbeat: el RTT se mide sólo con el robot armado.</div>
          ) : (
            <>
              <div className="chart-value">
                {link.rttMs ?? '—'}
                <small>ms</small>
              </div>
              <LineChart series={rttSeries} unit="ms" yMin={0} yMax={60} gapMs={1500} />
            </>
          )}
        </div>
        <div className="chart">
          <div className="chart-head">
            <span className="t">{sim ? 'Consigna simulada por canal' : 'Consigna escrita por el firmware (PW)'}</span>
            <span className="spacer" />
            <HelpTip label="Consigna por canal">Consignas en µs, no posiciones medidas. Resaltado: el canal de la articulación seleccionada; el resto, en gris.</HelpTip>
          </div>
          {!sim && channels.length > 0 && getSeries('real', `ch${shown[0]}`).length === 0 ? (
            <>
              <div className="chart-value sel">
                —<small>µs</small>
                <span className="tag real">FIRMWARE</span>
              </div>
              <div className="empty">Sin datos del firmware. Las consignas aparecen al habilitar canales (no son posiciones medidas).</div>
            </>
          ) : (
            <>
              <div className="chart-value sel">
                {selUs ?? '—'}
                <small>µs · {selCh !== null && selCh !== undefined ? `CH${selCh}` : 'sin canal'}</small>
                <span className={`tag ${sim ? 'sim' : 'real'}`}>{sim ? 'SIMULACIÓN' : 'FIRMWARE'}</span>
              </div>
              <LineChart series={consignaSeries} unit="µs" yMin={1300} yMax={1700} gapMs={sim ? 1500 : 1200} />
            </>
          )}
          <div className="legend">
            {[...consignaSeries].reverse().map((s) => (
              <span key={s.label} className={s.color === CH_SEL ? 'on' : ''}>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="cards" aria-label="Señales">
        <div className="card wide">
          <div className="k">Enlace / firmware</div>
          {sim ? (
            <div className="v na">Sin enlace con hardware</div>
          ) : (
            <>
              <div className={`v ${link.state === 'armado' || link.state === 'desarmado' ? 'ok' : ''}`}>
                {link.state} · {link.firmware ? `fw ${link.firmware.fw}` : 'sin identificar'}
              </div>
              <div className="s">
                RTT {link.rttMs ?? '—'} ms · {link.rttAt ? `hace ${Math.round((now - link.rttAt) / 1000)} s` : 'sin datos'} · {VALIDITY_LABEL[rttValidity]} · PW {VALIDITY_LABEL[pwValidity]}
              </div>
            </>
          )}
        </div>
        {PHYSICAL_SIGNALS.filter((s) => s.id !== 'angulo' && s.id !== 'imu').map((s) => (
          <div className="card" key={s.id}>
            <div className="k">
              {icons[s.id]} <span className="k-text">{s.label}</span>
              <HelpTip label={s.label}>{s.nota}</HelpTip>
            </div>
            <div className="v na">
              —<small>{s.unit}</small>
            </div>
            <div className="s">Sin sensor</div>
          </div>
        ))}
        <div className="card">
          <div className="k">
            <span className="k-text">Ángulo físico / IMU</span>
            <HelpTip label="Ángulo físico / IMU">Servos de 3 hilos sin feedback. Sólo hay ángulo ESTIMADO visual.</HelpTip>
          </div>
          <div className="v na">
            —<small>°</small>
          </div>
          <div className="s">No disponible</div>
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
        <h4 className="pane-title">
          Nueva medición manual
          <HelpTip label="Mediciones manuales">Mediciones manuales con instrumento externo. Se guardan separadas del histórico del dossier y nunca se mezclan con datos simulados.</HelpTip>
        </h4>
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
                <td className="mono num big">
                  {m.valor} <small>{m.unidad}</small>
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
                <td className="mono num big">
                  {m.valor} <small>{m.unidad}</small>
                </td>
                <td>{m.condicion}</td>
                <td>{m.montaje === 'carga parcial' ? <span className="tag warn">carga parcial</span> : m.montaje}</td>
                <td>{m.nota ? <HelpTip label="Nota del dossier">{m.nota}</HelpTip> : null}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Información y registros. `dock` (HUD de escritorio): barra flotante de pestañas en la base;
 * el contenido se despliega al pulsar una pestaña y se pliega al volver a pulsarla.
 * Sin `dock` (ventanas estrechas): panel completo con las pestañas arriba.
 */
export function BottomPanel({ dock, resizer }: { dock?: boolean; resizer?: ReactNode }) {
  const tab = useApp((s) => s.ui.bottomTab);
  const stored = useApp((s) => s.ui.bottomOpen);
  const setUi = useApp((s) => s.setUi);
  const mode = useApp((s) => s.mode);
  const errors = useApp((s) => s.events.filter((e) => e.level === 'error').length);
  const open = dock ? stored : true;
  const content = (
    <div className="fill" role="tabpanel" id="data-panel">
      {tab === 'telemetria' && <Telemetry />}
      {tab === 'eventos' && <Events />}
      {tab === 'serie' && <SerialMonitor />}
      {tab === 'ensayos' && <Tests />}
      {tab === 'mediciones' && <Measurements />}
    </div>
  );
  const tabs = (
    <div className="tabs" role="tablist" aria-label="Datos y registros">
      {TABS.map(([k, l, short, icon]) => {
        const on = open && tab === k;
        return (
          <button
            key={k}
            role="tab"
            aria-selected={on}
            aria-controls={open ? 'data-panel' : undefined}
            className={on ? 'on' : ''}
            title={dock ? l : undefined}
            onClick={() => setUi(dock ? (on ? { bottomOpen: false } : { bottomOpen: true, bottomTab: k }) : { bottomTab: k })}
          >
            {dock && icon}
            <span className="tab-label">{l}</span>
            {dock && (
              <span className="tab-short" aria-hidden="true">
                {short}
              </span>
            )}
            {k === 'eventos' && errors > 0 && <span className="tag err count">{errors}</span>}
          </button>
        );
      })}
      <span className="spacer" />
      {mode === 'sim' && (
        <span className="tag sim dock-extra" title="En simulación, la tensión y la corriente son señales sintéticas: no representan el robot.">
          DATOS SIMULADOS
        </span>
      )}
      <button className="btn xs ghost" onClick={exportSession} title="Exportar sesión (eventos y series, con modo y fuente)" aria-label="Exportar sesión en CSV">
        <IDownload size={dock ? 13 : 11} /> <span className="dock-extra">Sesión CSV</span>
      </button>
      {dock && open && (
        <button className="btn xs ghost icon" onClick={() => setUi({ bottomOpen: false })} title="Plegar panel de datos" aria-label="Plegar panel de datos">
          <IChevron dir="down" size={13} />
        </button>
      )}
    </div>
  );
  if (dock) {
    return (
      <section className={`bottom data-dock ${open ? 'open' : ''}`} aria-label="Información y registros">
        <div className="dock-body">
          {open && resizer}
          {open && content}
        </div>
        {tabs}
      </section>
    );
  }
  return (
    <section className="bottom" aria-label="Información y registros">
      {tabs}
      {content}
    </section>
  );
}
