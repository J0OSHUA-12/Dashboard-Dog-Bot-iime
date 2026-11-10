// Editor inspirado en Arduino IDE: pestañas, resaltado C/C++, números de línea,
// buscar (Ctrl+F), deshacer/rehacer, abrir/guardar, compilar y subir con Arduino CLI.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { HighlightStyle, bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { tags as t } from '@lezer/highlight';
import fwSource from '../../firmware/DogBotDashboard/DogBotDashboard.ino?raw';
import origCal from '../../DOGBOT_CLAUDE_CODE/originales/CALIBRACION_6_SERVOS.ino?raw';
import origWalk2 from '../../DOGBOT_CLAUDE_CODE/originales/CAMINATA_2_0_EXPERIMENTAL.ino?raw';
import origFluid from '../../DOGBOT_CLAUDE_CODE/originales/CAMINATA_FLUIDA_PROBADA.ino?raw';
import { BuildRecord, JobInfo, SketchEntry, ToolsStatus, buildKey, isValidSketchName, sha256Hex } from '../../shared/serviceApi';
import { BOARDS, boardByFqbn, coreById, familyOfMcu } from '../../shared/boards';
import { EditorDoc, useEditor } from '../state/editorStore';
import { useApp, uid } from '../state/store';
import { downloadText, pickFile } from '../state/persist';
import { service } from '../services/serviceClient';
import { client } from '../services/robotLink';
import { confirmDialog, promptDialog, toast } from './Dialog';
import { IAlert, ICheck, IDownload, IError, IFile, IFolder, IHammer, IInfo, IPlus, IRedo, IRefresh, ISave, ISearch, IUndo, IUpload, IX } from './icons';
import { Disclosure } from './Disclosure';

/** Compilaciones terminadas recibidas por WebSocket (pueden llegar antes que la respuesta HTTP). */
const finishedBuilds = new Map<string, BuildRecord>();
/**
 * Trabajos que el WebSocket ya dio por terminados. Si un trabajo acaba muy
 * rápido (p. ej. una carga que falla al instante), ese aviso puede llegar antes
 * que la respuesta HTTP que lo inició: sin esto, la respuesta lo volvería a
 * marcar «en curso» y Compilar/Subir quedarían bloqueados.
 */
const finishedJobs = new Set<string>();
function trackJob(job: JobInfo) {
  if (!finishedJobs.has(job.id)) useEditor.getState().setJob(job);
}

const FICHAS: Record<string, string> = {
  DogBotDashboard:
    'Firmware NUEVO del dashboard (protocolo DOGBOT v1, 115200 baudios). El mismo archivo sirve para Arduino UNO y para ESP32: elige la placa antes de compilar. Probado sólo en software; PENDIENTE DE VALIDACIÓN FÍSICA. Arranca sin mover nada.',
  CAMINATA_FLUIDA_PROBADA:
    'REPORTADO PROBADO sólo suspendido. ¡ATENCIÓN! Su setup() centra los servos uno por uno y ejecuta 3 ciclos AUTOMÁTICAMENTE al arrancar o reiniciar (abrir el puerto reinicia el UNO). Sin parser: "x" no lo detiene. No usar como firmware del dashboard.',
  CAMINATA_2_0_EXPERIMENTAL:
    'EXPERIMENTAL, no probado. Centra al arrancar; "x" congela la consigna (no desenergiza); "+/-" pueden provocar postura incluso detenido; intensidad 30–100 % (arranca al 70 %). Límites provisionales no validados.',
  CALIBRACION_6_SERVOS:
    'Herramienta de calibración (9600 baudios). Desactiva señal al inicio; "c" ordena 1500 µs (posible salto). Los límites l/n/u se guardan en RAM pero NO limitan movimientos. Movimientos bloqueantes: "x" puede tardar ~4 s en atenderse.',
};

const BUNDLED: { source: 'firmware' | 'originales'; name: string; content: string }[] = [
  { source: 'firmware', name: 'DogBotDashboard', content: fwSource },
  { source: 'originales', name: 'CAMINATA_FLUIDA_PROBADA', content: origFluid },
  { source: 'originales', name: 'CAMINATA_2_0_EXPERIMENTAL', content: origWalk2 },
  { source: 'originales', name: 'CALIBRACION_6_SERVOS', content: origCal },
];

