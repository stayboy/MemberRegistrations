import { resolveGatewayOrigin } from './gatewayOrigin';

export const SESSION_STORAGE_KEY = 'mr.session.v1';

/** The storage key an earlier build used to remember a gateway origin. */
const LEGACY_GATEWAY_STORAGE_KEY = 'mr.gateway.v1';

/**
 * The gateway origin, resolved once at build time from `VITE_GATEWAY_URL` and
 * inlined into the bundle (FR-13). Nothing at runtime can change it; the CSP in
 * `index.html` is generated from the same value.
 */
export const GATEWAY_URL = resolveGatewayOrigin(
  import.meta.env.VITE_GATEWAY_URL,
  import.meta.env.MODE,
);

export interface SessionCredential {
  readonly token: string;
  readonly expiresAt: string;
}

export interface Officer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly actorId: string;
}

/**
 * Only a short-lived, revocable session credential is persisted, and only in
 * sessionStorage (FR-15). The API bearer never reaches this module.
 */
export function isSessionUsable(
  session: SessionCredential | null | undefined,
  now = Date.now(),
): session is SessionCredential {
  if (!session || !session.token) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function parseSession(raw: string | null): SessionCredential | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as { token?: unknown; expiresAt?: unknown };
    if (typeof candidate.token !== 'string' || candidate.token.length < 10) return null;
    if (typeof candidate.expiresAt !== 'string') return null;
    if (!Number.isFinite(Date.parse(candidate.expiresAt))) return null;
    return { token: candidate.token, expiresAt: candidate.expiresAt };
  } catch {
    return null;
  }
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSession(): SessionCredential | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  try {
    return parseSession(storage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeSession(session: SessionCredential): void {
  const storage = sessionStorageOrNull();
  if (!storage) {
    throw new Error('This browser blocks sessionStorage, so a session cannot be kept.');
  }
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  try {
    sessionStorageOrNull()?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

/**
 * Removes the `mr.gateway.v1` entry an earlier build wrote. It is never read, so
 * it cannot change the origin; deleting it keeps a stale value out of the
 * browser's storage (FR-13, AC-10a).
 */
export function clearLegacyGatewayUrl(): void {
  try {
    localStorageOrNull()?.removeItem(LEGACY_GATEWAY_STORAGE_KEY);
  } catch {
    // A browser that blocks localStorage has nothing to clear.
  }
}
