import { useState } from 'react';
import { Copy, Printer, Settings2 } from 'lucide-react';
import { useLabelsApp } from '../context/LabelsAppContext';
import { LocalPrinterPicker } from './LocalPrinterPicker';
import { templateUsesInspector } from '../lib/format';
import { getBatchLabelTotal } from '../lib/order-selection';
import { getPrintMediaChecklist } from '../lib/print-media-hint';
import { isPapelTarget } from '../lib/printer-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function PrintSidebar() {
  const {
    printSidebarOpen,
    closePrintSidebar,
    printBatch,
    totalLabelCount,
    lastOrderData,
    visiblePrinters,
    selectedPrinterValue,
    onPrinterSelectChange,
    printerCopies,
    onPrinterCopiesChange,
    onPrinterCopiesCommit,
    printerThermalMethod,
    onPrinterThermalMethodChange,
    stockSize,
    printerSaveStatus,
    handlePrintLabels,
    actionButtonsDisabled,
    selectedTemplate,
    selectedInspectorName,
  } = useLabelsApp();

  const summaryText =
    printBatch.length > 0
      ? `Lote · ${printBatch.length} orden(es) · ${getBatchLabelTotal(printBatch)} etiqueta(s)`
      : `${lastOrderData?.order?.name || 'Orden'} · ${totalLabelCount} etiqueta(s)`;

  const mediaChecklist = getPrintMediaChecklist(selectedTemplate);
  const inspectorRequired = templateUsesInspector(
    selectedTemplate || lastOrderData?.preview?.templateCode,
  );
  const batchMissingInspector =
    inspectorRequired &&
    printBatch.length > 0 &&
    printBatch.some((job) => !String(job.inspectorName || '').trim());
  const inspectorMissing =
    inspectorRequired &&
    (printBatch.length > 0
      ? batchMissingInspector
      : !selectedInspectorName);
  const showInspector =
    inspectorRequired &&
    (printBatch.length > 0
      ? printBatch.every((job) => Boolean(job.inspectorName))
      : Boolean(selectedInspectorName));

  const inspectorSummary =
    printBatch.length > 0
      ? `${printBatch.filter((j) => j.inspectorName).length}/${printBatch.length} órdenes con inspector`
      : selectedInspectorName;

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Sheet open={printSidebarOpen} onOpenChange={(open) => !open && closePrintSidebar()}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-[min(100vw,26rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 space-y-1 border-b border-border py-4 pl-5 pr-12 text-left">
          <SheetTitle className="pr-2 text-base leading-snug">Imprimir etiquetas</SheetTitle>
          <SheetDescription className="break-words text-ui-sm leading-snug">
            {summaryText}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="inline-flex items-center gap-1.5">
                  <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Impresora
                </Label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-ui-xs font-medium text-brand-600 hover:underline"
                  onClick={() => setPickerOpen(true)}
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Elegir mis impresoras
                </button>
              </div>
              <Select
                value={selectedPrinterValue || undefined}
                onValueChange={(value) => onPrinterSelectChange(value === '__none__' ? '' : value)}
              >
                <SelectTrigger className="w-full" aria-label="Impresora">
                  <SelectValue placeholder="Elegir impresora…" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="__none__">Elegir impresora…</SelectItem>
                  {visiblePrinters.map((p) => {
                    const value = `${p.stationId}::${p.windowsName}`;
                    const label = p.label || p.windowsName;
                    return (
                      <SelectItem key={value} value={value} className="whitespace-normal">
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {visiblePrinters.length === 0 ? (
                <p className="text-ui-xs text-muted-foreground">
                  No elegiste impresoras para esta PC. Tocá "Elegir mis impresoras".
                </p>
              ) : null}
            </div>
            <LocalPrinterPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />

            {inspectorMissing ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-ui-xs text-red-700">
                {printBatch.length > 0
                  ? 'Falta elegir inspector en una o más órdenes del lote.'
                  : 'Elige un inspector en la orden antes de imprimir.'}
              </p>
            ) : null}

            {showInspector ? (
              <p className="text-ui-xs text-muted-foreground">
                Inspector: {inspectorSummary}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="printer-copies" className="inline-flex items-center gap-1.5">
                <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                Copias
              </Label>
              <Input
                type="number"
                id="printer-copies"
                className="w-full"
                min={1}
                max={99}
                value={printerCopies}
                onChange={(e) => onPrinterCopiesChange(Number(e.target.value) || 1)}
                onBlur={onPrinterCopiesCommit}
              />
            </div>

            {isPapelTarget({ stockSize, windowsName: selectedPrinterValue?.split('::')[1], templateCode: selectedTemplate }) ? (
              <div className="space-y-2">
                <Label className="inline-flex items-center gap-1.5">
                  Método de Impresión (Tela)
                </Label>
                <Select
                  value={printerThermalMethod || 'transfer'}
                  onValueChange={(val) => onPrinterThermalMethodChange(val as 'transfer' | 'direct')}
                >
                  <SelectTrigger className="w-full" aria-label="Método de Impresión">
                    <SelectValue placeholder="Seleccionar método…" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                    <SelectItem value="transfer">Transferencia térmica</SelectItem>
                    <SelectItem value="direct">Térmica directa</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-ui-xs text-muted-foreground">
                  {printerThermalMethod === 'direct'
                    ? 'Térmica directa: Imprime por calor sin verificar cinta (^MTD).'
                    : 'Transferencia térmica: Requiere cinta/ribbon instalado (^MTT).'}
                </p>
              </div>
            ) : null}

            {mediaChecklist ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-ui-sm text-amber-950">
                <p className="font-medium">Revisar que en la impresora esté con:</p>
                <p className="mt-1 leading-snug">{mediaChecklist}</p>
              </div>
            ) : selectedTemplate ? null : (
              <p className="text-ui-xs text-muted-foreground">
                Elige una plantilla para ver qué material cargar.
              </p>
            )}

            {printerSaveStatus ? (
              <p className="break-words text-ui-sm text-muted-foreground" role="status">
                {printerSaveStatus}
              </p>
            ) : null}
          </div>
        </div>

        <SheetFooter className="shrink-0 gap-2 border-t border-border px-5 py-4 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full bg-brand-600 text-white hover:bg-brand-700 hover:text-white"
            disabled={actionButtonsDisabled || inspectorMissing}
            onClick={handlePrintLabels}
          >
            <Printer aria-hidden="true" />
            Imprimir
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={closePrintSidebar}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
