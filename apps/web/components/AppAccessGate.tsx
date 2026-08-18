import { useState, type ReactNode } from 'react';
import { KeyRound, Lock, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiAuthChangePassword, apiAuthRegister } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';

type View = 'login' | 'register' | 'registered-pending';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Email o clave incorrectos');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <Lock className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <h1 className="m-0 text-lg font-semibold">Etiquetas Colineal</h1>
        <p className="m-0 text-sm text-muted-foreground">Ingresa con tu cuenta.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          type="email"
          id="login-email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Clave</Label>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
      <Button type="button" disabled={submitting || !email || !password} onClick={() => void submit()}>
        Entrar
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        onClick={onSwitchToRegister}
      >
        ¿No tienes cuenta? Regístrate
      </button>
    </>
  );
}

function RegisterForm({
  onSwitchToLogin,
  onRegistered,
}: {
  onSwitchToLogin: () => void;
  onRegistered: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await apiAuthRegister(name.trim(), email.trim(), password);
      onRegistered();
    } catch (err: any) {
      setError(err.message || 'Error registrando la cuenta');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <Lock className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <h1 className="m-0 text-lg font-semibold">Crear cuenta</h1>
        <p className="m-0 text-sm text-muted-foreground">
          Un admin tiene que aprobarla antes de que puedas entrar.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-name">Nombre</Label>
        <Input id="register-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          type="email"
          id="register-email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password">Clave</Label>
        <PasswordInput
          id="register-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        disabled={submitting || !name || !email || password.length < 8}
        onClick={() => void submit()}
      >
        Registrarme
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        onClick={onSwitchToLogin}
      >
        Ya tengo cuenta
      </button>
    </>
  );
}

function RegisteredPending({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <MailCheck className="h-8 w-8 text-emerald-500" aria-hidden="true" />
        <h1 className="m-0 text-lg font-semibold">Cuenta creada</h1>
        <p className="m-0 text-sm text-muted-foreground">
          Espera a que un admin apruebe tu cuenta para poder entrar.
        </p>
      </div>
      <Button type="button" onClick={onBackToLogin}>
        Volver a inicio de sesión
      </Button>
    </>
  );
}

function ForceChangePasswordForm() {
  const { refreshMe } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await apiAuthChangePassword(currentPassword, newPassword);
      await refreshMe();
    } catch (err: any) {
      setError(err.message || 'Error cambiando la clave');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <KeyRound className="h-8 w-8 text-amber-500" aria-hidden="true" />
        <h1 className="m-0 text-lg font-semibold">Cambia tu clave</h1>
        <p className="m-0 text-sm text-muted-foreground">
          Un admin reseteó tu clave. Por seguridad, tienes que elegir una nueva antes de
          seguir.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="force-change-current">Clave actual (la que te dieron)</Label>
        <PasswordInput
          id="force-change-current"
          autoComplete="current-password"
          autoFocus
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="force-change-new">Clave nueva</Label>
        <PasswordInput
          id="force-change-new"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        disabled={submitting || !currentPassword || newPassword.length < 8}
        onClick={() => void submit()}
      >
        Cambiar clave y entrar
      </Button>
    </>
  );
}

export function AppAccessGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [view, setView] = useState<View>('login');

  if (status === 'checking') return null;

  if (status === 'needs-auth') {
    return (
      <Shell>
        {view === 'login' && <LoginForm onSwitchToRegister={() => setView('register')} />}
        {view === 'register' && (
          <RegisterForm
            onSwitchToLogin={() => setView('login')}
            onRegistered={() => setView('registered-pending')}
          />
        )}
        {view === 'registered-pending' && <RegisteredPending onBackToLogin={() => setView('login')} />}
      </Shell>
    );
  }

  if (user?.mustChangePassword) {
    return (
      <Shell>
        <ForceChangePasswordForm />
      </Shell>
    );
  }

  return <>{children}</>;
}
