import { Router } from 'express';
import { actorOf } from '../actor.js';
import { memberNoParamSchema } from '../schemas/common.js';
import {
  assignmentInputSchema,
  callInputSchema,
  windowQuerySchema,
} from '../schemas/shepherding.js';
import type { ShepherdingRepository } from '../repos/shepherding.js';

export function shepherdingRouter(repo: ShepherdingRepository): Router {
  const router = Router();

  router.get('/officers', async (req, res) => {
    const window = windowQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.listOfficers(window) });
  });

  router.get('/officers/:memberNo/members', async (req, res) => {
    const memberNo = memberNoParamSchema.parse(req.params.memberNo);
    const window = windowQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      officerMemberNo: memberNo,
      from: window.from ?? null,
      to: window.to ?? null,
      items: await repo.roster(memberNo, window),
    });
  });

  router.get('/report', async (req, res) => {
    const window = windowQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await repo.report(window));
  });

  router.post('/assignments', async (req, res) => {
    const input = assignmentInputSchema.parse(req.body);
    res.status(201).json(await repo.assign(input, actorOf(req)));
  });

  router.delete('/assignments/:assignmentId', async (req, res) => {
    await repo.endAssignment(req.params.assignmentId, actorOf(req));
    res.status(204).end();
  });

  router.post('/assignments/:assignmentId/calls', async (req, res) => {
    const input = callInputSchema.parse(req.body);
    res.status(201).json(await repo.logCall(req.params.assignmentId, input, actorOf(req)));
  });

  router.get('/assignments/:assignmentId/calls', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      assignmentId: req.params.assignmentId,
      items: await repo.listCalls(req.params.assignmentId),
    });
  });

  return router;
}

/** Mounted at `/v1/members`; only the two-segment shepherding view. */
export function memberShepherdingRouter(repo: ShepherdingRepository): Router {
  const router = Router();

  router.get('/:memberNo/shepherding', async (req, res) => {
    const memberNo = memberNoParamSchema.parse(req.params.memberNo);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await repo.forMember(memberNo));
  });

  return router;
}
