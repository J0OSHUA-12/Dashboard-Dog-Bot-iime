// Cliente del protocolo DOGBOT v1, independiente del transporte.
//
// Responsabilidades:
//  - Identificar el firmware (HELLO) sin mover nada.
//  - Relacionar solicitudes y respuestas por id; timeouts.
//  - Consolidar movimientos de sliders (última consigna por canal, tasa
//    limitada) y dar prioridad a STOP/OFF, vaciando lo pendiente.
//  - Detectar reinicios del firmware (BOOT o boot id distinto): limpiar
//    colas y volver a DESARMADO. Nunca reenvía consignas antiguas.
//  - Heartbeat mientras está armado.

import {
  Command,
  FwMessage,
  MAX_MOVE_MS,
  PROTOCOL_DEVICE,
  PROTOCOL_VERSION,
  Request,
  buildMoveRequests,
  describeError,
  encodeRequest,
  parseFirmwareLine,
} from './protocol';

export interface LineTransport {
  /** Envía una línea (sin '\n'). priority=true: el servicio descarta lo pendiente y la escribe primero. */
  send(line: string, priority: boolean): void;
}

export type LinkState =
  | 'desconectado'
  | 'conectando'
  | 'identificando'
  | 'firmware-desconocido'
  | 'incompatible'
  | 'desarmado'
  | 'armado'
  | 'enlace-perdido'
  | 'fallo'
  | 'cargando';

export const LINK_STATE_LABEL: Record<LinkState, string> = {
  desconectado: 'Desconectado',
  conectando: 'Conectando',
  identificando: 'Identificando firmware',
  'firmware-desconocido': 'Firmware desconocido',
  incompatible: 'Firmware incompatible',
  desarmado: 'Compatible · desarmado',
  armado: 'Armado',
  'enlace-perdido': 'Enlace perdido (firmware)',
  fallo: 'Fallo de comunicación',
  cargando: 'Cargando firmware',
};

export interface FirmwareInfo {
  dev: string;
  proto: number;
  fw: string;
  boot: string;
  session: number;
  channels: number;
  calStep: number;
  freeRam: number | null;
  /** Placa informada por el firmware (UNO, ESP32…). null en firmware 0.1.x, que no la informa. */
  mcu: string | null;
}

export type LogLevel = 'info' | 'aviso' | 'error' | 'tx' | 'rx';
export interface ClientLog {
  level: LogLevel;
  text: string;
  at: number;
}

export interface ClientCallbacks {
  onState?: (s: LinkState, why: string) => void;
  onLog?: (l: ClientLog) => void;
  onFirmware?: (info: FirmwareInfo | null) => void;
  /** Firmware aceptó la orden (OK MOVE / ENABLE): última consigna confirmada. */
  onConfirmed?: (ch: number, us: number, at: number) => void;
  /** Reporte PW: consigna PWM escrita por el firmware. */
  onPulses?: (pulses: Record<number, number>, fwMillis: number, at: number) => void;
  onEnabled?: (enabled: ReadonlySet<number>) => void;
  onDone?: (moveId: number) => void;
  onReset?: (why: string) => void;
  onRtt?: (ms: number, at: number) => void;
}

export interface ClientOptions {
  requestTimeoutMs?: number;
  bootWaitMs?: number;
  flushIntervalMs?: number;
  heartbeatMs?: number;
  maxInFlightMoves?: number;
  /** Velocidad usada para calcular la duración de MOVE desde sliders (µs/s). */
  sliderSpeedUsPerS?: number;
  now?: () => number;
}

interface Pending {
  req: Request;
  sentAt: number;
  resolve: (m: FwMessage & { kind: 'ok' }) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  targets?: { ch: number; us: number }[];
  generation: number;
}

export class CommandError extends Error {
  constructor(
    message: string,
    public code: string,
    public detail = '',
  ) {
    super(message);
  }
}

export class ProtocolClient {
  state: LinkState = 'desconectado';
  firmware: FirmwareInfo | null = null;
  readonly enabled = new Set<number>();
  /** Última consigna confirmada por canal (OK del firmware), no medición. */
  readonly confirmed = new Map<number, number>();
  /** Consignas de sliders pendientes de enviar (se sobrescriben). */
  readonly pendingTargets = new Map<number, number>();

