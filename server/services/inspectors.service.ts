import { prisma } from '../lib/prisma';

export function normalizeInspectorName(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export async function listInspectors(opts?: { activeOnly?: boolean }) {
  return prisma.inspector.findMany({
    where: opts?.activeOnly ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  });
}

export async function createInspector(rawName: unknown) {
  const name = normalizeInspectorName(rawName);
  if (!name) {
    throw new Error('El nombre del inspector es obligatorio');
  }
  return prisma.inspector.create({
    data: { name, active: true },
  });
}

export async function updateInspector(
  id: number,
  patch: { name?: unknown; active?: unknown },
) {
  const data: { name?: string; active?: boolean } = {};
  if (patch.name !== undefined) {
    const name = normalizeInspectorName(patch.name);
    if (!name) throw new Error('El nombre del inspector es obligatorio');
    data.name = name;
  }
  if (patch.active !== undefined) {
    data.active = Boolean(patch.active);
  }
  if (Object.keys(data).length === 0) {
    throw new Error('Nada que actualizar');
  }
  return prisma.inspector.update({ where: { id }, data });
}

export async function deleteInspector(id: number) {
  return prisma.inspector.delete({ where: { id } });
}
