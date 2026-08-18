import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { createUserSession, clearUserSession, requireLogin } from '../lib/user-session';
import { createRateLimiter } from '../lib/rate-limit';

const router = Router();

const loginRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: 'Demasiados intentos de acceso. Probá de nuevo en un momento.',
});
const registerRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: 'Demasiados intentos de registro. Probá de nuevo en un momento.',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user: { id: number; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

router.post('/auth/register', registerRateLimit, async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Falta el nombre' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'La clave debe tener al menos 8 caracteres' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
      return;
    }

    await prisma.user.create({
      data: { email, name, passwordHash: hashPassword(password), role: 'operario', status: 'pending' },
    });

    res.json({ ok: true, status: 'pending' });
  } catch (error: any) {
    // P2002 = choque de unique (email) por dos registros simultáneos con
    // el mismo email — mismo mensaje que el chequeo de arriba.
    if (error?.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
      return;
    }
    console.error('[auth/register]', error);
    res.status(500).json({ error: 'Error registrando la cuenta' });
  }
});

router.post('/auth/login', loginRateLimit, async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Email o clave incorrectos' });
      return;
    }
    if (!verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Email o clave incorrectos' });
      return;
    }
    if (user.status === 'pending') {
      res.status(403).json({ error: 'Tu cuenta todavía no fue aprobada por un admin' });
      return;
    }
    if (user.status === 'rejected') {
      res.status(403).json({ error: 'Tu cuenta no tiene acceso' });
      return;
    }

    createUserSession(req, res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    console.error('[auth/login]', error);
    res.status(500).json({ error: 'Error iniciando sesión' });
  }
});

router.post('/auth/logout', (_req: Request, res: Response) => {
  clearUserSession(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireLogin, (req: Request, res: Response) => {
  res.json({ user: publicUser(req.user!) });
});

export default router;
