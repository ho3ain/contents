import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSessionHint,
  getAccessToken,
  hasPersistedSession,
  markSessionActive,
  onAuthChange,
  refreshSession,
  setAccessToken,
  setImpersonating,
} from '../api/client';
import { authApi, meApi } from '../api/endpoints';
import { controlApi, type ImpersonationStart, type MfaChallenge } from '../api/control';
import type { PublicUser } from '../api/types';
import { getLocale } from '../i18n';

type Status = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  status: Status;
  user: PublicUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCreator: boolean;
  /**
   * Phone-only sign-in: phone + password. An account with two-step sign-in
   * answers with a challenge instead of a session (Phase 3): finish it with
   * `completeMfa`. No session exists until the second factor is proven.
   */
  signIn: (input: { phone: string; password: string }) => Promise<PublicUser | MfaChallenge>;
  completeMfa: (input: { challengeToken: string; code: string }) => Promise<PublicUser>;
  /** True while an admin is viewing the app as another user (impersonation). */
  isImpersonating: boolean;
  /** Switches the app to the impersonation token; the admin session is kept in memory only. */
  beginImpersonation: (started: ImpersonationStart) => Promise<void>;
  /** Leaves impersonation and restores the admin session. */
  endImpersonation: () => Promise<void>;
  signUp: (input: {
    email?: string;
    password: string;
    username: string;
    fullName?: string;
    phone: string;
    acceptTerms: boolean;
    termsVersion?: string;
  }) => Promise<PublicUser>;
  signOut: () => Promise<void>;
  /** Sign out of every device (revokes all sessions), then clear locally. */
  signOutEverywhere: () => Promise<void>;
  setUser: (user: PublicUser) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  // The admin's own token and user while impersonating — memory only, never persisted.
  const [adminSession, setAdminSession] = useState<{ token: string | null; user: PublicUser } | null>(null);

  const applyToken = useCallback((accessToken: string) => {
    setAccessToken(accessToken);
  }, []);

  // Bootstrap: if a refresh cookie exists, exchange it for an access token.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      // No session hint cookie → no httpOnly refresh cookie either; skip the
      // doomed request and become a guest without a console 401.
      if (!hasPersistedSession()) {
        setStatus('guest');
        return;
      }
      try {
        // Deduped: concurrent bootstraps (StrictMode) share one exchange —
        // the backend rotates the refresh cookie, so parallel calls would
        // 401 on the already-consumed token and wrongly demote to guest.
        const response = await refreshSession();
        if (cancelled) return;
        if (!response) throw new Error('no active session');
        applyToken(response.accessToken);
        setUser(response.user);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        setAccessToken(null);
        setStatus('guest');
      }
    }
    void bootstrap();
    const unsubscribe = onAuthChange(() => {
      // Access token was cleared (e.g. refresh failed); treat as guest.
      // The token state lives in client.ts — this hook keeps user in sync.
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyToken]);

  const signIn = useCallback(
    async (input: { phone: string; password: string }): Promise<PublicUser | MfaChallenge> => {
      const response = await authApi.login(input);
      if ('mfaRequired' in response) return response;
      applyToken(response.accessToken);
      markSessionActive();
      setUser(response.user);
      setStatus('authenticated');
      return response.user;
    },
    [applyToken],
  );

  const completeMfa = useCallback(
    async (input: { challengeToken: string; code: string }) => {
      const response = await controlApi.loginMfa(input);
      applyToken(response.accessToken);
      markSessionActive();
      setUser(response.user);
      setStatus('authenticated');
      return response.user;
    },
    [applyToken],
  );

  const beginImpersonation = useCallback(
    async (started: ImpersonationStart) => {
      if (!user) return;
      const previous = { token: getAccessToken(), user };
      setImpersonating(true);
      applyToken(started.accessToken);
      try {
        const target = await meApi.get();
        setAdminSession(previous);
        setUser(target);
      } catch (error) {
        // Could not enter the session: stay the admin.
        setImpersonating(false);
        setAccessToken(previous.token);
        throw error;
      }
    },
    [applyToken, user],
  );

  const endImpersonation = useCallback(async () => {
    const previous = adminSession;
    try {
      await controlApi.leaveImpersonation();
    } catch {
      // Already ended or expired server-side: restoring the admin session is still correct.
    }
    setImpersonating(false);
    if (previous) {
      setAccessToken(previous.token);
      setUser(previous.user);
    }
    setAdminSession(null);
  }, [adminSession]);

  const signUp = useCallback(
    async (input: {
      email?: string;
      password: string;
      username: string;
      fullName?: string;
      phone: string;
      acceptTerms: boolean;
      termsVersion?: string;
    }) => {
      // Preferred locale travels with the registration so the very first
      // transactional email (verification code) is already localized.
      const response = await authApi.register({ ...input, locale: getLocale() });
      applyToken(response.accessToken);
      markSessionActive();
      setUser(response.user);
      setStatus('authenticated');
      return response.user;
    },
    [applyToken],
  );

  const signOut = useCallback(async () => {
    // Signing out while impersonating means signing the ADMIN out: leave the
    // impersonation first (the impersonation token may not call /auth/*).
    if (adminSession) {
      try {
        await controlApi.leaveImpersonation();
      } catch {
        // already ended
      }
      setImpersonating(false);
      setAccessToken(adminSession.token);
      setAdminSession(null);
    }
    try {
      await authApi.logout();
      clearSessionHint();
    } catch {
      // Session already gone; clear locally regardless.
    }
    setAccessToken(null);
    setUser(null);
    setStatus('guest');
  }, [adminSession]);

  const signOutEverywhere = useCallback(async () => {
    // Unlike a plain sign-out we do NOT swallow a failure: if the server did
    // not confirm the revocation the user must not be told other devices were
    // signed out. The caller shows the error; local state is left untouched.
    await authApi.logoutAll();
    clearSessionHint();
    setAccessToken(null);
    setUser(null);
    setStatus('guest');
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await meApi.get();
      setUser(fresh);
    } catch {
      // token expired mid-flight; leave existing user in place
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated' && user !== null,
      isAdmin: user?.role === 'admin',
      isCreator: user?.role === 'creator' || user?.role === 'admin',
      signIn,
      completeMfa,
      isImpersonating: adminSession !== null,
      beginImpersonation,
      endImpersonation,
      signUp,
      signOut,
      signOutEverywhere,
      setUser,
      refreshUser,
    }),
    [
      status,
      user,
      signIn,
      completeMfa,
      adminSession,
      beginImpersonation,
      endImpersonation,
      signUp,
      signOut,
      signOutEverywhere,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
