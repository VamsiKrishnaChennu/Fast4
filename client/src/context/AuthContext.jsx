import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi.js';
import {
  hasSessionHint,
  refreshAccessToken,
  setAccessToken,
  setAuthLostHandler,
  setSessionHint,
} from '../api/axiosClient.js';

const AuthContext = createContext(null);

/** Holds the signed-in user. Restores the session silently on load with the refresh cookie. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!hasSessionHint()) {
        setStatus('anon');
        return;
      }
      try {
        await refreshAccessToken();
        const current = await authApi.me();
        if (live) {
          setUser(current);
          setStatus('authed');
        }
      } catch {
        setAccessToken(null);
        setSessionHint(false);
        if (live) setStatus('anon');
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setAuthLostHandler(() => {
      setUser(null);
      setStatus('anon');
    });
  }, []);

  const signIn = useCallback(async (fn, payload) => {
    const next = await fn(payload);
    setUser(next);
    setStatus('authed');
    setLoggedOut(false);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      loggedOut,
      login: (payload) => signIn(authApi.login, payload),
      signup: (payload) => signIn(authApi.signup, payload),
      async logout() {
        try {
          await authApi.logout();
        } finally {
          setLoggedOut(true);
          setUser(null);
          setStatus('anon');
        }
      },
    }),
    [user, status, loggedOut, signIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
