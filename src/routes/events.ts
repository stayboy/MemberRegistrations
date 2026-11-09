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
  headcountInputSchema,
  sessionDateQuerySchema,
  updateEventSchema,
} from '../schemas/events.js';
import { offeringCountInputSchema, offeringCountQuerySchema } from '../schemas/offering-counts.js';
import type { ClockingRepository } from '../repos/clocking.js';
import type { EventDetail, EventRepository } from '../repos/events.js';
import type { HeadcountRepository } from '../repos/headcounts.js';
import type { OfferingCountRepository } from '../repos/offering-counts.js';

const eventIdSchema = z.string().uuid();
const attendanceIdSchema = z.string().uuid();
const headcountIdSchema = z.string().uuid();

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

/**
 * The bearer token is shared by officers and reads the whole register. Member
 * identity lives on the USSD session, never on this surface.
 */
export function eventsRouter(
  repo: EventRepository,
  clocking: ClockingRepository,
  headcounts: HeadcountRepository,
  offeringCounts: OfferingCountRepository,
): Router {
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

  router.get('/:id/headcounts', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = sessionDateQuerySchema.parse(req.query);
    const page = await headcounts.get(id, sessionDate);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.get('/:id/headcounts/:headcountId', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const headcountId = headcountIdSchema.parse(req.params.headcountId);
    const headcount = await headcounts.getById(id, headcountId);
    if (!headcount) throw new NotFoundError(`Headcount ${headcountId} was not found`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(headcount);
  });

  router.post('/:id/headcounts', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = headcountInputSchema.parse(req.body);
    const headcount = await headcounts.record(id, input, actorOf(req));
    res.setHeader(
      'Location',
      `/v1/events/${encodeURIComponent(id)}/headcounts/${encodeURIComponent(headcount.id)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(headcount);
  });

  // The sole read target for a count group; there is no item GET.
  router.get('/:id/offering-counts', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const query = offeringCountQuerySchema.parse(req.query);
    const page = await offeringCounts.get(id, query.sessionDate, query.offeringId);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.post('/:id/offering-counts', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = offeringCountInputSchema.parse(req.body);
    const count = await offeringCounts.record(id, input, actorOf(req));
    const params = new URLSearchParams({
      sessionDate: count.sessionDate,
      offeringId: count.offeringId,
    });
    res.setHeader(
      'Location',
      `/v1/events/${encodeURIComponent(id)}/offering-counts?${params.toString()}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(count);
  });

  router.get('/:id/delegations', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = sessionDateQuerySchema.parse(req.query);
    const page = await clocking.listDelegations(id, sessionDate);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.post('/:id/delegations', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { sessionDate } = sessionDateQuerySchema.parse(req.query);
    const input = delegationInputSchema.parse(req.body);
    const delegation = await clocking.delegate(
      { eventId: id, sessionDate, ...input },
      actorOf(req),
      { surface: 'operator' },
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
