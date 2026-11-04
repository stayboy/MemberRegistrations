export const SESSION_STORAGE_KEY = 'mr.session.v1';
export const GATEWAY_STORAGE_KEY = 'mr.gateway.v1';
export const DEFAULT_GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL?.trim() || 'https://member-registrations-mind-logs.vercel.app';

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
 * Normalises a gateway base URL: trims, strips trailing slashes, and requires
 * https (http is allowed only for a loopback host). Returns null when invalid so
 * the form can show an inline error without saving it (FR-13).
 */
export function normalizeGatewayUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.username || url.password || url.search || url.hash) return null;

  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function readStoredGatewayUrl(): string {
  const storage = localStorageOrNull();
  if (!storage) return DEFAULT_GATEWAY_URL;
  try {
    return normalizeGatewayUrl(storage.getItem(GATEWAY_STORAGE_KEY) ?? '') ?? DEFAULT_GATEWAY_URL;
  } catch {
    return DEFAULT_GATEWAY_URL;
  }
}

export function writeStoredGatewayUrl(url: string): void {
  try {
    localStorageOrNull()?.setItem(GATEWAY_STORAGE_KEY, url);
  } catch {
    // Prefilling the next visit is a convenience, not a requirement.
  }
}
