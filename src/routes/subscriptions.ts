import { Router } from 'express';
import { actorOf } from '../actor.js';
import { memberNoParamSchema } from '../schemas/common.js';
import type { MemberRepository } from '../repos/members.js';

/** Coverage lives at the subscription, not under the policyholder's member path. */
export function subscriptionsRouter(repo: MemberRepository): Router {
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

  return router;
}
