import { Settings } from 'lucide-react';

export function Topbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-[1.05rem] font-semibold tracking-[-0.02em] text-slate-900">
          Etiquetas CTIN
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-slate-400 transition-colors hover:bg-slate-400/10 hover:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          onClick={onOpenSettings}
          title="Configuración"
          aria-label="Configuración"
        >
          <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
