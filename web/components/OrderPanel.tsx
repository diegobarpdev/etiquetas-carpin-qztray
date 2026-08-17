import { useMemo, useState } from 'react';
import { Boxes, Download } from 'lucide-react';
import { useLabelsApp } from '../context/LabelsAppContext';
import { formatOrderState, templateUsesInspector } from '../lib/format';
import { buildInspectorChoices, InspectorCombobox } from './InspectorCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function escapeForTitle(value: string): string {
  return value;
}

function packingStatusTone(className: string): string {
  switch (className) {
    case 'is-ok':
      return 'text-emerald-700';
    case 'is-pending':
      return 'text-amber-700';
    case 'is-bad':
      return 'text-red-700';
    case 'is-empty':
      return 'font-medium text-slate-500';
    default:
      return '';
  }
}

const filterInputClassName =
  'h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-[0.82rem] shadow-none';

export function OrderPanel() {
  const {
    selectedOrderId,
    manualActive,
    lastOrderData,
    selectionGroups,
    selectedGroupIds,
    summaryByRef,
    handleGroupCheckboxChange,
    selectionSummaryHint,
    dualPacking,
    dualPackingVisible,
    onDualPackingChange,
    customPackingRows,
    customPackingVisible,
    customPackingModeActive,
    toggleCustomPackingModeActive,
    customPackingStatus,
    onCustomPackingRowChange,
    addCustomPackingRow,
    removeCustomPackingRow,
    applyCustomPackingPlan,
    rangeFrom,
    rangeTo,
    unitsFilter,
    onRangeFromChange,
    onRangeToChange,
    onUnitsFilterChange,
    handleDownloadPdf,
    actionButtonsDisabled,
    inspectorOptions,
    selectedInspectorName,
    onInspectorSelect,
    bultoQuantities,
    onBultoQuantityChange,
    selectedTemplate,
  } = useLabelsApp();

  const effectiveTemplate =
    selectedTemplate || lastOrderData?.preview?.templateCode || '';
  const showInspector = templateUsesInspector(effectiveTemplate);
  const inspectorChoices = useMemo(
    () => buildInspectorChoices(inspectorOptions),
    [inspectorOptions],
  );

  const [cardOpen, setCardOpen] = useState(true);

  if ((!selectedOrderId && !manualActive) || !lastOrderData) return null;

  const order = lastOrderData.order;
  const itemQty = order.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const metaParts = [
    order.lotNumber ? { label: 'Lote', value: order.lotNumber } : null,
    order.productionDate
      ? { label: 'Fecha', value: String(order.productionDate).slice(0, 10) }
      : null,
    itemQty > 0 ? { label: 'Cantidad', value: String(itemQty) } : null,
    { label: 'Estado', value: formatOrderState(order.state) },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel',
        !cardOpen && 'h-auto',
      )}
    >
      <div className="flex shrink-0 items-start gap-2 bg-slate-50 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              className="min-w-0 truncate border-0 bg-transparent p-0 text-left text-[0.95rem] font-bold text-slate-900 hover:opacity-90"
              aria-expanded={cardOpen}
              onClick={() => setCardOpen((open) => !open)}
            >
              {order.name}
            </button>
            <Button
              id="download-pdf-btn"
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-slate-200/80 hover:text-foreground"
              disabled={actionButtonsDisabled}
              title="Descargar PDF"
              aria-label="Descargar PDF de la orden"
              onClick={handleDownloadPdf}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              id="toggle-custom-packing-btn"
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-6 w-6 shrink-0 transition-colors',
                customPackingModeActive
                  ? 'bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200'
                  : 'text-slate-400 hover:bg-slate-200/80 hover:text-slate-600',
              )}
              disabled={actionButtonsDisabled}
              title={
                customPackingModeActive
                  ? 'Reparto de bultos (Activado)'
                  : 'Reparto de bultos (Desactivado)'
              }
              aria-label="Activar o desactivar reparto de bultos"
              onClick={toggleCustomPackingModeActive}
            >
              <Boxes
                className={cn(
                  'h-3.5 w-3.5',
                  customPackingModeActive ? 'text-red-600' : 'text-slate-400',
                )}
                aria-hidden="true"
              />
            </Button>
          </div>
          <button
            type="button"
            className="mt-0.5 block w-full truncate border-0 bg-transparent p-0 text-left text-[0.72rem] text-muted-foreground hover:opacity-90"
            aria-expanded={cardOpen}
            onClick={() => setCardOpen((open) => !open)}
          >
            {metaParts.map((p) => `${p.label}: ${p.value}`).join(' · ')}
          </button>
        </div>
        <button
          type="button"
          className="shrink-0 self-center border-0 bg-transparent p-0 text-[0.72rem] font-medium text-muted-foreground hover:opacity-90"
          aria-expanded={cardOpen}
          onClick={() => setCardOpen((open) => !open)}
        >
          {selectionSummaryHint || 'Orden'}
          <span className="ml-1.5 text-[0.7rem]">{cardOpen ? '▴' : '▾'}</span>
        </button>
      </div>

      {cardOpen ? (
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-200 p-4">
        {showInspector ? (
          <div className="mb-3 grid gap-1">
            <Label
              htmlFor="order-inspector-select"
              className="text-[0.72rem] font-bold uppercase tracking-wide text-slate-600"
            >
              Inspector <span className="text-red-600">*</span>
            </Label>
            <InspectorCombobox
              id="order-inspector-select"
              value={selectedInspectorName}
              options={inspectorChoices}
              onChange={onInspectorSelect}
              placeholder="Elegir inspector…"
              required
              invalid={!selectedInspectorName}
            />
            {!selectedInspectorName ? (
              <p className="m-0 text-[0.72rem] text-red-600">Obligatorio para esta etiqueta</p>
            ) : null}
          </div>
        ) : null}

      {selectionGroups.length > 0 ? (
        <div className="mb-3">
            <div className="mb-2.5 min-w-0 overflow-hidden rounded-md border border-slate-200">
              <table className="w-full table-fixed border-collapse text-[0.75rem]" aria-label="Productos a imprimir">
                <thead>
                  <tr>
                    <th className="w-[1.6rem] border-b border-slate-200 bg-slate-50 px-2 py-1.5 pr-0.5 text-center font-semibold text-slate-600" scope="col">
                      <span className="sr-only">Imprimir</span>
                    </th>
                    <th className="w-[22%] border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-600" scope="col">
                      Ref.
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-600" scope="col">
                      Producto
                    </th>
                    <th className="w-[18%] border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-600" scope="col">
                      N° Bulto
                    </th>
                    {customPackingModeActive ? (
                      <th className="w-[18%] border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-600" scope="col">
                        Cant. / Bulto
                      </th>
                    ) : null}
                    <th className="w-[14%] border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-600" scope="col">
                      Etiquetas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectionGroups.map((group) => {
                    const meta = summaryByRef.get(group.internalRef);
                    const isChild = Boolean(group.parentId);
                    const checked = selectedGroupIds.has(group.id);
                    const productName =
                      meta?.productName || group.label.replace(/\s*\(kit completo\)\s*$/i, '');
                    const currentQtyVal =
                      bultoQuantities[group.id] ||
                      (meta?.bultoDisplay ? bultoQuantities[meta.bultoDisplay] : '') ||
                      '';
                    return (
                      <tr
                        key={group.id}
                        className={cn(
                          group.isKitParent && 'bg-sky-50',
                          checked && !group.isKitParent && 'bg-slate-50',
                        )}
                      >
                        <td className="border-b border-slate-100 px-2 py-1.5 pr-0.5 text-center align-top">
                          <input
                            type="checkbox"
                            className="m-0 cursor-pointer"
                            checked={checked}
                            aria-label={`Imprimir ${group.label}`}
                            onChange={(e) => handleGroupCheckboxChange(group.id, e.target.checked)}
                          />
                        </td>
                        <td
                          className={cn(
                            'truncate whitespace-nowrap border-b border-slate-100 px-2 py-1.5 align-top',
                            isChild && 'text-slate-500',
                          )}
                        >
                          {isChild ? (
                            `↳ ${group.internalRef}`
                          ) : group.isKitParent ? (
                            <>
                              {escapeForTitle(group.internalRef)}{' '}
                              <span className="ml-1 inline-block rounded bg-brand-600 px-1 py-px text-[0.65rem] font-semibold text-white">
                                Kit
                              </span>
                            </>
                          ) : (
                            group.internalRef
                          )}
                        </td>
                        <td
                          className="truncate whitespace-nowrap border-b border-slate-100 px-2 py-1.5 align-top"
                          title={productName}
                        >
                          {productName}
                        </td>
                        <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-center align-top">
                          {meta?.bultoDisplay || '—'}
                        </td>
                        {customPackingModeActive ? (
                          <td className="whitespace-nowrap border-b border-slate-100 px-1 py-1 text-center align-top">
                            {!group.isKitParent ? (
                              <Input
                                type="number"
                                min={1}
                                placeholder="Default"
                                aria-label={`Cantidad por bulto para ${group.label}`}
                                className="mx-auto h-6 w-16 px-1 text-center text-[0.75rem] shadow-none border-red-200 focus-visible:ring-red-400"
                                value={currentQtyVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onBultoQuantityChange(group.id, val);
                                  if (meta?.bultoDisplay && meta.bultoDisplay !== '—') {
                                    onBultoQuantityChange(meta.bultoDisplay, val);
                                  }
                                }}
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-center align-top font-semibold">
                          {group.labelCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 grid grid-cols-2 items-start gap-2">
              {dualPackingVisible ? (
                <div className="col-span-2 min-w-0">
                  <label
                    className="mb-1 flex cursor-pointer items-center gap-1.5 text-[0.82rem] font-semibold"
                    htmlFor="dual-packing"
                  >
                    <input
                      type="checkbox"
                      id="dual-packing"
                      className="m-0 w-auto"
                      checked={dualPacking}
                      onChange={(e) => onDualPackingChange(e.target.checked)}
                    />
                    Bultos pares (2 uds/etiqueta)
                  </label>
                  <p className="mt-1.5 text-[0.72rem] text-muted-foreground">
                    PLSIL o Carpenter terminado. Por defecto individual. Impar: última etiqueta con 1.
                  </p>
                </div>
              ) : null}

              {customPackingModeActive && customPackingVisible ? (
                <div className="col-span-2 min-w-0">
                  <Label className="mb-1.5 block text-[0.78rem] font-semibold">
                    Reparto de bultos (personalizado)
                  </Label>
                  <div
                    className="grid grid-cols-[1fr_auto_1fr_2rem] items-center gap-1.5 px-0.5"
                    aria-hidden="true"
                  >
                    <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Uds / bulto
                    </span>
                    <span />
                    <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Nº bultos
                    </span>
                    <span />
                  </div>
                  <div className="mb-1.5 flex flex-col gap-1.5">
                    {customPackingRows.map((row, idx) => (
                      <div
                        className="grid grid-cols-[1fr_auto_1fr_2rem] items-center gap-1.5"
                        key={idx}
                      >
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          placeholder="10"
                          aria-label="Unidades por bulto"
                          className={cn(filterInputClassName, 'text-[0.85rem]')}
                          value={row.qty}
                          onChange={(e) => onCustomPackingRowChange(idx, 'qty', e.target.value)}
                        />
                        <span
                          className="text-center text-[0.9rem] font-semibold leading-none text-muted-foreground"
                          aria-hidden="true"
                        >
                          ×
                        </span>
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          placeholder="1"
                          aria-label="Número de bultos"
                          className={cn(filterInputClassName, 'text-[0.85rem]')}
                          value={row.count}
                          onChange={(e) => onCustomPackingRowChange(idx, 'count', e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0 border-slate-200 text-base text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          title="Quitar fila"
                          aria-label="Quitar fila"
                          disabled={customPackingRows.length <= 1}
                          onClick={() => removeCustomPackingRow(idx)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto w-auto px-2.5 py-1.5 text-[0.78rem]"
                      onClick={addCustomPackingRow}
                    >
                      + Agregar fila
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-auto w-auto px-2.5 py-1.5 text-[0.78rem]"
                      onClick={applyCustomPackingPlan}
                    >
                      Validar
                    </Button>
                    <span
                      className={cn(
                        'text-[0.8rem] font-semibold',
                        packingStatusTone(customPackingStatus.className),
                      )}
                    >
                      {customPackingStatus.text}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] text-muted-foreground">
                    Completá el reparto y pulsá Validar (ej. 1×10 para emitir 10 bultos/etiquetas aunque la orden tenga 6).
                  </p>
                </div>
              ) : null}

              <div className="min-w-0">
                <Label htmlFor="units-filter" className="mb-1.5 block text-[0.78rem] font-semibold">
                  N° de unidad (cuál de la orden)
                </Label>
                <Input
                  type="text"
                  id="units-filter"
                  className={filterInputClassName}
                  placeholder="2,5,8,10 o 7-10"
                  value={unitsFilter}
                  onChange={(e) => onUnitsFilterChange(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="range-from" className="mb-1.5 block text-[0.78rem] font-semibold">
                  Rango (sobre lo filtrado)
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    id="range-from"
                    min={1}
                    placeholder="Desde"
                    className={cn(filterInputClassName, 'min-w-0 flex-1')}
                    value={rangeFrom}
                    onChange={(e) => onRangeFromChange(e.target.value)}
                  />
                  <span className="text-[0.85rem] text-muted-foreground">—</span>
                  <Input
                    type="number"
                    id="range-to"
                    min={1}
                    placeholder="Hasta"
                    className={cn(filterInputClassName, 'min-w-0 flex-1')}
                    value={rangeTo}
                    onChange={(e) => onRangeToChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
        </div>
      ) : null}
      </div>
      ) : null}
    </section>
  );
}
