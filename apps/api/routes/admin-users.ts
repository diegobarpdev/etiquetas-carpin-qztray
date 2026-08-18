import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { requireAdmin } from '../lib/user-session';

const router = Router();

function wrap(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, _next: NextFunction) => {
    handler(req, res).catch((error: any) => {
      if (error?.code === 'P2025') {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }
      console.error('[admin-users]', error);
      res.status(500).json({ error: 'Error interno' });
    });
  };
}

function publicUser(user: {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
  };
}

router.get(
  '/admin/users',
  requireAdmin,
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ users: users.map(publicUser) });
  }),
);

router.post(
  '/admin/users/:id/approve',
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const user = await prisma.user.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date() },
    });
    res.json({ ok: true, user: publicUser(user) });
  }),
);

router.post(
  '/admin/users/:id/reject',
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    await requireNotLastAdmin(id, res, async () => {
      const user = await prisma.user.update({ where: { id }, data: { status: 'rejected' } });
      res.json({ ok: true, user: publicUser(user) });
    });
  }),
);

router.post(
  '/admin/users/:id/role',
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    const role = req.body?.role === 'admin' ? 'admin' : req.body?.role === 'operario' ? 'operario' : null;
    if (isNaN(id) || !role) {
      res.status(400).json({ error: 'ID o rol inválido' });
      return;
    }
    await requireNotLastAdmin(id, res, async () => {
      const user = await prisma.user.update({ where: { id }, data: { role } });
      res.json({ ok: true, user: publicUser(user) });
    });
  }),
);

router.post(
  '/admin/users/:id/reset-password',
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    const newPassword = String(req.body?.newPassword || '');
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'La clave debe tener al menos 8 caracteres' });
      return;
    }
    const user = await prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(newPassword) },
    });
    res.json({ ok: true, user: publicUser(user) });
  }),
);

/**
 * Bloquea degradar/rechazar al último admin aprobado — sin esto un admin
 * podría dejar la app sin ningún admin y nadie más podría gestionar
 * usuarios (el bootstrap solo corre si la tabla está vacía).
 */
async function requireNotLastAdmin(
  targetUserId: number,
  res: Response,
  action: () => Promise<void>,
): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  if (target.role === 'admin' && target.status === 'approved') {
    const otherAdmins = await prisma.user.count({
      where: { role: 'admin', status: 'approved', id: { not: targetUserId } },
    });
    if (otherAdmins === 0) {
      res.status(400).json({ error: 'No se puede — es el único admin activo' });
      return;
    }
  }
  await action();
}

export default router;
