// Cliente del servicio local (HTTP + WebSocket). Si no hay servicio, la
// interfaz funciona en SIMULACIÓN y desactiva COM / compilar / subir.
import { ClientMsg, ServerMsg, TOKEN_HEADER } from '../../shared/serviceApi';

type Listener = (m: ServerMsg) => void;

function readToken(): string {
  const el = document.querySelector('meta[name="dogbot-token"]');
  return el?.getAttribute('content') ?? '';
}

export class ServiceClient {
  readonly token = readToken();
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(up: boolean) => void>();
  private retry = 0;
  private stopped = false;
  connected = false;

  get hasToken() {
    return this.token.length > 0 && !__PREVIEW_BUILD__;
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (up: boolean) => void) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  async api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    if (!this.hasToken) throw new Error('Servicio local no disponible');
    const res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: this.token },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    return data as T;
  }

  start() {
    if (!this.hasToken) {
      this.statusListeners.forEach((f) => f(false));
      return;
    }
    this.stopped = false;
    this.open();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.statusListeners.forEach((f) => f(true));
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.listeners.forEach((f) => f(m));
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.ws = null;
      if (was || this.retry === 0) this.statusListeners.forEach((f) => f(false));
      if (this.stopped) return;
      const delay = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }

  send(m: ClientMsg): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }
}

export const service = new ServiceClient();
