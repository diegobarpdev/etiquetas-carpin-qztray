import { useLabelsApp } from '../context/LabelsAppContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BatchPanel() {
  const { printBatch, selectedOrderId, selectOrder, handleRemoveFromBatch, handleClearBatch } =
    useLabelsApp();

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card p-3 shadow-panel">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-[0.875rem] font-semibold">
          Lote a imprimir
          {printBatch.length > 0 ? (
            <span className="ml-1.5 font-normal text-muted-foreground">({printBatch.length})</span>
          ) : null}
        </h2>
        {printBatch.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[0.78rem] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={handleClearBatch}
          >
            Vaciar
          </Button>
        ) : null}
      </div>
      {printBatch.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-start rounded-md border border-dashed border-border px-2 py-1.5">
          <p className="m-0 text-ui-sm text-muted-foreground">Agrega órdenes con +</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {printBatch.map((job) => {
            const isActive = job.orderId === selectedOrderId;
            return (
              <li key={job.orderId}>
                <div
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 transition-colors',
                    isActive ? 'bg-primary/10' : 'hover:bg-muted/70',
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                    onClick={() => selectOrder(job.orderId)}
                    title={`${job.orderName} · ${job.labelCount} etiq. · ${job.hint}`}
                  >
                    <span
                      className={cn(
                        'block truncate font-mono text-[0.8rem] font-semibold leading-tight',
                        isActive ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {job.orderName}
                    </span>
                    <span className="block truncate text-[0.72rem] leading-tight text-muted-foreground">
                      {job.labelCount} etiq. · {job.hint}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Quitar del lote"
                    aria-label={`Quitar ${job.orderName}`}
                    onClick={() => handleRemoveFromBatch(job.orderId)}
                  >
                    ×
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
