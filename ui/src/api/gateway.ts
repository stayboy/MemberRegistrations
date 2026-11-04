import type { Officer, SessionCredential } from '../auth/session';
import { ApiError, toApiError } from './errors';

interface RawOfficer {
  id: string;
  name: string;
  email: string;
  actorId: string;
}

interface ExchangeResponse {
  sessionToken: string;
  expiresAt: string;
  officer: RawOfficer;
}

interface MeResponse {
  officerId: string;
  name: string;
  email: string;
  actorId: string;
  expiresAt: string;
}

export interface ExchangeResult {
  readonly session: SessionCredential;
  readonly officer: Officer;
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly sessionToken?: string;
  readonly signal?: AbortSignal;
  /** Extra request headers, such as `If-Match` for a versioned update. */
  readonly headers?: Record<string, string>;
}

export interface GatewayResult<T> {
  readonly data: T | null;
  readonly headers: Headers;
}

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

/**
 * One request helper for the gateway. Only the short-lived session credential is
 * sent, as `Authorization: Bearer`. `X-Actor-Id` is never sent: the gateway
 * derives it from the session (FR-16).
 *
 * `gatewayRequestWithMeta` keeps the response headers so callers can read
 * `ETag` and `Location`; `gatewayRequest` is the plain-data wrapper.
 */
export async function gatewayRequestWithMeta<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<GatewayResult<T>> {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (options.sessionToken) headers.Authorization = `Bearer ${options.sessionToken}`;
  if (options.headers) Object.assign(headers, options.headers);

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: 'no-store',
    credentials: 'omit',
  });

  if (!response.ok) throw await toApiError(response);
  const data = response.status === 204 ? null : ((await response.json()) as T);
  return { data, headers: response.headers };
}

export async function gatewayRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  const { data } = await gatewayRequestWithMeta<T>(baseUrl, path, options);
  return data;
}

export async function probeGateway(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Accept: 'application/json' },
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) throw await toApiError(response);
  return true;
}

/** Always 202 for a known, unknown, inactive or rate-limited address (FR-14). */
export async function requestMagicLink(
  baseUrl: string,
  email: string,
  signal?: AbortSignal,
): Promise<void> {
  await gatewayRequest(baseUrl, '/auth/magic-link', {
    method: 'POST',
    body: { email },
    signal,
  });
}

export async function exchangeMagicToken(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<ExchangeResult> {
  const result = await gatewayRequest<ExchangeResponse>(baseUrl, '/auth/exchange', {
    method: 'POST',
    body: { token },
    signal,
  });
  if (!result) throw new ApiError(500, 'The sign-in response was empty.');

  return {
    session: { token: result.sessionToken, expiresAt: result.expiresAt },
    officer: {
      id: result.officer.id,
      name: result.officer.name,
      email: result.officer.email,
      actorId: result.officer.actorId,
    },
  };
}

export async function fetchMe(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<Officer> {
  const result = await gatewayRequest<MeResponse>(baseUrl, '/auth/me', {
    sessionToken,
    signal,
  });
  if (!result) throw new ApiError(500, 'The session response was empty.');

  return {
    id: result.officerId,
    name: result.name,
    email: result.email,
    actorId: result.actorId,
  };
}

export async function logoutSession(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await gatewayRequest(baseUrl, '/auth/logout', {
    method: 'POST',
    sessionToken,
    signal,
  });
}
