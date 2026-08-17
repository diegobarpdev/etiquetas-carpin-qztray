import { useLabelsApp } from '../context/LabelsAppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EanPanel() {
  const {
    manualEan,
    setManualEan,
    manualQty,
    setManualQty,
    manualLotPrefix,
    setManualLotPrefix,
    manualLotNumber,
    setManualLotNumber,
    manualOrderNamePreview,
    manualProductName,
    lookupManualProduct,
    generateManualOrder,
  } = useLabelsApp();

  return (
    <section className="flex h-full min-h-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-panel">
      <Label className="shrink-0 text-[0.875rem] font-medium text-foreground">
        Imprimir por código EAN
      </Label>

      <div className="grid shrink-0 grid-cols-3 gap-2">
        <div className="col-span-2 min-w-0">
          <Label htmlFor="ean-input" className="mb-1 block text-[0.72rem] font-semibold text-slate-600">
            Código EAN
          </Label>
          <Input
            id="ean-input"
            className="h-8 text-[0.875rem]"
            placeholder="7891234567890"
            autoComplete="off"
            value={manualEan}
            onChange={(e) => setManualEan(e.target.value)}
            onBlur={() => lookupManualProduct()}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              lookupManualProduct();
            }}
          />
        </div>
        <div className="col-span-1 min-w-0">
          <Label htmlFor="ean-qty" className="mb-1 block text-[0.72rem] font-semibold text-slate-600">
            Cantidad
          </Label>
          <Input
            id="ean-qty"
            type="number"
            min={1}
            inputMode="numeric"
            className="h-8 text-[0.875rem]"
            placeholder="150"
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value)}
          />
        </div>
      </div>

      {manualProductName ? (
        <p className="-mt-1 shrink-0 truncate text-[0.72rem] text-emerald-700" title={manualProductName}>
          ✓ {manualProductName}
        </p>
      ) : null}

      <div className="shrink-0">
        <Label className="mb-1 block text-[0.72rem] font-semibold text-slate-600">Lote / OP</Label>
        <div className="flex items-center gap-1.5">
          <Input
            className="h-8 min-w-0 flex-1 font-mono text-[0.85rem]"
            placeholder="PLCOL"
            aria-label="Prefijo del lote"
            value={manualLotPrefix}
            onChange={(e) => setManualLotPrefix(e.target.value.toUpperCase())}
          />
          <span className="shrink-0 text-[0.78rem] font-semibold text-muted-foreground">/OPR/</span>
          <Input
            className="h-8 min-w-0 flex-1 font-mono text-[0.85rem]"
            placeholder="00450"
            aria-label="Número del lote"
            value={manualLotNumber}
            onChange={(e) => setManualLotNumber(e.target.value)}
          />
        </div>
        {manualOrderNamePreview ? (
          <p className="mt-1 truncate font-mono text-[0.72rem] text-muted-foreground">
            {manualOrderNamePreview}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        className="mt-auto h-8 w-full shrink-0 text-[0.82rem]"
        onClick={generateManualOrder}
      >
        Generar etiquetas
      </Button>
    </section>
  );
}
