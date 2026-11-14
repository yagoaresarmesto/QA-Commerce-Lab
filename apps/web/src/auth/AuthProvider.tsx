import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { http, refreshAccessToken, session } from '../lib/api';
import { storage } from '../lib/storage';
import type { AuthResponse, Cart, User } from '../lib/types';

type Status = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  status: Status;
  user: User | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  acceptTerms: boolean;
  marketingOptIn?: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  // Restore the session on page load using the httpOnly refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (session.hasHint() && (await refreshAccessToken())) {
        try {
          const me = await http.get<User>('/users/me');
          if (!cancelled) {
            setUser(me);
            setStatus('authenticated');
          }
          return;
        } catch {
          session.set(null);
        }
      }
      if (!cancelled) setStatus('guest');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearLocalSession = useCallback(() => {
    session.set(null);
    setUser(null);
    setStatus('guest');
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'catalog' });
  }, [queryClient]);

  useEffect(
    () =>
      session.onExpired(() => {
        clearLocalSession();
        toast.warning('Tu sesión ha caducado. Inicia sesión de nuevo.', { id: 'session-expired' });
      }),
    [clearLocalSession],
  );

  const onAuthenticated = useCallback(
    async (res: AuthResponse) => {
      session.set(res.accessToken);
      setUser(res.user);
      setStatus('authenticated');
      // Recover the guest cart after login.
      const guestToken = storage.get('qcl.cartToken');
      if (guestToken) {
        try {
          const cart = await http.post<Cart>('/cart/merge', { guestCartToken: guestToken });
          queryClient.setQueryData(['cart'], cart);
        } catch {
          /* guest cart expired or already merged */
        }
        storage.set('qcl.cartToken', null);
      }
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'catalog' });
      return res.user;
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => onAuthenticated(await http.post<AuthResponse>('/auth/login', { email, password })),
    [onAuthenticated],
  );

  const register = useCallback(
    async (data: RegisterInput) => onAuthenticated(await http.post<AuthResponse>('/auth/register', data)),
    [onAuthenticated],
  );

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      clearLocalSession();
    }
  }, [clearLocalSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, isAdmin: user?.role === 'ADMIN', login, register, logout, setUser }),
    [status, user, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
