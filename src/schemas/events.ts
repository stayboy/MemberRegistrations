import { z } from 'zod';
import { dateStringSchema } from './common.js';

export const VENUE_TYPES = ['auditorium', 'virtual', 'hybrid'] as const;
export const EVENT_STATUSES = ['draft', 'scheduled', 'held', 'cancelled', 'archived'] as const;
export const EVENT_SESSION_STATUSES = ['scheduled', 'held', 'cancelled'] as const;
export const EVENT_SOURCES = ['series', 'manual', 'import'] as const;
export const SESSION_SOURCES = ['import', 'manual', 'mixed', 'none'] as const;

export const venueTypeSchema = z.enum(VENUE_TYPES);
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const eventSessionStatusSchema = z.enum(EVENT_SESSION_STATUSES);
export const sessionSourceSchema = z.enum(SESSION_SOURCES);

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
