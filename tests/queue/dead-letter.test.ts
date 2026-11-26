import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { createPglite, type PgliteHandle } from '../../src/db/pglite.js';
import { createPgBossQueue, deadLetterFor } from '../../src/queue/pgboss.js';
import type { Queue } from '../../src/queue/port.js';
import { PROBE_FAILING_KIND } from '../../src/queue/probe.js';

/**
 * AC-3 / FR-21: a job that always fails is attempted at most five times, then
 * dead-letters, and the dead letter is a readable row carrying the original
 * payload and the stored failure.
 *
 * Retries are immediate so the test does not wait out the production backoff;
 * the ladder itself (retryLimit 4, so five attempts) is the adapter's default and is what makes
 * the count five.
 */
const TEST_POLLING_SECONDS = 0.5;

async function waitFor<T>(
  read: () => Promise<T | undefined | null>,
  what: string,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined && value !== null) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('queue dead letters on PGlite', () => {
  let handle: PgliteHandle;
  let queue: Queue;
  const attempts: string[] = [];

  beforeAll(async () => {
    handle = await createPglite();
    await migrate(handle.db);
    queue = createPgBossQueue({
      db: handle.db,
      connection: { driver: 'pglite', engine: handle.engine },
      retry: { limit: 4, delaySeconds: 0, backoff: false },
      pollingIntervalSeconds: TEST_POLLING_SECONDS,
    });
    queue.work(PROBE_FAILING_KIND, async (job) => {
      attempts.push(job.id);
      throw new Error('provider_rejected');
    });
    await queue.start();
  });

  afterAll(async () => {
    await queue?.stop();
    await handle?.db.close();
  });

  it('runs five attempts, then moves the job to a readable dead letter', async () => {
    const id = await queue.enqueue(PROBE_FAILING_KIND, { note: 'always fails' });
    expect(id).toEqual(expect.any(String));

    const deadLetter = deadLetterFor(PROBE_FAILING_KIND);
    const row = await waitFor(async () => {
      const [found] = await handle.db.query<{
        name: string;
        state: string;
        source_name: string;
        source_id: string;
        data: { note: string };
        source_output: unknown;
      }>(
        `select name, state, source_name, source_id, data, source_output
             from pgboss.job where name = $1`,
        [deadLetter],
      );
      return found;
    }, 'the job to dead-letter');

    // Five handler runs, then the fifth failure is terminal.
    expect(attempts.filter((attempt) => attempt === id)).toHaveLength(5);
    expect(row.source_name).toBe(PROBE_FAILING_KIND);
    expect(row.source_id).toBe(id);
    expect(row.data).toEqual({ note: 'always fails' });
    expect(JSON.stringify(row.source_output)).toContain('provider_rejected');
  });
});
