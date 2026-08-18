import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';

/**
 * Crea el primer admin desde env vars al arrancar — sin esto nadie podría
 * aprobar cuentas nuevas nunca (el registro solo deja pending). Solo actúa
 * si el email todavía no existe: no toca ni resetea nada en un restart
 * normal, así no borra una clave que ya se cambió a mano.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  if (!email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  await prisma.user.create({
    data: {
      email,
      name: 'Admin',
      passwordHash: hashPassword(password),
      role: 'admin',
      status: 'approved',
      approvedAt: new Date(),
    },
  });
  console.log(`[bootstrap-admin] Cuenta admin creada: ${email}`);
}
