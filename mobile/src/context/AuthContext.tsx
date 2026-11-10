import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { auth, setAuthToken, setOnUnauthorized } from '@/lib/api';
import { SECURE_KEYS, secureStorage } from '@/services/storage/secure-store';
import type { User } from '@/types/api';

interface AuthValue {
  user: User | null;
  ready: boolean;
  isAuthed: boolean;
  login: (username: string, password: string, pin: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await Promise.all([
      secureStorage.removeItem(SECURE_KEYS.token),
      secureStorage.removeItem(SECURE_KEYS.user),
    ]);
  }, []);

  // Restore persisted session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [token, userRaw] = await Promise.all([
        secureStorage.getItem(SECURE_KEYS.token),
        secureStorage.getItem(SECURE_KEYS.user),
      ]);
      if (cancelled) return;
      if (token) {
        setAuthToken(token);
        if (userRaw) {
          try {
            setUser(JSON.parse(userRaw) as User);
          } catch {
            /* ignore corrupt session */
          }
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 anywhere clears the session so guarded routes bounce to /login.
  useEffect(() => {
    setOnUnauthorized(() => {
      void logout();
    });
    return () => setOnUnauthorized(null);
  }, [logout]);

  const login = useCallback(async (username: string, password: string, pin: string) => {
    const data = await auth.login(username, password, pin);
    setAuthToken(data.token);
    setUser(data.user);
    await Promise.all([
      secureStorage.setItem(SECURE_KEYS.token, data.token),
      secureStorage.setItem(SECURE_KEYS.user, JSON.stringify(data.user)),
    ]);
    return data.user;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, ready, isAuthed: !!user, login, logout }),
    [user, ready, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