const hl = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--hl-keyword)' },
  { tag: [t.typeName, t.standard(t.typeName)], color: 'var(--hl-type)' },
  { tag: [t.processingInstruction, t.meta], color: 'var(--hl-meta)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--hl-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--hl-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--hl-function)' },
  { tag: [t.macroName], color: 'var(--hl-meta)' },
  { tag: [t.operator, t.punctuation], color: 'var(--hl-operator)' },
  { tag: t.variableName, color: 'var(--editor-fg)' },
]);

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--editor-fg)', fontSize: '12.5px' },
    '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--orange)' },
    '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--editor-gutter)', border: 'none', borderRight: '1px solid var(--editor-line)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,122,26,0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,122,26,0.10)', color: 'var(--sel)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(255,122,26,0.28) !important' },
    '.cm-cursor': { borderLeftColor: 'var(--orange)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(255,177,92,0.22)', outline: 'none' },
    '.cm-searchMatch': { backgroundColor: 'rgba(255,177,92,0.25)' },
    '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--editor-fg)', borderTop: '1px solid var(--border)' },
    '.cm-panels input, .cm-panels button': { fontSize: '12px' },
    '.cm-textfield': { backgroundColor: 'var(--editor-bg)', border: '1px solid var(--border)', color: 'var(--editor-fg)' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--raised)', border: '1px solid var(--border)', color: 'var(--editor-fg)' },
  },
  { dark: true },
);

function extensions(readOnly: boolean, onChange: (v: string) => void): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    cpp(),
    syntaxHighlighting(hl),
    theme,
    keymap.of([...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString());
    }),
  ];
}

const NEW_TEMPLATE = (name: string) => `// ${name}.ino — sketch nuevo creado en Dog Bot Control
// Recuerda: cargar un sketch arbitrario no garantiza compatibilidad con los controles del dashboard.
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm(0x40);

void setup() {
  Serial.begin(115200);
  pwm.begin();
  pwm.setPWMFreq(50);
  // Sin movimientos automáticos al arrancar.
}

void loop() {
}
`;

function sourceLabel(s: EditorDoc['source']) {
  return s === 'mis-sketches' ? 'Mis sketches' : s === 'firmware' ? 'Firmware dashboard' : s === 'originales' ? 'Original histórico' : s === 'local' ? 'Archivo local' : 'Nuevo';
}

