import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="top-right"
      closeButton
      richColors
      expand={false}
      gap={10}
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'group font-sans border border-border shadow-dropdown !bg-background !text-foreground',
          title: 'text-ui-sm font-medium',
          description: 'text-ui-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton:
            '!bg-background !border-border !text-muted-foreground hover:!text-foreground',
          success: '!border-emerald-200',
          error: '!border-red-200',
          warning: '!border-amber-200',
        },
      }}
    />
  );
}
