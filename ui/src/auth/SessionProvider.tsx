import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { exchangeMagicToken, fetchMe, logoutSession } from '../api/gateway';
import { isUnauthorized } from '../api/errors';
import {
  clearSession,
  GATEWAY_URL,
  isSessionUsable,
  readSession,
  writeSession,
  type Officer,
  type SessionCredential,
} from './session';

export type SessionStatus = 'checking' | 'signed-out' | 'signed-in';

interface SessionContextValue {
  readonly status: SessionStatus;
  readonly officer: Officer | null;
  readonly session: SessionCredential | null;
  /** The build-time gateway origin; the connect form cannot change it. */
  readonly baseUrl: string;
  /** True when a saved session was rejected, so the gate can explain why. */
  readonly expired: boolean;
  signIn(token: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [initial] = useState<{ session: SessionCredential | null; expired: boolean }>(() => {
    const stored = readSession();
    const usable = isSessionUsable(stored) ? stored : null;
    return { session: usable, expired: stored !== null && usable === null };
  });
  const initialSession = initial.session;
  const [status, setStatus] = useState<SessionStatus>(initialSession ? 'checking' : 'signed-out');
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [session, setSession] = useState<SessionCredential | null>(initialSession);
  const [expired, setExpired] = useState(initial.expired);
  const baseUrl = GATEWAY_URL;

  // Restore the tab credential and verify it with the gateway before rendering
  // protected content. A network failure keeps the shell usable (FR-10); only a
  // 401/403 clears the credential and returns to the gate (FR-17).
  useEffect(() => {
    if (!initialSession) {
      clearSession();
      return;
    }

    const controller = new AbortController();

    fetchMe(GATEWAY_URL, initialSession.token, controller.signal)
      .then((verified) => {
        if (controller.signal.aborted) return;
        setOfficer(verified);
        setStatus('signed-in');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(error)) {
          clearSession();
          setSession(null);
          setExpired(true);
          setStatus('signed-out');
          return;
        }
        setStatus('signed-in');
      });

    return () => controller.abort();
  }, [initialSession]);

  const signIn = useCallback(async (token: string) => {
    const result = await exchangeMagicToken(GATEWAY_URL, token);
    writeSession(result.session);
    setSession(result.session);
    setOfficer(result.officer);
    setExpired(false);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    const token = session?.token;
    if (token) {
      try {
        await logoutSession(GATEWAY_URL, token, AbortSignal.timeout(5000));
      } catch {
        // A failed revoke must not trap the operator in a signed-in shell; the
        // credential is short-lived and is removed locally below.
      }
    }

    clearSession();
    queryClient.clear();
    setSession(null);
    setOfficer(null);
    setExpired(false);
    setStatus('signed-out');
  }, [queryClient, session?.token]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      officer,
      session,
      baseUrl,
      expired,
      signIn,
      signOut,
    }),
    [status, officer, session, baseUrl, expired, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider.');
  }
  return context;
}
