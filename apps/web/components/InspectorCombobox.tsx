import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type InspectorChoice = {
  value: string;
  label: string;
  hint?: string;
};

export function buildInspectorChoices(
  inspectorOptions: Array<{ id: number; name: string }>,
): InspectorChoice[] {
  const names = new Set<string>();
  const list: InspectorChoice[] = [];

  for (const row of inspectorOptions) {
    const name = row.name.toUpperCase();
    if (!name || names.has(name)) continue;
    names.add(name);
    list.push({ value: name, label: name });
  }

  return list;
}

export function InspectorCombobox({
  value,
  options,
  onChange,
  placeholder = 'Elegir inspector…',
  id,
  required = false,
  invalid = false,
}: {
  value: string;
  options: InspectorChoice[];
  onChange: (name: string) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return options;
    return options.filter((o) => o.label.includes(q) || (o.hint || '').toUpperCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  const triggerLabel = selected
    ? selected.hint
      ? `${selected.label} (${selected.hint})`
      : selected.label
    : placeholder;

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        id={inputId}
        className={cn(
          'flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-[0.82rem] text-foreground',
          open && 'border-sky-300 shadow-[0_0_0_2px_rgba(147,197,253,0.35)]',
          invalid && !value && 'border-red-400 shadow-[0_0_0_2px_rgba(248,113,113,0.25)]',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        aria-invalid={invalid && !value}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={cn(
            'min-w-0 truncate whitespace-nowrap',
            !selected && 'text-slate-400',
          )}
        >
          {triggerLabel}
        </span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 flex max-h-56 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.16)]"
          role="listbox"
          aria-labelledby={inputId}
        >
          <Input
            ref={searchRef}
            type="search"
            className="h-8 shrink-0 rounded-none border-0 border-b border-slate-200 bg-slate-50 px-2.5 text-[0.82rem] shadow-none focus-visible:bg-white focus-visible:ring-0"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                e.preventDefault();
                pick(filtered[0].value);
              }
            }}
            aria-label="Buscar inspector"
          />
          <div className="max-h-[11.5rem] overflow-auto p-0.5">
            {filtered.length === 0 ? (
              <p className="m-0 px-2 py-2 text-[0.78rem] text-muted-foreground">Sin coincidencias</p>
            ) : (
              filtered.map((item) => {
                const active = item.value === value;
                return (
                  <button
                    type="button"
                    key={item.value}
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full cursor-pointer items-baseline justify-between gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[0.82rem] text-foreground hover:bg-sky-50',
                      active && 'bg-sky-50',
                    )}
                    onClick={() => pick(item.value)}
                  >
                    <span>{item.label}</span>
                    {item.hint ? (
                      <small className="shrink-0 text-[0.68rem] font-semibold uppercase text-slate-500">
                        {item.hint}
                      </small>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
