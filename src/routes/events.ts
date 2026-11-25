import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { BadRequestError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { dateStringSchema } from '../schemas/common.js';
import {
  cancelOccurrenceSchema,
  createEventParentSchema,
  delegationInputSchema,
  eventAttendanceInputSchema,
  eventAttendanceQuerySchema,
  eventGenerateQuerySchema,
  eventListQuerySchema,
  eventParentDetailQuerySchema,
  eventParentListQuerySchema,
  eventPreviewInputSchema,
  eventScheduleWriteSchema,
  eventViewQuerySchema,
  headcountInputSchema,
  headcountListQuerySchema,
  recurrenceExceptionInputSchema,
  recurrenceScheduleInputSchema,
  sessionDateQuerySchema,
  updateEventParentSchema,
  updateEventSchema,
} from '../schemas/events.js';
import { offeringCountInputSchema, offeringCountQuerySchema } from '../schemas/offering-counts.js';
import { EVENT_PERIODS } from '../domain/periods.js';
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
 * Zod strips an unknown key, so a retired `ministry` or `presbyterOnly` in the
 * raw body would vanish silently. Refuse it by name instead (FR-36).
 */
function refuseLegacyProjections(body: unknown): void {
  if (!body || typeof body !== 'object') return;
  const record = body as Record<string, unknown>;
  for (const field of ['ministry', 'presbyterOnly']) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      throw new ValidationError(
        `${field}: is not accepted on the event write; use audienceId`,
        'validation_error',
      );
    }
  }
}

async function sendParent(
  repo: EventRepository,
  res: Response,
  parent: { id: string },
  status = 200,
): Promise<void> {
  const etag = await repo.parentEtag(parent.id);
  if (etag) res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(parent);
}

function assertWindow(from: string, to: string): void {
  if (from > to) throw new BadRequestError('from must be on or before to', 'invalid_window');
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
    const { view } = eventViewQuerySchema.parse(req.query);
    if (view === 'parent') {
      const query = eventParentListQuerySchema.parse(req.query);
      assertWindow(query.from, query.to);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ items: await repo.listParents(query) });
      return;
    }
    const query = eventListQuerySchema.parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(query) });
  });

  router.post('/', async (req, res) => {
    refuseLegacyProjections(req.body);
    const input = createEventParentSchema.parse(req.body);
    const parent = await repo.createParent(input, actorOf(req));
    res.setHeader('Location', `/v1/events/${encodeURIComponent(parent.id)}`);
    await sendParent(repo, res, parent, 201);
  });

  // Defined before /:id so the generation path can never be shadowed.
  router.post('/generate', async (req, res) => {
    const query = eventGenerateQuerySchema.parse(req.query);
    const result = await repo.generate(query.from, query.to, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  });

  // The read-only period catalogue; before /:id so `periods` is never an id.
  router.get('/periods', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: EVENT_PERIODS });
  });

  // Non-persistent: the form's dates and counts, with nothing written. Before
  // /:id for the same reason as /generate.
  router.post('/preview', async (req, res) => {
    const input = eventPreviewInputSchema.parse(req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await repo.preview(input));
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
    const { sessionDate, mode } = headcountListQuerySchema.parse(req.query);
    const page = await headcounts.get(id, sessionDate, mode);
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
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(delegation);
  });

  router.post('/:id/archive', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    actorOf(req);
    const parent = await repo.archiveParent(id);
    await sendParent(repo, res, parent);
  });

  router.post('/:id/occurrences/:date/cancel', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const date = dateStringSchema.parse(req.params.date);
    const actor = actorOf(req);
    // The contract's reason is `note`; an empty one is `reason_required`, not a
    // generic schema failure.
    if (
      typeof (req.body as { note?: unknown } | undefined)?.note !== 'string' ||
      (req.body as { note: string }).note.trim() === ''
    ) {
      throw new ValidationError('note: a cancellation reason is required', 'reason_required');
    }
    const input = cancelOccurrenceSchema.parse(req.body);
    const occurrence = await repo.cancelOccurrence(id, date, input.note, actor);
    res.setHeader('Cache-Control', 'no-store');
    res.json(occurrence);
  });

  router.post('/:id/recurrence/versions', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = recurrenceScheduleInputSchema.parse(req.body);
    const recurrence = await repo.addRecurrenceVersion(id, input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(recurrence);
  });

  // The edit form's save: one arm, under the guard. A closed guard is the
  // repository's `409 recurrence_locked` carrying the reasons.
  router.put('/:id/schedule', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = eventScheduleWriteSchema.parse(req.body);
    const result = await repo.writeSchedule(id, input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  });

  router.post('/:id/recurrence/exceptions', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = recurrenceExceptionInputSchema.parse(req.body);
    const recurrence = await repo.setRecurrenceException(id, input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(recurrence);
  });

  router.delete('/:id/recurrence/exceptions/:date', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const date = dateStringSchema.parse(req.params.date);
    actorOf(req);
    const recurrence = await repo.removeRecurrenceException(id, date);
    res.setHeader('Cache-Control', 'no-store');
    res.json(recurrence);
  });

  router.get('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const { view } = eventViewQuerySchema.parse(req.query);
    if (view === 'parent') {
      const query = eventParentDetailQuerySchema.parse(req.query);
      assertWindow(query.from, query.to);
      const parent = await repo.getParent(id, query.from, query.to);
      if (!parent) throw new NotFoundError(`Event ${id} was not found`);
      const etag = await repo.parentEtag(id);
      if (etag) res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-store');
      res.json(parent);
      return;
    }
    const detail = await repo.get(id);
    if (!detail) throw new NotFoundError(`Event ${id} was not found`);
    sendEvent(res, detail);
  });

  router.patch('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    actorOf(req);
    refuseLegacyProjections(req.body);
    const input = updateEventParentSchema.parse(req.body);
    const parent = await repo.updateParent(id, input, expectedEtag(req));
    await sendParent(repo, res, parent);
  });

  router.put('/:id', async (req, res) => {
    const id = eventIdSchema.parse(req.params.id);
    const input = updateEventSchema.parse(req.body);
    actorOf(req);
    sendEvent(res, await repo.update(id, input, expectedEtag(req)));
  });

  return router;
}
