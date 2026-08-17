import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'print_admin_session';
/** TTL en memoria del servidor (la cookie es de sesión: se borra al cerrar el navegador). */
const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionEntry {
  tokenHash: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionEntry>();

function getAdminPin(): string {
  return (process.env.PRINT_ADMIN_PIN || 'col1968').trim();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (entry.expiresAt <= now) sessions.delete(id);
  }
}

export function verifyAdminPin(pin: unknown): boolean {
  if (typeof pin !== 'string') return false;
  const expected = getAdminPin();
  const a = Buffer.from(pin.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createAdminSession(res: Response): void {
  pruneSessions();
  const token = randomBytes(32).toString('hex');
  const id = randomBytes(16).toString('hex');
  sessions.set(id, {
    tokenHash: hashToken(token),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  const value = encodeURIComponent(`${id}.${token}`);
  // Cookie de sesión (sin Max-Age): no persiste al cerrar el navegador.
  // Al cerrar el panel de config el cliente también llama /lock.
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax`,
  );
}

export function clearAdminSession(req: Request, res: Response): void {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (raw) {
    const [id] = raw.split('.');
    if (id) sessions.delete(id);
  }
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function isAdminSessionValid(req: Request): boolean {
  pruneSessions();
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return false;
  const [id, token] = raw.split('.');
  if (!id || !token) return false;
  const entry = sessions.get(id);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    sessions.delete(id);
    return false;
  }
  const incoming = hashToken(token);
  const expected = Buffer.from(entry.tokenHash);
  const actual = Buffer.from(incoming);
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function requirePrintAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminSessionValid(req)) {
    res.status(401).json({ error: 'Sesión de administración requerida' });
    return;
  }
  next();
}

export function getAdminSessionStatus(req: Request): { unlocked: boolean; ttlHours: number } {
  return {
    unlocked: isAdminSessionValid(req),
    ttlHours: SESSION_TTL_MS / (60 * 60 * 1000),
  };
}
