import { Plus, X } from 'lucide-react';
import { useLabelsApp } from '../context/LabelsAppContext';
import { formatOrderState } from '../lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function stateBadgeVariant(state: string | undefined): 'success' | 'info' | 'warning' | 'secondary' {
  const s = String(state || '').toLowerCase().replace(/\s+/g, '_');
  if (s === 'done') return 'success';
  if (s === 'progress') return 'info';
  if (s === 'confirmed' || s === 'to_close') return 'warning';
  return 'secondary';
}

export function OrderSearch() {
  const {
    orderQuery,
    setOrderQuery,
    orders,
    orderListHint,
    orderSearchExecuted,
    runOrderSearch,
    handleClearOrderSearch,
    selectedOrderId,
    selectOrder,
    handleAddOrderToBatch,
    isOrderInBatchFn,
  } = useLabelsApp();

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-3 shadow-panel">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <Label htmlFor="order-filter" className="text-[0.875rem] font-medium text-foreground">
          Orden de fabricación
        </Label>
        {orderListHint ? (
          <span className="text-ui-sm text-muted-foreground">{orderListHint}</span>
        ) : null}
      </div>

      <div className="relative mb-2 shrink-0">
        <Input
          id="order-filter"
          className="h-8 w-full pr-8 text-[0.875rem]"
          placeholder="Buscar y Enter…"
          title="Usa % o * como comodín. Ejemplo: tap%1070 → PLTAP/OPR/01070."
          autoComplete="off"
          value={orderQuery}
          onChange={(e) => setOrderQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            runOrderSearch();
          }}
        />
        {orderQuery || orderSearchExecuted || orders.length > 0 ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Limpiar búsqueda"
            aria-label="Limpiar búsqueda"
            onClick={handleClearOrderSearch}
          >
            <X className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {orderSearchExecuted && orders.length === 0 ? (
        <p className="m-0 flex-1 text-[0.875rem] text-muted-foreground">Sin resultados.</p>
      ) : null}

      {orders.length > 0 ? (
        <ul
          className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border"
          role="listbox"
          aria-label="Lista de órdenes"
        >
          {orders.map((order) => {
            const isSelected =
              selectedOrderId != null && Number(order.id) === Number(selectedOrderId);
            const inBatch = isOrderInBatchFn(order.id);
            return (
              <li key={order.id} role="option" aria-selected={isSelected}>
                <div
                  className={cn(
                    'group flex items-center gap-1.5 px-2 py-0.5 transition-colors',
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/70',
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => selectOrder(order.id)}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate font-mono text-[0.86rem] font-medium leading-tight tracking-tight',
                        isSelected ? 'text-primary' : 'text-foreground',
                      )}
                      title={order.name}
                    >
                      {order.name}
                    </span>
                    <Badge
                      variant={stateBadgeVariant(order.state)}
                      className="h-5 shrink-0 rounded px-1.5 py-0 text-[0.72rem] font-medium leading-none"
                    >
                      {formatOrderState(order.state)}
                    </Badge>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground',
                      inBatch && 'text-primary',
                    )}
                    disabled={inBatch}
                    title={inBatch ? 'Ya está en el lote' : 'Agregar al lote'}
                    aria-label={inBatch ? 'Ya en el lote' : `Agregar ${order.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleAddOrderToBatch(order.id, order.name);
                    }}
                  >
                    {inBatch ? '✓' : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
