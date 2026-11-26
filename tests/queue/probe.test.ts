import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPglite, type PgliteHandle } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import { createPgBossQueue } from '../../src/queue/pgboss.js';
import type { Queue } from '../../src/queue/port.js';
import { PROBE_KIND, probeEnqueueEnabled, registerProbeHandlers } from '../../src/queue/probe.js';

/**
 * Round doc decision 4: the probe enqueues only when `PGBOSS_PROBE` is set,
 * and never in production, while its handler is registered unconditionally so
 * a stray job drains instead of dead-lettering.
 */
describe('probe gating', () => {
  it('never enqueues in production, even with the flag set', () => {
    expect(probeEnqueueEnabled({ NODE_ENV: 'production', PGBOSS_PROBE: '1' })).toBe(false);
    expect(probeEnqueueEnabled({ NODE_ENV: 'production', PGBOSS_PROBE: 'true' })).toBe(false);
  });

  it('enqueues only when PGBOSS_PROBE is set outside production', () => {
    expect(probeEnqueueEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(probeEnqueueEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(probeEnqueueEnabled({ NODE_ENV: 'development', PGBOSS_PROBE: 'no' })).toBe(false);
    expect(probeEnqueueEnabled({ NODE_ENV: 'development', PGBOSS_PROBE: '1' })).toBe(true);
    expect(probeEnqueueEnabled({ NODE_ENV: 'test', PGBOSS_PROBE: 'true' })).toBe(true);
  });
});

describe('probe handlers', () => {
  let handle: PgliteHandle;
  let queue: Queue;
  const lines: string[] = [];

  beforeAll(async () => {
    handle = await createPglite();
    await migrate(handle.db);
    queue = createPgBossQueue({
      db: handle.db,
      connection: { driver: 'pglite', engine: handle.engine },
      retry: { limit: 5, delaySeconds: 0, backoff: false },
      pollingIntervalSeconds: 0.5,
    });
    registerProbeHandlers(queue, (line) => lines.push(line));
    await queue.start();
  });

  afterAll(async () => {
    await queue?.stop();
    await handle?.db.close();
  });

  it('drains a stray probe job even when the flag is unset', async () => {
    expect(probeEnqueueEnabled({ NODE_ENV: 'production' })).toBe(false);

    const id = await queue.enqueue(PROBE_KIND, { enqueuedAt: new Date().toISOString() });
    expect(id).toEqual(expect.any(String));

    const deadline = Date.now() + 12_000;
    while (!lines.some((line) => line === `probe: drained ${id}`)) {
      if (Date.now() > deadline) throw new Error('the stray probe job did not drain');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
});
