import type { Request, Response, NextFunction } from 'express';
import { getRequestClientIp } from './request-ip';

/**
 * Rate-limit simple en memoria, por IP, ventana fija. Pensado para frenar
 * un loop descontrolado (o un DoS trivial) contra los endpoints que
 * renderizan PDF con Puppeteer — no para tráfico legítimo normal.
 */
export function createRateLimiter({
  windowMs,
  max,
  message,
}: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = getRequestClientIp(req) || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      res.status(429).json({
        error:
          message ||
          `Demasiadas solicitudes. Probá de nuevo en ${Math.ceil((entry.resetAt - now) / 1000)}s.`,
      });
      return;
    }

    entry.count += 1;
    next();
  };
}
