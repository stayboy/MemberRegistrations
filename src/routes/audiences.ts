import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { NotFoundError } from '../errors/domain-errors.js';
import {
  audienceListQuerySchema,
  createAudienceSchema,
  updateAudienceSchema,
} from '../schemas/audiences.js';
import type { AudienceRepository } from '../repos/audiences.js';

const audienceIdSchema = z.string().uuid();

/**
 * Audience reference data. A system audience is seeded and read-only; there is
 * no delete, so archiving a custom audience is `PUT { active: false }` (A-6).
 */
export function audiencesRouter(repo: AudienceRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { includeArchived } = audienceListQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(includeArchived) });
  });

  router.post('/', async (req, res) => {
    const input = createAudienceSchema.parse(req.body);
    const audience = await repo.create(input, actorOf(req));
    res.setHeader('Location', `/v1/audiences/${encodeURIComponent(audience.id)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(audience);
  });

  router.get('/:id', async (req, res) => {
    const id = audienceIdSchema.parse(req.params.id);
    const audience = await repo.get(id);
    if (!audience) throw new NotFoundError(`Audience ${id} was not found`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(audience);
  });

  router.put('/:id', async (req, res) => {
    const id = audienceIdSchema.parse(req.params.id);
    const input = updateAudienceSchema.parse(req.body);
    const audience = await repo.update(id, input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(audience);
  });

  return router;
}
