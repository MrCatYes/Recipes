import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { User } from '@epicerie/shared-types';
import {
  setTokens, setAuthCallbacks, login as apiLogin, register as apiRegister,
  logoutApi, getMe, updateMe as apiUpdateMe,
} from './api';

const ACCESS_KEY = 'epicerie.access';
const REFRESH_KEY = 'epicerie.refresh';

type Status = 'loading' | 'authed' | 'anon';

interface AuthValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'displayName' | 'latitude' | 'longitude' | 'postalCode'>>) => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  status: 'loading', user: null,
  login: async () => {}, register: async () => {}, logout: async () => {}, updateProfile: async () => {},
});

async function persist(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}
async function clearPersisted() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const reset = useCallback(async () => {
    setTokens(null, null);
    await clearPersisted();
    setUser(null);
    setStatus('anon');
  }, []);

  // Wire api callbacks (token rotation persistence + forced logout on refresh failure)
  useEffect(() => {
    setAuthCallbacks({
      onTokensRefreshed: (a, r) => { void persist(a, r); },
      onAuthLost: () => { void reset(); },
    });
  }, [reset]);

  // Boot: restore tokens, validate via /auth/me
  useEffect(() => {
    (async () => {
      const access = await SecureStore.getItemAsync(ACCESS_KEY);
      const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!access || !refresh) { setStatus('anon'); return; }
      setTokens(access, refresh);
      try {
        setUser(await getMe());
        setStatus('authed');
      } catch {
        await reset();
      }
    })();
  }, [reset]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setTokens(res.accessToken, res.refreshToken);
    await persist(res.accessToken, res.refreshToken);
    setUser(res.user);
    setStatus('authed');
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await apiRegister(email, password, displayName);
    setTokens(res.accessToken, res.refreshToken);
    await persist(res.accessToken, res.refreshToken);
    setUser(res.user);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (refresh) { try { await logoutApi(refresh); } catch { /* ignore */ } }
    await reset();
  }, [reset]);

  const updateProfile = useCallback(async (patch: Partial<Pick<User, 'displayName' | 'latitude' | 'longitude' | 'postalCode'>>) => {
    setUser(await apiUpdateMe(patch));
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
