import { Printer } from 'lucide-react';
import { useLabelsApp } from '../context/LabelsAppContext';
import { Button } from '@/components/ui/button';

export function PrintFab() {
  const { printFabVisible, handlePrintNext, actionButtonsDisabled } = useLabelsApp();
  if (!printFabVisible) return null;

  return (
    <Button
      type="button"
      size="lg"
      className="fixed bottom-5 right-5 z-40 h-11 gap-2 bg-brand-600 px-5 font-semibold text-white shadow-fab hover:bg-brand-700 hover:text-white"
      title="Imprimir"
      aria-label="Imprimir"
      disabled={actionButtonsDisabled}
      onClick={handlePrintNext}
    >
      <Printer className="h-4 w-4 text-white" aria-hidden="true" />
      Imprimir
    </Button>
  );
}
