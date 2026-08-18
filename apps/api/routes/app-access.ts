import { Router, Request, Response } from 'express';
import { getRequestClientIp } from '../lib/request-ip';
import { appAccessAuth } from '../services/app-access-auth.service';

const router = Router();

router.post('/app/unlock', (req: Request, res: Response) => {
  const ip = getRequestClientIp(req);
  const lock = appAccessAuth.getUnlockLockStatus(ip);
  if (lock.locked) {
    res.status(429).json({
      error: `Demasiados intentos. Probá de nuevo en ${Math.ceil(lock.retryAfterMs / 1000)}s.`,
    });
    return;
  }
  if (!appAccessAuth.verifyPin(req.body?.pin, ip)) {
    res.status(401).json({ error: 'Clave incorrecta' });
    return;
  }
  appAccessAuth.createSession(res);
  res.json({ ok: true, unlocked: true });
});

router.post('/app/lock', (req: Request, res: Response) => {
  appAccessAuth.clearSession(req, res);
  res.json({ ok: true, unlocked: false });
});

router.get('/app/session', (req: Request, res: Response) => {
  res.json(appAccessAuth.getSessionStatus(req));
});

export default router;
