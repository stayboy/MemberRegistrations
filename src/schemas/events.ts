import { z } from 'zod';
import { GENDERS } from '../repos/members.js';
import { audienceSummarySchema } from './audiences.js';
import { dateStringSchema, memberNoParamSchema } from './common.js';
import { offeringStatsSchema, termsSchema } from './offerings.js';
import { seriesSummarySchema } from './reference.js';

export const VENUE_TYPES = ['auditorium', 'virtual', 'hybrid'] as const;
export const EVENT_STATUSES = ['draft', 'active', 'archived'] as const;
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
  /** The latest capture of either channel, with the shared close state; null when none (FR-4b). */
  capture: z.object({ asOf: z.string(), ended: z.boolean() }).nullable(),
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

export const HEADCOUNT_MODES = ['adults', 'children', 'visitors', 'presbyters'] as const;
/** `mixed` is retired: readable history, never a write. */
export const HEADCOUNT_READ_MODES = [...HEADCOUNT_MODES, 'mixed'] as const;
export type HeadcountMode = (typeof HEADCOUNT_MODES)[number];
export type HeadcountReadMode = (typeof HEADCOUNT_READ_MODES)[number];

const headcountBucketSchema = z.number().int().min(0).max(10_000);

/**
 * A line names one of the mode's buckets. `total` is derived by the repository;
 * which buckets a mode declares, duplicate codes and the sum are checked there
 * against the reference data.
 */
export const headcountLineInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  count: headcountBucketSchema,
});

export const headcountInputSchema = z
  .object({
    sessionDate: dateStringSchema,
    mode: z.enum(HEADCOUNT_MODES),
    /** A subset of the mode's buckets; an empty set is a real count of zero. */
    lines: z.array(headcountLineInputSchema).max(16).default([]),
    asOf: z.string().datetime({ offset: true }).optional(),
    supersedesId: z.string().uuid().optional(),
    /** True closes the session; a headcount never ends automatically. */
    ended: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const codes = new Set<string>();
    for (const [index, line] of value.lines.entries()) {
      if (codes.has(line.code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'code'],
          message: `the ${line.code} bucket appears more than once`,
        });
      }
      codes.add(line.code);
    }
    const total = value.lines.reduce((sum, line) => sum + line.count, 0);
    if (total > 30_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'the lines must not exceed 30000',
      });
    }
  });

export const headcountLineSchema = z.object({
  code: z.string(),
  /** Joined from the mode's bucket reference row. */
  label: z.string(),
  count: z.number().int(),
});

export const headcountSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  sessionDate: z.string(),
  asOf: z.string(),
  mode: z.enum(HEADCOUNT_READ_MODES),
  total: z.number().int(),
  ended: z.boolean(),
  recordedBy: z.string(),
  recordedAt: z.string(),
  supersedesId: z.string().nullable(),
  supersededBy: z.string().nullable(),
  lines: z.array(headcountLineSchema),
});

/**
 * The lane map: the four live modes always, `mixed` only when the session holds
 * legacy rows; a `?mode=` read narrows it to that lane alone.
 */
export const headcountListSchema = z.object({
  sessionDate: z.string(),
  current: z.record(z.enum(HEADCOUNT_READ_MODES), headcountSchema.nullable()),
  observations: z.array(headcountSchema),
});

export const headcountListQuerySchema = sessionDateQuerySchema.extend({
  mode: z.enum(HEADCOUNT_READ_MODES).optional(),
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

/**
 * The parent read's occurrence row: a dated child of the event, never a
 * second event. The attendance fields are the occurrence's own summary.
 */
export const eventOccurrenceSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  status: eventSessionStatusSchema,
  venueType: venueTypeSchema.optional(),
  capture: z.object({ asOf: z.string(), ended: z.boolean() }).nullable(),
  note: z.string().nullable(),
  present: z.number().int(),
  expected: z.number().int(),
  importedRows: z.number().int(),
  source: sessionSourceSchema,
  /** Read-only legacy per-instance number; null once the transition retires it. */
  legacyEventNo: z.string().nullable(),
});

export const eventRecurrenceSchema = z.object({
  schedules: z.array(
    z.object({
      effectiveFrom: z.string(),
      rrule: z.string(),
      endsOn: z.string().nullable(),
    }),
  ),
  exceptions: z.array(
    z.object({
      date: z.string(),
      kind: z.enum(['cancelled', 'extra']),
      note: z.string().nullable(),
    }),
  ),
});

/**
 * The recurrence write contract. `rrule` is the RRULE body only: `COUNT` and
 * `UNTIL` are refused inside it because the end is `endsOn` (Recurrence).
 */
export const recurrenceRuleInputSchema = z
  .string()
  .trim()
  .min(6)
  .max(200)
  .refine((value) => !/(^|;)\s*(?:COUNT|UNTIL)\s*=/i.test(value), {
    message: 'rrule must not carry COUNT or UNTIL; set endsOn instead',
  });

/** A standalone event's date row. Blank times inherit the parent's defaults. */
export const eventOccurrenceInputSchema = z.object({
  date: dateStringSchema,
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.nullable().optional(),
});

export const recurrenceScheduleInputSchema = z.object({
  effectiveFrom: dateStringSchema,
  rrule: recurrenceRuleInputSchema,
  endsOn: dateStringSchema.nullable().optional(),
});

