// Propietario único del puerto COM.
//  - Una sola conexión abierta; cola corta; STOP/OFF (prioridad) vacían lo pendiente.
//  - Diagnósticos útiles si otra aplicación (Arduino IDE / Monitor Serie) ocupa el puerto.
//  - Al abrir, el Arduino UNO suele reiniciarse por DTR: la interfaz espera BOOT.

import { EventEmitter } from 'node:events';
import { PortInfo, SerialStatus } from '../../shared/serviceApi';

export interface PortLike {
  open(cb: (err: Error | null) => void): void;
  close(cb?: (err: Error | null) => void): void;
  write(data: string, cb?: (err: Error | null | undefined) => void): boolean;
  drain(cb: (err: Error | null) => void): void;
  on(ev: 'data', fn: (d: Buffer) => void): unknown;
  on(ev: 'close', fn: (err?: Error | null) => void): unknown;
  on(ev: 'error', fn: (err: Error) => void): unknown;
  isOpen: boolean;
}

export interface PortFactory {
  create(path: string, baud: number): PortLike;
  list(): Promise<PortInfo[]>;
}

export const ALLOWED_BAUDS = [9600, 19200, 38400, 57600, 115200];
export const SERIAL_PATH_RE = /^(COM\d{1,3}|\/dev\/(tty|cu)[A-Za-z0-9._-]{1,40})$/i;
const MAX_QUEUE = 16;
const MAX_RX_LINE = 512;

export function diagnoseOpenError(msg: string): string {
  const m = msg.toLowerCase();
  if (/access denied|acceso denegado|resource busy|ebusy|permission denied|locked/.test(m)) {
    return 'El puerto está ocupado. Cierra el Monitor Serie / Arduino IDE u otra aplicación que lo use y vuelve a conectar.';
  }
  if (/file not found|no such file|cannot find|not found|enoent/.test(m)) {
    return 'El puerto no existe. ¿Se desconectó la placa? Actualiza la lista de puertos.';
  }
  return 'No se pudo abrir el puerto. Revisa el cable, el driver (CH340 en clones) y que el puerto sea el correcto.';
}

export function isLikelyArduino(vendorId: string | null, manufacturer: string | null): boolean {
  const v = (vendorId ?? '').toLowerCase();
  return v === '2341' || v === '2a03' || v === '1a86' || v === '0403' || /arduino|wch|ch340/i.test(manufacturer ?? '');
}

/** Chip/adaptador USB-serie según el vendorId. NO identifica la placa: un ESP32 con CH340 se ve igual que un clon de UNO. */
export function usbChipName(vendorId: string | null, manufacturer: string | null): string | null {
  switch ((vendorId ?? '').toLowerCase()) {
    case '2341':
    case '2a03':
      return 'Arduino';
    case '1a86':
      return 'CH340/CH9102';
    case '10c4':
      return 'CP210x';
    case '0403':
      return 'FTDI';
    case '303a':
      return 'Espressif USB';
  }
  return /arduino/i.test(manufacturer ?? '') ? 'Arduino' : null;
}

export class SerialManager extends EventEmitter {
  status: SerialStatus = { state: 'cerrado', path: null, baud: null, error: null, diagnostic: null };
  private port: PortLike | null = null;
  private queue: string[] = [];
  private writing = false;
  private rxBuf = '';
  private closingOnPurpose = false;

  constructor(private factory: PortFactory) {
    super();
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
    port.on('data', (d: Buffer) => this.onData(d));
    port.on('error', (e: Error) => {
      this.setStatus({ state: 'error', error: e.message, diagnostic: diagnoseOpenError(e.message) });
    });
    port.on('close', () => {
      const unexpected = !this.closingOnPurpose;
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
    this.port.write(line + '\n', (err) => {
      if (err) this.setStatus({ state: 'error', error: err.message, diagnostic: 'Error de escritura en el puerto.' });
    });
    this.port.drain(() => {
      this.writing = false;
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
