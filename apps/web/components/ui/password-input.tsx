import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';

/** Input de clave con botón para mostrar/ocultar el texto. */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-9', className)}
        ref={ref}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar clave' : 'Mostrar clave'}
        title={visible ? 'Ocultar clave' : 'Mostrar clave'}
      >
        {visible ? (
          <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
