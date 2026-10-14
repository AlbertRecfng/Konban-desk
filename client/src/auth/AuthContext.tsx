import { type ReactNode, createContext, use, useEffect, useState } from 'react';
import { authApi } from '../api';
import { onSessionExpired, refreshSession, setAccessToken } from '../api/client';
import { connectRealtime, disconnectRealtime } from '../api/realtime';
import type { AuthResponse, User } from '../api/types';

interface AuthValue {
  user: User | null;
  /** true, пока при запуске проверяем, есть ли активная сессия */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    refreshSession().then((session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    onSessionExpired(() => {
      setAccessToken(null);
      setUser(null);
    });
    return () => {
      cancelled = true;
      onSessionExpired(null);
    };
  }, []);

  // Обновления в реальном времени нужны только вошедшему пользователю
  const loggedIn = user !== null;
  useEffect(() => {
    if (!loggedIn) return;
    connectRealtime();
    return disconnectRealtime;
  }, [loggedIn]);

  function startSession(session: AuthResponse) {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }

  const value: AuthValue = {
    user,
    loading,
    login: async (email, password) => startSession(await authApi.login(email, password)),
    register: async (name, email, password) => startSession(await authApi.register(name, email, password)),
    logout: async () => {
      try {
        await authApi.logout();
      } finally {
        setAccessToken(null);
        setUser(null);
      }
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return value;
}
