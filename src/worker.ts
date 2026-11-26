import pino from 'pino';
import { loadEnv } from './config/env.js';
import { migrate } from './db/migrate.js';
import { createPgDb } from './db/pg.js';
import type { Db } from './db/sql.js';
import { createPgBossQueue, type QueueConnection } from './queue/pgboss.js';
import { enqueueProbe, probeEnqueueEnabled, registerProbeHandlers } from './queue/probe.js';

/**
 * The long-lived worker (notification spec N-8, FR-20, FR-42).
 *
 * It starts the queue port, registers the probe handlers and drains on
 * `SIGTERM`. It mounts no route and serves no port: the local MVP is a Compose
 * service, and the hosted path later runs the same handlers inside a bounded
 * authenticated call. A start failure exits non-zero so a supervisor sees it.
 */
const STOP_BUDGET_MS = 10_000;

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });

async function main(): Promise<void> {
  let db: Db;
  let connection: QueueConnection;

  if (env.DATABASE_URL) {
    // The Compose `migrate` service owns the schema; the worker never migrates
    // a shared database on boot.
    db = createPgDb(env.DATABASE_URL);
    connection = { driver: 'pg', connectionString: env.DATABASE_URL };
  } else {
    // Zero-setup local run: the same embedded engine the API uses. Its data is
    // ephemeral, so this worker migrates it the way `src/index.ts` does.
    const { createPglite } = await import('./db/pglite.js');
    const handle = await createPglite();
    db = handle.db;
    connection = { driver: 'pglite', engine: handle.engine };
    await migrate(db);
  }

  const queue = createPgBossQueue({ db, connection, log: (line) => log.info(line) });
  registerProbeHandlers(queue, (line) => log.info(line));

  await queue.start();

  if (probeEnqueueEnabled()) {
    const id = await enqueueProbe(queue);
    log.info(id ? `probe: enqueued ${id}` : 'probe: a job already holds the probe key');
  }

  let stopping = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.info(`worker: ${signal} received; draining for up to ${STOP_BUDGET_MS}ms`);

    let timedOut = false;
    const budget = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, STOP_BUDGET_MS);
      timer.unref();
    });

    let stopFailed = false;
    await Promise.race([
      queue.stop().catch((error: Error) => {
        // A drain that threw is not a success: the supervisor must see it.
        stopFailed = true;
        log.error(`worker: queue stop failed: ${error.message}`);
      }),
      budget,
    ]);
    log.info(
      timedOut
        ? `worker: drain timed out after ${STOP_BUDGET_MS}ms; exiting`
        : stopFailed
          ? 'worker: drain failed; exiting non-zero'
          : 'worker: drained; exiting',
    );

    await db.close().catch((error: Error) => log.error(`worker: close failed: ${error.message}`));
    process.exit(timedOut || stopFailed ? 1 : 0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  log.info('worker: started');
}

main().catch((error: Error) => {
  log.error(`worker: failed to start: ${error.message}`);
  process.exit(1);
});