export const recurrenceExceptionInputSchema = z
  .object({
    date: dateStringSchema,
    kind: z.enum(['cancelled', 'extra']),
    /** Required and non-empty on a `cancelled` exception (Recurrence). */
    note: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'cancelled' && !value.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'a cancelled exception requires a non-empty note',
      });
    }
  });

export const eventRecurrenceInputSchema = z.object({
  schedules: z.array(recurrenceScheduleInputSchema).min(1),
  exceptions: z.array(recurrenceExceptionInputSchema).default([]),
});

/**
 * `POST /v1/events`: one parent, a draft, with either manual occurrences
 * (standalone) or a first recurrence version (recurring), never both. The
 * range is derived, so `startDate`/`endDate` are not request fields. The
 * retired `ministry`/`presbyterOnly` projections are not in the payload.
 */
export const createEventParentSchema = z
  .object({
    eventNo: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe(
        'Optional identity. When omitted the server mints `EVT-<year>-<sequence>`; a duplicate is 409.',
      ),
    name: z.string().trim().min(1).max(200),
    audienceId: z
      .string()
      .uuid()
      .optional()
      .describe('The event applicability; defaults to the seeded Everyone audience when omitted.'),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('IANA override used only to decide "today" for this event; defaults to UTC.'),
    description: z.string().max(2000).nullable().optional(),
    venueType: venueTypeSchema,
    venueName: z.string().max(200).nullable().optional(),
    startTime: timeStringSchema,
    endTime: timeStringSchema.nullable().optional(),
    tracksMembers: z.boolean().default(true),
    occurrences: z
      .array(eventOccurrenceInputSchema)
      .min(1)
      .optional()
      .describe("A standalone event's dates; mutually exclusive with `recurrence`."),
    recurrence: eventRecurrenceInputSchema
      .optional()
      .describe(
        "A recurring event's first schedule version; mutually exclusive with `occurrences`.",
      ),
  })
  .superRefine((value, ctx) => {
    if (!value.occurrences && !value.recurrence) {
      ctx.addIssue({
        code: 'custom',
        path: ['occurrences'],
        message: 'a standalone event requires at least one occurrence, or supply a recurrence',
      });
    }
    if (value.occurrences && value.recurrence) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence'],
        message: 'supply either occurrences or a recurrence, not both',
      });
    }
  });

/**
 * `PATCH /v1/events/{eventId}`: the same parent fields without the recurrence,
 * all optional. `eventNo` is immutable and `status` moves through the
 * documented transitions; the legacy projections stay refused.
 */
export const updateEventParentSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  audienceId: z.string().uuid().optional(),
  timezone: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).nullable().optional(),
  venueType: venueTypeSchema.optional(),
  venueName: z.string().max(200).nullable().optional(),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.nullable().optional(),
  tracksMembers: z.boolean().optional(),
  status: eventStatusSchema.optional(),
});

/** `POST .../occurrences/{date}/cancel`: the reason is stored as the occurrence's `note`. */
export const cancelOccurrenceSchema = z.object({
  note: z.string().trim().min(1).max(200),
});

export type CreateEventParentInput = z.infer<typeof createEventParentSchema>;
export type UpdateEventParentInput = z.infer<typeof updateEventParentSchema>;
export type EventRecurrenceInput = z.infer<typeof eventRecurrenceInputSchema>;
export type RecurrenceScheduleInput = z.infer<typeof recurrenceScheduleInputSchema>;
export type RecurrenceExceptionInput = z.infer<typeof recurrenceExceptionInputSchema>;
export type CancelOccurrenceInput = z.infer<typeof cancelOccurrenceSchema>;

/** The parent read's window figures: the data behind the four tiles (S-Q2). */
export const eventWindowSummarySchema = seriesSummarySchema;

export const eventParentSchema = z.object({
  id: z.string(),
  eventNo: z.string(),
  name: z.string(),
  audienceId: z.string(),
  audience: audienceSummarySchema,
  ministry: z.object({ code: z.string(), name: z.string() }).nullable(),
  presbyterOnly: z.boolean(),
  timezone: z.string(),
  description: z.string().nullable(),
  venueType: venueTypeSchema,
  venueName: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  tracksMembers: z.boolean(),
  status: eventStatusSchema,
  recurrence: eventRecurrenceSchema.nullable(),
  occurrences: z.array(eventOccurrenceSchema),
  offerings: z.array(eventOfferingSchema),
  stats: offeringStatsSchema,
  summary: eventWindowSummarySchema,
});

export const eventParentListSchema = z.object({
  items: z.array(eventParentSchema),
});

/** The transition flag, validated even on the legacy default path. */
export const eventViewQuerySchema = z.object({
  view: z.literal('parent').optional(),
});

export const eventParentListQuerySchema = eventListQuerySchema.extend({
  view: z.literal('parent'),
  from: dateStringSchema,
  to: dateStringSchema,
});

export const eventParentDetailQuerySchema = z.object({
  view: z.literal('parent'),
  from: dateStringSchema,
  to: dateStringSchema,
});

export const seriesParentQuerySchema = z.object({
  view: z.literal('parent'),
  from: dateStringSchema,
  to: dateStringSchema,
});
