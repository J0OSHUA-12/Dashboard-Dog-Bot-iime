import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export interface SecurityConfig {
  port: number;
  token: string;
  /** Orígenes del navegador permitidos (servicio y, en desarrollo, Vite). */
  allowedOrigins: Set<string>;
  allowedHosts: Set<string>;
}

export function newToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function makeSecurity(port: number, token: string, devPort?: number): SecurityConfig {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (devPort) {
    origins.add(`http://127.0.0.1:${devPort}`);
    origins.add(`http://localhost:${devPort}`);
  }
  return { port, token, allowedOrigins: origins, allowedHosts: hosts };
}

/** Rechaza Host ajenos (protección frente a DNS rebinding). */
export function hostAllowed(sec: SecurityConfig, req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').toLowerCase();
  return sec.allowedHosts.has(host);
}

/** Origin ausente (herramientas locales) o en la lista permitida. */
export function originAllowed(sec: SecurityConfig, req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return sec.allowedOrigins.has(origin.toLowerCase());
}

export function tokenMatches(sec: SecurityConfig, provided: string | undefined | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(sec.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
