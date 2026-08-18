import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Sesión real por usuario (reemplaza el modelo de PIN compartido). La
 * cookie solo firma `${userId}.${expiresAt}` — el rol/estado NO viaja en
 * la cookie, se relee de la DB en cada request (requireLogin/requireAdmin)
 * para que aprobar/rechazar/promover/degradar a alguien surta efecto de
 * inmediato, sin esperar a que expire una sesión de hasta 30 días.
 */
const COOKIE_NAME = 'user_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

function sign(payload: string): string {
  const secret = String(process.env.INTERNAL_API_KEY || '');
  return createHmac('sha256', `${secret}:${COOKIE_NAME}`).update(payload).digest('hex');
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

export function createUserSession(req: Request, res: Response, userId: number): void {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const value = encodeURIComponent(token);
  const secureFlag = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${Math.floor(TTL_MS / 1000)}`,
  );
}

export function clearUserSession(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Solo valida la firma/expiración — no toca la DB. */
function getSessionUserId(req: Request): number | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [userIdStr, expiresAtStr, sig] = parts;
  const payload = `${userIdStr}.${expiresAtStr}`;
  if (!sig || !safeEqual(sig, sign(payload))) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const userId = Number(userIdStr);
  return Number.isFinite(userId) ? userId : null;
}

/** Cualquier usuario con cuenta aprobada. Carga req.user desde la DB. */
export async function requireLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = getSessionUserId(req);
  if (userId == null) {
    res.status(401).json({ error: 'Sesión requerida' });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'approved') {
      res.status(401).json({ error: 'Sesión requerida' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(500).json({ error: 'Error verificando sesión' });
  }
}

/** Como requireLogin, pero exige rol admin. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireLogin(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Requiere rol admin' });
      return;
    }
    next();
  });
}