  private nextId = 1;
  private pending = new Map<number, Pending>();
  private generation = 0;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveTimeouts = 0;
  private session = 0;
  private lastSentTarget = new Map<number, number>();
  private opts: Required<ClientOptions>;
  sentLines = 0;

  constructor(
    private transport: LineTransport,
    private cb: ClientCallbacks = {},
    opts: ClientOptions = {},
  ) {
    this.opts = {
      requestTimeoutMs: opts.requestTimeoutMs ?? 1200,
      bootWaitMs: opts.bootWaitMs ?? 2500,
      flushIntervalMs: opts.flushIntervalMs ?? 60,
      heartbeatMs: opts.heartbeatMs ?? 500,
      maxInFlightMoves: opts.maxInFlightMoves ?? 2,
      sliderSpeedUsPerS: opts.sliderSpeedUsPerS ?? 600,
      now: opts.now ?? (() => Date.now()),
    };
  }

  // ------------------------------------------------------------ ciclo de vida

  /**
   * Puerto abierto. La placa puede reiniciarse (el UNO lo hace por DTR; un ESP32
   * a veces no): se espera BOOT o se identifica tras un plazo.
   */
  attach(): void {
    this.resetSession('Puerto abierto');
    this.setState('identificando', 'Esperando arranque de la placa');
    this.session = 1 + Math.floor(Math.random() * 65534);
    this.bootTimer = setTimeout(() => {
      this.bootTimer = null;
      this.identify().catch(() => undefined);
    }, this.opts.bootWaitMs);
    this.flushTimer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
  }

  /** Puerto cerrado o perdido. */
  detach(why = 'Puerto cerrado', state: LinkState = 'desconectado'): void {
    this.resetSession(why);
    this.setState(state, why);
  }

  dispose(): void {
    this.detach();
  }

