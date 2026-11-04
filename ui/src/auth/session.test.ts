import { describe, expect, it } from 'vitest';
import { isSessionUsable, normalizeGatewayUrl, parseSession } from './session';

describe('normalizeGatewayUrl', () => {
  it('trims and removes trailing slashes', () => {
    expect(normalizeGatewayUrl('  https://example.vercel.app/  ')).toBe(
      'https://example.vercel.app',
    );
    expect(normalizeGatewayUrl('https://example.vercel.app/base//')).toBe(
      'https://example.vercel.app/base',
    );
  });

  it('keeps the path but drops nothing else', () => {
    expect(normalizeGatewayUrl('https://example.vercel.app/api')).toBe(
      'https://example.vercel.app/api',
    );
  });

  it('allows http only for loopback', () => {
    expect(normalizeGatewayUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeGatewayUrl('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    expect(normalizeGatewayUrl('http://example.com')).toBeNull();
  });

  it('rejects empty, relative, credentialed and query-bearing input', () => {
    expect(normalizeGatewayUrl('')).toBeNull();
    expect(normalizeGatewayUrl('example.com')).toBeNull();
    expect(normalizeGatewayUrl('https://user:pass@example.com')).toBeNull();
    expect(normalizeGatewayUrl('https://example.com?token=1')).toBeNull();
    expect(normalizeGatewayUrl('https://example.com#x')).toBeNull();
  });
});

describe('session credential', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');

  it('treats only an unexpired, well-formed credential as usable', () => {
    expect(
      isSessionUsable({ token: 'session-token-value', expiresAt: '2026-11-04T13:00:00.000Z' }, now),
    ).toBe(true);
    expect(
      isSessionUsable({ token: 'session-token-value', expiresAt: '2026-11-04T11:00:00.000Z' }, now),
    ).toBe(false);
    expect(isSessionUsable(null, now)).toBe(false);
  });

  it('parses only token and expiry and ignores extra keys', () => {
    expect(
      parseSession(
        '{"token":"session-token-value","expiresAt":"2026-11-04T13:00:00.000Z","bearer":"no"}',
      ),
    ).toEqual({
      token: 'session-token-value',
      expiresAt: '2026-11-04T13:00:00.000Z',
    });
  });

  it('rejects malformed JSON and missing fields', () => {
    expect(parseSession('{')).toBeNull();
    expect(parseSession('{"token":"short"}')).toBeNull();
    expect(parseSession('{"token":"session-token-value","expiresAt":"not-a-date"}')).toBeNull();
  });
});
