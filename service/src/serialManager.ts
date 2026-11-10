// Propietario único del puerto COM.
//  - Una sola conexión abierta; cola corta; STOP/OFF (prioridad) vacían lo pendiente.
//  - Diagnósticos útiles si otra aplicación (Arduino IDE / Monitor Serie) ocupa el puerto.
//  - Al abrir, el Arduino UNO se reinicia por DTR; un ESP32 puede no reiniciarse.
//    La interfaz espera BOOT y, si no llega, identifica el firmware igualmente.

import { EventEmitter } from 'node:events';
import { PortInfo, SerialStatus } from '../../shared/serviceApi';

export interface PortLike {
  open(cb: (err: Error | null) => void): void;
  close(cb?: (err: Error | null) => void): void;
  write(data: string, cb?: (err: Error | null | undefined) => void): boolean;
  on(ev: 'data', fn: (d: Buffer) => void): unknown;
  on(ev: 'close', fn: (err?: Error | null) => void): unknown;
  on(ev: 'error', fn: (err: Error) => void): unknown;
  /** Líneas de control (DTR/RTS). Opcional: los puertos simulados no la tienen. */
  set?(opts: { dtr?: boolean; rts?: boolean }, cb?: (err: Error | null) => void): void;
  isOpen: boolean;
}

export interface PortFactory {
  create(path: string, baud: number): PortLike;
  list(): Promise<PortInfo[]>;
}

export const ALLOWED_BAUDS = [9600, 19200, 38400, 57600, 115200];
export const SERIAL_PATH_RE = /^(COM\d{1,3}|\/dev\/(tty|cu)[A-Za-z0-9._-]{1,40})$/i;
const MAX_QUEUE = 16;
const KICK_MS = 40;
const MAX_RX_LINE = 512;

export function diagnoseOpenError(msg: string): string {
  const m = msg.toLowerCase();
  if (/access denied|acceso denegado|resource busy|ebusy|permission denied|locked/.test(m)) {
    return 'El puerto está ocupado. Cierra el Monitor Serie / Arduino IDE u otra aplicación que lo use y vuelve a conectar.';
  }
  if (/file not found|no such file|cannot find|not found|enoent/.test(m)) {
    return 'El puerto no existe. ¿Se desconectó la placa? Actualiza la lista de puertos.';
  }
  return 'No se pudo abrir el puerto. Revisa el cable, el driver (CH340 o CP210x según la placa) y que el puerto sea el correcto.';
}

/**
 * Pista sobre la placa según el adaptador USB. Es orientativa: los chips
 * CH340, CP210x y FTDI se usan tanto en clones de Arduino como en ESP32, así
 * que solo se nombra una placa cuando el fabricante USB es inequívoco.
 */
export function boardHint(vendorId: string | null, manufacturer: string | null): string | null {
  const v = (vendorId ?? '').toLowerCase();
  const m = manufacturer ?? '';
  if (v === '2341' || v === '2a03' || /arduino/i.test(m)) return 'Arduino';
  if (v === '303a' || /espressif/i.test(m)) return 'ESP32';
  if (v === '10c4' || /silicon lab|cp210/i.test(m)) return 'CP210x';
  if (v === '1a86' || /wch|ch340|ch910/i.test(m)) return 'CH340';
  if (v === '0403' || /ftdi/i.test(m)) return 'FTDI';
  return null;
}

export class SerialManager extends EventEmitter {
  status: SerialStatus = { state: 'cerrado', path: null, baud: null, error: null, diagnostic: null };
  private port: PortLike | null = null;
  private queue: string[] = [];
  private writing = false;
  private rxBuf = '';
  private closingOnPurpose = false;
  private kickTimer: ReturnType<typeof setInterval> | null = null;
  private kickMs: number;

  /**
   * kickMs: intervalo del "empujón" de lectura (0 = desactivado). Por defecto, activo solo en Windows
   * (desactivable con DOGBOT_SERIAL_KICK=0). Ver startKick().
   */
  constructor(
    private factory: PortFactory,
    opts: { kickMs?: number } = {},
  ) {
    super();
    this.kickMs = opts.kickMs ?? (process.platform === 'win32' && process.env.DOGBOT_SERIAL_KICK !== '0' ? KICK_MS : 0);
  }

  /**
   * Solución provisional para adaptadores WCH (CH9102/CH343) en Windows: con serialport, las respuestas
   * de la placa no llegan al programa hasta que se escribe OTRA cosa en el puerto (se vio con 'OK n STATUS'
   * entregado 6,6 s tarde, justo al escribir la orden siguiente), mientras que el Monitor Serie de Arduino
   * IDE las recibe al instante. Escribir una línea vacía ('\n') libera la lectura, y el firmware DogBot la
   * ignora sin responder ni contar como enlace activo. Solo con el protocolo DogBot (115200 baudios) y solo
   * cuando no hay una escritura en curso o pendiente, para no intercalar nada en mitad de una orden.
   */
  private startKick(port: PortLike, baud: number) {
    this.stopKick();
    if (!this.kickMs || baud !== 115200) return;
    this.kickTimer = setInterval(() => {
      if (this.port !== port || this.writing || this.queue.length > 0) return;
      try {
        port.write('\n', () => undefined);
      } catch {
        /* un fallo de escritura se notificará por el evento 'error' del puerto */
      }
    }, this.kickMs);
    this.kickTimer.unref?.();
  }

  private stopKick() {
    if (this.kickTimer) clearInterval(this.kickTimer);
    this.kickTimer = null;
  }

  private setStatus(s: Partial<SerialStatus>) {
    this.status = { ...this.status, ...s };
    this.emit('status', this.status);
  }

  list() {
    return this.factory.list();
  }

