import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { codeListQuerySchema, issueCodeSchema, voidCodeSchema } from '../schemas/events.js';
import type { AttendanceCodeRepository } from '../repos/attendance-codes.js';

const eventIdSchema = z.string().uuid();
const codeIdSchema = z.string().uuid();

/**
 * Code issuance, listing and void are portal seams. Redemption stays inside
 * `POST /ussd/session`; no route exposes it.
 */
export function attendanceCodesRouter(repo: AttendanceCodeRepository): Router {
  const router = Router();

  router.post('/events/:eventId/codes', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const input = issueCodeSchema.parse(req.body);
    const issued = await repo.issue({ eventId, ...input }, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(issued);
  });

  router.get('/events/:eventId/codes', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const query = codeListQuerySchema.parse(req.query);
    const page = await repo.list(eventId, query.sessionDate, query.status);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.post('/codes/:id/void', async (req, res) => {
    const id = codeIdSchema.parse(req.params.id);
    const input = voidCodeSchema.parse(req.body ?? {});
    const row = await repo.void(id, input.reason ?? null, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(row);
  });

  return router;
}
