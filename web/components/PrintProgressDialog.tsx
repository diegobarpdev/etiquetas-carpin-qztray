import { useEffect } from 'react';
import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import type { PrintProgressState } from '../context/LabelsAppContext';

const AUTO_CLOSE_MS = 2500;

type Props = {
  state: PrintProgressState;
  onClose: () => void;
};

export function PrintProgressDialog({ state, onClose }: Props) {
  const open = state.open;
  const phase = open ? state.phase : null;

  useEffect(() => {
    if (phase !== 'success') return;
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && open && phase !== 'sending' && phase !== 'connecting-qz') onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-[60] bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-[60] w-[min(100vw-2rem,22rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-background p-8 shadow-xl outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
          onPointerDownOutside={(e) => {
            if (phase === 'sending' || phase === 'connecting-qz') e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (phase === 'sending' || phase === 'connecting-qz') e.preventDefault();
          }}
        >
          {open ? <PrintProgressBody state={state} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PrintProgressBody({ state }: { state: Extract<PrintProgressState, { open: true }> }) {
  if (state.phase === 'sending') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/10">
          <Loader2 className="h-9 w-9 animate-spin text-brand-600" aria-hidden="true" />
        </div>
        <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
          Enviando a la impresora…
        </DialogPrimitive.Title>
        <p className="text-base font-medium text-foreground">{state.printerLabel}</p>
        <p className="text-sm text-muted-foreground">
          {state.pages} etiqueta{state.pages === 1 ? '' : 's'}
        </p>
      </div>
    );
  }

  if (state.phase === 'connecting-qz') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/10">
          <Loader2 className="h-9 w-9 animate-spin text-brand-600" aria-hidden="true" />
        </div>
        <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
          Conectando con QZ Tray…
        </DialogPrimitive.Title>
        <p className="text-base font-medium text-foreground">{state.printerLabel}</p>
        <p className="text-sm text-muted-foreground">
          {state.pages} etiqueta{state.pages === 1 ? '' : 's'}
        </p>
      </div>
    );
  }

  if (state.phase === 'not-installed') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <WifiOff className="h-9 w-9 text-amber-700" aria-hidden="true" />
        </div>
        <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
          QZ Tray no está corriendo
        </DialogPrimitive.Title>
        <p className="text-sm leading-snug text-muted-foreground">
          Instala o abre QZ Tray en esta PC y volvé a intentar.
        </p>
        <p className="text-base font-medium text-foreground">{state.printerLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 animate-in zoom-in-50 duration-300">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
      </div>
      <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
        Impreso
      </DialogPrimitive.Title>
      <p className="text-base font-medium text-foreground">{state.printerLabel}</p>
      <p className="text-sm text-muted-foreground">
        {state.pages} etiqueta{state.pages === 1 ? '' : 's'}
        {state.detail ? ` · ${state.detail}` : ''}
      </p>
    </div>
  );
}
