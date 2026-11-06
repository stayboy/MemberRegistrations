import { Router } from 'express';
import { actorOf } from '../actor.js';
import { memberNoParamSchema } from '../schemas/common.js';
import {
  decideClaimSchema,
  recordClaimSchema,
  recordPaymentSchema,
  renewSubscriptionSchema,
} from '../schemas/subscriptions.js';
import type { SubscriptionRepository } from '../repos/subscriptions.js';

/** Coverage lives at the subscription, not under the policyholder's member path. */
export function subscriptionsRouter(repo: SubscriptionRepository): Router {
  const router = Router();

  router.post('/:subscriptionId/coverage', async (req, res) => {
    const memberNo = memberNoParamSchema.parse(req.body?.memberNo);
    await repo.addCoverage(req.params.subscriptionId, memberNo, actorOf(req));
    res.status(204).end();
  });

  router.delete('/:subscriptionId/coverage/:memberNo', async (req, res) => {
    const memberNo = memberNoParamSchema.parse(req.params.memberNo);
    await repo.removeCoverage(req.params.subscriptionId, memberNo, actorOf(req));
    res.status(204).end();
  });

  router.post('/:subscriptionId/renew', async (req, res) => {
    const input = renewSubscriptionSchema.parse(req.body ?? {});
    const subscription = await repo.renew(req.params.subscriptionId, input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(subscription);
  });

  router.get('/:subscriptionId/payments', async (req, res) => {
    const items = await repo.listPayments(req.params.subscriptionId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items });
  });

  router.post('/:subscriptionId/payments', async (req, res) => {
    const input = recordPaymentSchema.parse(req.body);
    const result = await repo.recordPayment(req.params.subscriptionId, input, actorOf(req));
    res.setHeader(
      'Location',
      `/v1/subscriptions/${req.params.subscriptionId}/payments/${result.payment.id}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.created ? 201 : 200).json(result.payment);
  });

  router.get('/:subscriptionId/claims', async (req, res) => {
    const items = await repo.listClaims(req.params.subscriptionId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items });
  });

  router.post('/:subscriptionId/claims', async (req, res) => {
    const input = recordClaimSchema.parse(req.body);
    const claim = await repo.recordClaim(req.params.subscriptionId, input, actorOf(req));
    res.setHeader('Location', `/v1/subscriptions/${req.params.subscriptionId}/claims/${claim.id}`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(claim);
  });

  router.post('/:subscriptionId/claims/:claimId/decide', async (req, res) => {
    const input = decideClaimSchema.parse(req.body);
    const claim = await repo.decideClaim(
      req.params.subscriptionId,
      req.params.claimId,
      input,
      actorOf(req),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json(claim);
  });

  return router;
}
