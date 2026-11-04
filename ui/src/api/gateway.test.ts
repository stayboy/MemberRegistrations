import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { probeGateway } from './gateway';

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('probeGateway', () => {
  it('resolves true so the health query has data', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeGateway('https://gateway.example')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.example/health',
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
  });

  it('throws a problem-backed ApiError for a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ title: 'Unavailable', detail: 'Gateway is down.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await probeGateway('https://gateway.example').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).message).toBe('Gateway is down.');
  });
});
