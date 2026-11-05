import { z } from 'zod';
import { dateStringSchema } from './common.js';

export const CONTRIBUTION_CHANNELS = ['app', 'ussd', 'manual'] as const;
export const contributionChannelSchema = z.enum(CONTRIBUTION_CHANNELS);

export type ContributionChannel = (typeof CONTRIBUTION_CHANNELS)[number];

/** `failed` only arrives from a gateway callback; a create is paid or initiated. */
export const contributionStatusSchema = z.enum(['initiated', 'paid', 'failed']);
export const createContributionStatusSchema = z.enum(['initiated', 'paid']);

const createContributionBase = z.object({
  memberNo: z.string().trim().min(1).max(32).optional(),
  visitorName: z.string().trim().min(1).max(128).optional(),
  visitorPhone: z.string().trim().min(1).max(32).optional(),
  offeringId: z.string().uuid(),
  eventId: z.string().uuid(),
  sessionDate: dateStringSchema,
  amountMinor: z.number().int().positive(),
  /** Defaults to the offering's current terms currency; a different value is rejected. */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters')
    .optional(),
  channel: contributionChannelSchema,
  status: createContributionStatusSchema.default('paid'),
  idempotencyKey: z.string().trim().min(1).max(128),
});

/**
 * Exactly one giver side: a member number, or a visitor name and phone together.
 * The visitor phone is hashed before storage and never returned.
 */
export const createContributionSchema = createContributionBase
  .superRefine((value, ctx) => {
    const hasMember = value.memberNo !== undefined;
    const hasVisitorName = value.visitorName !== undefined;
    const hasVisitorPhone = value.visitorPhone !== undefined;
    const hasVisitor = hasVisitorName || hasVisitorPhone;

    if (hasMember === hasVisitor) {
      ctx.addIssue({
        code: 'custom',
        message: 'exactly one of memberNo or the visitor name and phone pair is required',
        path: ['memberNo'],
      });
      return;
    }

    if (!hasMember && !(hasVisitorName && hasVisitorPhone)) {
      ctx.addIssue({
        code: 'custom',
        message: 'a visitor contribution requires both visitorName and visitorPhone',
        path: ['visitorPhone'],
      });
    }
  })
  .describe(
    'Exactly one giver side is required: either memberNo, or both visitorName and visitorPhone together. The visitor phone is normalised and hashed; it is never stored or returned raw.',
  );

export const listContributionsQuerySchema = z.object({
  memberNo: z.string().trim().min(1).max(32).optional(),
  offeringId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

export const summaryQuerySchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: 'from must be on or before to',
    path: ['to'],
  });

/** The wire shape; the visitor phone and its hash never appear here. */
export const contributionSchema = z.object({
  id: z.string(),
  memberNo: z.string().nullable(),
  visitorName: z.string().nullable(),
  offeringId: z.string(),
  eventId: z.string(),
  sessionDate: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  channel: contributionChannelSchema,
  status: contributionStatusSchema,
  reference: z.string(),
  idempotencyKey: z.string(),
  termsVersion: z.number().int(),
  createdAt: z.string(),
});

export const contributionListSchema = z.object({
  items: z.array(contributionSchema),
  nextCursor: z.string().optional(),
});

export const contributionSummaryItemSchema = z.object({
  currency: z.string(),
  memberCount: z.number().int(),
  memberPaidMinor: z.number().int(),
  visitorCount: z.number().int(),
  visitorPaidMinor: z.number().int(),
});

export const contributionSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  items: z.array(contributionSummaryItemSchema),
});

export type CreateContributionInput = z.infer<typeof createContributionSchema>;
export type ContributionItem = z.infer<typeof contributionSchema>;
export type ContributionListQuery = z.infer<typeof listContributionsQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type ContributionSummaryItem = z.infer<typeof contributionSummaryItemSchema>;
