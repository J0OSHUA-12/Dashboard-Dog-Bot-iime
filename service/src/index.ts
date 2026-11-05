// Punto de entrada del servicio local de Dog Bot Control.
// Uso: npm start  (o INICIAR_DOGBOT.bat en Windows)

import fs from 'node:fs';
import { SerialPort } from 'serialport';
import { SERVICE_PORT, SERVICE_VERSION, PortInfo, ToolsStatus } from '../../shared/serviceApi';
import { findRepoRoot, makePaths } from './paths';
import { makeSecurity, newToken } from './security';
import { PortFactory, SerialManager, isLikelyArduino } from './serialManager';
import { BuildManager } from './buildManager';
import { SketchStore } from './sketches';
import { cliCandidates, detectTools } from './arduinoCli';
import { realRunner } from './runner';
import { createServer } from './server';

const port = Number(process.env.DOGBOT_PORT ?? SERVICE_PORT);
const devPort = process.env.DOGBOT_DEV_PORT ? Number(process.env.DOGBOT_DEV_PORT) : 5173;
const root = findRepoRoot();
const paths = makePaths(root);
fs.mkdirSync(paths.builds, { recursive: true });
fs.mkdirSync(paths.mySketches, { recursive: true });

const token = newToken();
fs.writeFileSync(paths.tokenFile, token, { encoding: 'utf8', mode: 0o600 });
const sec = makeSecurity(port, token, devPort);

const factory: PortFactory = {
  create: (path, baud) => new SerialPort({ path, baudRate: baud, autoOpen: false }),
  async list(): Promise<PortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? null,
      vendorId: p.vendorId ?? null,
      productId: p.productId ?? null,
      serialNumber: p.serialNumber ?? null,
      likelyArduino: isLikelyArduino(p.vendorId ?? null, p.manufacturer ?? null),
    }));
  },
};

const serial = new SerialManager(factory);
let tools: ToolsStatus | null = null;
let cliPath = 'arduino-cli';
const detect = async (refresh: boolean) => {
  if (!tools || refresh) {
    tools = await detectTools(realRunner, cliCandidates());
    cliPath = tools.cliPath;
  }
  return tools;
};

const builds = new BuildManager({
  buildsDir: paths.builds,
  runner: realRunner,
  cliPath: () => cliPath,
  serial,
});
builds.on('job', (job) => {
  if (job.state !== 'en-curso' && (job.kind === 'install-core' || job.kind === 'install-lib')) tools = null;
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('  Cerrando Dog Bot Control: se libera el puerto COM.');
  await serial.close().catch(() => undefined);
  process.exit(0);
};

const server = createServer({
  paths,
  sec,
  serial,
  builds,
  sketches: new SketchStore(paths),
  detect,
  log: (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`),
  onShutdown: () => void shutdown(),
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya está en uso. ¿Ya hay otro Dog Bot Control abierto? Cierra esa ventana o usa DOGBOT_PORT.`);
  } else console.error(e);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log(`  Dog Bot Control · servicio local ${SERVICE_VERSION}`);
  console.log(`  Abre en el navegador:  http://127.0.0.1:${port}`);
  console.log('  Sólo accesible desde esta computadora. Ctrl+C para detener.');
  console.log('  Iniciar la app NO mueve el robot ni carga firmware.');
  console.log('');
  void detect(true).then((t) => {
    console.log(`  Arduino CLI: ${t.cli.detail} · ${t.core.detail} · ${t.lib.detail}`);
  });
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
