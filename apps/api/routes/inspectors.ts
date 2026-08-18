import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { requireAdmin } from '../lib/user-session';
import {
  createInspector,
  deleteInspector,
  listInspectors,
  updateInspector,
} from '../services/inspectors.service';

const router = Router();

function handleInspectorError(error: unknown, res: Response, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe un inspector con ese nombre' });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Inspector no encontrado' });
      return;
    }
  }
  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: fallback });
}

/** Lista activa para el select de impresión (sin PIN). */
router.get('/inspectors', async (_req: Request, res: Response) => {
  try {
    const rows = await listInspectors({ activeOnly: true });
    res.json(rows.map((r) => ({ id: r.id, name: r.name })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al listar inspectores' });
  }
});

router.get('/admin/inspectors', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await listInspectors();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al listar inspectores' });
  }
});

router.post('/admin/inspectors', requireAdmin, async (req: Request, res: Response) => {
  try {
    const row = await createInspector(req.body?.name);
    res.status(201).json(row);
  } catch (error) {
    handleInspectorError(error, res, 'Error al crear inspector');
  }
});

router.patch('/admin/inspectors/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const row = await updateInspector(id, {
      name: req.body?.name,
      active: req.body?.active,
    });
    res.json(row);
  } catch (error) {
    handleInspectorError(error, res, 'Error al actualizar inspector');
  }
});

router.delete('/admin/inspectors/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    await deleteInspector(id);
    res.json({ ok: true });
  } catch (error) {
    handleInspectorError(error, res, 'Error al eliminar inspector');
  }
});

export default router;
