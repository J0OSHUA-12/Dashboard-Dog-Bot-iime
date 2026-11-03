import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Error al lanzar el proceso (p. ej. ejecutable inexistente). */
  spawnError: string | null;
  timedOut: boolean;
}

/** Ejecuta herramientas con argumentos estructurados. Nunca usa shell. */
export interface CommandRunner {
  run(exe: string, args: string[], opts?: RunOptions): Promise<RunResult>;
}

export const realRunner: CommandRunner = {
  run(exe, args, opts = {}) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let child;
      try {
        child = spawn(exe, args, { cwd: opts.cwd, shell: false, windowsHide: true });
      } catch (e) {
        resolve({ code: null, stdout, stderr, spawnError: (e as Error).message, timedOut });
        return;
      }
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, opts.timeoutMs)
        : null;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (d: string) => {
        stdout += d;
        opts.onStdout?.(d);
      });
      child.stderr.on('data', (d: string) => {
        stderr += d;
        opts.onStderr?.(d);
      });
      child.on('error', (e) => {
        if (timer) clearTimeout(timer);
        resolve({ code: null, stdout, stderr, spawnError: e.message, timedOut });
      });
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        resolve({ code, stdout, stderr, spawnError: null, timedOut });
      });
    });
  },
};
