import { z } from 'zod';
import { dateStringSchema } from './common.js';
import { contributionChannelSchema, contributionSchema } from './contributions.js';

export const PAYMENT_GROUP_STATUSES = ['pending', 'paid', 'failed'] as const;
export const PAYMENT_INTENT_STATUSES = ['initiated', 'paid', 'failed'] as const;

export const paymentGroupStatusSchema = z.enum(PAYMENT_GROUP_STATUSES);
export const paymentIntentStatusSchema = z.enum(PAYMENT_INTENT_STATUSES);

const memberNoRef = z.string().trim().min(1).max(32);

const paymentGroupItemSchema = z.object({
  offeringId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
});

/**
 * One USSD money commit: a member or a visitor pays a total split across one
 * to twenty offerings. A pledge redemption is the same shape with `pledgeId`
 * and exactly one item.
 */
export const createPaymentGroupSchema = z
  .object({
    memberNo: memberNoRef.optional(),
    visitorName: z.string().trim().min(1).max(128).optional(),
    visitorPhone: z.string().trim().min(1).max(32).optional(),
    eventId: z.string().uuid(),
    sessionDate: dateStringSchema.optional(),
    /** Defaults to the offering terms currency; a different value is rejected. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters')
      .optional(),
    channel: contributionChannelSchema.default('ussd'),
    idempotencyKey: z.string().trim().min(1).max(128),
    pledgeId: z.string().uuid().optional(),
    items: z.array(paymentGroupItemSchema).min(1).max(20),
  })
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
        message: 'a visitor payment group requires both visitorName and visitorPhone',
        path: ['visitorPhone'],
      });
    }

    if (value.pledgeId !== undefined && value.items.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'a pledge redemption group has exactly one item',
        path: ['items'],
      });
    }
  })
  .describe(
    'Exactly one payer side is required: memberNo, or both visitorName and visitorPhone. A pledge redemption carries pledgeId and exactly one item.',
  );

export const paymentCallbackSchema = z.object({
  reference: z.string().trim().min(1).max(128),
  status: z.enum(['paid', 'failed']),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters'),
  occurredAt: z.string().min(1),
});

export const paymentGroupSchema = z.object({
  id: z.string(),
  reference: z.string(),
  idempotencyKey: z.string(),
  totalMinor: z.number().int(),
  currency: z.string(),
  status: paymentGroupStatusSchema,
  pledgeId: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export const paymentIntentSchema = z.object({
  id: z.string(),
  paymentGroupId: z.string(),
  gateway: z.string(),
  reference: z.string(),
  status: paymentIntentStatusSchema,
  rawCallbackHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const paymentGroupResultSchema = z.object({
  created: z.boolean(),
  group: paymentGroupSchema,
  contributions: z.array(contributionSchema),
  intent: paymentIntentSchema,
});

export const paymentCallbackResultSchema = z.object({
  status: z.enum(['paid', 'failed']),
  duplicate: z.boolean(),
});

export type CreatePaymentGroupInput = z.infer<typeof createPaymentGroupSchema>;
export type PaymentCallbackInput = z.infer<typeof paymentCallbackSchema>;
export type PaymentGroup = z.infer<typeof paymentGroupSchema>;
export type PaymentIntent = z.infer<typeof paymentIntentSchema>;
export type PaymentGroupResult = z.infer<typeof paymentGroupResultSchema>;
