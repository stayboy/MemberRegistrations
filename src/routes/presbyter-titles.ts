import { Router } from 'express';
import type { PresbyterTitleRepository } from '../repos/presbyter-titles.js';

/**
 * `GET /v1/presbyter-titles` (MR-12): the active reference rows a title picker
 * offers, ordered by label. Read-only, additive and behind the bearer like
 * every other `/v1` route.
 */
export function presbyterTitlesRouter(repo: PresbyterTitleRepository): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.listActive() });
  });

  return router;
}
