import { PgBoss, fromPglite, type PGliteLike, type QueuePolicy } from 'pg-boss';
import { PGBOSS_PACKAGE_VERSION, PGBOSS_SCHEMA_VERSION } from '../db/pgboss-schema.js';
import type { Db } from '../db/sql.js';
import type { EnqueueOptions, JobHandler, Queue, QueueJob } from './port.js';

/** pg-boss owns this schema; it is the documented exception to the ORM mirror (AGENTS 12). */
export const PGBOSS_SCHEMA = 'pgboss';

/**
 * Where pg-boss itself connects. The engine is passed for PGlite so the queue
 * runs in the *same* embedded database as the repositories, not a second one.
 */
export type QueueConnection =
  { driver: 'pglite'; engine: PGliteLike } | { driver: 'pg'; connectionString: string };

export interface QueueRetryPolicy {
  /**
   * Retries after the first attempt, pg-boss's own vocabulary. The default of
   * 4 is FR-21's "at most 5 attempts": the initial run plus four retries.
   */
  limit?: number;
  /** Base delay in seconds. */
  delaySeconds?: number;
  /** Exponential backoff between retries. */
  backoff?: boolean;
}

export interface PgBossQueueOptions {
  /**
   * The register's own handle. Used for the schema-version boot check, and so
   * a test can read the queue's rows without a second connection.
   */
  db: Db;
  connection: QueueConnection;
  retry?: QueueRetryPolicy;
  /**
   * pg-boss queue policy. `exclusive` (the default) holds at most one live job
   * per singleton key, which is the spec's "one job per unit" (N-8). A keyless
   * job is that queue's single unnamed unit, so a kind whose work is not
   * keyed should use `standard`, which allows any number of live jobs.
   */
  policy?: QueuePolicy;
  /**
   * Per-kind override of `policy`. A keyless kind and a keyed kind cannot share
   * one policy in the same worker — `exclusive` would collapse every keyless
   * job onto a single unnamed unit — so the choice is made here rather than for
   * the whole adapter. The port stays free of the vocabulary.
   */
  policyByKind?: Record<string, QueuePolicy>;
  /** Jobs of one kind a single worker process runs at once (spec: 5 per channel). */
  concurrency?: number;
  pollingIntervalSeconds?: number;
  /** Receives lifecycle lines; the worker wires it to its logger. */
  log?: (line: string) => void;
}

const DEFAULT_RETRY: Required<QueueRetryPolicy> = {
  // pg-boss counts retries after the first attempt, so 4 is five attempts.
  limit: 4,
  delaySeconds: 30,
  backoff: true,
};

/** The dead-letter queue for a kind. Readable as any other pg-boss queue. */
export function deadLetterFor(kind: string): string {
  return `${kind}.dead-letter`;
}

/**
 * The boot check (round doc decision 3). pg-boss's own assertion when
 * `migrate: false` finds the wrong version does not say what to do about a
 * vendored DDL file, so this runs first and names the expected version, the
 * generator and the file to commit.
 */
function schemaMismatch(found: string): string {
  return (
    `pg-boss schema check failed: expected pgboss schema version ${PGBOSS_SCHEMA_VERSION} ` +
    `(pg-boss ${PGBOSS_PACKAGE_VERSION}), found ${found}. Regenerate the vendored DDL with ` +
    '`node scripts/pgboss-schema.mjs`, commit `src/db/pgboss-schema.ts`, then run `npm run db:migrate`.'
  );
}

/**
 * The pg-boss adapter.
 *
 * `migrate: false` always: the tracked runner applied `0031_pgboss_schema`, so
 * a start that finds a different version is a deployment defect, not something
 * the library may repair. The retry ladder, the dead-letter queue and the
 * concurrency live here rather than in the port, because they are pg-boss's
 * vocabulary and the domain must not learn it.
 */
