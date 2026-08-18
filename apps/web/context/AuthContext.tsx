import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiAuthLogin, apiAuthLogout, apiAuthMe, type CurrentUser } from '../lib/api';

type AuthStatus = 'checking' | 'needs-auth' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Vuelve a pedir /auth/me — usar después de cambiar la clave para que
   * mustChangePassword se actualice sin tener que recargar la página. */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    apiAuthMe()
      .then((res) => {
        setUser(res.user);
        setStatus('authenticated');
      })
      .catch(() => setStatus('needs-auth'));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiAuthLogin(email, password);
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await apiAuthLogout().catch(() => {});
    setUser(null);
    setStatus('needs-auth');
  }, []);

  const refreshMe = useCallback(async () => {
    const res = await apiAuthMe();
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
