import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgDb } from '../../src/db/pg.js';
import { createPglite, type PgliteHandle } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { createPgBossQueue } from '../../src/queue/pgboss.js';
import type { Queue } from '../../src/queue/port.js';
import { createScratchDatabase } from '../helpers/scratch-db.js';

/**
 * AC-2 of the round: the port enqueues, claims and completes on both drivers.
 * The PGlite block always runs; the pooled `pg` block runs when
 * `TEST_DATABASE_URL` names a scratch server, which is how CI's `verify` job
 * proves the second backend (AGENTS 12).
 *
 * Retries are immediate here so the dead-letter test does not wait out the
 * production backoff; polling is the documented 500ms floor.
 */
const TEST_RETRY = { delaySeconds: 0, backoff: false };
const TEST_POLLING_SECONDS = 0.5;

type Payload = { value: number };

async function waitFor<T>(
  read: () => Promise<T | undefined | null>,
  what: string,
  timeoutMs = 12_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined && value !== null) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function jobState(db: Db, id: string): Promise<string | undefined> {
  const [row] = await db.query<{ state: string }>('select state from pgboss.job where id = $1', [
    id,
  ]);
  return row?.state;
}

function queueContract(
  deps: () => {
    db: Db;
    queue: Queue;
    completed: Array<{ id: string; payload: Payload }>;
  },
): () => Promise<void> {
  return async () => {
    const { db, queue, completed } = deps();
    const id = await queue.enqueue('test-work', { value: 42 }, { singletonKey: 'first' });
    expect(id).toEqual(expect.any(String));

    const state = await waitFor(async () => {
      const value = await jobState(db, id!);
      return value === 'completed' ? value : undefined;
    }, 'the job to complete');
    expect(state).toBe('completed');
    expect(completed.find((entry) => entry.id === id)?.payload).toEqual({ value: 42 });

    // A singleton key holds one live job: the second send is a no-op, and the
    // startAfter instant is stored rather than ignored.
    const startAfter = new Date(Date.now() + 60_000);
    const first = await queue.enqueue(
      'test-work',
      { value: 7 },
      { singletonKey: 'unit', startAfter },
    );
    const second = await queue.enqueue(
      'test-work',
      { value: 7 },
      { singletonKey: 'unit', startAfter },
    );
    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();

    const [held] = await db.query<{ state: string; data: Payload; deferred: boolean }>(
      `select state, data, start_after > now() as deferred
         from pgboss.job where id = $1`,
      [first],
    );
    expect(held?.state).toBe('created');
    expect(held?.data).toEqual({ value: 7 });
    expect(held?.deferred).toBe(true);
  };
}

describe('queue port on PGlite', () => {
  let handle: PgliteHandle;
  let queue: Queue;
  const completed: Array<{ id: string; payload: Payload }> = [];

  beforeAll(async () => {
    handle = await createPglite();
    await migrate(handle.db);
    queue = createPgBossQueue({
      db: handle.db,
      connection: { driver: 'pglite', engine: handle.engine },
      retry: TEST_RETRY,
      pollingIntervalSeconds: TEST_POLLING_SECONDS,
    });
    queue.work<Payload>('test-work', async (job) => {
      completed.push({ id: job.id, payload: job.payload });
    });
    await queue.start();
  });

  afterAll(async () => {
    await queue?.stop();
    await handle?.db.close();
  });

  it(
    'enqueues, claims and completes a job',
    queueContract(() => ({ db: handle.db, queue, completed })),
  );
});

/**
 * The same contract against the pooled `pg` driver. `TEST_DATABASE_URL` must
 * name a scratch server that allows creating databases; the block migrates a
 * database of its own and drops it afterwards.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('queue port on the pooled pg driver', () => {
  let db: Db;
  let queue: Queue;
  let drop: () => Promise<void>;
  const completed: Array<{ id: string; payload: Payload }> = [];

  beforeAll(async () => {
    const scratch = await createScratchDatabase(testDatabaseUrl!);
    drop = scratch.drop;
    db = createPgDb(scratch.connectionString);
    await migrate(db);
    queue = createPgBossQueue({
      db,
      connection: { driver: 'pg', connectionString: scratch.connectionString },
      retry: TEST_RETRY,
      pollingIntervalSeconds: TEST_POLLING_SECONDS,
    });
    queue.work<Payload>('test-work', async (job) => {
      completed.push({ id: job.id, payload: job.payload });
    });
    await queue.start();
  });

  afterAll(async () => {
    await queue?.stop();
    await db?.close();
    await drop?.();
  });

  it(
    'enqueues, claims and completes a job',
    queueContract(() => ({ db, queue, completed })),
  );
});
