import { useCallback, useEffect, useState } from 'react';
import {
  apiAdminCreateInspector,
  apiAdminDeleteInspector,
  apiAdminListInspectors,
  apiAdminUpdateInspector,
  type AdminInspector,
} from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function InspectorsAdminPanel({ active }: { active: boolean }) {
  const [rows, setRows] = useState<AdminInspector[]>([]);
  const [status, setStatus] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    setStatus('Cargando inspectores…');
    try {
      const data = await apiAdminListInspectors();
      setRows(data);
      setStatus(`${data.length} inspector(es)`);
    } catch (err: any) {
      setStatus(err.message || 'Error al cargar');
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function addInspector() {
    try {
      setStatus('Creando…');
      await apiAdminCreateInspector(newName);
      setNewName('');
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al crear');
    }
  }

  async function saveEdit(id: number) {
    try {
      setStatus('Guardando…');
      await apiAdminUpdateInspector(id, { name: editingName });
      setEditingId(null);
      setEditingName('');
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al guardar');
    }
  }

  async function toggleActive(row: AdminInspector) {
    try {
      await apiAdminUpdateInspector(row.id, { active: !row.active });
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al actualizar');
    }
  }

  async function remove(id: number) {
    if (!window.confirm('¿Eliminar este inspector de la lista local?')) return;
    try {
      await apiAdminDeleteInspector(id);
      await load();
    } catch (err: any) {
      setStatus(err.message || 'Error al eliminar');
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[0.95rem] font-semibold">Inspectores locales</h3>
        <span className="text-xs text-muted-foreground">MAYÚSCULAS · no reemplazan Odoo</span>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
        <Input
          type="text"
          placeholder="NOMBRE APELLIDO"
          value={newName}
          onChange={(e) => setNewName(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addInspector();
          }}
          className="h-8 flex-1 text-sm"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void addInspector()}
          disabled={!newName.trim()}
          className="flex-shrink-0"
        >
          Agregar
        </Button>
      </div>
      <p className="m-0 min-h-[1.2em] text-sm font-medium text-muted-foreground" role="status">
        {status}
      </p>

      <div className="grid gap-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay inspectores locales. Agrega nombres para el select de impresión.
          </p>
        ) : (
          rows.map((row) => (
            <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5" key={row.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge
                    variant={row.active ? 'success' : 'destructive'}
                    className="rounded-full uppercase tracking-wide"
                  >
                    {row.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {editingId === row.id ? (
                    <Input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value.toUpperCase())}
                      className="h-8 max-w-md"
                      autoFocus
                    />
                  ) : (
                    <strong className="font-semibold">{row.name}</strong>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-1.5">
                  {editingId === row.id ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => void saveEdit(row.id)}>
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditingName(row.name);
                        }}
                      >
                        Editar
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void toggleActive(row)}>
                        {row.active ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void remove(row.id)}
                      >
                        Eliminar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
