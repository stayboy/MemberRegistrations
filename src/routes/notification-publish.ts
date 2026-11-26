import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import {
  notificationChangeInputSchema,
  notificationPublishInputSchema,
} from '../schemas/notifications.js';
import type { NotificationInstanceRepository } from '../repos/notification-instances.js';

const eventIdSchema = z.string().uuid();

/**
 * Publish, cancel and the change notice (N-1, N-3, FR-17, FR-18, FR-19).
 *
 * Publishing pins the draft's content ETag and materialises instances.
 * Cancelling stops future instances and leaves created messages and sent
 * deliveries. A change notice is its own row and its own instance; it touches
 * no slot and no future instance.
 */
export function notificationPublishRouter(repo: NotificationInstanceRepository): Router {
  const router = Router();

  router.post('/:eventId/notification-plan/publish', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const body = (req.body ?? {}) as unknown;
    const input =
      body !== null && typeof body === 'object' && Object.keys(body as object).length > 0
        ? notificationPublishInputSchema.parse(body)
        : {};
    void input;
    const now = new Date();
    const result = await repo.publish(eventId, actorOf(req), req.header('if-match'), now);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  });

  router.post('/:eventId/notification-plan/cancel', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const now = new Date();
    const result = await repo.cancel(eventId, actorOf(req), now);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  });

  router.post('/:eventId/notification-plan/change', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const input = notificationChangeInputSchema.parse(req.body);
    const now = new Date();
    const result = await repo.change(eventId, input, actorOf(req), now);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(result);
  });

  router.get('/:eventId/notification-plan/instances', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const instances = await repo.listInstances(eventId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ instances });
  });

  return router;
}
