import { z } from 'zod';
import { memberResponseSchema } from './member.js';

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
});

export const memberListResponseSchema = z.object({
  items: z.array(memberResponseSchema),
  nextCursor: z.string().optional(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export const subscriptionRequestSchema = z.object({
  kind: z.enum(['life-insurance', 'credit-union']),
});

export const ministryRequestSchema = z.object({
  ministry: z.enum(['pemem', 'women-ministry', 'choir', 'prayer']),
});
