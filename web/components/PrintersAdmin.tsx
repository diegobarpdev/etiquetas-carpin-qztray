import { useEffect, useRef, useState } from 'react';
import { Printer, UserRound, X } from 'lucide-react';
import {
  apiAdminAddStation,
  apiAdminConfig,
  apiAdminDeleteStation,
  apiAdminLock,
  apiAdminSaveConfig,
  apiAdminUnlock,
} from '../lib/api';
import { useLabelsApp } from '../context/LabelsAppContext';
import { listPrinters } from '../lib/qz-client';
import { toast } from '../lib/toast';
import type { AdminStation } from '../types';
import { InspectorsAdminPanel } from './InspectorsAdminPanel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const STOCK_OPTIONS = [
  { code: 'producto-terminado', label: 'Terminado' },
  { code: 'producto-conforme', label: 'Conforme' },
  { code: 'conforme-papel', label: 'Tela' },
  { code: 'carpinteria', label: 'Carpenter' },
];

type MainTab = 'inspectors' | 'printers';

export function PrintersAdmin({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { refreshAvailablePrinters } = useLabelsApp();

  const [pinMode, setPinMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [status, setStatus] = useState('');
  const [mainTab, setMainTab] = useState<MainTab>('inspectors');
  const [stations, setStations] = useState<AdminStation[]>([]);
  const [newStationCode, setNewStationCode] = useState('');
  const [newStationName, setNewStationName] = useState('');
  const [newPrinterNameByStation, setNewPrinterNameByStation] = useState<Record<string, string>>(
    {},
  );
  const [detectedByStation, setDetectedByStation] = useState<Record<string, string[]>>({});
  const [detectingStation, setDetectingStation] = useState<string | null>(null);
  const openRequestedRef = useRef(false);

  async function loadConfig() {
    setStatus('Cargando…');
    try {
      const data = await apiAdminConfig();
      setStations(data.stations || []);
      setStatus(`${(data.stations || []).length} estación(es)`);
    } catch (err: any) {
      setStatus(err.message || 'Error al cargar');
    }
  }

  async function openFlow() {
    setPinError('');
    setPin('');
    // Siempre pedir clave: no reutilizar sesión previa del navegador.
    try {
      await apiAdminLock();
    } catch {
      /* si no había sesión, igual pedimos PIN */
    }
    setPinMode(true);
  }

  // Abrir automáticamente cuando `open` pasa a true.
  useEffect(() => {
    if (open) {
      if (!openRequestedRef.current) {
        openRequestedRef.current = true;
        void openFlow();
      }
    } else {
      openRequestedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open && !pinMode && !panelOpen) return null;

  async function submitPin() {
    setPinError('');
    try {
      await apiAdminUnlock(pin);
      setPin('');
      setPinMode(false);
      setPanelOpen(true);
      await loadConfig();
    } catch (err: any) {
      setPinError(err.message || 'Clave incorrecta');
    }
  }

  function closeAll() {
    setPin('');
    setPinError('');
    setPinMode(false);
    setPanelOpen(false);
    // Bloquear sesión en servidor (borra cookie HttpOnly). No esperar respuesta.
    void apiAdminLock().catch(() => undefined);
    onClose();
  }

  async function saveConfig() {
    try {
      setStatus('Guardando…');
      await apiAdminSaveConfig(stations);
      await loadConfig();
      setStatus('Guardado.');
      toast.success('Cambios de impresoras guardados.');
      refreshAvailablePrinters();
    } catch (err: any) {
      const message = err.message || 'Error al guardar';
      setStatus(message);
      toast.error(message);
    }
  }

  async function addStation() {
    const code = newStationCode.trim().toUpperCase();
    const name = newStationName.trim() || code;
    if (!code) {
      setStatus('Indica un código de estación.');
      toast.error('Indica un código de estación.');
      return;
    }
    if (stations.some((s) => String(s.code).toUpperCase() === code)) {
      const message = `Ya existe la estación ${code}`;
      setStatus(message);
      toast.error(message);
      return;
    }
    try {
      setStatus('Agregando estación…');
      await apiAdminAddStation(name, code);
      setNewStationCode('');
      setNewStationName('');
      await loadConfig();
      toast.success(`Estación ${code} agregada.`);
    } catch (err: any) {
      const message = err.message || 'Error al agregar estación';
      setStatus(message);
      toast.error(message);
    }
  }

  async function deleteStation(stationId: string) {
    if (!window.confirm('¿Eliminar esta estación?')) return;
    try {
      await apiAdminDeleteStation(stationId);
      await loadConfig();
      toast.success('Estación eliminada.');
    } catch (err: any) {
      const message = err.message || 'Error al eliminar estación';
      setStatus(message);
      toast.error(message);
    }
  }

  function updateStation(id: string, patch: Partial<AdminStation>) {
    setStations((prev) => prev.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  }

  async function detectPrinters(stationId: string) {
    setDetectingStation(stationId);
    try {
      const names = await listPrinters();
      setDetectedByStation((prev) => ({ ...prev, [stationId]: names }));
      if (names.length) {
        setNewPrinterNameByStation((prev) => ({ ...prev, [stationId]: names[0] }));
        setStatus(`${names.length} impresora(s) detectada(s) en esta PC.`);
      } else {
        setStatus('QZ Tray no ve ninguna impresora en esta PC.');
      }
    } catch (err: any) {
      setStatus(err.message || 'No se pudo conectar a QZ Tray en esta PC.');
    } finally {
      setDetectingStation(null);
    }
  }

  function addPrinter(stationId: string) {
    const windowsName = (newPrinterNameByStation[stationId] || '').trim();
    if (!windowsName) return;
    setStations((prev) =>
      prev.map((st) => {
        if (st.id !== stationId) return st;
        if (st.printers.some((p) => p.windowsName.toLowerCase() === windowsName.toLowerCase())) {
          return st;
        }
        return {
          ...st,
          printers: [...st.printers, { windowsName, label: windowsName, stocks: [] }],
        };
      }),
    );
    setNewPrinterNameByStation((prev) => ({ ...prev, [stationId]: '' }));
  }

  function removePrinter(stationId: string, windowsName: string) {
    setStations((prev) =>
      prev.map((st) => {
        if (st.id !== stationId) return st;
        return { ...st, printers: st.printers.filter((p) => p.windowsName !== windowsName) };
      }),
    );
  }

  function updatePrinter(stationId: string, windowsName: string, patch: Record<string, unknown>) {
    setStations((prev) =>
      prev.map((st) => {
        if (st.id !== stationId) return st;
        return {
          ...st,
          printers: st.printers.map((p) =>
            p.windowsName === windowsName ? { ...p, ...patch } : p,
          ),
        };
      }),
    );
  }

  function toggleStock(stationId: string, windowsName: string, code: string, checked: boolean) {
    setStations((prev) =>
      prev.map((st) => {
        if (st.id !== stationId) return st;
        return {
          ...st,
          printers: st.printers.map((p) => {
            if (p.windowsName !== windowsName) return p;
            const stocks = checked
              ? [...new Set([...(p.stocks || []), code])]
              : (p.stocks || []).filter((s) => s !== code);
            return { ...p, stocks };
          }),
        };
      }),
    );
  }

  if (pinMode) {
    return (
      <Dialog open onOpenChange={(next) => !next && closeAll()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración</DialogTitle>
            <DialogDescription>Ingresa la clave de administración.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="printers-admin-pin">Clave</Label>
            <Input
              type="password"
              id="printers-admin-pin"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitPin();
              }}
            />
            {pinError ? (
              <p className="text-sm text-destructive" role="alert">
                {pinError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeAll}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitPin()}>
              Entrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!panelOpen) return null;

  const navItemClass =
    'flex min-h-[4.4rem] w-full flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-semibold text-slate-400 transition-colors [&_svg]:h-5 [&_svg]:w-5 [&_svg]:flex-shrink-0';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-start bg-slate-900/40"
      aria-hidden="false"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAll();
      }}
    >
      <div
        className="flex h-full w-full max-w-[920px] flex-row overflow-hidden bg-white shadow-2xl animate-in slide-in-from-left duration-200"
        role="dialog"
        aria-labelledby="printers-admin-title"
      >
        <nav
          className="flex w-36 flex-shrink-0 flex-col gap-1 border-r border-slate-800 bg-slate-900 p-3 text-slate-200"
          aria-label="Secciones de configuración"
        >
          <p className="mx-1 mb-3 text-[0.72rem] font-bold uppercase tracking-wider text-slate-400">
            Ajustes
          </p>
          <button
            type="button"
            className={cn(
              navItemClass,
              mainTab === 'inspectors'
                ? 'bg-blue-500/20 text-white shadow-[inset_3px_0_0_0_#60a5fa]'
                : 'hover:bg-slate-400/10 hover:text-slate-50',
            )}
            role="tab"
            aria-selected={mainTab === 'inspectors'}
            onClick={() => setMainTab('inspectors')}
          >
            <UserRound aria-hidden="true" />
            Inspectores
          </button>
          <button
            type="button"
            className={cn(
              navItemClass,
              mainTab === 'printers'
                ? 'bg-blue-500/20 text-white shadow-[inset_3px_0_0_0_#60a5fa]'
                : 'hover:bg-slate-400/10 hover:text-slate-50',
            )}
            role="tab"
            aria-selected={mainTab === 'printers'}
            onClick={() => {
              setMainTab('printers');
              void loadConfig();
            }}
          >
            <Printer aria-hidden="true" />
            Impresoras
          </button>
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden bg-white p-4">
          <div className="flex flex-shrink-0 items-start justify-between gap-4">
            <div>
              <h2 id="printers-admin-title" className="m-0 mb-0.5 text-lg font-semibold tracking-tight">
                {mainTab === 'inspectors' ? 'Inspectores' : 'Impresoras'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {mainTab === 'inspectors'
                  ? 'Lista local para elegir al imprimir (no reemplaza Odoo).'
                  : 'Cada estación agrupa impresoras (catálogo compartido). Cuál usa cada PC lo elige el operario en su propio navegador, con el botón "Elegir mis impresoras".'}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-[2.15rem] w-[2.15rem] border-slate-200 text-brand-600 hover:border-blue-300 hover:bg-blue-50"
                title="Actualizar"
                aria-label="Actualizar"
                onClick={() => {
                  if (mainTab === 'printers') void loadConfig();
                }}
              >
                ↻
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-[2.15rem] w-[2.15rem] border-slate-200 text-brand-600 hover:border-blue-300 hover:bg-blue-50"
                title="Salir"
                aria-label="Salir"
                onClick={() => {
                  closeAll();
                }}
              >
                ↩
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-[2.15rem] w-[2.15rem] border-slate-200 text-brand-600 hover:border-blue-300 hover:bg-blue-50"
                title="Cerrar"
                aria-label="Cerrar"
                onClick={closeAll}
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
            {mainTab === 'inspectors' ? (
              <InspectorsAdminPanel active={mainTab === 'inspectors' && panelOpen} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="m-0 text-[0.95rem] font-semibold">Estaciones</h3>
                  <span className="text-xs text-muted-foreground">
                    Catálogo compartido — cada PC elige las suyas
                  </span>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <Input
                      type="text"
                      placeholder="Código (CALIDAD-01)"
                      value={newStationCode}
                      onChange={(e) => setNewStationCode(e.target.value)}
                    />
                    <Input
                      type="text"
                      placeholder="Nombre (Calidad)"
                      value={newStationName}
                      onChange={(e) => setNewStationName(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={() => void addStation()}>
                      Agregar estación
                    </Button>
                  </div>
                  <p className="m-0 min-h-[1.2em] text-sm font-medium text-muted-foreground" role="status">
                    {status}
                  </p>
                </div>
                <div className="grid gap-3">
                  {stations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No hay estaciones. Agrega una arriba.
                    </p>
                  ) : (
                    stations.map((st) => (
                      <section
                        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                        key={st.id}
                      >
                        <div className="flex flex-col gap-2.5">
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                              Código
                              <Input
                                type="text"
                                value={st.code}
                                placeholder="CALIDAD-01"
                                autoComplete="off"
                                onChange={(e) => updateStation(st.id, { code: e.target.value })}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                              Nombre
                              <Input
                                type="text"
                                value={st.name}
                                placeholder="Calidad"
                                autoComplete="off"
                                onChange={(e) => updateStation(st.id, { name: e.target.value })}
                              />
                            </label>
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="self-end"
                            onClick={() => void deleteStation(st.id)}
                          >
                            Eliminar estación
                          </Button>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <div className="mb-1 flex items-baseline justify-between gap-3">
                            <h4 className="m-0 text-sm font-bold">Impresoras</h4>
                            <span className="text-xs text-muted-foreground">
                              Vacío en tipos = aparece para todos
                            </span>
                          </div>
                          <div className="mb-2 flex flex-col gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={detectingStation === st.id}
                              onClick={() => void detectPrinters(st.id)}
                            >
                              {detectingStation === st.id
                                ? 'Detectando…'
                                : 'Detectar impresoras (QZ Tray en esta PC)'}
                            </Button>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              {detectedByStation[st.id]?.length ? (
                                <select
                                  className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                  value={newPrinterNameByStation[st.id] || ''}
                                  onChange={(e) =>
                                    setNewPrinterNameByStation((prev) => ({
                                      ...prev,
                                      [st.id]: e.target.value,
                                    }))
                                  }
                                >
                                  {detectedByStation[st.id].map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Input
                                  type="text"
                                  placeholder="O escribe el nombre a mano (PC remota)"
                                  value={newPrinterNameByStation[st.id] || ''}
                                  onChange={(e) =>
                                    setNewPrinterNameByStation((prev) => ({
                                      ...prev,
                                      [st.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addPrinter(st.id);
                                  }}
                                />
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addPrinter(st.id)}
                              >
                                Agregar impresora
                              </Button>
                            </div>
                          </div>
                          {st.printers.length === 0 ? (
                            <p className="p-3 text-xs text-muted-foreground">
                              Sin impresoras. Agrega el nombre exacto que ve QZ Tray.
                            </p>
                          ) : (
                            st.printers.map((printer) => (
                              <div
                                key={printer.windowsName}
                                className="mt-2 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
                              >
                                <div className="grid min-w-0 gap-1">
                                  <Input
                                    type="text"
                                    className="h-8 font-semibold"
                                    value={printer.label || printer.windowsName}
                                    placeholder="Alias para el operario"
                                    title="Nombre que ve el operario"
                                    onChange={(e) =>
                                      updatePrinter(st.id, printer.windowsName, { label: e.target.value })
                                    }
                                  />
                                  <code
                                    className="block truncate font-mono text-xs text-slate-500"
                                    title="Nombre en QZ Tray"
                                  >
                                    {printer.windowsName}
                                  </code>
                                </div>
                                <div className="flex flex-wrap justify-end gap-1.5" title="Vacío = todos los tipos">
                                  {STOCK_OPTIONS.map((opt) => {
                                    const isChecked = Array.isArray(printer.stocks)
                                      ? printer.stocks.includes(opt.code)
                                      : false;
                                    return (
                                      <label
                                        key={opt.code}
                                        className={cn(
                                          'inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600',
                                          isChecked && 'border-blue-300 bg-blue-100 text-blue-800',
                                        )}
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3 w-3 accent-brand-600"
                                          checked={isChecked}
                                          onChange={(e) =>
                                            toggleStock(st.id, printer.windowsName, opt.code, e.target.checked)
                                          }
                                        />
                                        {opt.label}
                                      </label>
                                    );
                                  })}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title="Quitar impresora"
                                  aria-label="Quitar impresora"
                                  onClick={() => removePrinter(st.id, printer.windowsName)}
                                >
                                  <X size={14} strokeWidth={2} aria-hidden="true" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {mainTab === 'printers' ? (
            <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 pt-2">
              <Button type="button" size="sm" onClick={() => void saveConfig()}>
                Guardar cambios
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
