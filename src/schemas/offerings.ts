import { z } from 'zod';
import { dateStringSchema } from './common.js';

export const OFFERING_KINDS = ['freewill', 'tithe', 'building', 'missions', 'other'] as const;

export const offeringKindSchema = z.enum(OFFERING_KINDS);

export type OfferingKind = (typeof OFFERING_KINDS)[number];

const termsBase = z.object({
  name: z.string().max(200).nullable().optional(),
  purpose: z.string().trim().min(1).max(512),
  kind: offeringKindSchema,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters')
    .default('GHS'),
  targetMinor: z.number().int().positive().nullable().optional(),
  defaultAmountMinor: z.number().int().positive().nullable().optional(),
  startsOn: dateStringSchema.nullable().optional(),
  endsOn: dateStringSchema.nullable().optional(),
  availableUntil: dateStringSchema.nullable().optional(),
  scripture: z.string().max(500).nullable().optional(),
  gatewayAccount: z.string().max(200).nullable().optional(),
  gatewayMetadata: z.record(z.string(), z.string()).nullable().optional(),
});

/** `endsOn` may only be present when `startsOn` is, and never before it. */
const dateOrder = (value: { startsOn?: string | null; endsOn?: string | null }): boolean =>
  !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn;

export const termsInputSchema = termsBase.refine(dateOrder, {
  message: 'endsOn must not be before startsOn',
  path: ['endsOn'],
});

/** A full replacement body plus the version the caller last read and the NFR-3 reason. */
export const termsPublishSchema = termsBase
  .extend({
    baseVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(512),
  })
  .refine(dateOrder, {
    message: 'endsOn must not be before startsOn',
    path: ['endsOn'],
  });

/** The stored, published shape; a version is immutable once written. */
export const termsSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().nullable(),
  purpose: z.string(),
  kind: offeringKindSchema,
  currency: z.string(),
  targetMinor: z.number().int().nullable(),
  defaultAmountMinor: z.number().int().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  availableUntil: z.string().nullable(),
  scripture: z.string().nullable(),
  gatewayAccount: z.string().nullable(),
  gatewayMetadata: z.record(z.string(), z.string()).nullable(),
  /** Audit (NFR-3): who published this version, when, and why. */
  createdAt: z.string(),
  createdBy: z.string(),
  reason: z.string().nullable(),
});

export const offeringSchema = z.object({
  id: z.string(),
  active: z.boolean(),
  terms: termsSchema,
  createdAt: z.string(),
});

export const offeringListSchema = z.object({
  items: z.array(offeringSchema),
});

export const offeringStatsSchema = z.object({
  attachedEvents: z.number().int(),
  pledgedMinor: z.number().int(),
  paidMinor: z.number().int(),
  pendingMinor: z.number().int(),
  honorRate: z.number(),
  contributionCount: z.number().int(),
});

export const listQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
});

export const setActiveSchema = z.object({
  active: z.boolean(),
});

export const attachSchema = z.object({
  offeringId: z.string().uuid(),
  availableUntil: dateStringSchema.nullable().optional(),
});

/** A series attachment covers every occurrence and carries no attachment expiry. */
export const seriesAttachSchema = z.strictObject({
  offeringId: z.string().uuid(),
});

export const offeringAttachmentSchema = z.object({
  attachmentId: z.string(),
  offeringId: z.string(),
  availableUntil: z.string().nullable(),
  terms: termsSchema,
});

export const offeringAttachmentListSchema = z.object({
  items: z.array(offeringAttachmentSchema),
});

export const exceptionInputSchema = z.object({
  date: dateStringSchema,
  kind: z.enum(['skip', 'opt_in']),
  note: z.string().max(500).nullable().optional(),
});

export const exceptionRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  kind: z.enum(['skip', 'opt_in']),
  note: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export const exceptionListSchema = z.object({
  items: z.array(exceptionRowSchema),
});

export type TermsInput = z.infer<typeof termsInputSchema>;
export type TermsPublishInput = z.infer<typeof termsPublishSchema>;
export type OfferingListItem = z.infer<typeof offeringSchema>;
export type OfferingsListQuery = z.infer<typeof listQuerySchema>;
export type AttachInput = z.infer<typeof attachSchema>;
export type SeriesAttachInput = z.infer<typeof seriesAttachSchema>;
export type ExceptionInput = z.infer<typeof exceptionInputSchema>;
export type ExceptionRowItem = z.infer<typeof exceptionRowSchema>;
