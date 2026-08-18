import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Sesión sin estado: cookie = `${expiresAt}.${hmac}`. No usa memoria del
 * proceso, así que sobrevive a un reinicio (pm2 restart, deploy) sin forzar
 * a cada PC a reingresar el PIN. El secreto se mezcla con cookieName para
 * que un token de una instancia no sirva para otra.
 */
interface SessionAuthOptions {
  cookieName: string;
  pinEnvVar: string;
  ttlMs: number;
  /** Nombre de la env var con el secreto de firma (leída en cada request, no al crear el módulo — el .env todavía no está cargado en ese momento). */
  secretEnvVar: string;
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

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function createSessionAuth({ cookieName, pinEnvVar, ttlMs, secretEnvVar }: SessionAuthOptions) {
  const attempts = new Map<string, { failures: number; lockedUntil: number }>();
  const LOCKOUT_STEPS = [
    { after: 5, forMs: 30_000 },
    { after: 8, forMs: 2 * 60_000 },
    { after: 12, forMs: 15 * 60_000 },
  ];

  function sign(payload: string): string {
    const secret = String(process.env[secretEnvVar] || '');
    return createHmac('sha256', `${secret}:${cookieName}`).update(payload).digest('hex');
  }

  function getPin(): string | null {
    const pin = (process.env[pinEnvVar] || '').trim();
    return pin || null;
  }

  function registerFailedAttempt(ip: string): void {
    const entry = attempts.get(ip) || { failures: 0, lockedUntil: 0 };
    entry.failures += 1;
    const step = [...LOCKOUT_STEPS].reverse().find((s) => entry.failures >= s.after);
    if (step) entry.lockedUntil = Date.now() + step.forMs;
    attempts.set(ip, entry);
  }

  function getUnlockLockStatus(ip: string): { locked: boolean; retryAfterMs: number } {
    const entry = attempts.get(String(ip || '').trim());
    if (!entry) return { locked: false, retryAfterMs: 0 };
    const remaining = entry.lockedUntil - Date.now();
    return remaining > 0 ? { locked: true, retryAfterMs: remaining } : { locked: false, retryAfterMs: 0 };
  }

  function verifyPin(pin: unknown, clientIp: string): boolean {
    const expected = getPin();
    if (!expected) return false;
    const ok = typeof pin === 'string' && safeEqual(pin.trim(), expected);
    const ip = String(clientIp || '').trim();
    if (ok) attempts.delete(ip);
    else if (ip) registerFailedAttempt(ip);
    return ok;
  }

  function createSession(res: Response): void {
    const expiresAt = Date.now() + ttlMs;
    const payload = String(expiresAt);
    const token = `${payload}.${sign(payload)}`;
    const value = encodeURIComponent(token);
    const maxAgeSeconds = Math.floor(ttlMs / 1000);
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
    );
  }

  function clearSession(_req: Request, res: Response): void {
    res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  function isSessionValid(req: Request): boolean {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[cookieName];
    if (!raw) return false;
    const dot = raw.indexOf('.');
    if (dot <= 0) return false;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    if (!sig || !safeEqual(sig, sign(payload))) return false;
    const expiresAt = Number(payload);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  function requireSession(req: Request, res: Response, next: NextFunction): void {
    if (!isSessionValid(req)) {
      res.status(401).json({ error: 'Sesión requerida' });
      return;
    }
    next();
  }

  function getSessionStatus(req: Request): { unlocked: boolean; ttlHours: number } {
    return { unlocked: isSessionValid(req), ttlHours: ttlMs / (60 * 60 * 1000) };
  }

  return {
    verifyPin,
    createSession,
    clearSession,
    isSessionValid,
    requireSession,
    getSessionStatus,
    getUnlockLockStatus,
  };
}

export type SessionAuth = ReturnType<typeof createSessionAuth>;
