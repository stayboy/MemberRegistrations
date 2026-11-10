import { describe, expect, it, vi, afterEach } from 'vitest';
import { clearLegacyGatewayUrl, isSessionUsable, parseSession } from './session';

describe('legacy gateway storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes the entry an earlier build stored and tolerates a blocked store', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { removeItem } });
    clearLegacyGatewayUrl();
    expect(removeItem).toHaveBeenCalledWith('mr.gateway.v1');

    vi.stubGlobal('window', {
      localStorage: {
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => clearLegacyGatewayUrl()).not.toThrow();
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