export function EditorPanel({ onCollapse }: { onCollapse?: () => void }) {
  const docs = useEditor((s) => s.docs);
  const activeId = useEditor((s) => s.activeId);
  const builds = useEditor((s) => s.builds);
  const fqbn = useEditor((s) => s.fqbn);
  const consoleLines = useEditor((s) => s.console);
  const job = useEditor((s) => s.job);
  const serviceUp = useApp((s) => s.link.serviceAvailable);
  const ports = useApp((s) => s.link.ports);
  const port = useApp((s) => s.link.port);
  const connectedMcu = useApp((s) => s.link.firmware?.mcu ?? null);
  const board = boardByFqbn(fqbn);
  const boardCore = board ? coreById(board.core) : null;
  const active = docs.find((d) => d.id === activeId) ?? null;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const consoleRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [entries, setEntries] = useState<SketchEntry[]>([]);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [showTools, setShowTools] = useState(false);
  const jobDoc = useRef(new Map<string, string>());

  // Documento inicial: firmware del dashboard (copia incluida).
  useEffect(() => {
    if (useEditor.getState().docs.length === 0) {
      const b = BUNDLED[0];
      useEditor.getState().open({ id: uid('doc'), name: b.name, source: b.source, readOnly: true, content: b.content, saved: b.content, ficha: FICHAS[b.name], hash: null });
    }
  }, []);

  // Vista CodeMirror única; un EditorState por documento (conserva deshacer/rehacer).
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current });
    view.current = v;
    return () => v.destroy();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v || !active) return;
    let s = states.current.get(active.id);
    if (!s) {
      const id = active.id;
      s = EditorState.create({ doc: active.content, extensions: extensions(active.readOnly, (val) => useEditor.getState().patch(id, { content: val })) });
      states.current.set(id, s);
    }
    if (v.state !== s) {
      const prevDoc = docs.find((d) => d.id !== active.id && states.current.get(d.id) === v.state);
      if (prevDoc) states.current.set(prevDoc.id, v.state);
      v.setState(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.readOnly]);

  // Guarda el estado del editor activo antes de cambiar de pestaña.
  const switchTo = (id: string) => {
    if (view.current && activeId) states.current.set(activeId, view.current.state);
    useEditor.getState().activate(id);
  };

  // Hash del documento actual (nombre + placa + contenido) para detectar binarios obsoletos.
  useEffect(() => {
    if (!active) return;
    let cancel = false;
    const h = setTimeout(() => {
      sha256Hex(buildKey(active.name, fqbn, active.content))
        .then((hash) => !cancel && useEditor.getState().patch(active.id, { hash }))
        .catch(() => undefined);
    }, 150);
    return () => {
      cancel = true;
      clearTimeout(h);
    };
  }, [active?.id, active?.content, active?.name, fqbn]);

  // Eventos del servicio: trabajos y registros reales de Arduino CLI.
  useEffect(() => {
    const off = service.on((m) => {
      if (m.t === 'job') {
        const ed = useEditor.getState();
        ed.setJob(m.job.state === 'en-curso' ? m.job : null);
        if (m.job.state !== 'en-curso') {
          finishedJobs.add(m.job.id);
          ed.log(m.job.state === 'ok' ? 'info' : 'stderr', `■ ${m.job.title}: ${m.job.summary}\n`);
          useApp.getState().addEvent(m.job.state === 'ok' ? 'ok' : 'error', 'compilación', `${m.job.title}: ${m.job.summary}`);
          if (m.job.kind === 'upload' && m.job.state === 'ok') {
            toast('Carga terminada. El dashboard volverá a identificar el firmware antes de habilitar controles.', 'ok');
          }
        }
        if (m.build) {
          if (m.build.state !== 'en-curso') finishedBuilds.set(m.build.id, m.build);
          const docId = jobDoc.current.get(m.job.id) ?? Object.entries(ed.builds).find(([, b]) => b.build.id === m.build!.id)?.[0];
          if (docId) ed.setBuild(docId, { build: m.build, jobId: m.job.id });
        }
      } else if (m.t === 'job-log') {
        useEditor.getState().log(m.stream, m.text);
      }
    });
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [consoleLines.length]);

  const refreshTools = async (refresh: boolean) => {
    try {
      setTools(await service.api<ToolsStatus>(`/api/tools${refresh ? '?refresh=1' : ''}`));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  useEffect(() => {
    if (serviceUp) void refreshTools(false);
  }, [serviceUp]);

  const openMenu = async () => {
    setMenu((v) => !v);
    if (serviceUp) {
      try {
        setEntries(await service.api<SketchEntry[]>('/api/sketches'));
      } catch {
        setEntries([]);
      }
    }
  };

  const openEntry = async (e: { source: EditorDoc['source']; name: string; readOnly: boolean; ficha: string | null; content?: string }) => {
    setMenu(false);
    let content = e.content;
    if (content === undefined) {
      try {
        content = (await service.api<{ content: string }>(`/api/sketches/${e.source}/${encodeURIComponent(e.name)}`)).content;
      } catch (err) {
        toast((err as Error).message, 'error');
        return;
      }
    }
    if (view.current && activeId) states.current.set(activeId, view.current.state);
    useEditor.getState().open({ id: uid('doc'), name: e.name, source: e.source, readOnly: e.readOnly, content, saved: content, ficha: e.ficha ?? FICHAS[e.name] ?? null, hash: null });
  };

  const openLocal = async () => {
    setMenu(false);
    const f = await pickFile('.ino,.cpp,.h,.txt');
    if (!f) return;
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]/g, '_') || 'sketch';
    useEditor.getState().open({ id: uid('doc'), name: base, source: 'local', readOnly: false, content: f.text, saved: '', ficha: 'Archivo abierto desde el equipo: guárdalo en "Mis sketches" para compilarlo con nombre de carpeta válido.', hash: null });
  };

  const askName = (initial: string, title: string) =>
    promptDialog({
      title,
      body: <div>Se guardará como <span className="mono">sketches/&lt;Nombre&gt;/&lt;Nombre&gt;.ino</span> (Arduino exige carpeta = nombre). Los originales nunca se sobrescriben.</div>,
      input: { label: 'Nombre del sketch', initial, validate: (v) => (isValidSketchName(v) ? null : 'Letras, números, "_", "-" o "."; sin espacios; máx. 63') },
      confirmLabel: 'Guardar',
    });

  const newDoc = async () => {
    const name = await promptDialog({
      title: 'Nuevo sketch',
      body: <div>Plantilla mínima sin movimientos al arrancar.</div>,
      input: { label: 'Nombre', initial: 'MiSketch', validate: (v) => (isValidSketchName(v) ? null : 'Nombre inválido') },
      confirmLabel: 'Crear',
    });
    if (!name) return;
    if (view.current && activeId) states.current.set(activeId, view.current.state);
    useEditor.getState().open({ id: uid('doc'), name, source: 'nuevo', readOnly: false, content: NEW_TEMPLATE(name), saved: '', ficha: null, hash: null });
  };

  const saveAs = async (d: EditorDoc) => {
    const suggested = d.source === 'originales' || d.source === 'firmware' ? `${d.name}_ADAPTADO` : d.name;
    const name = await askName(suggested, 'Guardar como (Mis sketches)');
    if (!name) return;
    if (!serviceUp) {
      downloadText(`${name}.ino`, d.content);
      toast('Sin servicio local: se descargó el archivo .ino.', 'info');
      return;
    }
    try {
      await service.api(`/api/sketches/mis-sketches/${encodeURIComponent(name)}`, { method: 'PUT', body: { content: d.content, overwrite: false } });
      if (view.current && activeId) states.current.set(activeId, view.current.state);
      const newId = uid('doc');
      useEditor.getState().open({ id: newId, name, source: 'mis-sketches', readOnly: false, content: d.content, saved: d.content, ficha: null, hash: null });
      toast(`Guardado: sketches/${name}/${name}.ino`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const saveDoc = async (d: EditorDoc) => {
    if (d.source !== 'mis-sketches') return saveAs(d);
    try {
      await service.api(`/api/sketches/mis-sketches/${encodeURIComponent(d.name)}`, { method: 'PUT', body: { content: d.content, overwrite: true } });
      useEditor.getState().patch(d.id, { saved: d.content });
      toast('Guardado', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const closeDoc = async (d: EditorDoc) => {
    if (!d.readOnly && d.content !== d.saved) {
      const ok = await confirmDialog({ title: `Cerrar ${d.name}`, body: <div>Hay cambios sin guardar en disco. Se perderán al cerrar la pestaña.</div>, confirmLabel: 'Cerrar sin guardar', danger: true });
      if (!ok) return;
    }
    states.current.delete(d.id);
    useEditor.getState().close(d.id);
  };

  const build = active ? builds[active.id] : undefined;
  const stale = !!(build && active && active.hash && build.build.contentHash !== active.hash);
  const compiling = job?.kind === 'compile';
  const uploading = job?.kind === 'upload';

  const compile = async () => {
    if (!active) return;
    if (!isValidSketchName(active.name)) {
      toast('Nombre de sketch inválido para Arduino CLI. Usa "Guardar como".', 'error');
      return;
    }
    useEditor.getState().clearConsole();
    try {
      const r = await service.api<{ job: JobInfo; build: BuildRecord }>('/api/compile', { method: 'POST', body: { sketchName: active.name, fqbn, content: active.content } });
      jobDoc.current.set(r.job.id, active.id);
      const done = finishedBuilds.get(r.build.id);
      useEditor.getState().setBuild(active.id, { build: done ?? r.build, jobId: r.job.id });
      if (!done) trackJob(r.job);
    } catch (e) {
      toast((e as Error).message, 'error');
      useEditor.getState().log('stderr', (e as Error).message + '\n');
    }
  };

  const upload = async () => {
    if (!active || !build || build.build.state !== 'ok' || stale || !active.hash) return;
    if (!port) {
      toast('Selecciona un puerto COM.', 'error');
      return;
    }
    const historical = active.source === 'originales';
    const esp32 = board?.family === 'esp32';
    // Si la placa conectada ya se identificó, avisar cuando el binario es para otra familia.
    const connectedFamily = familyOfMcu(connectedMcu);
    const mismatch = !!board && !!connectedFamily && connectedFamily !== board.family;
    const ok = await confirmDialog({
      title: `Subir ${active.name} a ${port}`,
      danger: true,
      body: (
        <div className="list">
          <div>
            Se subirá SOLO el binario de la compilación <span className="mono">{build.build.id.slice(0, 8)}</span> (sha256 <span className="mono">{build.build.contentHash.slice(0, 12)}…</span>). El puerto se liberará durante la carga.
          </div>
          <div>
            Placa de destino: <b>{board?.label ?? fqbn}</b>.
          </div>
          {mismatch && (
            <div className="note warn">
              <span>
                La placa conectada se identificó como <b>{connectedMcu}</b>, pero este binario es para <b>{board?.label}</b>. Subirlo a una placa distinta falla o la deja sin firmware válido. Cambia la placa en el editor y vuelve a compilar si te equivocaste.
              </span>
            </div>
          )}
          <div className="note warn">La placa se reiniciará y ejecutará este sketch. {historical ? 'Este sketch HISTÓRICO puede mover los servos por su cuenta al arrancar.' : 'Un sketch distinto de DogBotDashboard dejará los controles bloqueados hasta identificar un firmware compatible.'}</div>
          {esp32 && (
            <div className="note">
              <span>
                ESP32: si la consola se queda en «Connecting…», mantén pulsado el botón <b>BOOT</b> de la placa hasta que empiece a escribir. Recuerda que el PCA9685 debe tener su VCC en <b>3V3</b>, no en 5 V.
              </span>
            </div>
          )}
        </div>
      ),
      checks: ['Robot sostenido en el soporte o alimentación de servos desconectada.', 'Monitor Serie de Arduino IDE cerrado.', ...(mismatch ? [`Confirmo que la placa conectada es un ${board?.label}.`] : [])],
      confirmLabel: 'Subir',
    });
    if (!ok) return;
    try {
      client.markUploading();
      const r = await service.api<{ job: JobInfo }>('/api/upload', { method: 'POST', body: { buildId: build.build.id, contentHash: active.hash, fqbn, port } });
      trackJob(r.job);
    } catch (e) {
      toast((e as Error).message, 'error');
      useEditor.getState().log('stderr', (e as Error).message + '\n');
    }
  };

  const install = async (what: 'install-core' | 'install-lib' | 'update-index') => {
    try {
      // El core y el índice dependen de la placa elegida (el del ESP32 usa un índice adicional).
      const r = await service.api<{ job: JobInfo }>('/api/tools/install', { method: 'POST', body: { what, core: boardCore?.id } });
      trackJob(r.job);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const buildBadge = useMemo(() => {
    if (!build) return <span className="tag muted">Sin compilar</span>;
    if (build.build.state === 'en-curso') return <span className="tag warn">Compilando…</span>;
    if (build.build.state === 'error')
      return (
        <span className="tag err">
          <IError size={11} /> Error de compilación
        </span>
      );
    if (stale)
      return (
        <span className="tag warn" title="El código cambió después de compilar">
          <IAlert size={11} /> Compilación obsoleta
        </span>
      );
    return (
      <span className="tag ok">
        <ICheck size={11} /> Compilado {build.build.contentHash.slice(0, 8)}
      </span>
    );
  }, [build, stale]);

  return (
    <section className="panel right" aria-label="Editor de sketches">
      <div className="panel-head">
        <span className="panel-title">Editor de sketches</span>
        <span className="panel-sub">C/C++ · Arduino CLI</span>
        <span className="spacer" />
        {onCollapse && (
          <button className="btn sm icon ghost" onClick={onCollapse} title="Cerrar el editor" aria-label="Cerrar el editor">
            <IX size={14} />
          </button>
        )}
      </div>
      <div className="editor-wrap">
        <div className="doc-tabs" role="tablist">
          {docs.map((d) => (
            <div key={d.id} className={`doc-tab ${d.id === activeId ? 'on' : ''}`} onClick={() => switchTo(d.id)} role="tab" aria-selected={d.id === activeId} title={`${sourceLabel(d.source)}${d.readOnly ? ' · solo lectura' : ''}`}>
              <IFile size={12} />
              <span className="n">
                {d.name}.ino{!d.readOnly && d.content !== d.saved ? ' •' : ''}
              </span>
              {d.readOnly && <span className="ro" title="Sólo lectura">RO</span>}
              <button
                className="x"
                onClick={(e) => {
                  e.stopPropagation();
                  void closeDoc(d);
                }}
                aria-label={`Cerrar ${d.name}`}
              >
                <IX size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="toolbar">
          <button className="btn sm" onClick={newDoc} title="Nuevo sketch">
            <IPlus size={13} /> Nuevo
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn sm" onClick={openMenu}>
              <IFolder size={13} /> Abrir
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                {(serviceUp ? entries : BUNDLED.map((b) => ({ source: b.source, name: b.name, readOnly: true, displayPath: '(copia incluida)', ficha: FICHAS[b.name] }))).map((e) => (
                  <button
                    key={e.source + e.name}
                    className="btn ghost sm"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() =>
                      openEntry({ ...e, content: serviceUp ? undefined : BUNDLED.find((b) => b.name === e.name)?.content })
                    }
                  >
                    <IFile size={12} /> <span className="mono">{e.name}</span>
                    <span className="spacer" />
                    <span className="hint">{e.source === 'mis-sketches' ? 'mío' : e.source === 'firmware' ? 'firmware' : 'original'}</span>
                  </button>
                ))}
                <div className="menu-sep" />
                <button className="btn ghost sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={openLocal}>
                  <IFolder size={12} /> Archivo .ino del equipo…
                </button>
              </div>
            )}
          </div>
          <button className="btn sm" disabled={!active || (active.source === 'mis-sketches' && !serviceUp)} onClick={() => active && saveDoc(active)} title={active?.source !== 'mis-sketches' ? 'Guarda una copia en Mis sketches' : 'Guardar'}>
            <ISave size={13} /> Guardar
          </button>
          <button className="btn sm icon" disabled={!active} onClick={() => active && downloadText(`${active.name}.ino`, active.content)} title="Descargar .ino" aria-label="Descargar">
            <IDownload size={13} />
          </button>
          <span className="tb-sep" />
          <button className="btn sm icon ghost" onClick={() => view.current && undo(view.current)} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
            <IUndo size={14} />
          </button>
          <button className="btn sm icon ghost" onClick={() => view.current && redo(view.current)} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">
            <IRedo size={14} />
          </button>
          <button className="btn sm icon ghost" onClick={() => view.current && openSearchPanel(view.current)} title="Buscar (Ctrl+F)" aria-label="Buscar">
            <ISearch size={14} />
          </button>
        </div>
        <div className="toolbar build-tools">
          <select
            className="field"
            style={{ width: 128 }}
            value={fqbn}
            onChange={(e) => useEditor.getState().setFqbn(e.target.value)}
            aria-label="Placa"
            title={`Placa para compilar y subir: ${board?.label ?? fqbn}. Cambiarla deja obsoleta la compilación anterior.`}
          >
            {BOARDS.map((b) => (
              <option key={b.fqbn} value={b.fqbn}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            className="field mono"
            style={{ width: 96 }}
            value={port}
            disabled={!serviceUp}
            onChange={(e) => useApp.getState().setLink({ port: e.target.value })}
            aria-label="Puerto para subir"
          >
            {ports.length === 0 && <option value="">{serviceUp ? 'Sin puertos' : 'COM —'}</option>}
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}
              </option>
            ))}
          </select>
          <button className="btn sm primary" disabled={!serviceUp || !active || !!job} onClick={compile} title={!serviceUp ? 'Requiere el servicio local en Windows' : 'Compilar con Arduino CLI'}>
            <IHammer size={13} /> Compilar
          </button>
          <button
            className="btn sm"
            disabled={!serviceUp || !build || build.build.state !== 'ok' || stale || !!job || !port}
            onClick={upload}
            title={stale ? 'Compilación obsoleta: vuelve a compilar' : build?.build.state === 'error' ? 'La compilación falló' : 'Subir el binario compilado'}
          >
            <IUpload size={13} /> Subir
          </button>
          {(compiling || uploading || job) && (
            <span className="progress" aria-label="En curso">
              <i />
            </span>
          )}
        </div>
        <div className="notes">
          {active?.ficha && (
            <Disclosure
              className="ficha"
              tone={active.source === 'originales' ? 'warn' : undefined}
              icon={<IAlert size={13} />}
              summary={active.source === 'originales' ? 'Advertencias de este sketch histórico' : 'Ficha del sketch'}
              meta={sourceLabel(active.source)}
            >
              {active.ficha}
            </Disclosure>
          )}
          {board?.family === 'esp32' && (
            <Disclosure className="ficha" icon={<IInfo size={13} />} summary="ESP32: conexión y carga" meta="3,3 V · GPIO21/22">
              <b>Cableado:</b> PCA9685 SDA → GPIO21, SCL → GPIO22, GND común y <b>VCC del PCA9685 al pin 3V3</b> del ESP32 (sus pines no toleran 5 V). La potencia de los servos (V+) va aparte, como hasta ahora.
              <br />
              <b>Carga:</b> necesita el core <span className="mono">esp32:esp32</span> (botón en «Diagnóstico Arduino CLI»; es una descarga grande y la primera compilación tarda varios minutos). Si no conecta, mantén pulsado <b>BOOT</b>.
              <br />
              <b>Uso:</b> el mismo protocolo y los mismos controles que con el UNO, por USB a 115200 baudios. WiFi y Bluetooth todavía no se usan.
            </Disclosure>
          )}
          {!serviceUp && (
            <Disclosure className="ficha" icon={<IInfo size={13} />} summary="Servicio local no disponible" meta="Compilar y Subir desactivados">
              Puedes editar, abrir y descargar sketches. <b>Compilar y Subir</b> requieren ejecutar <span className="mono">INICIAR_DOGBOT.bat</span> en la computadora Windows (Arduino CLI).
            </Disclosure>
          )}
        </div>
        <div className="cm-host" ref={host} />
        <div className="build-bar">
          {buildBadge}
          {build?.build.state === 'ok' && build.build.flashBytes !== null && (
            <span className="mono hint">
              flash {build.build.flashBytes}/{build.build.flashMax} B · RAM {build.build.ramBytes}/{build.build.ramMax} B
            </span>
          )}
          <span className="spacer" />
          <button className="btn xs ghost" onClick={() => setShowTools((v) => !v)} disabled={!serviceUp}>
            Diagnóstico Arduino CLI
          </button>
          <button className="btn xs ghost" onClick={() => useEditor.getState().clearConsole()}>
            Limpiar consola
          </button>
        </div>
        <div className="console" ref={consoleRef} role="log" aria-label="Consola de compilación">
          {showTools && serviceUp && (
            <div style={{ marginBottom: 8, fontFamily: 'var(--font)' }}>
              <div className="row" style={{ marginBottom: 4 }}>
                <b>Herramientas</b>
                <button className="btn xs ghost" onClick={() => refreshTools(true)}>
                  <IRefresh size={11} /> Comprobar
                </button>
              </div>
              {tools ? (
                <div className="list">
                  {[tools.cli, tools.lib].map((c, i) => (
                    <div key={i} className="tool-line" style={{ color: c.ok ? 'var(--ok)' : 'var(--warn)' }}>
                      {c.ok ? <ICheck size={12} /> : <IError size={12} />} {c.detail}
                    </div>
                  ))}
                  {tools.cores.map((c) => {
                    // Sólo hace falta el core de la placa elegida: los demás se muestran sin alarma.
                    const needed = c.id === boardCore?.id;
                    return (
                      <div key={c.id} className="tool-line" style={{ color: c.ok ? 'var(--ok)' : needed ? 'var(--warn)' : 'var(--muted)' }}>
                        {c.ok ? <ICheck size={12} /> : needed ? <IError size={12} /> : <IInfo size={12} />} {c.detail}
                        {!c.ok && !needed ? ' · no hace falta para la placa elegida' : ''}
                      </div>
                    );
                  })}
                  <div className="hint mono">{tools.cliPath}</div>
                  {tools.cli.ok && (
                    <div className="row">
                      <button className="btn xs" onClick={() => install('update-index')} disabled={!!job}>
                        Actualizar índice
                      </button>
                      {boardCore && tools.cores.some((c) => c.id === boardCore.id && !c.ok) && (
                        <button className="btn xs" onClick={() => install('install-core')} disabled={!!job} title={boardCore.heavy ? 'Descarga grande (cientos de MB): puede tardar bastante' : undefined}>
                          Instalar core {boardCore.id}
                          {boardCore.heavy ? ' (descarga grande)' : ''}
                        </button>
                      )}
                      {!tools.lib.ok && (
                        <button className="btn xs" onClick={() => install('install-lib')} disabled={!!job}>
                          Instalar Adafruit PWM Servo Driver
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="hint">Comprobando…</div>
              )}
            </div>
          )}
          {consoleLines.length === 0 && !showTools && <span style={{ color: 'var(--muted)' }}>La salida real de Arduino CLI aparecerá aquí.</span>}
          {consoleLines.map((l) => (
            <span key={l.id} className={l.stream}>
              {l.text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
