import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import type { NotificationDeliveryRepository } from '../repos/notification-deliveries.js';

const deliveryIdSchema = z.string().uuid();

/**
 * The audited retry (N-8, FR-45; AC-47). Only a `failed` delivery is accepted;
 * the actor and time are recorded in `notification_preference_events`.
 */
export function notificationDeliveriesRouter(repo: NotificationDeliveryRepository): Router {
  const router = Router();

  router.post('/:id/retry', async (req, res) => {
    const id = deliveryIdSchema.parse(req.params.id);
    const now = new Date();
    const delivery = await repo.retry(id, actorOf(req), now);
    res.setHeader('Cache-Control', 'no-store');
    res.json(delivery);
  });

  return router;
}
