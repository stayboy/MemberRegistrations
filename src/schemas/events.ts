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

/**
 * The three named periods are declared in code (`src/domain/periods.ts`) and
 * read from the catalogue; the ids are the wire vocabulary and are closed.
 */
export const EVENT_PERIOD_IDS = ['communion-week', 'gospel-week', 'home-cells'] as const;
export const eventPeriodIdSchema = z.enum(EVENT_PERIOD_IDS);
export type EventPeriodId = (typeof EVENT_PERIOD_IDS)[number];

/** The resolver's shape projected onto the wire: a week or a single date. */
export const EVENT_PERIOD_DATES = ['week', 'date'] as const;

/** A period day is the three-letter vocabulary, never the rrule `MO`-`SU`. */
export const PERIOD_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const eventPeriodDaySchema = z.enum(PERIOD_DAYS);
export type PeriodDay = (typeof PERIOD_DAYS)[number];

/** A closed enum that starts with monthly; a new cadence is a new value. */
export const PERIOD_FREQUENCIES = ['monthly'] as const;
export const eventPeriodFrequencySchema = z.enum(PERIOD_FREQUENCIES);
export type PeriodFrequency = (typeof PERIOD_FREQUENCIES)[number];

export const eventPeriodSchema = z.object({
  id: eventPeriodIdSchema,
  name: z.string(),
  /** The declared rule, in words: the form shows it beside the choice. */
  definition: z.string(),
  /** The projection of the resolver's `kind`, derived - never hand-written. */
  dates: z.enum(EVENT_PERIOD_DATES),
});

export const eventPeriodListSchema = z.object({
  items: z.array(eventPeriodSchema),
});

const cycleMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'cycleMonth must be a calendar month (YYYY-MM)');

/**
 * The create's period arm has exactly two forms. `{ id, cycleMonth }` resolves
 * one cycle once; `{ id, frequency: 'monthly', day?, effectiveFrom? }` generates
 * one date per cycle over the create's 90-day window. Both arms are strict, so
 * sending **both** `cycleMonth` and `frequency` is a 422 by name rather than a
 * silently stripped key. `effectiveFrom` anchors the window only: it is
 * input-only and never stored.
 */
export const eventPeriodCycleInputSchema = z
  .object({
    id: eventPeriodIdSchema,
    cycleMonth: cycleMonthSchema,
  })
  .strict();

export const eventPeriodRuleInputSchema = z
  .object({
    id: eventPeriodIdSchema,
    frequency: eventPeriodFrequencySchema,
    day: eventPeriodDaySchema
      .optional()
      .describe('A weekday inside the period; refused for a single-date period.'),
    effectiveFrom: dateStringSchema
      .optional()
      .describe('Anchors the first 90-day window; input-only, never stored.'),
  })
  .strict();

export const eventPeriodInputSchema = z.union([
  eventPeriodCycleInputSchema,
  eventPeriodRuleInputSchema,
]);

/** The provenance a period-created event carries on read. */
export const eventPeriodProvenanceSchema = z.object({
  id: eventPeriodIdSchema,
  /** The name snapshot taken at save, never a live lookup. */
  name: z.string(),
  /** The chosen cycle for a one-off period event; null for a recurring one. */
  cycle: z.string().nullable(),
  frequency: eventPeriodFrequencySchema.nullable(),
  /** A weekday inside each cycle; null for a whole week or a single date. */
  day: eventPeriodDaySchema.nullable(),
});

export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time (HH:MM)');

export const eventListQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  seriesId: z.string().uuid().optional(),
  ministry: z.string().trim().min(1).optional(),
  venueType: venueTypeSchema.optional(),
  /** The named period a parent was created from; filters on the stored id. */
  period: eventPeriodIdSchema.optional(),
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
 * The event number is minted by the server, never accepted on a write. Zod
 * strips an unknown key, so a caller that sends one would silently lose it -
 * declare it `never` instead, which refuses it by name at the field path
 * (`422 validation_error`), the `refuseLegacyProjections` rule at the schema.
 */
