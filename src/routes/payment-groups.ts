import { Router, type Request, type Response } from 'express';
import { actorOf } from '../actor.js';
import type { PaymentGroupRepository } from '../repos/payment-groups.js';
import { createPaymentGroupSchema } from '../schemas/payment-groups.js';

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function actor(req: Request): string {
  return actorOf(req);
}

/**
 * Mounted at `/v1/contributions/groups` before the contribution id routes.
 * One request commits the group, its child contributions and the intent.
 */
export function paymentGroupsRouter(repo: PaymentGroupRepository): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = createPaymentGroupSchema.parse(req.body);
    const result = await repo.create(input, actor(req));
    noStore(res);
    res.status(result.created ? 201 : 200).json(result);
  });

  return router;
}
