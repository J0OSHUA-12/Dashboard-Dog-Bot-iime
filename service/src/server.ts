// Servidor HTTP + WebSocket local (127.0.0.1). Sin ejecución arbitraria:
// sólo puerto serie, sketches con rutas validadas y Arduino CLI con
// argumentos estructurados.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ClientMsg,
  SERVICE_VERSION,
  ServerMsg,
  SketchSource,
  TOKEN_HEADER,
  ToolsStatus,
} from '../../shared/serviceApi';
import { AppPaths, safeJoin } from './paths';
import { SecurityConfig, hostAllowed, originAllowed, tokenMatches } from './security';
import { SerialManager } from './serialManager';
import { BuildManager, JobError } from './buildManager';
import { SketchStore } from './sketches';

export interface ServerDeps {
  paths: AppPaths;
  sec: SecurityConfig;
  serial: SerialManager;
  builds: BuildManager;
  sketches: SketchStore;
  detect: (refresh: boolean) => Promise<ToolsStatus>;
  log?: (msg: string) => void;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, limit = 600_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new JobError('Cuerpo demasiado grande', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new JobError('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new JobError(`Falta "${name}"`);
  return v;
}

export function createServer(d: ServerDeps) {
  const log = d.log ?? (() => undefined);
  const clients = new Map<string, WebSocket>();
  let controller: string | null = null;
  let idleClose: ReturnType<typeof setTimeout> | null = null;

  const broadcast = (m: ServerMsg) => {
    const s = JSON.stringify(m);
    for (const ws of clients.values()) if (ws.readyState === WebSocket.OPEN) ws.send(s);
  };

  d.serial.on('status', (status) => broadcast({ t: 'serial', status }));
  d.serial.on('line', (line: string) => broadcast({ t: 'rx', line, at: Date.now() }));
  d.serial.on('tx', (line: string, priority: boolean) => broadcast({ t: 'tx', line, at: Date.now(), priority }));
  d.serial.on('dropped', (count: number, reason: string) => broadcast({ t: 'dropped', count, reason }));
  d.builds.on('job', (job, build) => broadcast({ t: 'job', job, build }));
  d.builds.on('job-log', (jobId: string, stream: 'stdout' | 'stderr' | 'info', text: string) => broadcast({ t: 'job-log', jobId, stream, text }));

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
    const p = url.pathname;
    if (p === '/api/status' && method === 'GET') {
      return sendJson(res, 200, { service: SERVICE_VERSION, serial: d.serial.status, busyJob: d.builds.busyJob });
    }
    if (p === '/api/tools' && method === 'GET') {
      return sendJson(res, 200, await d.detect(url.searchParams.get('refresh') === '1'));
    }
    if (p === '/api/sketches' && method === 'GET') return sendJson(res, 200, d.sketches.list());
    const m = /^\/api\/sketches\/(mis-sketches|firmware|originales)\/([^/]+)$/.exec(p);
    if (m) {
      const source = m[1] as SketchSource;
      const name = decodeURIComponent(m[2]);
      if (method === 'GET') return sendJson(res, 200, { source, name, content: d.sketches.read(source, name) });
      if (method === 'PUT' && source === 'mis-sketches') {
        const body = (await readBody(req)) as Record<string, unknown>;
        const saved = d.sketches.save(name, str(body.content, 'content'), body.overwrite === true);
        return sendJson(res, 200, { ok: true, path: saved });
      }
      return sendJson(res, 403, { error: 'Origen de solo lectura: guarda una copia en "Mis sketches".' });
    }
    if (p === '/api/compile' && method === 'POST') {
      const b = (await readBody(req)) as Record<string, unknown>;
      return sendJson(res, 200, d.builds.compile(str(b.sketchName, 'sketchName'), str(b.fqbn, 'fqbn'), str(b.content, 'content')));
    }
    if (p === '/api/upload' && method === 'POST') {
      const b = (await readBody(req)) as Record<string, unknown>;
      const job = d.builds.upload(str(b.buildId, 'buildId'), str(b.contentHash, 'contentHash'), str(b.fqbn, 'fqbn'), str(b.port, 'port'));
      return sendJson(res, 200, { job });
    }
    if (p === '/api/tools/install' && method === 'POST') {
      const b = (await readBody(req)) as Record<string, unknown>;
      const what = b.what;
      if (what !== 'install-core' && what !== 'install-lib' && what !== 'update-index') throw new JobError('Instalación desconocida');
      return sendJson(res, 200, { job: d.builds.install(what) });
    }
    return sendJson(res, 404, { error: 'No encontrado' });
  }

  function serveStatic(res: http.ServerResponse, url: URL) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    let file: string;
    try {
      file = safeJoin(d.paths.web, '.' + rel);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(d.paths.web, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Interfaz no compilada. Ejecuta "npm run build" (o INSTALAR_DOGBOT.bat).');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html') {
      const html = fs
        .readFileSync(file, 'utf8')
        .replace('<meta name="dogbot-token" content="" />', `<meta name="dogbot-token" content="${d.sec.token}" />`);
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store', 'x-frame-options': 'DENY' });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!hostAllowed(d.sec, req)) {
        res.writeHead(403, { 'content-type': 'text/plain' }).end('Host no permitido');
        return;
      }
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        if (!originAllowed(d.sec, req)) return sendJson(res, 403, { error: 'Origen no permitido' });
        const tok = req.headers[TOKEN_HEADER] as string | undefined;
        if (!tokenMatches(d.sec, tok)) return sendJson(res, 401, { error: 'Token inválido' });
        await handleApi(req, res, url);
        return;
      }
      if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
      }
      serveStatic(res, url);
    } catch (e) {
      const status = e instanceof JobError ? e.status : 400;
      if (!res.headersSent) sendJson(res, status, { error: (e as Error).message });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws' || !hostAllowed(d.sec, req) || !originAllowed(d.sec, req) || !tokenMatches(d.sec, url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    const id = crypto.randomUUID();
    clients.set(id, ws);
    if (idleClose) {
      clearTimeout(idleClose);
      idleClose = null;
    }
    if (!controller) controller = id;
    const send = (m: ServerMsg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
    send({ t: 'hello', service: SERVICE_VERSION, controller: controller === id, clientId: id });
    send({ t: 'serial', status: d.serial.status });
    for (const job of d.builds.jobs.values()) if (job.state === 'en-curso') send({ t: 'job', job });
    log(`Cliente conectado (${clients.size})`);

    ws.on('message', async (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ t: 'error', message: 'Mensaje inválido' });
        return;
      }
      try {
        if (msg.t === 'list-ports') {
          send({ t: 'ports', ports: await d.serial.list() });
          return;
        }
        if (msg.t === 'take-control') {
          controller = id;
          for (const [cid, c] of clients) if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ t: 'control', controller: cid === id } satisfies ServerMsg));
          return;
        }
        if (controller !== id) {
          send({ t: 'error', message: 'Otra pestaña controla el robot. Usa "Tomar control".' });
          return;
        }
        if (msg.t === 'open') {
          if (d.builds.busyJob?.kind === 'upload') throw new Error('Carga de firmware en curso');
          await d.serial.open(String(msg.path), Number(msg.baud));
        } else if (msg.t === 'close') {
          await d.serial.close();
        } else if (msg.t === 'send') {
          d.serial.send(String(msg.line), !!msg.priority);
        }
      } catch (e) {
        send({ t: 'error', message: (e as Error).message });
      }
    });
    ws.on('close', () => {
      clients.delete(id);
      if (controller === id) {
        controller = clients.keys().next().value ?? null;
        if (controller) clients.get(controller)?.send(JSON.stringify({ t: 'control', controller: true } satisfies ServerMsg));
      }
      log(`Cliente desconectado (${clients.size})`);
      if (clients.size === 0 && d.serial.status.state === 'abierto') {
        // Sin interfaz abierta: se libera el COM (el firmware aplicará su política de pérdida de enlace).
        idleClose = setTimeout(() => {
          idleClose = null;
          if (clients.size === 0) {
            log('Sin clientes: se cierra el puerto serie.');
            void d.serial.close();
          }
        }, 4000);
      }
    });
  });

  return server;
}
