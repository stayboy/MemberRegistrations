import { z } from 'zod';
import { CONTACT_KINDS } from '../domain/contacts.js';
import {
  GENDERS,
  LIST_INCLUDES,
  RELATIONSHIP_TYPES,
  SUBSCRIPTION_KINDS,
  type Gender,
  type ListInclude,
} from '../repos/members.js';
import { dateStringSchema, memberNoParamSchema } from './common.js';

export const contactInputSchema = z.object({
  kind: z.enum(CONTACT_KINDS),
  value: z.string().min(1).max(256),
  displayOrder: z.number().int().min(1).max(999).optional(),
});

export const createMemberSchema = z.object({
  memberNo: memberNoParamSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  otherNames: z.string().max(200).nullable().optional(),
  maidenName: z.string().max(100).nullable().optional(),
  alias: z.string().max(100).nullable().optional(),
  dob: dateStringSchema.nullable().optional(),
  gender: z.enum(GENDERS).optional(),
  placeOfResidence: z.string().max(200).nullable().optional(),
  addressLine: z.string().max(300).nullable().optional(),
  joinedOn: dateStringSchema.nullable().optional(),
  isPresbyter: z.boolean().optional(),
  presbyterRank: z.number().int().min(1).nullable().optional(),
  membershipCardNo: z.string().trim().max(32).nullable().optional(),
  verified: z.boolean().optional(),
  contacts: z.array(contactInputSchema).max(20).optional(),
  ministries: z.array(z.string().min(2).max(16)).max(20).optional(),
});

export const updateMemberSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  otherNames: z.string().max(200).nullable().optional(),
  maidenName: z.string().max(100).nullable().optional(),
  alias: z.string().max(100).nullable().optional(),
  dob: dateStringSchema.nullable().optional(),
  gender: z.enum(GENDERS).optional(),
  placeOfResidence: z.string().max(200).nullable().optional(),
  addressLine: z.string().max(300).nullable().optional(),
  joinedOn: dateStringSchema.nullable().optional(),
  isPresbyter: z.boolean().optional(),
  presbyterRank: z.number().int().min(1).nullable().optional(),
  membershipCardNo: z.string().trim().max(32).nullable().optional(),
  verified: z.boolean().optional(),
});

export const relationshipInputSchema = z.object({
  relatedMemberNo: memberNoParamSchema,
  type: z.enum(RELATIONSHIP_TYPES),
  isDependent: z.boolean().optional(),
});

export const subscriptionInputSchema = z.object({
  kind: z.enum(SUBSCRIPTION_KINDS),
  scope: z.enum(['individual', 'household']),
  reference: z.string().max(100).nullable().optional(),
  startedOn: dateStringSchema.optional(),
  coveredMemberNos: z.array(memberNoParamSchema).max(50).optional(),
});

export const attendanceInputSchema = z.object({
  seriesId: z.string().uuid(),
  date: dateStringSchema,
});

export const listQuerySchema = z
  .object({
    q: z.string().min(1).max(100).optional(),
    contact: z.string().min(3).max(256).optional(),
    status: z.enum(['active', 'archived']).optional(),
    includeArchived: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    unassigned: z
      .enum(['true'])
      .optional()
      .transform((value) => value === 'true'),
    include: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const parts = value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
        return [...new Set(parts)] as ListInclude[];
      }),
    seriesId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(64).optional(),
  })
  .superRefine((query, ctx) => {
    for (const item of query.include ?? []) {
      if (!(LIST_INCLUDES as readonly string[]).includes(item)) {
        ctx.addIssue({
          code: 'custom',
          path: ['include'],
          message: `include must be one of: ${LIST_INCLUDES.join(', ')}`,
        });
      }
    }
    if (query.include?.includes('attendance') && !query.seriesId) {
      ctx.addIssue({
        code: 'custom',
        path: ['seriesId'],
        message: 'seriesId is required when include=attendance',
      });
    }
    if (query.unassigned && query.status === 'archived') {
      ctx.addIssue({
        code: 'custom',
        path: ['unassigned'],
        message:
          'unassigned=true already implies active; it cannot be combined with status=archived',
      });
    }
  });

export const purgeSchema = z.object({
  confirm: z.string().min(1),
});

const contactSchema = z.object({
  id: z.string(),
  kind: z.enum(CONTACT_KINDS),
  value: z.string(),
  displayOrder: z.number().int(),
  ownerMemberNo: z.string(),
  linked: z.boolean(),
});

const ministrySchema = z.object({
  code: z.string(),
  name: z.string(),
});

