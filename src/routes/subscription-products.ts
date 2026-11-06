import { Router } from 'express';
import { actorOf } from '../actor.js';
import { NotFoundError } from '../errors/domain-errors.js';
import type { SubscriptionProductRepository } from '../repos/subscription-products.js';
import {
  createSubscriptionProductSchema,
  updateSubscriptionProductSchema,
} from '../schemas/subscription-products.js';

export function subscriptionProductsRouter(repo: SubscriptionProductRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const items = await repo.list({ includeInactive });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items });
  });

  router.get('/:code', async (req, res) => {
    const product = await repo.get(req.params.code);
    if (!product) throw new NotFoundError(`Welfare product ${req.params.code} was not found`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(product);
  });

  router.post('/', async (req, res) => {
    const input = createSubscriptionProductSchema.parse(req.body);
    const product = await repo.create(input, actorOf(req));
    res.setHeader('Location', `/v1/subscription-products/${encodeURIComponent(product.code)}`);
    res.status(201).json(product);
  });

  router.put('/:code', async (req, res) => {
    const { active } = updateSubscriptionProductSchema.parse(req.body);
    const product = await repo.setActive(req.params.code, active, actorOf(req));
    res.json(product);
  });

  return router;
}
