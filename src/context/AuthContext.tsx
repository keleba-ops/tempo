import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role, User } from '../../shared/types';
import { get, patch, post, setUnauthorizedHandler } from '../lib/api';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  name: string;
  email: string;
  password?: string;
  role: Role;
  businessName?: string;
  timezone?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  temporaryPassword: string | null;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // The one-time password is kept only for this tab so a reload mid-setup doesn't lose it.
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(() => {
    try { return sessionStorage.getItem('tempo-temp-pw'); } catch { return null; }
  });

  const refresh = useCallback(async () => {
    try {
      const data = await get<{ user: User | null }>('/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const data = await post<{ user: User }>('/auth/login', input);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await post<{ user: User; temporaryPassword?: string }>('/auth/register', input);
    if (data.temporaryPassword) {
      setTemporaryPassword(data.temporaryPassword);
      try { sessionStorage.setItem('tempo-temp-pw', data.temporaryPassword); } catch { /* ignore */ }
    }
    setUser(data.user);
    return data.user;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const data = await post<{ user: User }>('/auth/change-password', { currentPassword, newPassword });
    setTemporaryPassword(null);
    try { sessionStorage.removeItem('tempo-temp-pw'); } catch { /* ignore */ }
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } finally {
      setUser(null);
      setTemporaryPassword(null);
      try { sessionStorage.removeItem('tempo-temp-pw'); } catch { /* ignore */ }
    }
  }, []);

  const updateUser = useCallback((next: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...next } : current));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, temporaryPassword, changePassword, logout, refresh, updateUser }),
    [user, loading, login, register, temporaryPassword, changePassword, logout, refresh, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export async function saveProfile(input: {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  applyToBusiness?: boolean;
}) {
  return patch<{ user: User }>('/me', input);
}
