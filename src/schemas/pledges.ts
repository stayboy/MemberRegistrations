import { z } from 'zod';
import { dateStringSchema } from './common.js';

/** `overdue` is derived on read; it is never stored. */
export const PLEDGE_STATUSES = ['pending', 'honored', 'dishonored', 'overdue'] as const;
export const PLEDGE_STORED_STATUSES = ['pending', 'honored', 'dishonored'] as const;
export const REMINDER_CHANNELS = ['sms', 'whatsapp', 'ussd', 'email'] as const;
export const REMINDER_STATUSES = ['pending', 'sent', 'failed', 'cancelled'] as const;

export const pledgeStatusSchema = z.enum(PLEDGE_STATUSES);
export const pledgeStoredStatusSchema = z.enum(PLEDGE_STORED_STATUSES);
export const reminderChannelSchema = z.enum(REMINDER_CHANNELS);
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);

const memberNoRef = z.string().trim().min(1).max(32);

export const createPledgeSchema = z
  .object({
    memberNo: memberNoRef,
    offeringId: z.string().uuid(),
    eventId: z.string().uuid(),
    sessionDate: dateStringSchema.optional(),
    amountMinor: z.number().int().positive(),
    /** Defaults to the offering's current terms currency; a different value is rejected. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be three uppercase letters')
      .optional(),
    expectedOn: dateStringSchema,
    followUpOfficerMemberNo: memberNoRef.optional(),
    officerReason: z.string().trim().min(3).max(500).optional(),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .refine(
    (value) => value.officerReason === undefined || value.followUpOfficerMemberNo !== undefined,
    {
      message: 'officerReason requires followUpOfficerMemberNo',
      path: ['officerReason'],
    },
  );

export const listPledgesQuerySchema = z.object({
  status: pledgeStatusSchema.optional(),
  memberNo: memberNoRef.optional(),
  officerMemberNo: memberNoRef.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

export const pledgeSchema = z.object({
  id: z.string(),
  memberNo: z.string(),
  offeringId: z.string(),
  eventId: z.string(),
  sessionDate: z.string().nullable(),
  amountMinor: z.number().int(),
  currency: z.string(),
  expectedOn: z.string(),
  followUpOfficerMemberNo: z.string(),
  status: pledgeStatusSchema,
  reason: z.string().nullable(),
  termsVersion: z.number().int(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});

export const pledgeListSchema = z.object({
  items: z.array(pledgeSchema),
  nextCursor: z.string().optional(),
});

export const pledgeEventSchema = z.object({
  id: z.string(),
  pledgeId: z.string(),
  kind: z.enum(['created', 'honored', 'dishonored', 'reassigned']),
  actor: z.string(),
  reason: z.string().nullable(),
  /** Set on `reassigned`: the officer before and after, so both stay in history. */
  fromOfficerMemberNo: z.string().nullable(),
  toOfficerMemberNo: z.string().nullable(),
  at: z.string(),
});

export const reminderSchema = z.object({
  id: z.string(),
  pledgeId: z.string(),
  scheduledFor: z.string(),
  channel: reminderChannelSchema,
  status: reminderStatusSchema,
  sentAt: z.string().nullable(),
});

export const reminderListSchema = z.object({
  items: z.array(reminderSchema),
});

export const addReminderSchema = z.object({
  scheduledFor: dateStringSchema,
  channel: reminderChannelSchema,
});

/** Honor is recorded on payment and carries no body. */
export const honorSchema = z.object({});

export const dishonorSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const reassignSchema = z.object({
  officerMemberNo: memberNoRef,
  reason: z.string().trim().min(3).max(500),
});

export type CreatePledgeInput = z.infer<typeof createPledgeSchema>;
export type PledgeItem = z.infer<typeof pledgeSchema>;
export type PledgeListQuery = z.infer<typeof listPledgesQuerySchema>;
export type PledgeEventItem = z.infer<typeof pledgeEventSchema>;
export type ReminderItem = z.infer<typeof reminderSchema>;
export type AddReminderInput = z.infer<typeof addReminderSchema>;
export type DishonorInput = z.infer<typeof dishonorSchema>;
export type ReassignInput = z.infer<typeof reassignSchema>;
