import pino from 'pino';
import { loadEnv } from './config/env.js';
import { migrate } from './db/migrate.js';
import { createPgDb } from './db/pg.js';
import type { Db } from './db/sql.js';
import { createPgBossQueue, type QueueConnection } from './queue/pgboss.js';
import { enqueueProbe, probeEnqueueEnabled, registerProbeHandlers } from './queue/probe.js';
import { createNotificationSenders } from './messaging/notification-sender.js';
import { EventRepository } from './repos/events.js';
import {
  registerNotificationHandlers,
  runMaintenance,
  runNotificationTick,
} from './queue/handlers.js';

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

  // Only the worker builds real senders (N-8); the API never holds one.
  const senders = createNotificationSenders({
    NODE_ENV: env.NODE_ENV,
    RESEND_API_KEY: env.RESEND_API_KEY,
    MAGIC_LINK_FROM: env.MAGIC_LINK_FROM,
    NOTIFICATIONS_EMAIL_FROM: env.NOTIFICATIONS_EMAIL_FROM,
    WHATSAPP_SEND_URL: env.WHATSAPP_SEND_URL,
    SMS_SEND_URL: env.SMS_SEND_URL,
    MESSAGE_SEND_TOKEN: env.MESSAGE_SEND_TOKEN,
  });
  const events = new EventRepository(db);
  registerNotificationHandlers(queue, { db, queue, senders, events });

  await queue.start();

  // Local Compose polls continuously (`0`); a hosted deployment sets `15`.
  // The cadence is deploy-time, so the loop reads it once.
  const tickMs =
    env.NOTIFICATION_TRIGGER_MINUTES === 0 ? 1000 : env.NOTIFICATION_TRIGGER_MINUTES * 60_000;
  const tick = setInterval(() => {
    void runNotificationTick(db, queue).catch((error: Error) =>
      log.error(`worker: notification tick failed: ${error.message}`),
    );
  }, tickMs);
  tick.unref();

  const maintenance = setInterval(
    () => {
      void runMaintenance({ db, queue, events }).catch((error: Error) =>
        log.error(`worker: notification maintenance failed: ${error.message}`),
      );
    },
    24 * 60 * 60 * 1000,
  );
  maintenance.unref();

  if (probeEnqueueEnabled()) {
    const id = await enqueueProbe(queue);
    log.info(id ? `probe: enqueued ${id}` : 'probe: a job already holds the probe key');
  }

  let stopping = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(tick);
    clearInterval(maintenance);
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
