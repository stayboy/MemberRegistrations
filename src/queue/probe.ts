import type { Queue } from './port.js';

/**
 * The probe (round doc grill 3 and decision 4).
 *
 * Two kinds on the queue, and neither is a notification: a writing job that
 * proves a round trip, and a job that always fails so the retry ladder and the
 * dead-letter queue stay exercised. Both handlers are registered on every
 * boot: a stray writing probe drains, and a stray failing one walks the ladder
 * and dead-letters, which is the ladder working rather than a job left sitting.
 *
 * The writing probe is only enqueued when `PGBOSS_PROBE` is set, and never in
 * production: a deployed worker must not create work nobody asked for.
 */
export const PROBE_KIND = '_probe';
export const PROBE_FAILING_KIND = '_probe.fail';

/** The singleton key keeps a restart from piling probe jobs up. */
const PROBE_SINGLETON_KEY = 'probe';

export type ProbeLog = (line: string) => void;

export function probeEnqueueEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  const flag = (env.PGBOSS_PROBE ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

export function registerProbeHandlers(queue: Queue, log: ProbeLog): void {
  queue.work<{ enqueuedAt?: string }>(PROBE_KIND, async (job) => {
    log(`probe: drained ${job.id}`);
  });

  queue.work(PROBE_FAILING_KIND, async (job) => {
    throw new Error(`probe: deliberate failure ${job.id}`);
  });
}

/** Enqueues one writing probe job; `null` means the singleton key held. */
export function enqueueProbe(queue: Queue): Promise<string | null> {
  return queue.enqueue(
    PROBE_KIND,
    { enqueuedAt: new Date().toISOString() },
    { singletonKey: PROBE_SINGLETON_KEY },
  );
}
