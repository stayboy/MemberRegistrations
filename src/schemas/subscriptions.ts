import { z } from 'zod';
import { memberNoParamSchema } from './common.js';
import { GENDERS, RELATIONSHIP_TYPES } from '../domain/member-types.js';
import { COVERS, PAYMENT_MODES } from './subscription-products.js';

export const subscriptionPaymentChannels = ['app', 'ussd', 'manual'] as const;
export const claimStatuses = ['pending', 'approved', 'rejected', 'paid'] as const;

export const subscribeProductSchema = z.object({
  productCode: z.string().trim().min(1).max(32),
  /** Resolved server-side except for an `either` product, where it is required. */
  paidBy: z.enum(['member', 'church']).optional(),
  coveredMemberNos: z.array(memberNoParamSchema).max(50).optional(),
});

export const renewSubscriptionSchema = z.object({
  paidBy: z.enum(['member', 'church']).optional(),
});

export const recordPaymentSchema = z.object({
  // The repository maps a non-positive amount to 422 invalid_amount.
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters'),
  channel: z.enum(subscriptionPaymentChannels),
  reference: z.string().trim().min(1).max(100).optional(),
  /** Informational only: it never anchors the cover period. */
  paidAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export const recordClaimSchema = z.object({
  memberNo: memberNoParamSchema,
  // The repository maps a non-positive amount to 422 invalid_amount.
  amountMinor: z.number().int(),
  reason: z.string().trim().min(1).max(500),
});

export const decideClaimSchema = z.object({
  status: z.enum(['approved', 'rejected', 'paid']),
  note: z.string().trim().max(500).optional(),
});

export const subscriptionPaymentSchema = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  channel: z.enum(subscriptionPaymentChannels),
  reference: z.string(),
  paidAt: z.string(),
  recordedBy: z.string(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});

export const subscriptionPaymentListSchema = z.object({
  items: z.array(subscriptionPaymentSchema),
});

export const subscriptionClaimSchema = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  memberNo: z.string(),
  memberName: z.string(),
  amountMinor: z.number().int(),
  reason: z.string(),
  status: z.enum(claimStatuses),
  recordedBy: z.string(),
  recordedAt: z.string(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
});

export const subscriptionClaimListSchema = z.object({
  items: z.array(subscriptionClaimSchema),
});

export const memberSubscriptionPolicyholderSchema = z.object({
  memberNo: z.string(),
  name: z.string(),
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
});

/** The owned + inherited read row; legacy rows carry a kind and null product fields. */
export const memberSubscriptionSchema = z.object({
  id: z.string(),
  source: z.enum(['owned', 'inherited']),
  role: z.enum(['policyholder', 'covered']),
  status: z.enum(['active', 'expired', 'ended']),
  kind: z.string().nullable(),
  productCode: z.string().nullable(),
  productName: z.string().nullable(),
  paidBy: z.enum(['member', 'church']).nullable(),
  premiumMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  startedOn: z.string(),
  endedOn: z.string().nullable(),
  scope: z.enum(COVERS),
  coveredMemberNos: z.array(z.string()),
  claimedTotalMinor: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
  updatedAt: z.string(),
  policyholder: memberSubscriptionPolicyholderSchema.nullable(),
  relationship: z.enum(RELATIONSHIP_TYPES).nullable(),
});

export const memberSubscriptionListSchema = z.object({
  items: z.array(memberSubscriptionSchema),
});

export type SubscribeProductInput = z.infer<typeof subscribeProductSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RecordClaimInput = z.infer<typeof recordClaimSchema>;
export type DecideClaimInput = z.infer<typeof decideClaimSchema>;
export type SubscriptionPaymentDto = z.infer<typeof subscriptionPaymentSchema>;
export type SubscriptionClaimDto = z.infer<typeof subscriptionClaimSchema>;
export type MemberSubscriptionDto = z.infer<typeof memberSubscriptionSchema>;

export const subscriptionPaymentModeSchema = z.enum(PAYMENT_MODES);
