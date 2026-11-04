import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { NotFoundError } from '../errors/domain-errors.js';
import { createEventSchema, eventListQuerySchema, updateEventSchema } from '../schemas/events.js';
import type { EventDetail, EventRepository } from '../repos/events.js';

const eventIdSchema = z.string().uuid();

/** `If-Match: *` means "any current version"; an absent header skips the check. */
function expectedEtag(req: Request): string | null {
  const header = req.header('if-match')?.trim();
  if (!header || header === '*') return null;
  return header;
}

function sendEvent(res: Response, detail: EventDetail, status = 200): void {
  res.setHeader('ETag', detail.etag);
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(detail.event);
}

export function eventsRouter(repo: EventRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = eventListQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(query) });
  });

  router.post('/', async (req, res) => {
    const input = createEventSchema.parse(req.body);
    actorOf(req);
    const detail = await repo.create(input);
    res.setHeader('Location', `/v1/events/${encodeURIComponent(detail.event.id)}`);
    sendEvent(res, detail, 201);
  });

  router.get('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const detail = await repo.get(id);
    if (!detail) throw new NotFoundError(`Event ${id} was not found`);
    sendEvent(res, detail);
  });

  router.put('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = updateEventSchema.parse(req.body);
    actorOf(req);
    sendEvent(res, await repo.update(id, input, expectedEtag(req)));
  });

  return router;
}