const eventNoRefusalSchema = z
  .never({ error: 'eventNo: is minted by the server and is not accepted on the event write' })
  .optional()
  .describe('Refused: the server mints `EVT-<year>-<NNN>`; sending this field is a 422 naming it.');

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
  eventNo: eventNoRefusalSchema,
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
 * The recurrence write contract. `rrule` is the RRULE body only, inside the
 * closed authored vocabulary: daily with an optional `INTERVAL` of 1-7 and no
 * other key, weekly with `BYDAY` and `INTERVAL` 1-4, monthly with `BYMONTHDAY`,
 * or monthly positional with `BYSETPOS=±1` and exactly one `BYDAY`. A weekly
 * rule carrying `INTERVAL` is stored with `WKST=SU`. `COUNT` and `UNTIL` are
 * refused inside it because the end is `endsOn`.
 */
export const recurrenceRuleInputSchema = z
  .string()
  .trim()
  .min(6)
  .max(200)
  .refine((value) => !/(^|;)\s*(?:COUNT|UNTIL)\s*=/i.test(value), {
    message: 'rrule must not carry COUNT or UNTIL; set endsOn instead',
  })
  .describe(
    'The RRULE body: DAILY with an optional INTERVAL 1-7 and no other key, WEEKLY with BYDAY and INTERVAL 1-4, MONTHLY with BYMONTHDAY, or MONTHLY positional with BYSETPOS=±1 and exactly one BYDAY. A weekly rule carrying INTERVAL is stored with WKST=SU.',
  );

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
 * The event applicability on a write: an ordered set of saved audiences, the
 * first being the primary. Composition is intersection - a member matches
 * every audience - which is also how exclusion is said. `audienceId` stays a
 * one-element alias for this round so a deployed client keeps working; when
 * both are sent `audienceIds` wins and the alias must equal its first element.
 */
export const eventAudienceIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .superRefine((ids, ctx) => {
    const seen = new Set<string>();
    for (const [index, id] of ids.entries()) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: `${id} appears more than once; the audience set is ordered and unique`,
        });
      }
      seen.add(id);
    }
  })
  .describe(
    'Ordered audience ids; the first is the primary. Duplicates are refused. Defaults to the seeded Everyone audience.',
  );

export const eventAudienceAliasSchema = z
  .string()
  .uuid()
  .optional()
  .describe(
    'One-element alias for `audienceIds`, kept for one round. When both are sent it must equal the first element.',
  );

/** The alias rules shared by the create, the preview and the patch writes. */
function checkAudienceAlias(
  value: { audienceId?: string; audienceIds?: string[] },
  ctx: z.RefinementCtx,
): void {
  if (
    value.audienceIds &&
    value.audienceId !== undefined &&
    value.audienceId !== value.audienceIds[0]
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['audienceId'],
      message: `audienceId (${value.audienceId}) must equal the first element of audienceIds (${value.audienceIds[0]}); supply one alias or a matching first element`,
    });
  }
}

/**
 * `POST /v1/events/preview`: resolve a recurrence or a named period to dates
 * **without persisting anything**. The expected count and the per-audience
 * counts are computed for the audience set the form is about to save.
 */
export const eventPreviewInputSchema = z
  .object({
    audienceIds: eventAudienceIdsSchema.optional(),
    audienceId: eventAudienceAliasSchema,
    recurrence: eventRecurrenceInputSchema
      .optional()
      .describe("The create form's recurrence, resolved over the create's 90-day window."),
    period: eventPeriodInputSchema
      .optional()
      .describe(
        'The create period in either shape: `{ id, cycleMonth }` or `{ id, frequency: "monthly", day?, effectiveFrom? }`.',
      ),
  })
  .superRefine((value, ctx) => {
    checkAudienceAlias(value, ctx);
    if (!value.recurrence && !value.period) {
      ctx.addIssue({
        code: 'custom',
        path: ['period'],
        message: 'a preview requires a recurrence or a period',
      });
    }
    if (value.recurrence && value.period) {
      ctx.addIssue({
        code: 'custom',
        path: ['period'],
        message: 'supply either a recurrence or a period, not both',
      });
    }
  });

export const eventPreviewOccurrenceSchema = z.object({
  date: z.string(),
  /** The intersection count at that date, not a sum of the audiences. */
  expected: z.number().int(),
});

