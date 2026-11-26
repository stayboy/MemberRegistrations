import { Router } from 'express';
import { actorOf } from '../actor.js';
import { notificationDefaultsWriteSchema } from '../schemas/notifications.js';
import type { NotificationPlanRepository } from '../repos/notification-plans.js';

/**
 * The church defaults (N-12, FR-31): the standard slot template a new plan
 * copies, the church name, signature and reply-to, the SMS confirmation
 * threshold, the WhatsApp template names and the send-time policy's own
 * fields. The deployed trigger cadence is configuration, not a default, and is
 * reported read-only by the surface that shows it in R3+.
 */
export function notificationDefaultsRouter(repo: NotificationPlanRepository): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const defaults = await repo.defaults();
    res.setHeader('Cache-Control', 'no-store');
    res.json(defaults);
  });

  router.put('/', async (req, res) => {
    const input = notificationDefaultsWriteSchema.parse(req.body);
    const defaults = await repo.writeDefaults(input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(defaults);
  });

  return router;
}
