import { Router } from 'express';
import { actorOf } from '../actor.js';
import { ministryInputSchema, ministryUpdateSchema } from '../schemas/reference.js';
import { NotFoundError } from '../errors/domain-errors.js';
import type { MinistryRepository } from '../repos/ministries.js';

export function ministriesRouter(repo: MinistryRepository): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list() });
  });

  router.post('/', async (req, res) => {
    const input = ministryInputSchema.parse(req.body);
    actorOf(req);
    const ministry = await repo.create(input);
    res.status(201).json(ministry);
  });

  router.get('/:code', async (req, res) => {
    const ministry = await repo.get(req.params.code);
    if (!ministry) throw new NotFoundError(`Ministry ${req.params.code} was not found`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(ministry);
  });

  router.put('/:code', async (req, res) => {
    const input = ministryUpdateSchema.parse(req.body);
    actorOf(req);
    res.json(await repo.update(req.params.code, input));
  });

  router.delete('/:code', async (req, res) => {
    actorOf(req);
    await repo.remove(req.params.code);
    res.status(204).end();
  });

  return router;
}
