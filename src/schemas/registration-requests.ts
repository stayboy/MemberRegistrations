import { z } from 'zod';
import { dateStringSchema, memberNoParamSchema } from './common.js';

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const registrationRequestListQuerySchema = z.object({
  status: z.enum(REGISTRATION_STATUSES).optional(),
  eventId: z.string().uuid().optional(),
  sessionDate: dateStringSchema.optional(),
});

export const registrationApproveSchema = z.object({
  memberNo: memberNoParamSchema,
});

export const registrationRejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const registrationRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** One-way phone hash; the raw phone is never stored or returned. */
  phoneHash: z.string(),
  eventId: z.string(),
  sessionDate: z.string(),
  status: z.enum(REGISTRATION_STATUSES),
  createdAt: z.string(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  memberNo: z.string().nullable(),
});

export const registrationRequestListSchema = z.object({
  items: z.array(registrationRequestSchema),
});
