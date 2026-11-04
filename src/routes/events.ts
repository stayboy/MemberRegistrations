import { Router } from 'express';
import { eventListQuerySchema } from '../schemas/events.js';
import type { EventRepository } from '../repos/events.js';

export function eventsRouter(repo: EventRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = eventListQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(query) });
  });

  return router;
}