  async open(path: string, baud: number): Promise<void> {
    if (!SERIAL_PATH_RE.test(path)) throw new Error('Puerto inválido');
    if (!ALLOWED_BAUDS.includes(baud)) throw new Error('Velocidad no permitida');
    if (this.port) await this.close();
    this.setStatus({ state: 'abriendo', path, baud, error: null, diagnostic: null });
    const port = this.factory.create(path, baud);
    await new Promise<void>((resolve, reject) => {
      port.open((err) => {
        if (err) {
          this.setStatus({ state: 'error', error: err.message, diagnostic: diagnoseOpenError(err.message) });
          reject(err);
          return;
        }
        resolve();
      });
    });
    this.port = port;
    this.queue = [];
    this.rxBuf = '';
    // DTR y RTS inactivos (0,0). En las placas ESP32 el circuito de auto-reset mapea:
    //   (DTR,RTS) = (0,0)->EN=1,IO0=1 funcionar | (1,0)->IO0=0 | (0,1)->EN=0 (reset) | (1,1)->funcionar.
    // Con (1,0), que es como Windows deja el puerto al abrirlo, un reinicio posterior (botón EN) arranca en
    // modo de carga («waiting for download»). Forzar (1,1) desde (0,0) obligaba a pasar por (0,1): reinicio
    // al abrir y arranque en modo de carga según la carrera entre EN e IO0. El binding de Windows aplica
    // primero RTS y luego DTR, así que ir a (0,0) desde (1,1) o (1,0) pasa por (1,0) y llega a (0,0) sin
    // ningún reinicio. El UNO ya se reinició al abrir (DTR activo); soltar DTR después no lo reinicia.
    try {
      port.set?.({ dtr: false, rts: false }, () => undefined);
    } catch {
      /* adaptadores sin líneas de control: no es un error */
    }
    port.on('data', (d: Buffer) => this.onData(d));
    this.startKick(port, baud);
    port.on('error', (e: Error) => {
      this.setStatus({ state: 'error', error: e.message, diagnostic: diagnoseOpenError(e.message) });
    });
    port.on('close', () => {
      const unexpected = !this.closingOnPurpose;
      this.stopKick();
      this.port = null;
      this.queue = [];
      this.writing = false;
      if (unexpected) this.setStatus({ state: 'error', error: 'Puerto cerrado inesperadamente', diagnostic: 'La placa se desconectó o el cable USB falló.' });
    });
    this.setStatus({ state: 'abierto', error: null, diagnostic: null });
  }

  async close(nextState: SerialStatus['state'] = 'cerrado'): Promise<void> {
    const p = this.port;
    this.queue = [];
    if (!p) {
      this.setStatus({ state: nextState });
      return;
    }
    this.closingOnPurpose = true;
    this.stopKick();
    await new Promise<void>((resolve) => p.close(() => resolve()));
    this.closingOnPurpose = false;
    this.port = null;
    this.writing = false;
    this.setStatus({ state: nextState, error: null, diagnostic: null });
  }

  private onData(d: Buffer) {
    this.rxBuf += d.toString('latin1');
    let idx: number;
    while ((idx = this.rxBuf.indexOf('\n')) >= 0) {
      const line = this.rxBuf.slice(0, idx).replace(/\r$/, '');
      this.rxBuf = this.rxBuf.slice(idx + 1);
      this.emit('line', line);
    }
    if (this.rxBuf.length > MAX_RX_LINE) {
      this.emit('line', this.rxBuf.slice(0, MAX_RX_LINE) + ' [línea truncada]');
      this.rxBuf = '';
    }
  }

  /** Encola una línea. priority=true descarta lo pendiente y se escribe primero. */
  send(line: string, priority: boolean): void {
    if (!this.port || this.status.state !== 'abierto') throw new Error('Puerto no abierto');
    // eslint-disable-next-line no-control-regex
    if (line.length > 200 || /[^\x20-\x7E]/.test(line)) throw new Error('Línea inválida (ASCII imprimible, máx. 200)');
    if (priority) {
      if (this.queue.length) this.emit('dropped', this.queue.length, 'Prioridad de parada: órdenes pendientes descartadas');
      this.queue = [line];
    } else {
      if (this.queue.length >= MAX_QUEUE) {
        this.emit('dropped', 1, 'Cola llena: orden descartada (no se acumulan consignas antiguas)');
        return;
      }
      this.queue.push(line);
    }
    this.emit('tx', line, priority);
    this.pump();
  }

  private pump() {
    if (this.writing || !this.port || this.queue.length === 0) return;
    const line = this.queue.shift()!;
    this.writing = true;
    // Se continúa con el aviso de escritura de Node, NO con drain(): en Windows, con algunos drivers
    // USB-serie (CH340 en ESP32), drain() (FlushFileBuffers) puede quedar colgado y bloquear también
    // la recepción: las respuestas de la placa llegaban con ~30 s de retraso, al reiniciarla.
    this.port.write(line + '\n', (err) => {
      this.writing = false;
      if (err) {
        this.setStatus({ state: 'error', error: err.message, diagnostic: 'Error de escritura en el puerto.' });
        return;
      }
      this.pump();
    });
  }

  async releaseForUpload(): Promise<{ path: string; baud: number } | null> {
    if (!this.port || !this.status.path || !this.status.baud) {
      this.setStatus({ state: 'liberado-para-carga' });
      return null;
    }
    const prev = { path: this.status.path, baud: this.status.baud };
    await this.close('liberado-para-carga');
    return prev;
  }

  async reopenAfterUpload(prev: { path: string; baud: number } | null): Promise<void> {
    if (!prev) {
      this.setStatus({ state: 'cerrado' });
      return;
    }
    await this.open(prev.path, prev.baud);
  }
}
