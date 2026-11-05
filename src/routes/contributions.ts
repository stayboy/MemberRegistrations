import { Router, type Request, type Response } from 'express';
import { actorOf } from '../actor.js';
import type { ContributionRepository } from '../repos/contributions.js';
import {
  createContributionSchema,
  listContributionsQuerySchema,
  summaryQuerySchema,
} from '../schemas/contributions.js';
import { assertDate } from '../domain/contacts.js';

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function actor(req: Request): string {
  return actorOf(req);
}

export function contributionsRouter(repo: ContributionRepository): Router {
  const router = Router();

  // Registered before any id route so `summary` is never read as an id.
  router.get('/summary', async (req, res) => {
    const query = summaryQuerySchema.parse(req.query);
    const from = assertDate(query.from, 'from');
    const to = assertDate(query.to, 'to');
    noStore(res);
    res.json(await repo.summary(from, to));
  });

  router.get('/', async (req, res) => {
    const query = listContributionsQuerySchema.parse(req.query);
    const from = query.from ? assertDate(query.from, 'from') : undefined;
    const to = query.to ? assertDate(query.to, 'to') : undefined;
    noStore(res);
    res.json(await repo.list({ ...query, from, to }));
  });

  router.post('/', async (req, res) => {
    const input = createContributionSchema.parse(req.body);
    const result = await repo.create(input, actor(req));
    noStore(res);
    res.status(result.created ? 201 : 200).json(result.contribution);
  });

  return router;
}
