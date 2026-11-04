import { z } from 'zod';
import { dateStringSchema, memberNoParamSchema } from './common.js';

export const VENUE_TYPES = ['auditorium', 'virtual', 'hybrid'] as const;
export const EVENT_STATUSES = ['draft', 'scheduled', 'held', 'cancelled', 'archived'] as const;
export const EVENT_SESSION_STATUSES = ['scheduled', 'held', 'cancelled'] as const;
export const EVENT_SOURCES = ['series', 'manual', 'import'] as const;
export const SESSION_SOURCES = ['import', 'manual', 'mixed', 'none'] as const;

export const venueTypeSchema = z.enum(VENUE_TYPES);
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const eventSessionStatusSchema = z.enum(EVENT_SESSION_STATUSES);
export const sessionSourceSchema = z.enum(SESSION_SOURCES);

export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time (HH:MM)');

export const eventListQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  seriesId: z.string().uuid().optional(),
  ministry: z.string().trim().min(1).optional(),
  venueType: venueTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventGenerateQuerySchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
});

export type EventGenerateQuery = z.infer<typeof eventGenerateQuerySchema>;

/**
 * A written session inherits the event start/end time when it omits them. The
 * cross-field rules (range, unique dates) need the merged event, so they live
 * in the repository rather than in a Zod refinement.
 */
export const eventSessionInputSchema = z.object({
  date: dateStringSchema,
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.nullable().optional(),
  status: eventSessionStatusSchema.optional(),
  venueType: venueTypeSchema.optional(),
});

export const createEventSchema = z.object({
  eventNo: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  timezone: z.string().min(1).max(64).optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema.nullable().optional(),
  venueType: venueTypeSchema,
  venueName: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sessions: z.array(eventSessionInputSchema).min(1),
});

/** `eventNo` is unique and is never reused, so it is not mutable. */
export const updateEventSchema = createEventSchema.omit({ eventNo: true }).partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventSessionSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  status: eventSessionStatusSchema,
  venueType: venueTypeSchema.optional(),
  present: z.number().int(),
  expected: z.number().int(),
  importedRows: z.number().int(),
  source: sessionSourceSchema,
});

const offeringKindSchema = z.enum(['freewill', 'tithe', 'pledge', 'building', 'missions', 'other']);

export const offeringStatsSchema = z.object({
  attachedEvents: z.number().int(),
  pledgedMinor: z.number().int(),
  paidMinor: z.number().int(),
  pendingMinor: z.number().int(),
  honorRate: z.number(),
  contributionCount: z.number().int(),
});

export const eventOfferingSchema = z.object({
  offeringId: z.string(),
  name: z.string(),
  kind: offeringKindSchema,
  currency: z.string(),
  availableUntil: z.string().nullable(),
  exceptions: z.array(
    z.object({
      date: z.string(),
      kind: z.enum(['skip', 'opt_in']),
      note: z.string().nullable(),
    }),
  ),
  stats: offeringStatsSchema,
});

export const eventSchema = z.object({
  id: z.string(),
  // Null while a series-minted instance has not been assigned an event number yet.
  eventNo: z.string().nullable(),
  name: z.string(),
  seriesId: z.string().nullable(),
  ministry: z.object({ code: z.string(), name: z.string() }).nullable(),
  timezone: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  venueType: venueTypeSchema,
  venueName: z.string().nullable(),
  description: z.string().nullable(),
  status: eventStatusSchema,
  source: z.enum(EVENT_SOURCES),
  sessions: z.array(eventSessionSchema),
  offerings: z.array(eventOfferingSchema),
  stats: offeringStatsSchema,
});

export const eventListSchema = z.object({
  items: z.array(eventSchema),
});

export const eventGenerationSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  eventIds: z.array(z.string()),
});

export const eventAttendanceQuerySchema = z.object({
  date: dateStringSchema,
});

export const eventAttendanceInputSchema = z.object({
  memberNo: memberNoParamSchema,
  date: dateStringSchema,
});

export const eventAttendanceRowSchema = z.object({
  memberNo: z.string(),
  name: z.string(),
  status: z.literal('present'),
  source: z.enum(['import', 'manual']),
  sessionTime: z.string().nullable(),
});

export const eventAttendanceSchema = z.object({
  eventId: z.string(),
  sessionDate: z.string(),
  present: z.number().int(),
  expected: z.number().int(),
  importedRows: z.number().int(),
  rows: z.array(eventAttendanceRowSchema),
});

export const eventAttendanceEntrySchema = z.object({
  id: z.string(),
  memberNo: z.string(),
  name: z.string(),
  sessionDate: z.string(),
  source: z.enum(['import', 'manual']),
});

export type EventAttendanceQuery = z.infer<typeof eventAttendanceQuerySchema>;
export type EventAttendanceInput = z.infer<typeof eventAttendanceInputSchema>;
