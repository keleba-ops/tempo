import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role, User } from '../../shared/types';
import { get, patch, post, setUnauthorizedHandler } from '../lib/api';

interface RegisterStartInput {
  name: string;
  email: string;
  role: Role;
  businessName?: string;
  timezone?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (input: { email: string; pin: string }) => Promise<User>;
  startRegister: (input: RegisterStartInput) => Promise<void>;
  verifyRegister: (input: { email: string; code: string; pin: string }) => Promise<User>;
  startRecover: (email: string) => Promise<void>;
  verifyRecover: (input: { email: string; code: string; pin: string }) => Promise<User>;
  changePin: (currentPin: string, newPin: string) => Promise<User>;
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

  const login = useCallback(async (input: { email: string; pin: string }) => {
    const data = await post<{ user: User }>('/auth/login', input);
    setUser(data.user);
    return data.user;
  }, []);

  const startRegister = useCallback(async (input: RegisterStartInput) => {
    await post('/auth/register/start', input);
  }, []);

  const verifyRegister = useCallback(async (input: { email: string; code: string; pin: string }) => {
    const data = await post<{ user: User }>('/auth/register/verify', input);
    setUser(data.user);
    return data.user;
  }, []);

  const startRecover = useCallback(async (email: string) => {
    await post('/auth/recover/start', { email });
  }, []);

  const verifyRecover = useCallback(async (input: { email: string; code: string; pin: string }) => {
    const data = await post<{ user: User }>('/auth/recover/verify', input);
    setUser(data.user);
    return data.user;
  }, []);

  const changePin = useCallback(async (currentPin: string, newPin: string) => {
    const data = await post<{ user: User }>('/auth/change-pin', { currentPin, newPin });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((next: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...next } : current));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, startRegister, verifyRegister, startRecover, verifyRecover, changePin, logout, refresh, updateUser }),
    [user, loading, login, startRegister, verifyRegister, startRecover, verifyRecover, changePin, logout, refresh, updateUser],
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
