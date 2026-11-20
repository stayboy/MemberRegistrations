import { z } from 'zod';
import { dateStringSchema, memberNoParamSchema } from './common.js';

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const registrationRequestListQuerySchema = z.object({
  status: z.enum(REGISTRATION_STATUSES).optional(),
  eventId: z.string().uuid().optional(),
  sessionDate: dateStringSchema.optional(),
});

export const registrationApproveSchema = z
  .object({
    memberNo: memberNoParamSchema,
    /**
     * MR-53: the caller's number either becomes the member's own contact or is
     * the guardian's. `borrowed` therefore names the guardian.
     */
    phoneOwnership: z.enum(['own', 'borrowed']),
    guardianMemberNo: memberNoParamSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.phoneOwnership === 'borrowed' && !value.guardianMemberNo) {
      ctx.addIssue({
        code: 'custom',
        path: ['guardianMemberNo'],
        message: 'guardianMemberNo is required when the number is borrowed',
      });
    }
    // MR-53: a guardian is the reachability path of a borrowed number only. An
    // `own` approval has an owned contact, so a guardian would be noise.
    if (value.phoneOwnership === 'own' && value.guardianMemberNo) {
      ctx.addIssue({
        code: 'custom',
        path: ['guardianMemberNo'],
        message: 'guardianMemberNo is only used when the number is borrowed',
      });
    }
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
  /** The caller's number as the officer may see it; null when unreadable. */
  phoneMasked: z.string().nullable(),
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
