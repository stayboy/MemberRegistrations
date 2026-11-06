import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { NotFoundError } from '../errors/domain-errors.js';
import {
  createEventSchema,
  delegationInputSchema,
  eventAttendanceInputSchema,
  eventAttendanceQuerySchema,
  eventGenerateQuerySchema,
  eventListQuerySchema,
  expectedInputSchema,
  expectedQuerySchema,
  updateEventSchema,
} from '../schemas/events.js';
import type { ClockingRepository } from '../repos/clocking.js';
import type { EventDetail, EventRepository } from '../repos/events.js';

const eventIdSchema = z.string().uuid();
const attendanceIdSchema = z.string().uuid();

/** `If-Match: *` means "any current version"; an absent header skips the check. */
function expectedEtag(req: Request): string | null {
  const header = req.header('if-match')?.trim();
  if (!header || header === '*') return null;
  return header;
}

function sendEvent(res: Response, detail: EventDetail, status = 200): void {
  res.setHeader('ETag', detail.etag);
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(detail.event);
}

export function eventsRouter(repo: EventRepository, clocking: ClockingRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = eventListQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(query) });
  });

  router.post('/', async (req, res) => {
    const input = createEventSchema.parse(req.body);
    actorOf(req);
    const detail = await repo.create(input);
    res.setHeader('Location', `/v1/events/${encodeURIComponent(detail.event.id)}`);
    sendEvent(res, detail, 201);
  });

  // Defined before /:id so the generation path can never be shadowed.
  router.post('/generate', async (req, res) => {
    const query = eventGenerateQuerySchema.parse(req.query);
    const result = await repo.generate(query.from, query.to, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  });

  // Defined before /:id so the nested attendance paths can never be shadowed.
  router.get('/:id/attendance', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { date } = eventAttendanceQuerySchema.parse(req.query);
    const report = await repo.getAttendance(id, date);
    res.setHeader('Cache-Control', 'no-store');
    res.json(report);
  });

  router.post('/:id/attendance', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = eventAttendanceInputSchema.parse(req.body);
    const entry = await repo.addManualAttendance(id, input.memberNo, input.date, actorOf(req));
    res.setHeader(
      'Location',
      `/v1/events/${encodeURIComponent(id)}/attendance/${encodeURIComponent(entry.id)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(entry);
  });

  router.delete('/:id/attendance/:attendanceId', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const attendanceId = attendanceIdSchema.parse(req.params.attendanceId);
    await repo.deleteAttendance(id, attendanceId, actorOf(req));
    res.status(204).end();
  });

  router.get('/:id/expected', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = expectedQuerySchema.parse(req.query);
    const expected = await clocking.getExpected(id, sessionDate);
    res.setHeader('Cache-Control', 'no-store');
    res.json(expected);
  });

  router.put('/:id/expected', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = expectedQuerySchema.parse(req.query);
    const input = expectedInputSchema.parse(req.body);
    const expected = await clocking.recordExpected(id, sessionDate, input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(expected);
  });

  router.get('/:id/delegations', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = expectedQuerySchema.parse(req.query);
    const page = await clocking.listDelegations(id, sessionDate);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.post('/:id/delegations', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = expectedQuerySchema.parse(req.query);
    const input = delegationInputSchema.parse(req.body);
    const delegation = await clocking.delegate(
      { eventId: id, sessionDate, ...input },
      actorOf(req),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(delegation);
  });

  router.get('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const detail = await repo.get(id);
    if (!detail) throw new NotFoundError(`Event ${id} was not found`);
    sendEvent(res, detail);
  });

  router.put('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = updateEventSchema.parse(req.body);
    actorOf(req);
    sendEvent(res, await repo.update(id, input, expectedEtag(req)));
  });

  return router;
}
