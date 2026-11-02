import { z } from 'zod';
import { CONTACT_CHANNELS, MINISTRIES, SUBSCRIPTION_KINDS } from '../domain/member.js';

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const contactInputSchema = z.object({
  id: z.string().min(1).optional(),
  channel: z.enum(CONTACT_CHANNELS),
  value: z.string().min(1).max(256),
  label: z.string().max(64).optional(),
  preferred: z.boolean().optional(),
});

export const attendanceEntrySchema = z.object({
  eventNo: z.string().min(1).max(64),
  eventName: z.string().min(1).max(128),
  date: z.string().regex(DATE_PATTERN, 'date must be an ISO date (YYYY-MM-DD)'),
  ministry: z.string().max(128).optional(),
});

export const createMemberSchema = z.object({
  memberNo: z
    .string()
    .regex(
      MEMBER_NO_PATTERN,
      'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
    ),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  otherNames: z.string().max(200).optional(),
  maidenName: z.string().max(100).optional(),
  alias: z.string().max(100).optional(),
  dateOfBirth: z
    .string()
    .regex(DATE_PATTERN, 'dateOfBirth must be an ISO date (YYYY-MM-DD)')
    .optional(),
  gender: z.string().max(32).optional(),
  placeOfResidence: z.string().max(200).optional(),
  contacts: z.array(contactInputSchema).max(20).optional(),
  subscriptions: z.array(z.enum(SUBSCRIPTION_KINDS)).max(SUBSCRIPTION_KINDS.length).optional(),
  ministries: z.array(z.enum(MINISTRIES)).max(MINISTRIES.length).optional(),
});

export const updateMemberSchema = createMemberSchema.omit({ memberNo: true }).partial();

export const memberResponseSchema = z.object({
  memberNo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().optional(),
  maidenName: z.string().optional(),
  alias: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  placeOfResidence: z.string().optional(),
  contacts: z.array(
    z.object({
      id: z.string(),
      channel: z.enum(CONTACT_CHANNELS),
      value: z.string(),
      label: z.string().optional(),
      preferred: z.boolean(),
    }),
  ),
  subscriptions: z.array(
    z.object({
      kind: z.enum(SUBSCRIPTION_KINDS),
      status: z.enum(['active', 'inactive']),
      since: z.string().optional(),
    }),
  ),
  ministries: z.array(z.enum(MINISTRIES)),
  attendance: z.array(attendanceEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const attendanceResponseSchema = z.object({
  memberNo: z.string(),
  entries: z.array(attendanceEntrySchema),
  summary: z.array(
    z.object({
      eventName: z.string(),
      attendances: z.number(),
      lastDate: z.string(),
    }),
  ),
});
