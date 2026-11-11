import { z } from 'zod';
import { GENDERS } from '../repos/members.js';
import { dateStringSchema, memberNoParamSchema } from './common.js';
import { offeringStatsSchema, termsSchema } from './offerings.js';

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
  /** A non-empty reason when the session is cancelled (FR-4a); legacy rows may be null. */
  note: z.string().trim().max(200).nullable().optional(),
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
  // False = headcount-only: no per-member attendance, imports, codes or clock-ins.
  tracksMembers: z.boolean().default(true),
  // Presbyter-only events are hidden on member-facing surfaces and roster the presbyters.
  presbyterOnly: z.boolean().default(false),
  sessions: z.array(eventSessionInputSchema).min(1),
});

/**
 * `eventNo` is unique and is never reused, so it is not mutable. `tracksMembers`
 * is re-declared without the create default so an omitted update leaves it as
 * it is; `.partial()` alone would keep applying the default.
 */
export const updateEventSchema = createEventSchema
  .omit({ eventNo: true, tracksMembers: true, presbyterOnly: true })
  .partial()
  .extend({ tracksMembers: z.boolean().optional(), presbyterOnly: z.boolean().optional() });

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventSessionSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  status: eventSessionStatusSchema,
  venueType: venueTypeSchema.optional(),
  /** A non-empty reason when the session is cancelled; null on a legacy cancellation. */
  note: z.string().nullable(),
  present: z.number().int(),
  expected: z.number().int(),
  importedRows: z.number().int(),
  source: sessionSourceSchema,
});

export const eventOfferingSchema = z.object({
  offeringId: z.string(),
  /** The API resolves the display name; the UI must not compose it. */
  name: z.string(),
  availableUntil: z.string().nullable(),
  expired: z.boolean(),
  terms: termsSchema,
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
  /** False = headcount-only; per-member attendance does not apply. */
  tracksMembers: z.boolean(),
  /** Presbyter-only events are hidden on member-facing surfaces and roster the presbyters. */
  presbyterOnly: z.boolean(),
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
  id: z.string(),
  memberNo: z.string(),
  name: z.string(),
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
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
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
  sessionDate: z.string(),
  source: z.enum(['import', 'manual']),
});

export type EventAttendanceQuery = z.infer<typeof eventAttendanceQuerySchema>;
export type EventAttendanceInput = z.infer<typeof eventAttendanceInputSchema>;

export const CODE_PURPOSES = ['attendance_punch', 'registration'] as const;
export const CODE_STATUSES = ['active', 'used', 'expired', 'voided'] as const;

export const issueCodeSchema = z.object({
  purpose: z.enum(CODE_PURPOSES),
  sessionDate: dateStringSchema,
});

export const codeListQuerySchema = z.object({
  sessionDate: dateStringSchema,
  status: z.enum(CODE_STATUSES).optional(),
});

export const voidCodeSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export const issuedCodeSchema = z.object({
  id: z.string(),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(CODE_PURPOSES),
  sessionDate: z.string(),
  expiresAt: z.string(),
});

export const codeItemSchema = z.object({
  id: z.string(),
  purpose: z.enum(CODE_PURPOSES),
  sessionDate: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  status: z.enum(CODE_STATUSES),
  usedAt: z.string().nullable(),
  usedByMemberNo: z.string().nullable(),
  voidedAt: z.string().nullable(),
});

export const codeListSchema = z.object({
  items: z.array(codeItemSchema),
});

export const sessionDateQuerySchema = z.object({
  sessionDate: dateStringSchema,
});

export const HEADCOUNT_MODES = ['adults', 'children', 'mixed'] as const;
export type HeadcountMode = (typeof HEADCOUNT_MODES)[number];

const headcountBucketSchema = z.number().int().min(0).max(10_000);

/**
 * The client sends buckets; `total` is derived by the repository. Mode
 * consistency (which buckets must be zero) needs the mode and the six buckets
 * together, so the repository owns that rule and the database repeats it.
 */
export const headcountInputSchema = z
  .object({
    sessionDate: dateStringSchema,
    mode: z.enum(HEADCOUNT_MODES),
    adultMale: headcountBucketSchema.default(0),
    adultFemale: headcountBucketSchema.default(0),
    adultUnspecified: headcountBucketSchema.default(0),
    childMale: headcountBucketSchema.default(0),
    childFemale: headcountBucketSchema.default(0),
    childUnspecified: headcountBucketSchema.default(0),
    asOf: z.string().datetime({ offset: true }).optional(),
    supersedesId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    const total =
      value.adultMale +
      value.adultFemale +
      value.adultUnspecified +
      value.childMale +
      value.childFemale +
      value.childUnspecified;
    if (total > 30_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['childUnspecified'],
        message: 'the six buckets must not exceed 30000',
      });
    }
  });

export const headcountSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  sessionDate: z.string(),
  asOf: z.string(),
  mode: z.enum(HEADCOUNT_MODES),
  adultMale: z.number().int(),
  adultFemale: z.number().int(),
  adultUnspecified: z.number().int(),
  childMale: z.number().int(),
  childFemale: z.number().int(),
  childUnspecified: z.number().int(),
  total: z.number().int(),
  recordedBy: z.string(),
  recordedAt: z.string(),
  supersedesId: z.string().nullable(),
  supersededBy: z.string().nullable(),
});

export const headcountListSchema = z.object({
  sessionDate: z.string(),
  current: headcountSchema.nullable(),
  observations: z.array(headcountSchema),
});

export type HeadcountInput = z.infer<typeof headcountInputSchema>;

export const delegationInputSchema = z.object({
  fromMemberNo: memberNoParamSchema,
  toMemberNo: memberNoParamSchema,
  reason: z.string().min(3).max(500),
});

export const delegationSchema = z.object({
  id: z.string(),
  fromMemberNo: z.string(),
  fromName: z.string(),
  toMemberNo: z.string(),
  toName: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});

export const delegationListSchema = z.object({
  items: z.array(delegationSchema),
});
