/**
 * The one place the gateway origin is decided.
 *
 * `vite.config.ts` calls this at build time (so a bad value fails the build and
 * the CSP is generated from the same result) and `session.ts` calls it again for
 * the running bundle. Both read `VITE_GATEWAY_URL`, so no default is duplicated
 * between the config and the app (FR-13).
 */

/** Development default: the local API from `npm run dev` / the Docker stack. */
export const DEV_GATEWAY_URL = 'http://localhost:3000';

export class GatewayOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayOriginError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Resolves `VITE_GATEWAY_URL` to an origin, or throws.
 *
 * Rules (FR-13, EC-14): trimmed; no credentials; no query, fragment or path
 * prefix; `https://` only, except an `http://` loopback host in a non-production
 * build; a trailing slash is stripped by `URL.origin`. A missing value is the
 * development default outside production and a hard error inside it.
 */
export function resolveGatewayOrigin(raw: string | undefined, mode: string): string {
  const production = mode === 'production';
  const value = raw?.trim() ?? '';

  if (!value) {
    if (!production) return DEV_GATEWAY_URL;
    throw new GatewayOriginError(
      'VITE_GATEWAY_URL is required for a production build: set the gateway origin the UI may contact.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayOriginError(`VITE_GATEWAY_URL is not a URL: ${value}`);
  }

  if (url.username || url.password) {
    throw new GatewayOriginError('VITE_GATEWAY_URL must not carry credentials.');
  }
  if (url.search || url.hash) {
    throw new GatewayOriginError('VITE_GATEWAY_URL must not carry a query or a fragment.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new GatewayOriginError('VITE_GATEWAY_URL must be an origin, not a path.');
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol === 'http:') {
    if (production) {
      throw new GatewayOriginError('VITE_GATEWAY_URL must use https:// in a production build.');
    }
    if (!loopback) {
      throw new GatewayOriginError('VITE_GATEWAY_URL may use http:// only for a loopback host.');
    }
  } else if (url.protocol !== 'https:') {
    throw new GatewayOriginError('VITE_GATEWAY_URL must use https://.');
  }

  return url.origin;
}