const subscriptionSchema = z.object({
  id: z.string(),
  kind: z.enum(SUBSCRIPTION_KINDS).nullable(),
  scope: z.enum(['individual', 'household']),
  status: z.enum(['active', 'ended']),
  reference: z.string().nullable(),
  startedOn: z.string(),
  endedOn: z.string().nullable(),
  role: z.enum(['policyholder', 'covered']),
  policyholderMemberNo: z.string(),
  coveredMemberNos: z.array(z.string()),
});

const relationshipSchema = z.object({
  id: z.string(),
  type: z.enum(RELATIONSHIP_TYPES),
  isDependent: z.boolean(),
  memberNo: z.string(),
  name: z.string(),
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
  archived: z.boolean(),
});

const attendanceEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  source: z.enum(['import', 'manual']),
});

const attendanceSeriesSchema = z.object({
  seriesId: z.string(),
  seriesName: z.string(),
  ministry: z.string().nullable(),
  attended: z.number().int(),
  expected: z.number().int(),
  remaining: z.number().int(),
  status: z.enum(['ongoing', 'completed', 'in_progress']),
  entries: z.array(attendanceEntrySchema),
});

const memberAttendanceSummarySchema = z.object({
  seriesId: z.string(),
  seriesName: z.string(),
  attended: z.number().int(),
  expected: z.number().int(),
  remaining: z.number().int(),
  status: z.enum(['ongoing', 'completed', 'in_progress']),
  lastAttendedOn: z.string().nullable(),
});

const memberSubscriptionSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(SUBSCRIPTION_KINDS).nullable(),
  scope: z.enum(['individual', 'household']),
  status: z.enum(['active', 'ended']),
  role: z.enum(['policyholder', 'covered']),
  policyholderMemberNo: z.string(),
  coveredCount: z.number().int(),
});

export const memberSummarySchema = z.object({
  memberNo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
  ageMonths: z.number().int().nullable(),
  placeOfResidence: z.string().nullable(),
  joinedOn: z.string().nullable(),
  isPresbyter: z.boolean(),
  archivedAt: z.string().nullable(),
  contactCount: z.number().int(),
  ministries: z.array(ministrySchema),
  attendance: memberAttendanceSummarySchema.nullable().optional(),
  subscriptions: z.array(memberSubscriptionSummarySchema).optional(),
});

export const memberDetailSchema = memberSummarySchema.extend({
  id: z.string(),
  presbyterRank: z.number().int().nullable(),
  membershipCardNo: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  maidenName: z.string().nullable(),
  alias: z.string().nullable(),
  dob: z.string().nullable(),
  addressLine: z.string().nullable(),
  purgedAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contacts: z.array(contactSchema),
  subscriptions: z.array(subscriptionSchema),
  relationships: z.array(relationshipSchema),
  attendance: z.array(attendanceSeriesSchema),
});

export const memberListSchema = z.object({
  items: z.array(memberSummarySchema),
  nextCursor: z.string().optional(),
});

export const memberContributionWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
  paidMinor: z.number().int(),
});

export const memberContributionsSummarySchema = z.object({
  currency: z.string(),
  week: memberContributionWindowSchema,
  quarter: memberContributionWindowSchema,
  year: memberContributionWindowSchema,
  topEvents: z.array(
    z.object({
      eventId: z.string(),
      name: z.string(),
      paidMinor: z.number().int(),
    }),
  ),
});

export const attendanceListSchema = z.object({
  memberNo: z.string(),
  series: z.array(attendanceSeriesSchema),
});

export const memberAttendanceWindowQuerySchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
});

export const memberAttendanceWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
  attended: z.number().int(),
  expected: z.number().int(),
  events: z.array(
    z.object({
      eventId: z.string(),
      name: z.string(),
      sessionDate: z.string(),
    }),
  ),
});

const profileShepherdSchema = z.object({
  memberNo: z.string(),
  name: z.string(),
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
});

export const memberProfileSchema = z.object({
  memberNo: z.string(),
  name: z.string(),
  gender: z.enum(GENDERS),
  age: z.number().int().nullable(),
  ministries: z.array(z.string()),
  shepherd: profileShepherdSchema.nullable(),
  attendance: z.object({
    status: z.enum(['regular', 'non_regular', 'not_enough_data']),
    attended: z.number().int(),
    expected: z.number().int(),
    window: z.literal(5),
    lastAttendedOn: z.string().nullable(),
  }),
});

export type MemberAttendanceWindowQuery = z.infer<typeof memberAttendanceWindowQuerySchema>;

export const contactResponseSchema = contactSchema;
export const subscriptionResponseSchema = subscriptionSchema;
export const relationshipResponseSchema = relationshipSchema;
export const attendanceEntryResponseSchema = attendanceEntrySchema;

export type GenderInput = Gender;
