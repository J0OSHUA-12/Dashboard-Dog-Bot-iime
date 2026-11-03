import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Raíz del repositorio (contiene package.json). */
export function findRepoRoot(start = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'firmware'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

export interface AppPaths {
  root: string;
  web: string;
  data: string;
  builds: string;
  mySketches: string;
  firmware: string;
  originals: string;
  tokenFile: string;
  configFile: string;
}

export function makePaths(root: string): AppPaths {
  const data = path.join(root, '.dogbot');
  return {
    root,
    web: path.join(root, 'dist', 'web'),
    data,
    builds: path.join(data, 'builds'),
    mySketches: path.join(root, 'sketches'),
    firmware: path.join(root, 'firmware'),
    originals: path.join(root, 'DOGBOT_CLAUDE_CODE', 'originales'),
    tokenFile: path.join(data, 'session-token'),
    configFile: path.join(data, 'config.json'),
  };
}

/** Resuelve `child` dentro de `base`; lanza si escapa (rutas seguras). */
export function safeJoin(base: string, ...parts: string[]): string {
  const resolved = path.resolve(base, ...parts);
  const rel = path.relative(path.resolve(base), resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta fuera del área permitida');
  return resolved;
}
