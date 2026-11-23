import { Router } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../errors/domain-errors.js';
import { audienceListQuerySchema } from '../schemas/audiences.js';
import type { AudienceRepository } from '../repos/audiences.js';

const audienceIdSchema = z.string().uuid();

/** Read-only audience reference data; create and edit arrive with the write API. */
export function audiencesRouter(repo: AudienceRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { includeArchived } = audienceListQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(includeArchived) });
  });

  router.get('/:id', async (req, res) => {
    const id = audienceIdSchema.parse(req.params.id);
    const audience = await repo.get(id);
    if (!audience) throw new NotFoundError(`Audience ${id} was not found`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(audience);
  });

  return router;
}
