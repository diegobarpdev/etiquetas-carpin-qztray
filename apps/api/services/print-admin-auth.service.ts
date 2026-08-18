import type { Request, Response } from 'express';
import { createSessionAuth } from '../lib/session-auth';

const SESSION_TTL_MS = 30 * 60 * 1000;

const auth = createSessionAuth({
  cookieName: 'print_admin_session',
  pinEnvVar: 'PRINT_ADMIN_PIN',
  ttlMs: SESSION_TTL_MS,
  secretEnvVar: 'INTERNAL_API_KEY',
});

export function getUnlockLockStatus(ip: string) {
  return auth.getUnlockLockStatus(ip);
}

export function verifyAdminPin(pin: unknown, clientIp: string): boolean {
  return auth.verifyPin(pin, clientIp);
}

export function createAdminSession(req: Request, res: Response): void {
  auth.createSession(req, res);
}

export function clearAdminSession(req: Request, res: Response): void {
  auth.clearSession(req, res);
}

export function isAdminSessionValid(req: Request): boolean {
  return auth.isSessionValid(req);
}

export const requirePrintAdmin = auth.requireSession;

export function getAdminSessionStatus(req: Request) {
  return auth.getSessionStatus(req);
}
