import { useEffect, useRef, useState } from 'react';
import { Printer, UserRound, X } from 'lucide-react';
import {
  apiAdminAddAgent,
  apiAdminConfig,
  apiAdminDeleteAgent,
  apiAdminLock,
  apiAdminSaveConfig,
  apiAdminUnlock,
} from '../lib/api';
import { useLabelsApp } from '../context/LabelsAppContext';
import type { AdminAgent, AdminStation } from '../types';
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
type PrintersSubTab = 'agents' | 'stations';

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
  const [tab, setTab] = useState<PrintersSubTab>('agents');
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [stations, setStations] = useState<AdminStation[]>([]);
  const [newAgentName, setNewAgentName] = useState('');
  const [newPrinterNameByAgent, setNewPrinterNameByAgent] = useState<Record<string, string>>({});
  const [newStationCode, setNewStationCode] = useState('');
  const [newStationName, setNewStationName] = useState('');
  const [newStationAgent, setNewStationAgent] = useState('');
  const [newStationIps, setNewStationIps] = useState('');
  const openRequestedRef = useRef(false);

  async function loadConfig() {
    setStatus('Cargando…');
    try {
      const data = await apiAdminConfig();
      setAgents(data.agents || []);
      setStations(data.stations || []);
      setStatus(`${(data.agents || []).length} agente(s) · ${(data.stations || []).length} estación(es)`);
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
      await apiAdminSaveConfig(agents, stations);
      await loadConfig();
      setStatus('Guardado.');
      refreshAvailablePrinters();
    } catch (err: any) {
      setStatus(err.message || 'Error al guardar');
    }
  }

  async function addAgent() {
    try {
      setStatus('Agregando agente…');
      await apiAdminAddAgent(newAgentName);
      setNewAgentName('');
      await loadConfig();
    } catch (err: any) {
      setStatus(err.message || 'Error al agregar agente');
    }
  }

  async function deleteAgent(agentId: string) {
    if (!window.confirm(`¿Eliminar el agente ${agentId}?`)) return;
    try {
      await apiAdminDeleteAgent(agentId);
      await loadConfig();
    } catch (err: any) {
      setStatus(err.message || 'Error al eliminar agente');
    }
  }

  function updateAgent(agentId: string, patch: Partial<AdminAgent>) {
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, ...patch } : a)));
  }

  function updatePrinter(agentId: string, windowsName: string, patch: Record<string, unknown>) {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a;
        return {
          ...a,
          printers: a.printers.map((p) =>
            p.windowsName === windowsName ? { ...p, ...patch } : p,
          ),
        };
      }),
    );
  }

  function addPrinter(agentId: string) {
    const windowsName = (newPrinterNameByAgent[agentId] || '').trim();
    if (!windowsName) return;
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a;
        if (a.printers.some((p) => p.windowsName.toLowerCase() === windowsName.toLowerCase())) {
          return a;
        }
        return {
          ...a,
          printers: [...a.printers, { windowsName, label: windowsName, visible: false, stocks: [] }],
        };
      }),
    );
    setNewPrinterNameByAgent((prev) => ({ ...prev, [agentId]: '' }));
  }

  function removePrinter(agentId: string, windowsName: string) {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a;
        return { ...a, printers: a.printers.filter((p) => p.windowsName !== windowsName) };
      }),
    );
  }

  function toggleStock(agentId: string, windowsName: string, code: string, checked: boolean) {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a;
        return {
          ...a,
          printers: a.printers.map((p) => {
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

  function updateStation(id: string, patch: Partial<AdminStation>) {
    setStations((prev) => prev.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  }

  function deleteStation(id: string) {
    if (!window.confirm('¿Eliminar esta estación?')) return;
    setStations((prev) => prev.filter((st) => st.id !== id));
    setStatus('Estación quitada. Guarda para confirmar.');
  }

  function addStation() {
    const code = newStationCode.trim().toUpperCase();
    if (!code) {
      setStatus('Indica un código de estación.');
      return;
    }
    const agentId = newStationAgent.trim();
    if (!agentId) {
      setStatus('Elige el agente de la estación.');
      return;
    }
    const name = newStationName.trim() || code;
    const clientIps = newStationIps
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (stations.some((s) => String(s.code).toUpperCase() === code)) {
      setStatus(`Ya existe la estación ${code}`);
      return;
    }
    setStations((prev) => [
      ...prev,
      { id: `station-${Date.now().toString(36)}`, code, name, agentId, clientIps, printers: [] },
    ]);
    setTab('stations');
    setNewStationCode('');
    setNewStationName('');
    setNewStationIps('');
    setStatus(`Estación ${code} agregada. Marca impresoras y guarda.`);
  }

  function toggleStationPrinter(
    stationId: string,
    agentId: string,
    windowsName: string,
    checked: boolean,
  ) {
    setStations((prev) =>
      prev.map((st) => {
        if (st.id !== stationId) return st;
        const printers = checked
          ? [...st.printers, { agentId, windowsName }]
          : st.printers.filter((p) => p.windowsName !== windowsName);
        return { ...st, printers };
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
  const tabClass =
    'flex-1 rounded-md px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-800';

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
                  : 'Un sitio por estación. Marca Visible y el tipo de etiqueta. El nombre de cada impresora debe ser el que ve QZ Tray en la PC del operario.'}
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
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Impresoras">
                  <button
                    type="button"
                    className={cn(tabClass, tab === 'agents' && 'bg-white text-brand-600 shadow-sm')}
                    role="tab"
                    aria-selected={tab === 'agents'}
                    onClick={() => setTab('agents')}
                  >
                    Agentes
                  </button>
                  <button
                    type="button"
                    className={cn(tabClass, tab === 'stations' && 'bg-white text-brand-600 shadow-sm')}
                    role="tab"
                    aria-selected={tab === 'stations'}
                    onClick={() => setTab('stations')}
                  >
                    Estaciones
                  </button>
                </div>

                <div className="flex flex-col gap-2" hidden={tab !== 'agents'}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="m-0 text-[0.95rem] font-semibold">Agentes</h3>
                    <span className="text-xs text-muted-foreground">
                      Un sitio por estación · Visible + tipos
                    </span>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <Input
                        type="text"
                        placeholder="Nombre del sitio (ej. CARPINTERIA)"
                        value={newAgentName}
                        onChange={(e) => setNewAgentName(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={() => void addAgent()}>
                        Agregar
                      </Button>
                    </div>
                    <p className="m-0 min-h-[1.2em] text-sm font-medium text-muted-foreground" role="status">
                      {status}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {agents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hay sitios. Agrega uno.</p>
                    ) : (
                      agents.map((agent) => (
                        <section className="rounded-xl border border-slate-200 bg-white p-4" key={agent.id}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <strong className="font-semibold">{agent.name}</strong>
                            </div>
                            <div className="flex flex-shrink-0 gap-1.5">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => void deleteAgent(agent.id)}
                              >
                                Eliminar
                              </Button>
                            </div>
                          </div>
                          <div className="mt-3">
                            <label className="block text-xs font-semibold text-slate-600">
                              Nombre
                              <Input
                                type="text"
                                className="mt-1"
                                value={agent.name}
                                onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <div className="mb-1 flex items-baseline justify-between gap-3">
                              <h3 className="m-0 text-sm font-bold">Impresoras</h3>
                              <span className="text-xs text-muted-foreground">
                                Vacío en tipos = aparece para todos
                              </span>
                            </div>
                            <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
                              <Input
                                type="text"
                                placeholder="Nombre que ve QZ Tray en la PC del operario"
                                value={newPrinterNameByAgent[agent.id] || ''}
                                onChange={(e) =>
                                  setNewPrinterNameByAgent((prev) => ({
                                    ...prev,
                                    [agent.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addPrinter(agent.id);
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addPrinter(agent.id)}
                              >
                                Agregar impresora
                              </Button>
                            </div>
                            {agent.printers.length === 0 ? (
                              <p className="p-3 text-xs text-muted-foreground">
                                Sin impresoras. Agrega el nombre exacto que ve QZ Tray.
                              </p>
                            ) : (
                              agent.printers.map((printer) => (
                                <div
                                  key={printer.windowsName}
                                  className={cn(
                                    'mt-2 grid grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.2fr)_auto] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3',
                                    printer.visible && 'border-blue-200 bg-blue-50',
                                  )}
                                >
                                  <div className="grid min-w-0 gap-1">
                                    <Input
                                      type="text"
                                      className="h-8 font-semibold"
                                      value={printer.label || printer.windowsName}
                                      placeholder="Alias para el operario"
                                      title="Nombre que ve el operario"
                                      onChange={(e) =>
                                        updatePrinter(agent.id, printer.windowsName, { label: e.target.value })
                                      }
                                    />
                                    <code
                                      className="block truncate font-mono text-xs text-slate-500"
                                      title="ID Windows / USB"
                                    >
                                      {printer.windowsName}
                                    </code>
                                  </div>
                                  <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-slate-700 select-none">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-brand-600"
                                      checked={printer.visible}
                                      onChange={(e) =>
                                        updatePrinter(agent.id, printer.windowsName, { visible: e.target.checked })
                                      }
                                    />
                                    <span>Visible</span>
                                  </label>
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
                                              toggleStock(agent.id, printer.windowsName, opt.code, e.target.checked)
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
                                    onClick={() => removePrinter(agent.id, printer.windowsName)}
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

                <div className="flex flex-col gap-2" hidden={tab !== 'stations'}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="m-0 text-[0.95rem] font-semibold">Estaciones</h3>
                    <span className="text-xs text-muted-foreground">
                      1 estación = 1 agente · varias IPs de operarios
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <Input
                      type="text"
                      placeholder="Código (EMPAQUE-1)"
                      value={newStationCode}
                      onChange={(e) => setNewStationCode(e.target.value)}
                    />
                    <Input
                      type="text"
                      placeholder="Nombre (Empaque 1)"
                      value={newStationName}
                      onChange={(e) => setNewStationName(e.target.value)}
                    />
                    <select
                      title="Agente de la estación"
                      className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      value={newStationAgent}
                      onChange={(e) => setNewStationAgent(e.target.value)}
                    >
                      <option value=""></option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.id}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" size="sm" onClick={addStation}>
                      Agregar
                    </Button>
                    <Input
                      type="text"
                      className="col-span-full"
                      placeholder="IPs: 192.168.80.50, 192.168.80.51"
                      value={newStationIps}
                      onChange={(e) => setNewStationIps(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3">
                    {stations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sin estaciones: todas las PCs ven todas las impresoras Visible. Crea una (elige agente +
                        IPs) para filtrar.
                      </p>
                    ) : (
                      stations.map((st) => {
                        const agent = agents.find((a) => a.id === st.agentId);
                        const assigned = new Set(st.printers.map((p) => p.windowsName.toLowerCase()));
                        const assignable = agent ? agent.printers.filter((p) => p.visible) : [];
                        return (
                          <section
                            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                            key={st.id}
                          >
                            <div className="flex flex-col gap-2.5">
                              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
                                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                  Código
                                  <Input
                                    type="text"
                                    value={st.code}
                                    placeholder="EMPAQUE-1"
                                    autoComplete="off"
                                    onChange={(e) => updateStation(st.id, { code: e.target.value })}
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                  Nombre
                                  <Input
                                    type="text"
                                    value={st.name}
                                    placeholder="Empaque 1"
                                    autoComplete="off"
                                    onChange={(e) => updateStation(st.id, { name: e.target.value })}
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                  Agente
                                  <select
                                    className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    value={st.agentId}
                                    onChange={(e) =>
                                      updateStation(st.id, {
                                        agentId: e.target.value,
                                        printers: st.printers.filter((p) => p.agentId === e.target.value),
                                      })
                                    }
                                  >
                                    <option value="">— Elegir agente —</option>
                                    {agents.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.name || a.id}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="col-span-full flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                  IPs de las PCs operario
                                  <Input
                                    type="text"
                                    value={st.clientIps.join(', ')}
                                    placeholder="192.168.80.50, 192.168.80.51"
                                    autoComplete="off"
                                    onChange={(e) =>
                                      updateStation(st.id, {
                                        clientIps: e.target.value
                                          .split(/[,;\s]+/)
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      })
                                    }
                                  />
                                </label>
                              </div>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="self-end"
                                onClick={() => deleteStation(st.id)}
                              >
                                Eliminar estación
                              </Button>
                            </div>
                            <div className="border-t border-slate-100 pt-3">
                              <h4 className="mb-2 text-sm font-semibold">
                                Impresoras de esta estación{agent ? ` · ${agent.name}` : ''}
                              </h4>
                              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                                {!st.agentId ? (
                                  <p className="text-xs text-muted-foreground">
                                    Elige un agente para ver sus impresoras Visible.
                                  </p>
                                ) : assignable.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Este agente no tiene impresoras Visible. Márcalas en Agentes.
                                  </p>
                                ) : (
                                  assignable.map((p) => {
                                    const on = assigned.has(p.windowsName.toLowerCase());
                                    return (
                                      <label
                                        key={p.windowsName}
                                        className={cn(
                                          'flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm',
                                          on && 'border-blue-200 bg-blue-50',
                                        )}
                                      >
                                        <input
                                          type="checkbox"
                                          className="mt-0.5 h-4 w-4 accent-brand-600"
                                          checked={on}
                                          onChange={(e) =>
                                            toggleStationPrinter(st.id, st.agentId, p.windowsName, e.target.checked)
                                          }
                                        />
                                        <span className="min-w-0">
                                          <strong className="block truncate font-semibold">
                                            {p.label || p.windowsName}
                                          </strong>
                                          <small className="mt-0.5 block truncate text-xs text-muted-foreground">
                                            {p.windowsName}
                                          </small>
                                        </span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </section>
                        );
                      })
                    )}
                  </div>
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
