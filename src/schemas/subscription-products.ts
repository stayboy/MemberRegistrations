import { z } from 'zod';
import { GENDERS, RELATIONSHIP_TYPES } from '../domain/member-types.js';

export const PAYMENT_MODES = ['member', 'church', 'either'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const COVERS = ['individual', 'household'] as const;
export type Covers = (typeof COVERS)[number];

export const PERIOD_MONTHS = [1, 2, 3, 6, 12] as const;
export type PeriodMonths = (typeof PERIOD_MONTHS)[number];

const periodMonthsSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(6),
  z.literal(12),
]);

/**
 * A product is reference data: created once and toggled active. Pricing and
 * eligibility are fixed at creation, so this body is create-only.
 */
export const createSubscriptionProductSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,32}$/, 'code must be 1-32 letters, digits, hyphens or underscores'),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).nullable().optional(),
    premiumMinor: z.number().int(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters'),
    active: z.boolean().optional(),
    minMembershipDays: z.number().int().min(0).optional(),
    requiresCard: z.boolean().optional(),
    requiresVerified: z.boolean().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    minAge: z.number().int().min(0).max(150).nullable().optional(),
    maxAge: z.number().int().min(0).max(150).nullable().optional(),
    paymentMode: z.enum(PAYMENT_MODES),
    periodMonths: periodMonthsSchema,
    covers: z.enum(COVERS),
    maxDependents: z.number().int().min(0).optional(),
    allowedRelationships: z.array(z.enum(RELATIONSHIP_TYPES)).max(5).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.minAge != null && value.maxAge != null && value.minAge > value.maxAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxAge'],
        message: 'maxAge must be on or after minAge',
      });
    }
    if (value.covers === 'household') {
      if ((value.maxDependents ?? 0) < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxDependents'],
          message: 'a household product requires maxDependents of at least 1',
        });
      }
      if (!value.allowedRelationships || value.allowedRelationships.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['allowedRelationships'],
          message: 'a household product requires at least one allowed relationship',
        });
      }
    }
  });

export const updateSubscriptionProductSchema = z.object({
  active: z.boolean(),
});

export const subscriptionProductSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  premiumMinor: z.number().int(),
  currency: z.string(),
  active: z.boolean(),
  paymentMode: z.enum(PAYMENT_MODES),
  periodMonths: periodMonthsSchema,
  covers: z.enum(COVERS),
  maxDependents: z.number().int(),
  allowedRelationships: z.array(z.enum(RELATIONSHIP_TYPES)),
  minMembershipDays: z.number().int(),
  requiresCard: z.boolean(),
  requiresVerified: z.boolean(),
  gender: z.enum(GENDERS).nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  createdBy: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const subscriptionProductListSchema = z.object({
  items: z.array(subscriptionProductSchema),
});

export type CreateSubscriptionProductInput = z.infer<typeof createSubscriptionProductSchema>;
export type SubscriptionProductDto = z.infer<typeof subscriptionProductSchema>;