  private resetSession(why: string) {
    this.generation++;
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.bootTimer = null;
    this.flushTimer = null;
    this.stopHeartbeat();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new CommandError(`Cancelado: ${why}`, 'CANCELADO'));
    }
    this.pending.clear();
    this.pendingTargets.clear();
    this.lastSentTarget.clear();
    this.confirmed.clear();
    this.enabled.clear();
    this.cb.onEnabled?.(this.enabled);
    this.consecutiveTimeouts = 0;
    this.firmware = null;
    this.cb.onFirmware?.(null);
  }

  private setState(s: LinkState, why: string) {
    if (s === this.state) return;
    this.state = s;
    this.cb.onState?.(s, why);
    if (s === 'armado') this.startHeartbeat();
    else if (s !== 'enlace-perdido') this.stopHeartbeat();
  }

  private log(level: LogLevel, text: string) {
    this.cb.onLog?.({ level, text, at: this.opts.now() });
  }

  get isCompatible(): boolean {
    return this.state === 'desarmado' || this.state === 'armado' || this.state === 'enlace-perdido';
  }

  // ------------------------------------------------------------ recepción

  handleLine(line: string): void {
    const m = parseFirmwareLine(line);
    this.log('rx', line);
    switch (m.kind) {
      case 'boot':
        this.onBoot(m);
        return;
      case 'ok':
      case 'err': {
        const p = this.pending.get(m.id);
        if (!p) {
          if (m.kind === 'err') this.log('error', `Firmware: ${describeError(m.code, m.detail)}${m.id ? ` (id ${m.id})` : ''}`);
          return;
        }
        clearTimeout(p.timer);
        this.pending.delete(m.id);
        this.consecutiveTimeouts = 0;
        if (m.kind === 'ok') {
          this.onOk(p, m);
          p.resolve(m);
        } else {
          const msg = describeError(m.code, m.detail);
          this.log('error', `${p.req.cmd} rechazado: ${msg}`);
          p.reject(new CommandError(msg, m.code, m.detail));
        }
        return;
      }
      case 'event':
        if (m.name === 'DONE') {
          const id = Number(m.fields.id);
          if (Number.isFinite(id)) this.cb.onDone?.(id);
        } else if (m.name === 'LINKLOST') {
          this.pendingTargets.clear();
          if (m.fields.llp === 'OFF') {
            this.enabled.clear();
            this.cb.onEnabled?.(this.enabled);
          }
          this.log('aviso', `El firmware detectó pérdida de enlace (política ${m.fields.llp ?? '?'}). Revisa el robot y vuelve a armar.`);
          this.setState('enlace-perdido', 'EV LINKLOST');
        }
        return;
      case 'pulses':
        this.cb.onPulses?.(m.pulses, m.fwMillis, this.opts.now());
        return;
      case 'invalid':
        this.log('error', `Línea recibida inválida (${m.reason}): ${m.raw}`);
        return;
      case 'text':
        return;
    }
  }

  private onBoot(m: FwMessage & { kind: 'boot' }) {
    const wasActive = this.isCompatible;
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    if (wasActive) {
      const why = 'Reinicio del firmware detectado (BOOT)';
      this.log('aviso', why + ': se limpiaron colas y consignas; estado DESARMADO.');
      this.cb.onReset?.(why);
      const keepFlush = this.flushTimer;
      this.flushTimer = null;
      this.resetSession(why);
      this.flushTimer = keepFlush ?? setInterval(() => this.flush(), this.opts.flushIntervalMs);
    }
    this.setState('identificando', 'BOOT recibido');
    this.identify().catch(() => undefined);
  }

  private onOk(p: Pending, m: FwMessage & { kind: 'ok' }) {
    const now = this.opts.now();
    switch (p.req.cmd) {
      case 'ENABLE': {
        const ch = Number(p.req.args[0]);
        const us = Number(p.req.args[1]);
        this.enabled.add(ch);
        this.cb.onEnabled?.(this.enabled);
        if (p.generation === this.generation) {
          this.confirmed.set(ch, us);
          this.lastSentTarget.set(ch, us);
          this.cb.onConfirmed?.(ch, us, now);
        }
        break;
      }
      case 'MOVE':
        if (p.targets && p.generation === this.generation) {
          for (const t of p.targets) {
            this.confirmed.set(t.ch, t.us);
            this.cb.onConfirmed?.(t.ch, t.us, now);
          }
        }
        break;
      case 'OFF': {
        const a = String(p.req.args[0]);
        if (a === 'ALL') this.enabled.clear();
        else this.enabled.delete(Number(a));
        this.cb.onEnabled?.(this.enabled);
        break;
      }
      case 'DISARM':
        this.enabled.clear();
        this.cb.onEnabled?.(this.enabled);
        this.setState('desarmado', 'DISARM confirmado');
        break;
      case 'ARM':
        this.setState('armado', 'ARM confirmado');
        break;
      case 'HB':
        this.cb.onRtt?.(now - p.sentAt, now);
        break;
      case 'HELLO': {
        const f = m.fields;
        const info: FirmwareInfo = {
          dev: f.dev ?? '?',
          proto: Number(f.proto),
          fw: f.fw ?? '?',
          boot: f.boot ?? '?',
          session: Number(f.ses),
          channels: Number(f.ch),
          calStep: Number(f.calstep),
          freeRam: f.fr !== undefined && Number(f.fr) >= 0 ? Number(f.fr) : null,
          mcu: f.mcu && /^[A-Za-z0-9_-]{1,16}$/.test(f.mcu) ? f.mcu : null,
        };
        const prevBoot = this.firmware?.boot;
        if (prevBoot && prevBoot !== info.boot) {
          this.log('aviso', 'Boot id distinto: la placa se reinició.');
          this.cb.onReset?.('Boot id distinto');
        }
        this.firmware = info;
        this.cb.onFirmware?.(info);
        if (info.dev !== PROTOCOL_DEVICE || info.proto !== PROTOCOL_VERSION) {
          this.setState('incompatible', `Protocolo ${info.dev}/${info.proto} (se requiere ${PROTOCOL_DEVICE}/${PROTOCOL_VERSION})`);
        } else {
          this.setState('desarmado', 'Firmware compatible identificado');
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ envío

  request(cmd: Command, args: (string | number)[] = [], opts: { priority?: boolean; targets?: { ch: number; us: number }[] } = {}) {
    const id = this.allocId();
    return this.sendRequest({ id, cmd, args }, opts);
  }

  private allocId(): number {
    const id = this.nextId;
    this.nextId = this.nextId >= 65535 ? 1 : this.nextId + 1;
    return id;
  }

  private sendRequest(req: Request, opts: { priority?: boolean; targets?: { ch: number; us: number }[] } = {}) {
    const line = encodeRequest(req);
    return new Promise<FwMessage & { kind: 'ok' }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        this.consecutiveTimeouts++;
        this.log('error', `Sin respuesta a ${req.cmd} (id ${req.id}).`);
        reject(new CommandError(`Sin respuesta a ${req.cmd}`, 'TIMEOUT'));
        if (this.consecutiveTimeouts >= 3 && this.isCompatible) {
          this.pendingTargets.clear();
          this.setState('fallo', 'Tres solicitudes sin respuesta');
        }
      }, this.opts.requestTimeoutMs);
      this.pending.set(req.id, {
        req,
        sentAt: this.opts.now(),
        resolve,
        reject,
        timer,
        targets: opts.targets,
        generation: this.generation,
      });
      this.sentLines++;
      this.log('tx', line);
      this.transport.send(line, !!opts.priority);
    });
  }

  async identify(): Promise<void> {
    if (this.state !== 'identificando') this.setState('identificando', 'Reintento de identificación');
    try {
      await this.request('HELLO', [this.session]);
    } catch (e) {
      if (this.state === 'identificando') {
        this.setState('firmware-desconocido', 'Sin respuesta compatible a HELLO');
        this.log('aviso', 'El firmware no respondió al protocolo DOGBOT v1. Controles bloqueados; el monitor serie sigue disponible.');
      }
      throw e;
    }
    if (this.state === 'desarmado') await this.reconcileAfterIdentify();
  }

  /**
   * Si la placa NO se reinició al abrir el puerto, el firmware puede seguir
   * armado y con canales habilitados. No se reenvía nada antiguo: se detienen
   * trayectorias (sin cortar PWM, para no soltar un robot que sostiene peso) y
   * se muestra el estado real informado por el firmware.
   */
  private async reconcileAfterIdentify() {
    try {
      const st = await this.request('STATUS');
      const armed = st.fields.arm === '1';
      const en = parseInt(st.fields.en ?? '0', 16) || 0;
      if (!armed && en === 0) return;
      await this.request('STOP', [], { priority: true });
      this.enabled.clear();
      for (let c = 0; c < 16; c++) if (en & (1 << c)) this.enabled.add(c);
      this.cb.onEnabled?.(this.enabled);
      await this.request('PULSES').catch(() => undefined);
      this.log('aviso', `El firmware seguía ${armed ? 'ARMADO' : 'desarmado'} con ${this.enabled.size} canal(es) con PWM (la placa no se reinició). Se detuvieron trayectorias; no se reenviaron consignas antiguas. Revisa y desarma si corresponde.`);
      if (armed) this.setState(st.fields.ll === '1' ? 'enlace-perdido' : 'armado', 'Firmware ya armado al conectar');
    } catch {
      /* el estado queda como identificado */
    }
  }

  private requireCompatible() {
    if (!this.isCompatible) throw new CommandError(`Estado ${LINK_STATE_LABEL[this.state]}: orden no permitida`, 'ESTADO_PC');
  }

  async configure(linkMs: number, policy: 'HOLD' | 'OFF', reportMs: number, slewPerTick: number) {
    this.requireCompatible();
    await this.request('LINK', [linkMs, policy]);
    await this.request('RATE', [reportMs]);
    await this.request('SLEW', [slewPerTick]);
  }

  async sendLimit(ch: number, min: number, ref: number, max: number) {
    this.requireCompatible();
    await this.request('LIMIT', [ch, min, ref, max]);
  }

  async arm() {
    this.requireCompatible();
    await this.request('ARM');
  }

  async disarm() {
    this.pendingTargets.clear();
    this.generation++;
    await this.request('DISARM', [], { priority: true });
  }

  async enable(ch: number, us: number) {
    this.requireCompatible();
    await this.request('ENABLE', [ch, Math.round(us)]);
  }

  async setMode(mode: 'CAL' | 'RUN') {
    this.requireCompatible();
    await this.request('MODE', [mode]);
  }

  /** Detener trayectoria: vacía consignas pendientes; prioridad máxima. No desenergiza servos. */
  async stop() {
    this.pendingTargets.clear();
    this.generation++;
    for (const [ch] of this.lastSentTarget) {
      const c = this.confirmed.get(ch);
      if (c !== undefined) this.lastSentTarget.set(ch, c);
    }
    await this.request('STOP', [], { priority: true });
    try {
      await this.request('PULSES');
    } catch {
      /* informativo */
    }
  }

  /** Desactivar señal PWM (canal o todos). Prioridad máxima. Puede hacer perder apoyo. */
  async pwmOff(ch: number | 'ALL') {
    this.pendingTargets.clear();
    this.generation++;
    await this.request('OFF', [ch], { priority: true });
  }

  /** Slider: guarda la última consigna; se envía consolidada con tasa limitada. */
  setTarget(ch: number, us: number) {
    if (!this.isCompatible || this.state !== 'armado') return false;
    if (!this.enabled.has(ch)) return false;
    this.pendingTargets.set(ch, Math.round(us));
    return true;
  }

  /** Envía un fotograma de secuencia (todas sus consignas) con duración explícita. */
  async moveNow(targets: { ch: number; us: number }[], ms: number) {
    if (this.state !== 'armado') throw new CommandError('No armado', 'ESTADO_PC');
    for (const t of targets) this.pendingTargets.delete(t.ch);
    const reqs = buildMoveRequests(() => this.allocId(), ms, targets);
    const ps = reqs.map((r) => {
      const ts: { ch: number; us: number }[] = [];
      for (let i = 1; i < r.args.length; i += 2) ts.push({ ch: Number(r.args[i]), us: Number(r.args[i + 1]) });
      for (const t of ts) this.lastSentTarget.set(t.ch, t.us);
      return this.sendRequest(r, { targets: ts });
    });
    return Promise.all(ps);
  }

  private inFlightMoves(): number {
    let n = 0;
    for (const p of this.pending.values()) if (p.req.cmd === 'MOVE') n++;
    return n;
  }

  /** Envía las consignas consolidadas si hay capacidad. */
  flush() {
    if (this.state !== 'armado' || this.pendingTargets.size === 0) return;
    if (this.inFlightMoves() >= this.opts.maxInFlightMoves) return;
    const targets = [...this.pendingTargets.entries()].map(([ch, us]) => ({ ch, us }));
    this.pendingTargets.clear();
    let maxDelta = 0;
    for (const t of targets) {
      const prev = this.lastSentTarget.get(t.ch) ?? this.confirmed.get(t.ch) ?? t.us;
      maxDelta = Math.max(maxDelta, Math.abs(t.us - prev));
    }
    const ms = Math.min(MAX_MOVE_MS, Math.max(60, Math.round((maxDelta / this.opts.sliderSpeedUsPerS) * 1000)));
    const reqs = buildMoveRequests(() => this.allocId(), ms, targets);
    for (const r of reqs) {
      const ts: { ch: number; us: number }[] = [];
      for (let i = 1; i < r.args.length; i += 2) ts.push({ ch: Number(r.args[i]), us: Number(r.args[i + 1]) });
      for (const t of ts) this.lastSentTarget.set(t.ch, t.us);
      this.sendRequest(r, { targets: ts }).catch(() => {
        /* ya registrado */
      });
    }
  }

  private startHeartbeat() {
    if (this.hbTimer) return;
    this.hbTimer = setInterval(() => {
      if (this.state === 'armado' || this.state === 'enlace-perdido') this.request('HB').catch(() => undefined);
    }, this.opts.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
  }

  markUploading() {
    this.resetSession('Carga de firmware');
    this.setState('cargando', 'Carga de firmware en curso');
  }
}
