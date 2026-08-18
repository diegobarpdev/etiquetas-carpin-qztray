import { useCallback, useEffect, useState } from 'react';
import {
  apiAdminApproveUser,
  apiAdminListUsers,
  apiAdminRejectUser,
  apiAdminResetUserPassword,
  apiAdminSetUserRole,
  type AdminUserRow,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';

const STATUS_LABEL: Record<AdminUserRow['status'], string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const STATUS_VARIANT: Record<AdminUserRow['status'], 'success' | 'destructive' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

export function UsersAdminPanel({ active }: { active: boolean }) {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [status, setStatus] = useState('');
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setStatus('Cargando usuarios…');
    try {
      const data = await apiAdminListUsers();
      setRows(data.users);
      setStatus(`${data.users.length} usuario(s)`);
    } catch (err: any) {
      setStatus(err.message || 'Error al cargar');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function approve(id: number) {
    try {
      await apiAdminApproveUser(id);
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al aprobar');
    }
  }

  async function reject(id: number) {
    if (!window.confirm('¿Rechazar/quitar acceso a este usuario?')) return;
    try {
      await apiAdminRejectUser(id);
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al rechazar');
    }
  }

  async function toggleRole(row: AdminUserRow) {
    const nextRole = row.role === 'admin' ? 'operario' : 'admin';
    if (!window.confirm(`¿Cambiar a ${row.name} a rol "${nextRole}"?`)) return;
    try {
      await apiAdminSetUserRole(row.id, nextRole);
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al cambiar rol');
    }
  }

  async function submitResetPassword(id: number) {
    if (newPassword.length < 8) {
      setStatus('La clave debe tener al menos 8 caracteres');
      return;
    }
    try {
      await apiAdminResetUserPassword(id, newPassword);
      setResettingId(null);
      setNewPassword('');
      setStatus('Clave restablecida.');
    } catch (err: any) {
      setStatus(err.message || 'Error al restablecer clave');
    }
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const rest = rows.filter((r) => r.status !== 'pending');

  function renderRow(row: AdminUserRow) {
    const isSelf = row.id === currentUser?.id;
    return (
      <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5" key={row.id}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[row.status]} className="rounded-full uppercase tracking-wide">
              {STATUS_LABEL[row.status]}
            </Badge>
            <Badge variant="outline" className="rounded-full uppercase tracking-wide">
              {row.role}
            </Badge>
            <strong className="font-semibold">{row.name}</strong>
            <span className="text-xs text-muted-foreground">{row.email}</span>
            {isSelf ? <span className="text-xs text-muted-foreground">(tú)</span> : null}
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
            {row.status === 'pending' ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => void approve(row.id)}>
                  Aprobar
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => void reject(row.id)}>
                  Rechazar
                </Button>
              </>
            ) : (
              <>
                {!isSelf ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void toggleRole(row)}>
                    {row.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                  </Button>
                ) : null}
                {row.status === 'approved' && !isSelf ? (
                  <Button type="button" variant="destructive" size="sm" onClick={() => void reject(row.id)}>
                    Quitar acceso
                  </Button>
                ) : null}
                {row.status === 'rejected' ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void approve(row.id)}>
                    Re-aprobar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResettingId(resettingId === row.id ? null : row.id);
                    setNewPassword('');
                  }}
                >
                  Resetear clave
                </Button>
              </>
            )}
          </div>
        </div>
        {resettingId === row.id ? (
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
            <PasswordInput
              placeholder="Clave nueva (mín. 8 caracteres)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-8 max-w-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitResetPassword(row.id);
              }}
            />
            <Button type="button" size="sm" onClick={() => void submitResetPassword(row.id)}>
              Guardar clave
            </Button>
          </div>
        ) : null}
        {row.mustChangePassword ? (
          <p className="m-0 mt-1.5 text-xs font-medium text-amber-600">
            Pendiente: todavía no cambió la clave que le resetearon.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[0.95rem] font-semibold">Usuarios</h3>
        <span className="text-xs text-muted-foreground">Auto-registro con aprobación de admin</span>
      </div>
      <p className="m-0 min-h-[1.2em] text-sm font-medium text-muted-foreground" role="status">
        {status}
      </p>

      {pending.length > 0 ? (
        <div className="grid gap-2">
          <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-amber-600">
            Pendientes de aprobar ({pending.length})
          </h4>
          {pending.map(renderRow)}
        </div>
      ) : null}

      <div className="grid gap-2">
        {rest.length === 0 && pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay usuarios todavía.</p>
        ) : (
          rest.map(renderRow)
        )}
      </div>
    </div>
  );
}
