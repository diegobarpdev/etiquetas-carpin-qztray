import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { apiAppSession, apiAppUnlock } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Status = 'checking' | 'locked' | 'unlocked';

export function AppAccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    apiAppSession()
      .then((res) => setStatus(res.unlocked ? 'unlocked' : 'locked'))
      .catch(() => setStatus('locked'));
  }, []);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await apiAppUnlock(pin);
      setPin('');
      setStatus('unlocked');
    } catch (err: any) {
      setError(err.message || 'Clave incorrecta');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'checking') return null;

  if (status === 'locked') {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900">
        <div className="flex w-full max-w-xs flex-col gap-4 rounded-xl bg-white p-6 shadow-2xl">
          <div className="flex flex-col items-center gap-2 text-center">
            <Lock className="h-8 w-8 text-slate-400" aria-hidden="true" />
            <h1 className="m-0 text-lg font-semibold">Etiquetas Colineal</h1>
            <p className="m-0 text-sm text-muted-foreground">Ingresá el PIN de esta PC.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-access-pin">PIN</Label>
            <Input
              type="password"
              id="app-access-pin"
              autoComplete="off"
              autoFocus
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="button" disabled={submitting || !pin} onClick={() => void submit()}>
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
