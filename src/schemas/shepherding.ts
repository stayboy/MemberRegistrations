import { z } from 'zod';
import { CALL_OUTCOMES, STILL_IN_CHURCH } from '../domain/shepherding.js';
import { dateStringSchema, memberNoParamSchema } from './common.js';
import { contactResponseSchema } from './members.js';

export const assignmentInputSchema = z.object({
  officerMemberNo: memberNoParamSchema,
  memberNo: memberNoParamSchema,
  assignedOn: dateStringSchema.optional(),
  replaceAssignmentId: z.string().uuid().optional(),
  reason: z.string().max(500).nullable().optional(),
});

export const callInputSchema = z.object({
  calledOn: dateStringSchema.optional(),
  outcome: z.enum(CALL_OUTCOMES),
  stillInChurch: z.enum(STILL_IN_CHURCH).optional(),
  feedback: z.string().max(2000).nullable().optional(),
  issue: z.string().max(2000).nullable().optional(),
});

export const windowQuerySchema = z
  .object({
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must not be after to',
    path: ['from'],
  });

export const assignmentSchema = z.object({
  id: z.string(),
  officerMemberNo: z.string(),
  officerName: z.string(),
  memberNo: z.string(),
  memberName: z.string(),
  assignedOn: z.string(),
  endedOn: z.string().nullable(),
  reason: z.string().nullable(),
  endedReason: z.string().nullable(),
});

export const callSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  calledOn: z.string(),
  outcome: z.enum(CALL_OUTCOMES),
  stillInChurch: z.enum(STILL_IN_CHURCH),
  feedback: z.string().nullable(),
  issue: z.string().nullable(),
  recordedBy: z.string(),
  createdAt: z.string(),
});

export const callListSchema = z.object({
  assignmentId: z.string(),
  items: z.array(callSchema),
});

export const rosterEntrySchema = z.object({
  assignmentId: z.string(),
  assignedOn: z.string(),
  memberNo: z.string(),
  name: z.string(),
  placeOfResidence: z.string().nullable(),
  contacts: z.array(contactResponseSchema),
  attempts: z.number().int(),
  conversations: z.number().int(),
  lastCalledOn: z.string().nullable(),
  lastOutcome: z.enum(CALL_OUTCOMES).nullable(),
  stillInChurch: z.enum(STILL_IN_CHURCH).nullable(),
  latestFeedback: z.string().nullable(),
  latestIssue: z.string().nullable(),
});

export const rosterSchema = z.object({
  officerMemberNo: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  items: z.array(rosterEntrySchema),
});

export const officerSchema = z.object({
  memberNo: z.string(),
  name: z.string(),
  assignedMembers: z.number().int(),
  attempts: z.number().int(),
  conversations: z.number().int(),
  lastCalledOn: z.string().nullable(),
  membersNeverCalled: z.number().int(),
});

export const officerListSchema = z.object({
  items: z.array(officerSchema),
});

export const memberShepherdingSchema = z.object({
  memberNo: z.string(),
  name: z.string(),
  shepherd: z
    .object({
      assignmentId: z.string(),
      memberNo: z.string(),
      name: z.string(),
      assignedOn: z.string(),
    })
    .nullable(),
  history: z.array(
    z.object({
      assignmentId: z.string(),
      officerMemberNo: z.string(),
      officerName: z.string(),
      assignedOn: z.string(),
      endedOn: z.string().nullable(),
      reason: z.string().nullable(),
      endedReason: z.string().nullable(),
    }),
  ),
  calls: z.object({
    attempts: z.number().int(),
    conversations: z.number().int(),
    lastCalledOn: z.string().nullable(),
  }),
  stillInChurch: z.enum(STILL_IN_CHURCH).nullable(),
  latestFeedback: z.string().nullable(),
  latestIssue: z.string().nullable(),
  recentCalls: z.array(callSchema.extend({ officerMemberNo: z.string() })),
});

export const reportSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  totals: z.object({
    officers: z.number().int(),
    activeMembers: z.number().int(),
    assignedMembers: z.number().int(),
    unassignedMembers: z.number().int(),
    attempts: z.number().int(),
    conversations: z.number().int(),
    membersNeverCalled: z.number().int(),
    stillInChurch: z.object({
      yes: z.number().int(),
      no: z.number().int(),
      unknown: z.number().int(),
      neverReported: z.number().int(),
    }),
  }),
  officers: z.array(officerSchema),
});