export const eventAudienceCountSchema = z.object({
  id: z.string(),
  count: z.number().int(),
});

export const eventPreviewSchema = z.object({
  occurrences: z.array(eventPreviewOccurrenceSchema),
  audienceCounts: z.array(eventAudienceCountSchema),
});

/**
 * `POST /v1/events`: one parent, a draft, with either manual occurrences
 * (standalone) or a first recurrence version (recurring), never both. The
 * range is derived, so `startDate`/`endDate` are not request fields. The
 * retired `ministry`/`presbyterOnly` projections are not in the payload, and
 * `eventNo` is refused by name because the server mints it.
 */
export const createEventParentSchema = z
  .object({
    eventNo: eventNoRefusalSchema,
    name: z.string().trim().min(1).max(200),
    audienceIds: eventAudienceIdsSchema.optional(),
    audienceId: eventAudienceAliasSchema,
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
      .describe("A standalone event's dates; mutually exclusive with `recurrence` or `period`."),
    recurrence: eventRecurrenceInputSchema
      .optional()
      .describe(
        "A recurring event's first schedule version; mutually exclusive with `occurrences` or `period`.",
      ),
    period: eventPeriodInputSchema
      .optional()
      .describe(
        'A named period the server resolves: `{ id, cycleMonth }` for one cycle, `{ id, frequency: "monthly", day?, effectiveFrom? }` for a monthly rule.',
      ),
  })
  .superRefine((value, ctx) => {
    checkAudienceAlias(value, ctx);
    if (!value.occurrences && !value.recurrence && !value.period) {
      ctx.addIssue({
        code: 'custom',
        path: ['occurrences'],
        message: 'a standalone event requires at least one occurrence, or supply a recurrence',
      });
    }
    if (value.period && value.occurrences) {
      ctx.addIssue({
        code: 'custom',
        path: ['period'],
        message: 'supply either occurrences or a period, not both',
      });
    }
    if (value.period && value.recurrence) {
      ctx.addIssue({
        code: 'custom',
        path: ['period'],
        message: 'supply either a recurrence or a period, not both',
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
 * all optional. `eventNo` is immutable and refused by name; the legacy
 * projections stay refused. `audienceIds` replaces the whole set when present.
 */
export const updateEventParentSchema = z
  .object({
    eventNo: eventNoRefusalSchema,
    name: z.string().trim().min(1).max(200).optional(),
    audienceIds: eventAudienceIdsSchema.optional(),
    audienceId: eventAudienceAliasSchema,
    timezone: z.string().min(1).max(64).optional(),
    description: z.string().max(2000).nullable().optional(),
    venueType: venueTypeSchema.optional(),
    venueName: z.string().max(200).nullable().optional(),
    startTime: timeStringSchema.optional(),
    endTime: timeStringSchema.nullable().optional(),
    tracksMembers: z.boolean().optional(),
    status: eventStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    checkAudienceAlias(value, ctx);
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
export type EventPeriod = z.infer<typeof eventPeriodSchema>;
export type EventPeriodCycleInput = z.infer<typeof eventPeriodCycleInputSchema>;
export type EventPeriodRuleInput = z.infer<typeof eventPeriodRuleInputSchema>;
export type EventPeriodInput = z.infer<typeof eventPeriodInputSchema>;
export type EventPeriodProvenance = z.infer<typeof eventPeriodProvenanceSchema>;
export type EventPreviewInput = z.infer<typeof eventPreviewInputSchema>;
export type EventPreview = z.infer<typeof eventPreviewSchema>;

/** The parent read's window figures: the data behind the four tiles (S-Q2). */
export const eventWindowSummarySchema = seriesSummarySchema;

export const eventParentSchema = z.object({
  id: z.string(),
  /** Minted by the server; required on read and immutable on edit. */
  eventNo: z.string(),
  name: z.string(),
  /** The ordered audience set; the first is the primary. */
  audienceIds: z.array(z.string()),
  audiences: z.array(audienceSummarySchema),
  /** The legacy primary alias, kept for one round beside `audiences[]`. */
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
  /** The provenance of a period-created event; null for every other event. */
  period: eventPeriodProvenanceSchema.nullable(),
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
