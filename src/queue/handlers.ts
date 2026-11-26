import type { Db } from '../db/sql.js';
import type { Queue } from './port.js';
import type { NotificationSenders } from '../messaging/notification-sender.js';
import type { EventRepository } from '../repos/events.js';
import { NotificationInstanceRepository } from '../repos/notification-instances.js';
import {
  deliverNotification,
  fanOutInstance,
  pendingDeliveries,
} from '../repos/notification-deliveries.js';

/**
 * The notification queue (N-2, N-8; FR-20, FR-42).
 *
 * Two handlers and one daily maintenance run. The tick is the crash repair:
 * publish enqueues, but a job that was lost between the materialisation and
 * the enqueue is swept here. `send_at <= now` is the due test, and the job's
 * `startAfter` is the resolved `delivery_at`, which only the policy wrote.
 */

export const NOTIFICATION_FANOUT_KIND = 'notification.fanout';
export const NOTIFICATION_SEND_KIND = 'notification.send';
export const NOTIFICATION_MAINTENANCE_KIND = 'notification.maintenance';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NotificationHandlers {
  db: Db;
  queue: Queue;
  senders: NotificationSenders;
  events: EventRepository;
}

export function registerNotificationHandlers(
  queue: Queue,
  dependencies: NotificationHandlers,
): void {
  queue.work<{ instanceId: string }>(NOTIFICATION_FANOUT_KIND, async (job) => {
    await fanOutInstance(dependencies.db, job.payload.instanceId, { queue });
  });

  queue.work<{ deliveryId: string }>(NOTIFICATION_SEND_KIND, async (job) => {
    await deliverNotification(dependencies.db, dependencies.senders, job.payload.deliveryId);
  });

  queue.work(NOTIFICATION_MAINTENANCE_KIND, async () => {
    await runMaintenance(dependencies, new Date());
  });
}

/**
 * The sweep: a scheduled instance whose resolved instant has passed, and a
 * pending delivery whose instance has fanned out, are enqueued with their
 * recorded `delivery_at` (never recomputed here).
 */
export async function runNotificationTick(
  db: Db,
  queue: Queue,
  now: Date = new Date(),
): Promise<number> {
  const instances = new NotificationInstanceRepository(db);
  let enqueued = 0;

  for (const instance of await instances.dueInstances(now)) {
    const id = await queue.enqueue(
      NOTIFICATION_FANOUT_KIND,
      { instanceId: instance.id },
      {
        singletonKey: `instance:${instance.id}`,
        startAfter: instance.deliveryAt ? new Date(instance.deliveryAt) : new Date(instance.sendAt),
      },
    );
    if (id) enqueued += 1;
  }

  for (const deliveryId of await pendingDeliveries(db, now)) {
    const id = await queue.enqueue(
      NOTIFICATION_SEND_KIND,
      { deliveryId },
      { singletonKey: `delivery:${deliveryId}` },
    );
    if (id) enqueued += 1;
  }

  return enqueued;
}

/**
 * The daily run (N-2, N-5, EC-2): one global occurrence generation, then
 * materialisation per published plan, then the expiry sweep and the
 * cancelled-occurrence reconciliation.
 */
export async function runMaintenance(
  dependencies: Pick<NotificationHandlers, 'db' | 'queue' | 'events'>,
  now: Date = new Date(),
): Promise<void> {
  const { db, events } = dependencies;
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 90 * DAY_MS).toISOString().slice(0, 10);

  const repository = new NotificationInstanceRepository(db, { queue: dependencies.queue });

  // `generate` takes no event id: one call expands every active recurring
  // event, which is why the maintenance job calls it once before materialising.
  await events.generate(from, to, 'system');
  await repository.materialisePublished(now);

  await db.query(
    `update member_channel_blocks
        set revoked_at = $1, revoked_by = 'system'
      where revoked_at is null and expires_at <= $1`,
    [now],
  );
  await db.query(
    `update notification_mutes
        set revoked_at = $1, revoked_by = 'system'
      where revoked_at is null and expires_at <= $1`,
    [now],
  );
  await db.query(
    `update notification_slot_instances i
        set status = 'cancelled', finished_at = $1
       from event_occurrences o
      where i.occurrence_id = o.id
        and o.status = 'cancelled'
        and i.status = 'scheduled'`,
    [now],
  );
}