export function createPgBossQueue(options: PgBossQueueOptions): Queue {
  const retry = { ...DEFAULT_RETRY, ...options.retry };
  const concurrency = options.concurrency ?? 5;
  const pollingIntervalSeconds = options.pollingIntervalSeconds ?? 2;
  const log = options.log ?? (() => {});

  const handlers = new Map<string, JobHandler>();
  let boss: PgBoss | undefined;
  let started = false;

  function instance(): PgBoss {
    if (options.connection.driver === 'pglite') {
      return new PgBoss({
        db: fromPglite(options.connection.engine),
        backend: 'pglite',
        schema: PGBOSS_SCHEMA,
        migrate: false,
      });
    }
    return new PgBoss({
      connectionString: options.connection.connectionString,
      backend: 'postgres',
      schema: PGBOSS_SCHEMA,
      migrate: false,
    });
  }

  async function assertSchemaVersion(): Promise<void> {
    let rows: Array<{ version: number | string }>;
    try {
      rows = await options.db.query<{ version: number | string }>(
        `select version from ${PGBOSS_SCHEMA}.version order by version desc limit 1`,
      );
    } catch (error) {
      throw new Error(
        schemaMismatch(`no ${PGBOSS_SCHEMA}.version table (${(error as Error).message})`),
        { cause: error },
      );
    }
    const found = rows[0] ? Number(rows[0].version) : Number.NaN;
    if (found !== PGBOSS_SCHEMA_VERSION) {
      throw new Error(schemaMismatch(Number.isNaN(found) ? 'no row' : String(found)));
    }
  }

  async function register(instance: PgBoss, kind: string, handler: JobHandler): Promise<void> {
    const deadLetter = deadLetterFor(kind);
    // The policy is per kind: a keyless kind must not inherit `exclusive`, which
    // would collapse every keyless job onto the queue's single unnamed unit.
    const policy: QueuePolicy = options.policyByKind?.[kind] ?? options.policy ?? 'exclusive';
    // The dead letter must exist before the queue that references it; a failed
    // job there is terminal and is only read, never worked.
    await instance.createQueue(deadLetter, { retryLimit: 0 });
    await instance.createQueue(kind, {
      policy,
      retryLimit: retry.limit,
      retryDelay: retry.delaySeconds,
      retryBackoff: retry.backoff,
      deadLetter,
    });
    await instance.work(
      kind,
      { batchSize: 1, localConcurrency: concurrency, pollingIntervalSeconds },
      async (jobs) => {
        for (const job of jobs) {
          const queued: QueueJob = { id: job.id, kind, payload: job.data };
          await handler(queued);
        }
      },
    );
  }

  return {
    work<T = unknown>(kind: string, handler: JobHandler<T>): void {
      if (started) throw new Error('queue.work() must be called before queue.start()');
      handlers.set(kind, handler as JobHandler);
    },

    async enqueue(kind: string, payload: unknown, enqueueOptions: EnqueueOptions = {}) {
      if (!boss) throw new Error(`queue.enqueue(${kind}) was called before queue.start()`);
      const sendOptions: { singletonKey?: string; startAfter?: Date } = {};
      if (enqueueOptions.singletonKey !== undefined) {
        sendOptions.singletonKey = enqueueOptions.singletonKey;
      }
      if (enqueueOptions.startAfter !== undefined) {
        sendOptions.startAfter = enqueueOptions.startAfter;
      }
      const data = payload === undefined ? null : (payload as object | null);
      return boss.send(kind, data, sendOptions);
    },

    async start(): Promise<void> {
      if (started) return;

      await assertSchemaVersion();

      const fresh = instance();
      try {
        await fresh.start();
        for (const [kind, handler] of handlers) {
          await register(fresh, kind, handler);
        }
      } catch (error) {
        await fresh.stop({ graceful: false }).catch(() => {});
        throw error;
      }
      boss = fresh;
      started = true;
      log(`queue: started ${handlers.size} handler(s) on pg-boss ${PGBOSS_PACKAGE_VERSION}`);
    },

    async stop(): Promise<void> {
      const current = boss;
      boss = undefined;
      started = false;
      if (!current) return;
      await current.stop({ graceful: true, timeout: 5000 });
      log('queue: stopped');
    },
  };
}
