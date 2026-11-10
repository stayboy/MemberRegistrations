import { describe, expect, it } from 'vitest';
import { DEV_GATEWAY_URL, GatewayOriginError, resolveGatewayOrigin } from './gatewayOrigin';

const PRODUCTION = 'production';
const DEVELOPMENT = 'development';

describe('resolveGatewayOrigin', () => {
  it('normalises a production origin and strips a trailing slash', () => {
    expect(resolveGatewayOrigin('  https://example.vercel.app/  ', PRODUCTION)).toBe(
      'https://example.vercel.app',
    );
  });

  it('falls back to the dev default only outside a production build', () => {
    expect(resolveGatewayOrigin(undefined, DEVELOPMENT)).toBe(DEV_GATEWAY_URL);
    expect(resolveGatewayOrigin('   ', DEVELOPMENT)).toBe(DEV_GATEWAY_URL);
    expect(() => resolveGatewayOrigin(undefined, PRODUCTION)).toThrow(GatewayOriginError);
    expect(() => resolveGatewayOrigin('', PRODUCTION)).toThrow(/required for a production build/);
  });

  it('allows http only for a loopback host in a development build', () => {
    expect(resolveGatewayOrigin('http://localhost:3000', DEVELOPMENT)).toBe('http://localhost:3000');
    expect(resolveGatewayOrigin('http://127.0.0.1:3000/', DEVELOPMENT)).toBe('http://127.0.0.1:3000');
    expect(() => resolveGatewayOrigin('http://example.com', DEVELOPMENT)).toThrow(/loopback/);
    expect(() => resolveGatewayOrigin('http://localhost:3000', PRODUCTION)).toThrow(/https/);
  });

  it('rejects credentials, a path, a query, a fragment and a non-http protocol', () => {
    expect(() => resolveGatewayOrigin('https://user:pass@example.com', PRODUCTION)).toThrow(
      /credentials/,
    );
    expect(() => resolveGatewayOrigin('https://example.com/api', PRODUCTION)).toThrow(/path/);
    expect(() => resolveGatewayOrigin('https://example.com?token=1', PRODUCTION)).toThrow(/query/);
    expect(() => resolveGatewayOrigin('https://example.com#x', PRODUCTION)).toThrow(/fragment/);
    expect(() => resolveGatewayOrigin('ftp://example.com', PRODUCTION)).toThrow(/https/);
    expect(() => resolveGatewayOrigin('example.com', PRODUCTION)).toThrow(/not a URL/);
  });
});
