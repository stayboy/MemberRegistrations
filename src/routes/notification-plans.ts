import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { notificationPlanWriteSchema } from '../schemas/notifications.js';
import type { NotificationPlanRepository } from '../repos/notification-plans.js';

const eventIdSchema = z.string().uuid();

/**
 * The plan's authoring and preview surface
 * (member-registrations-event-notifications.md N-2, N-3, FR-16).
 *
 * There is deliberately no publish, cancel or change route in this round: R2 is
 * the plan an officer can author and preview, not publish (round grill 1). A
 * stub answering 501 would be a promise this round cannot keep, so the paths do
 * not exist at all.
 */
export function notificationPlansRouter(repo: NotificationPlanRepository): Router {
  const router = Router();

  router.get('/:eventId/notification-plan', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const plan = await repo.read(eventId);
    res.setHeader('ETag', plan.etag);
    res.setHeader('Cache-Control', 'no-store');
    res.json(plan);
  });

  router.put('/:eventId/notification-plan', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const input = notificationPlanWriteSchema.parse(req.body);
    const actor = actorOf(req);
    const plan = await repo.write(eventId, input, actor, req.header('if-match'));
    res.setHeader('ETag', plan.etag);
    res.setHeader('Cache-Control', 'no-store');
    res.json(plan);
  });

  router.post('/:eventId/notification-plan/preview', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const body = req.body as unknown;
    const hasBody =
      body !== null && typeof body === 'object' && Object.keys(body as object).length > 0;
    const input = hasBody ? notificationPlanWriteSchema.parse(body) : undefined;
    const preview = await repo.preview(eventId, input);
    res.setHeader('Cache-Control', 'no-store');
    res.json(preview);
  });

  return router;
}
