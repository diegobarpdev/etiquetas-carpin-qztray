import { useLabelsApp } from '../context/LabelsAppContext';
import { encodePrinterValue } from '../lib/printer-settings';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function LocalPrinterPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { availablePrinters, localVisibleKeys, toggleLocalPrinterVisible } = useLabelsApp();

  const byStation = new Map<string, typeof availablePrinters>();
  for (const p of availablePrinters) {
    const list = byStation.get(p.stationName) || [];
    list.push(p);
    byStation.set(p.stationName, list);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Impresoras de esta PC</DialogTitle>
          <DialogDescription>
            Marca cuáles impresoras del catálogo son las de esta computadora. Se guarda solo en
            este navegador, no afecta a las demás PCs.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {availablePrinters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay impresoras en el catálogo todavía. Pedile al admin que agregue una en
              Configuración → Impresoras.
            </p>
          ) : (
            [...byStation.entries()].map(([stationName, printers]) => (
              <div key={stationName}>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {stationName}
                </h4>
                <div className="space-y-1">
                  {printers.map((p) => {
                    const key = encodePrinterValue(p.stationId, p.windowsName);
                    const checked = localVisibleKeys.has(key);
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 flex-shrink-0 accent-brand-600"
                          checked={checked}
                          onChange={(e) =>
                            toggleLocalPrinterVisible(p.stationId, p.windowsName, e.target.checked)
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate">{p.label}</strong>
                          <code className="block truncate text-xs text-muted-foreground">
                            {p.windowsName}
                          </code>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
