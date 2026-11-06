import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import {
  registrationApproveSchema,
  registrationRejectSchema,
  registrationRequestListQuerySchema,
} from '../schemas/registration-requests.js';
import type { RegistrationRequestRepository } from '../repos/registration-requests.js';

const idSchema = z.string().uuid();

export function registrationRequestsRouter(repo: RegistrationRequestRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = registrationRequestListQuerySchema.parse(req.query);
    const page = await repo.list(query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.get('/:id', async (req, res) => {
    const item = await repo.get(idSchema.parse(req.params.id));
    res.setHeader('Cache-Control', 'no-store');
    res.json(item);
  });

  router.post('/:id/approve', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { memberNo } = registrationApproveSchema.parse(req.body);
    const item = await repo.approve(id, memberNo, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(item);
  });

  router.post('/:id/reject', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { reason } = registrationRejectSchema.parse(req.body);
    const item = await repo.reject(id, reason, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(item);
  });

  return router;
}
