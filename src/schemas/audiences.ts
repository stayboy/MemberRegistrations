import { z } from 'zod';

/**
 * An audience rule: exactly one operator over a flat clause list (A-1). The
 * server renders the summary and evaluates the rule; the client never does
 * either.
 */
export const AUDIENCE_OPERATORS = ['allOf', 'anyOf', 'noneOf'] as const;

const ministryClauseSchema = z.object({
  attribute: z.literal('ministry'),
  ministryCode: z.string().min(1).max(32),
});
const presbyterClauseSchema = z.object({
  attribute: z.literal('presbyter'),
  value: z.literal(true),
});
const ageBandClauseSchema = z.object({
  attribute: z.literal('ageBand'),
  minYears: z.number().int().min(0),
  maxYears: z.number().int().min(0).nullable(),
});
const genderClauseSchema = z.object({
  attribute: z.literal('gender'),
  value: z.enum(['male', 'female']),
});
const membershipStatusClauseSchema = z.object({
  attribute: z.literal('membershipStatus'),
  value: z.enum(['visitor', 'active']),
});

export const audienceClauseSchema = z.discriminatedUnion('attribute', [
  ministryClauseSchema,
  presbyterClauseSchema,
  ageBandClauseSchema,
  genderClauseSchema,
  membershipStatusClauseSchema,
]);

export const audienceRuleSchema = z
  .object({
    operator: z.enum(AUDIENCE_OPERATORS),
    clauses: z.array(audienceClauseSchema).min(1),
  })
  .superRefine((rule, ctx) => {
    for (const [index, clause] of rule.clauses.entries()) {
      if (
        clause.attribute === 'ageBand' &&
        clause.maxYears !== null &&
        clause.maxYears < clause.minYears
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['clauses', index, 'maxYears'],
          message: 'maxYears must not be below minYears',
        });
      }
    }
  });

/**
 * The audience write contract. A system audience is seeded and read-only, so
 * the handler refuses POST/PUT against one with `409 audience_system`
 * (member-registrations-event-audience.md A-6). There is no delete: a custom
 * audience is archived with `{ active: false }`.
 */
export const createAudienceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  rule: audienceRuleSchema,
});

export const updateAudienceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  rule: audienceRuleSchema.optional(),
  active: z.boolean().optional(),
});

export const audienceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** True for a seeded audience; system audiences are read-only. */
  system: z.boolean(),
  /** Server-rendered by `renderAudienceSummary`; never composed by a client. */
  summary: z.string(),
});

export const audienceSchema = z.object({
  id: z.string(),
  name: z.string(),
  system: z.boolean(),
  systemKey: z.string().nullable(),
  active: z.boolean(),
  rule: audienceRuleSchema,
  summary: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

export const audienceListSchema = z.object({
  items: z.array(audienceSchema),
});

export const audienceListQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type AudienceOperator = (typeof AUDIENCE_OPERATORS)[number];
export type AudienceClause = z.infer<typeof audienceClauseSchema>;
export type AudienceRule = z.infer<typeof audienceRuleSchema>;
export type AudienceSummary = z.infer<typeof audienceSummarySchema>;
export type Audience = z.infer<typeof audienceSchema>;
export type CreateAudienceInput = z.infer<typeof createAudienceSchema>;
export type UpdateAudienceInput = z.infer<typeof updateAudienceSchema>;
