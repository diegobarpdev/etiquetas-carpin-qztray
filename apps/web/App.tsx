import { useState } from 'react';
import { AppAccessGate } from './components/AppAccessGate';
import { LabelsAppProvider, useLabelsApp } from './context/LabelsAppContext';
import { Topbar } from './components/Topbar';
import { OrderSearch } from './components/OrderSearch';
import { BatchPanel } from './components/BatchPanel';
import { EanPanel } from './components/EanPanel';
import { OrderPanel } from './components/OrderPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { PrintFab } from './components/PrintFab';
import { PrintSidebar } from './components/PrintSidebar';
import { PrintProgressDialog } from './components/PrintProgressDialog';
import { PrintersAdmin } from './components/PrintersAdmin';
import { Toaster } from './components/ui/sonner';
import { cn } from './lib/utils';

type SearchMode = 'order' | 'ean';

function SearchModeTabs({ mode, onChange }: { mode: SearchMode; onChange: (mode: SearchMode) => void }) {
  const tabClass =
    'flex-1 rounded-md px-2 py-1 text-[0.78rem] font-medium text-muted-foreground transition-colors hover:text-foreground';
  const activeTabClass = 'bg-white text-foreground shadow-sm';

  return (
    <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Modo de búsqueda">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'order'}
        className={cn(tabClass, mode === 'order' && activeTabClass)}
        onClick={() => onChange('order')}
      >
        Por orden
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'ean'}
        className={cn(tabClass, mode === 'ean' && activeTabClass)}
        onClick={() => onChange('ean')}
      >
        Por código EAN
      </button>
    </div>
  );
}

function AppShell() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('order');
  const { printProgress, closePrintProgress } = useLabelsApp();

  return (
    <>
      <div className="flex h-screen flex-col bg-background">
        <Topbar onOpenSettings={() => setAdminOpen(true)} />

        <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden border-r border-slate-200 bg-slate-50 p-4">
            <SearchModeTabs mode={searchMode} onChange={setSearchMode} />

            {searchMode === 'order' ? (
              <div className="grid h-[190px] shrink-0 grid-cols-2 gap-3">
                <div className="min-h-0 min-w-0">
                  <OrderSearch />
                </div>
                <div className="min-h-0 min-w-0">
                  <BatchPanel />
                </div>
              </div>
            ) : (
              <div className="h-[230px] shrink-0">
                <EanPanel />
              </div>
            )}

            <div className="min-h-0 flex-1">
              <OrderPanel />
            </div>
          </aside>

          <PreviewPanel />
        </main>
      </div>

      <PrintFab />
      <PrintSidebar />
      <PrintProgressDialog state={printProgress} onClose={closePrintProgress} />
      <PrintersAdmin open={adminOpen} onClose={() => setAdminOpen(false)} />
      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <AppAccessGate>
      <LabelsAppProvider>
        <AppShell />
      </LabelsAppProvider>
    </AppAccessGate>
  );
}
