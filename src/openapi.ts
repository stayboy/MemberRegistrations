import { z } from 'zod';
import { healthResponseSchema, problemSchema } from './schemas/common.js';
import {
  exchangeRequestSchema,
  exchangeResponseSchema,
  magicLinkAcceptedSchema,
  magicLinkRequestSchema,
  meResponseSchema,
  sessionOfficerSchema,
} from './schemas/auth.js';
import {
  attendanceEntryResponseSchema,
  attendanceInputSchema,
  attendanceListSchema,
  contactInputSchema,
  contactResponseSchema,
  createMemberSchema,
  memberAttendanceWindowSchema,
  memberContributionsSummarySchema,
  memberDetailSchema,
  memberListSchema,
  memberProfileSchema,
  memberSummarySchema,
  purgeSchema,
  relationshipInputSchema,
  relationshipResponseSchema,
  subscriptionInputSchema,
  subscriptionResponseSchema,
  updateMemberSchema,
} from './schemas/members.js';
import {
  createSeriesSchema,
  ministryInputSchema,
  ministrySchema,
  ministryUpdateSchema,
  occurrenceListSchema,
  scheduleInputSchema,
  scheduleSchema,
  seriesExceptionInputSchema,
  seriesSchema,
  seriesSummarySchema,
  updateSeriesSchema,
} from './schemas/reference.js';
import {
  attendanceImportSchema,
  importBatchSchema,
  memberImportSchema,
} from './schemas/imports.js';
import {
  codeItemSchema,
  codeListSchema,
  createEventSchema,
  delegationInputSchema,
  delegationListSchema,
  delegationSchema,
  eventAttendanceEntrySchema,
  eventAttendanceInputSchema,
  eventAttendanceSchema,
  eventGenerationSchema,
  eventListSchema,
  eventSchema,
  headcountInputSchema,
  headcountListSchema,
  headcountSchema,
  issueCodeSchema,
  issuedCodeSchema,
  updateEventSchema,
  voidCodeSchema,
} from './schemas/events.js';
import {
  registrationApproveSchema,
  registrationRejectSchema,
  registrationRequestListSchema,
  registrationRequestSchema,
} from './schemas/registration-requests.js';
import {
  attachSchema,
  churchOfferingSummarySchema,
  exceptionInputSchema,
  exceptionListSchema,
  exceptionRowSchema,
  offeringAttachmentListSchema,
  offeringAttachmentSchema,
  offeringListSchema,
  offeringSchema,
  seriesAttachSchema,
  setActiveSchema,
  termsInputSchema,
  termsPublishSchema,
  termsSchema,
} from './schemas/offerings.js';
import {
  contributionListSchema,
  contributionSchema,
  contributionSummarySchema,
  createContributionSchema,
} from './schemas/contributions.js';
import {
  offeringCountInputSchema,
  offeringCountListSchema,
  offeringCountSchema,
} from './schemas/offering-counts.js';
import {
  addReminderSchema,
  createPledgeSchema,
  dishonorSchema,
  honorSchema,
  pledgeEventSchema,
  pledgeListSchema,
  pledgeSchema,
  reassignSchema,
  reminderListSchema,
  reminderSchema,
  settleSchema,
} from './schemas/pledges.js';
import {
  createPaymentGroupSchema,
  paymentCallbackResultSchema,
  paymentCallbackSchema,
  paymentGroupResultSchema,
  paymentGroupSchema,
  paymentIntentSchema,
} from './schemas/payment-groups.js';
import {
  assignmentInputSchema,
  assignmentSchema,
  callInputSchema,
  callListSchema,
  callSchema,
  memberShepherdingSchema,
  officerListSchema,
  officerSchema,
  reportSchema,
  rosterEntrySchema,
  rosterSchema,
} from './schemas/shepherding.js';
import {
  createSubscriptionProductSchema,
  subscriptionProductListSchema,
  subscriptionProductSchema,
  updateSubscriptionProductSchema,
} from './schemas/subscription-products.js';
import {
  decideClaimSchema,
  memberSubscriptionListSchema,
  memberSubscriptionSchema,
  recordClaimSchema,
  recordPaymentSchema,
  renewSubscriptionSchema,
  subscribeProductSchema,
  subscriptionClaimListSchema,
  subscriptionClaimSchema,
  subscriptionPaymentListSchema,
  subscriptionPaymentSchema,
} from './schemas/subscriptions.js';

type JsonSchema = Record<string, unknown>;

function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io }) as JsonSchema;
  delete json.$schema;
  return json;
}

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ref('Problem') } },
});

const json = (description: string, name: string) => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});

const noContent = (description: string) => ({ description });

const unauthorized = problem('Missing or invalid bearer token.');
const badRequest = problem('A valid request whose values cannot be used as asked.');
const validation = problem('Invalid request body or query parameters.');
const notFound = problem('The requested record was not found.');
const conflict = problem('The request conflicts with the current state.');

const memberNoParam = {
  name: 'memberNo',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' },
};

const idParam = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
});

const actorHeader = {
  name: 'X-Actor-Id',
  in: 'header',
  required: true,
  schema: { type: 'string' },
};

const ifMatchHeader = {
  name: 'If-Match',
  in: 'header',
  required: false,
  schema: { type: 'string' },
};

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MemberRegistrations API',
      version: '2.2.0',
      description:
        'Member registrations, ministries, event series, derived attendance, and shepherding. Attendance counts are computed from series schedules, imported occurrence lists and attendance registries; shepherding calls are append-only. Browser clients call /auth/* and /gateway/v1/*; the gateway holds the API bearer and derives X-Actor-Id from the officer session.',
    },
    servers: [{ url: '/', description: 'Current deployment' }],
    'x-gateway': {
      prefix: '/gateway/v1',
      target: '/v1',
      authentication: 'session',
      description:
        'Browser traffic calls this prefix with an officer session; the gateway injects the API bearer and derived X-Actor-Id, then rewrites to /v1.',
    },
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Server-to-server API token. Never held by a browser.',
        },
        sessionAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Short-lived officer session issued by /auth/exchange.',
        },
      },
      schemas: {
        Problem: toSchema(problemSchema, 'output'),
        Health: toSchema(healthResponseSchema, 'output'),
        MagicLinkRequest: toSchema(magicLinkRequestSchema, 'input'),
        MagicLinkAccepted: toSchema(magicLinkAcceptedSchema, 'output'),
        ExchangeRequest: toSchema(exchangeRequestSchema, 'input'),
        SessionOfficer: toSchema(sessionOfficerSchema, 'output'),
        ExchangeResponse: toSchema(exchangeResponseSchema, 'output'),
        MeResponse: toSchema(meResponseSchema, 'output'),
        MemberSummary: toSchema(memberSummarySchema, 'output'),
        MemberDetail: toSchema(memberDetailSchema, 'output'),
        MemberList: toSchema(memberListSchema, 'output'),
        MemberContributionsSummary: toSchema(memberContributionsSummarySchema, 'output'),
        MemberAttendanceWindow: toSchema(memberAttendanceWindowSchema, 'output'),
        MemberProfile: toSchema(memberProfileSchema, 'output'),
        CreateMember: toSchema(createMemberSchema, 'input'),
        UpdateMember: toSchema(updateMemberSchema, 'input'),
        PurgeMember: toSchema(purgeSchema, 'input'),
        Contact: toSchema(contactResponseSchema, 'output'),
        ContactInput: toSchema(contactInputSchema, 'input'),
        Subscription: toSchema(subscriptionResponseSchema, 'output'),
        SubscriptionInput: toSchema(subscriptionInputSchema, 'input'),
        SubscriptionProduct: toSchema(subscriptionProductSchema, 'output'),
        SubscriptionProductList: toSchema(subscriptionProductListSchema, 'output'),
        SubscriptionProductCreate: toSchema(createSubscriptionProductSchema, 'input'),
        SubscriptionProductActive: toSchema(updateSubscriptionProductSchema, 'input'),
        SubscribeProduct: toSchema(subscribeProductSchema, 'input'),
        MemberSubscription: toSchema(memberSubscriptionSchema, 'output'),
        MemberSubscriptionList: toSchema(memberSubscriptionListSchema, 'output'),
        RenewSubscription: toSchema(renewSubscriptionSchema, 'input'),
        SubscriptionPayment: toSchema(subscriptionPaymentSchema, 'output'),
        SubscriptionPaymentList: toSchema(subscriptionPaymentListSchema, 'output'),
        RecordSubscriptionPayment: toSchema(recordPaymentSchema, 'input'),
        SubscriptionClaim: toSchema(subscriptionClaimSchema, 'output'),
        SubscriptionClaimList: toSchema(subscriptionClaimListSchema, 'output'),
        RecordSubscriptionClaim: toSchema(recordClaimSchema, 'input'),
        DecideSubscriptionClaim: toSchema(decideClaimSchema, 'input'),
        Relationship: toSchema(relationshipResponseSchema, 'output'),
        RelationshipInput: toSchema(relationshipInputSchema, 'input'),
        AttendanceEntry: toSchema(attendanceEntryResponseSchema, 'output'),
        AttendanceInput: toSchema(attendanceInputSchema, 'input'),
        AttendanceList: toSchema(attendanceListSchema, 'output'),
        Ministry: toSchema(ministrySchema, 'output'),
        MinistryInput: toSchema(ministryInputSchema, 'input'),
        MinistryUpdate: toSchema(ministryUpdateSchema, 'input'),
        Series: toSchema(seriesSchema, 'output'),
        CreateSeries: toSchema(createSeriesSchema, 'input'),
        UpdateSeries: toSchema(updateSeriesSchema, 'input'),
        Schedule: toSchema(scheduleSchema, 'output'),
        ScheduleInput: toSchema(scheduleInputSchema, 'input'),
        SeriesExceptionInput: toSchema(seriesExceptionInputSchema, 'input'),
        SeriesSummary: toSchema(seriesSummarySchema, 'output'),
        OccurrenceList: toSchema(occurrenceListSchema, 'output'),
        Event: toSchema(eventSchema, 'output'),
        EventList: toSchema(eventListSchema, 'output'),
        EventGeneration: toSchema(eventGenerationSchema, 'output'),
        CreateEvent: toSchema(createEventSchema, 'input'),
        UpdateEvent: toSchema(updateEventSchema, 'input'),
        EventAttendance: toSchema(eventAttendanceSchema, 'output'),
        EventAttendanceEntry: toSchema(eventAttendanceEntrySchema, 'output'),
        EventAttendanceInput: toSchema(eventAttendanceInputSchema, 'input'),
        CodeIssue: toSchema(issueCodeSchema, 'input'),
        CodeVoid: toSchema(voidCodeSchema, 'input'),
        CodeIssued: toSchema(issuedCodeSchema, 'output'),
        CodeItem: toSchema(codeItemSchema, 'output'),
        CodeList: toSchema(codeListSchema, 'output'),
        Headcount: toSchema(headcountSchema, 'output'),
        HeadcountList: toSchema(headcountListSchema, 'output'),
        HeadcountInput: toSchema(headcountInputSchema, 'input'),
        Delegation: toSchema(delegationSchema, 'output'),
        DelegationList: toSchema(delegationListSchema, 'output'),
        DelegationInput: toSchema(delegationInputSchema, 'input'),
        RegistrationRequest: toSchema(registrationRequestSchema, 'output'),
        RegistrationRequestList: toSchema(registrationRequestListSchema, 'output'),
        RegistrationApprove: toSchema(registrationApproveSchema, 'input'),
        RegistrationReject: toSchema(registrationRejectSchema, 'input'),
        OfferingTerms: toSchema(termsSchema, 'output'),
        Offering: toSchema(offeringSchema, 'output'),
        OfferingList: toSchema(offeringListSchema, 'output'),
        OfferingInput: toSchema(termsInputSchema, 'input'),
        OfferingTermsPublish: toSchema(termsPublishSchema, 'input'),
        OfferingActiveUpdate: toSchema(setActiveSchema, 'input'),
        OfferingAttachment: toSchema(offeringAttachmentSchema, 'output'),
        OfferingAttachmentList: toSchema(offeringAttachmentListSchema, 'output'),
        OfferingAttach: toSchema(attachSchema, 'input'),
        SeriesOfferingAttach: toSchema(seriesAttachSchema, 'input'),
        OfferingException: toSchema(exceptionRowSchema, 'output'),
        OfferingExceptionList: toSchema(exceptionListSchema, 'output'),
        OfferingExceptionInput: toSchema(exceptionInputSchema, 'input'),
        OfferingCount: toSchema(offeringCountSchema, 'output'),
        OfferingCountList: toSchema(offeringCountListSchema, 'output'),
        OfferingCountInput: toSchema(offeringCountInputSchema, 'input'),
        ChurchOfferingSummary: toSchema(churchOfferingSummarySchema, 'output'),
        Contribution: toSchema(contributionSchema, 'output'),
        ContributionList: toSchema(contributionListSchema, 'output'),
        ContributionSummary: toSchema(contributionSummarySchema, 'output'),
        ContributionCreate: toSchema(createContributionSchema, 'input'),
        Pledge: toSchema(pledgeSchema, 'output'),
        PledgeList: toSchema(pledgeListSchema, 'output'),
        PledgeCreate: toSchema(createPledgeSchema, 'input'),
        PledgeEvent: toSchema(pledgeEventSchema, 'output'),
        PledgeHonor: toSchema(honorSchema, 'input'),
        PledgeDishonor: toSchema(dishonorSchema, 'input'),
        PledgeReassign: toSchema(reassignSchema, 'input'),
        PledgeSettle: toSchema(settleSchema, 'input'),
        PaymentGroup: toSchema(paymentGroupSchema, 'output'),
        PaymentIntent: toSchema(paymentIntentSchema, 'output'),
        PaymentGroupCreate: toSchema(createPaymentGroupSchema, 'input'),
        PaymentGroupResult: toSchema(paymentGroupResultSchema, 'output'),
        PaymentCallback: toSchema(paymentCallbackSchema, 'input'),
        PaymentCallbackResult: toSchema(paymentCallbackResultSchema, 'output'),
        Reminder: toSchema(reminderSchema, 'output'),
        ReminderList: toSchema(reminderListSchema, 'output'),
        ReminderCreate: toSchema(addReminderSchema, 'input'),
        ImportBatch: toSchema(importBatchSchema, 'output'),
        MemberImport: toSchema(memberImportSchema, 'input'),
        AttendanceImport: toSchema(attendanceImportSchema, 'input'),
        Assignment: toSchema(assignmentSchema, 'output'),
        AssignmentInput: toSchema(assignmentInputSchema, 'input'),
        Call: toSchema(callSchema, 'output'),
        CallInput: toSchema(callInputSchema, 'input'),
        CallList: toSchema(callListSchema, 'output'),
        RosterEntry: toSchema(rosterEntrySchema, 'output'),
        Roster: toSchema(rosterSchema, 'output'),
        Officer: toSchema(officerSchema, 'output'),
        OfficerList: toSchema(officerListSchema, 'output'),
        MemberShepherding: toSchema(memberShepherdingSchema, 'output'),
        ShepherdingReport: toSchema(reportSchema, 'output'),
      },
    },
    paths: {
      '/auth/magic-link': {
        post: {
          summary: 'Request a single-use sign-in link',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('MagicLinkRequest') } },
          },
          responses: {
            202: json(
              'Accepted; the response is identical for every address.',
              'MagicLinkAccepted',
            ),
            422: validation,
          },
        },
      },

      '/auth/exchange': {
        post: {
          summary: 'Exchange a magic-link token for a session',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ExchangeRequest') } },
          },
          responses: {
            200: json('Session credential and officer.', 'ExchangeResponse'),
            401: problem('The link is invalid, used or expired.'),
            422: validation,
          },
        },
      },

      '/auth/me': {
        get: {
          summary: 'The signed-in officer and derived actor id',
          security: [{ sessionAuth: [] }],
          responses: {
            200: json('Officer identity.', 'MeResponse'),
            401: problem('The session is invalid or expired.'),
          },
        },
      },

      '/auth/logout': {
        post: {
          summary: 'Revoke the current session',
          security: [{ sessionAuth: [] }],
          responses: {
            204: noContent('The session is revoked.'),
          },
        },
      },

      '/health': {
        get: {
          summary: 'Liveness and database reachability',
          security: [],
          responses: {
            200: json('Service is ready.', 'Health'),
            503: problem('The database is unreachable.'),
          },
        },
      },

      '/ussd/session': {
        post: {
          summary: 'USSD gateway entry (HMAC, not bearer)',
          description:
            'The aggregator signs `timestamp + nonce + raw body` with USSD_GATEWAY_SECRET. A timestamp more than 300 seconds from now, a missing or invalid signature and a replayed nonce are 401; the phone is rate-limited per hash (10/min) and client address (30/min). The raw phone is never stored, returned or logged. USSD is disabled by configuration in production (503 ussd_disabled).',
          security: [],
          parameters: [
            {
              name: 'X-USSD-Timestamp',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'X-USSD-Nonce',
              in: 'header',
              required: true,
              schema: { type: 'string', minLength: 8, maxLength: 128 },
            },
            {
              name: 'X-USSD-Signature',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phone', 'input', 'seq'],
                  properties: {
                    phone: { type: 'string' },
                    sessionId: { type: 'string', format: 'uuid' },
                    input: { type: 'string', maxLength: 64 },
                    seq: { type: 'integer', minimum: 0 },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'The whole screen for this frame, with Cache-Control: no-store.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['sessionId', 'text', 'done', 'state'],
                    properties: {
                      sessionId: { type: 'string', format: 'uuid' },
                      text: { type: 'string' },
                      done: { type: 'boolean' },
                      state: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['key', 'label'],
                          properties: {
                            key: { type: 'string' },
                            label: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: problem('The signature, timestamp or nonce is invalid.'),
            422: validation,
            429: problem('The phone hash or client address is over the rate limit.'),
            503: problem('USSD is disabled by configuration.'),
          },
        },
      },

      '/ussd/nalo': {
        post: {
          summary: 'Nalo USSD entry (USERID auth, not bearer)',
          description:
            'Nalo Solutions sends `USERID` (matched against USSD_NALO_USER_ID, no signature), `MSISDN`, `USERDATA`, `MSGTYPE` and `SESSIONID`. `SESSIONID` is stored as `external_id` under provider `nalo` so a continuation resolves the internal uuid; `USERDATA` over 64 characters is 422. The response omits `SESSIONID`, echoes `USERID`/`MSISDN`, truncates `MSG` to maxMsgChars with `…` only when needed, and sets `MSGTYPE` to `!done`. USSD is disabled by configuration (503 ussd_disabled).',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['USERID', 'MSISDN', 'MSGTYPE', 'SESSIONID'],
                  properties: {
                    USERID: { type: 'string', minLength: 1, maxLength: 32 },
                    MSISDN: { type: 'string' },
                    USERDATA: { type: 'string', maxLength: 64 },
                    MSGTYPE: { type: 'boolean' },
                    NETWORK: { type: 'string' },
                    SESSIONID: { type: 'string', minLength: 1, maxLength: 128 },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description:
                'The screen as Nalo wire, with Cache-Control: no-store; SESSIONID is omitted.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['USERID', 'MSG', 'MSGTYPE'],
                    properties: {
                      USERID: { type: 'string' },
                      MSISDN: { type: 'string' },
                      MSG: { type: 'string' },
                      MSGTYPE: { type: 'boolean' },
                    },
                  },
                },
              },
            },
            401: problem('The USERID is absent or does not match USSD_NALO_USER_ID.'),
            422: validation,
            429: problem('The phone hash or client address is over the rate limit.'),
            503: problem('USSD is disabled by configuration.'),
          },
        },
      },

      '/v1/members': {
        get: {
          summary: 'List member registrations',
          parameters: [
            {
              name: 'q',
              in: 'query',
              description:
                'Matches member number and name parts (first, last, other names, alias, maiden name); never owned or linked contact values.',
              schema: { type: 'string' },
            },
            {
              name: 'contact',
              in: 'query',
              description: 'Matches an owned or linked contact value, normalised per channel.',
              schema: { type: 'string' },
            },
            {
              name: 'status',
              in: 'query',
              description: 'Defaults to active; purged members are never returned.',
              schema: { type: 'string', enum: ['active', 'archived'] },
            },
            {
              name: 'includeArchived',
              in: 'query',
              description: 'Deprecated alias for active + archived.',
              deprecated: true,
              schema: { type: 'boolean' },
            },
            {
              name: 'unassigned',
              in: 'query',
              description:
                'Only `true`: active members with no active shepherding assignment. Cannot be combined with status=archived.',
              schema: { type: 'string', enum: ['true'] },
            },
            {
              name: 'include',
              in: 'query',
              description: 'Comma-separated aggregates: attendance, subscriptions.',
              schema: { type: 'string' },
            },
            {
              name: 'seriesId',
              in: 'query',
              description: 'Required when include contains attendance.',
              schema: { type: 'string', format: 'uuid' },
            },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: json('A page of member summaries.', 'MemberList'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Create a member registration',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateMember') } },
          },
          responses: {
            201: json('Member created.', 'MemberDetail'),
            401: unauthorized,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}': {
        parameters: [memberNoParam],
        get: {
          summary: 'Look up a member registration',
          parameters: [{ name: 'includeArchived', in: 'query', schema: { type: 'boolean' } }],
          responses: {
            200: json('The full registration, including attendance counts.', 'MemberDetail'),
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Update demographics',
          parameters: [actorHeader, ifMatchHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateMember') } },
          },
          responses: {
            200: json('Member updated.', 'MemberDetail'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
        delete: {
          summary: 'Archive a member (soft delete)',
          parameters: [actorHeader],
          responses: {
            204: noContent('Member archived.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/restore': {
        parameters: [memberNoParam],
        post: {
          summary: 'Restore an archived member',
          parameters: [actorHeader],
          responses: {
            200: json('Member restored.', 'MemberDetail'),
            401: unauthorized,
            409: conflict,
          },
        },
      },

      '/v1/members/{memberNo}/purge': {
        parameters: [memberNoParam],
        post: {
          summary: 'Permanently erase personal data, keeping a tombstone',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PurgeMember') } },
          },
          responses: {
            204: noContent('Personal data erased.'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/attendance': {
        parameters: [memberNoParam],
        get: {
          summary: 'Attendance per series: attended, expected, remaining',
          responses: {
            200: json('Attendance counts and entries.', 'AttendanceList'),
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Record a manual attendance entry',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('AttendanceInput') } },
          },
          responses: {
            201: json('Attendance recorded.', 'AttendanceEntry'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/attendance/{attendanceId}': {
        parameters: [memberNoParam, idParam('attendanceId')],
        delete: {
          summary:
            'Remove an attendance entry; imported entries are suppressed from future imports',
          parameters: [actorHeader],
          responses: {
            204: noContent('Attendance removed.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/contributions/summary': {
        parameters: [memberNoParam],
        get: {
          summary: 'Week, quarter and year paid totals plus the top three events',
          description:
            'One member-scoped aggregate. Windows are UTC calendar dates ending today (week starts Monday, quarter starts its first day, year starts 1 January). Only paid member contributions count; visitor gifts never appear. Responses carry Cache-Control: no-store.',
          responses: {
            200: json(
              'Payment windows and top events with Cache-Control: no-store.',
              'MemberContributionsSummary',
            ),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/contacts': {
        parameters: [memberNoParam],
        post: {
          summary: 'Add an owned contact',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ContactInput') } },
          },
          responses: {
            201: json('Contact added.', 'Contact'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/contacts/{contactId}': {
        parameters: [memberNoParam, idParam('contactId')],
        put: {
          summary: 'Update an owned contact',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ContactInput') } },
          },
          responses: {
            200: json('Contact updated.', 'Contact'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
        delete: {
          summary: 'Remove an owned contact',
          parameters: [actorHeader],
          responses: {
            204: noContent('Contact removed.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/contacts/link': {
        parameters: [memberNoParam],
        post: {
          summary: 'Link a contact owned by another member (dependent sharing)',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['contactId'],
                  properties: { contactId: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
          responses: {
            201: json('Contact linked.', 'Contact'),
            401: unauthorized,
            404: notFound,
            409: conflict,
          },
        },
      },

      '/v1/members/{memberNo}/contacts/link/{contactId}': {
        parameters: [memberNoParam, idParam('contactId')],
        delete: {
          summary: 'Remove a linked contact',
          parameters: [actorHeader],
          responses: {
            204: noContent('Contact unlinked.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/subscriptions': {
        parameters: [memberNoParam],
        get: {
          summary: 'Owned and inherited welfare cover for a member',
          description:
            'Rows carry source owned|inherited, the policyholder identity and relationship for inherited cover, and the approved-plus-paid claimed total. A product row is expired when periodEnd is before today; a legacy row is active unless ended. Responses carry Cache-Control: no-store.',
          responses: {
            200: {
              description: 'Owned and inherited rows with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('MemberSubscriptionList') } },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Subscribe to a welfare product, or create a legacy subscription',
          description:
            'A product subscription resolves paidBy server-side and evaluates eligibility first (422 not_eligible). The period starts today (UTC); a member-paid period writes one payment row, a church-paid period writes none and leaves premiumMinor null. Household coverage validates the cap, an allowed relationship and an active dependent. The legacy body still creates a life_insurance or credit_union row.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { oneOf: [ref('SubscribeProduct'), ref('SubscriptionInput')] },
              },
            },
          },
          responses: {
            201: {
              description: 'Subscription created.',
              content: {
                'application/json': {
                  schema: { oneOf: [ref('MemberSubscription'), ref('Subscription')] },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/subscriptions/{subscriptionId}': {
        parameters: [memberNoParam, idParam('subscriptionId')],
        delete: {
          summary: 'End a subscription',
          parameters: [actorHeader],
          responses: {
            204: noContent('Subscription ended.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/subscriptions/{subscriptionId}/coverage': {
        parameters: [idParam('subscriptionId')],
        post: {
          summary: 'Add a covered member to a household subscription',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['memberNo'],
                  properties: { memberNo: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            204: noContent('Coverage added.'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/subscriptions/{subscriptionId}/coverage/{memberNo}': {
        parameters: [idParam('subscriptionId'), memberNoParam],
        delete: {
          summary: 'Remove a covered member from a household subscription',
          parameters: [actorHeader],
          responses: {
            204: noContent('Coverage removed.'),
            401: unauthorized,
            404: problem('The subscription or the active coverage was not found.'),
          },
        },
      },

      '/v1/subscriptions/{subscriptionId}/renew': {
        parameters: [idParam('subscriptionId')],
        post: {
          summary: 'Renew a welfare subscription from max(periodEnd, today)',
          description:
            'paidBy defaults to the stored payer and is required for an either product. A member-paid renewal writes one payment row; a church-paid renewal writes none. A lapsed period restarts today (UTC). 409 subscription_not_active when the subscription has ended.',
          parameters: [actorHeader],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: ref('RenewSubscription') } },
          },
          responses: {
            200: json('The renewed subscription.', 'MemberSubscription'),
            401: unauthorized,
            404: notFound,
            409: problem('The subscription has ended.'),
            422: validation,
          },
        },
      },

      '/v1/subscriptions/{subscriptionId}/payments': {
        parameters: [idParam('subscriptionId')],
        get: {
          summary: 'List the recorded payments for a subscription',
          responses: {
            200: {
              description: 'Payments in period order with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('SubscriptionPaymentList') } },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Record one member-paid premium for an unpaid period',
          description:
            'Idempotent by idempotencyKey: an identical repeat returns 200 with the stored row; a different payload is 409 idempotency_conflict. amountMinor > 0 and the currency must match the product. The period starts today (UTC); paidAt is informational and never anchors it. There is no unpaid period while periodEnd is on or after today (409 period_already_paid). Premiums are recorded, not transacted.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RecordSubscriptionPayment') } },
          },
          responses: {
            201: {
              description: 'Payment recorded; Location names the row.',
              content: { 'application/json': { schema: ref('SubscriptionPayment') } },
            },
            200: {
              description: 'Identical repeat of the idempotency key; the stored row.',
              content: { 'application/json': { schema: ref('SubscriptionPayment') } },
            },
            401: unauthorized,
            404: notFound,
            409: problem(
              'The period is already paid, the key or reference was reused, or the subscription ended.',
            ),
            422: validation,
          },
        },
      },

      '/v1/subscriptions/{subscriptionId}/claims': {
        parameters: [idParam('subscriptionId')],
        get: {
          summary: 'List recorded claims, newest first',
          responses: {
            200: {
              description: 'Claims with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('SubscriptionClaimList') } },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Record a back-office claim for the policyholder or a covered member',
          description:
            'The claimant must be the policyholder or actively covered (404 not_covered). amountMinor > 0 and a reason are required; the claim starts pending. There is no member self-service entry and no payout rail.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RecordSubscriptionClaim') } },
          },
          responses: {
            201: {
              description: 'Claim recorded; Location names the row.',
              content: { 'application/json': { schema: ref('SubscriptionClaim') } },
            },
            401: unauthorized,
            404: problem('The subscription or the covered claimant was not found.'),
            409: problem('The subscription has ended.'),
            422: validation,
          },
        },
      },

      '/v1/subscriptions/{subscriptionId}/claims/{claimId}/decide': {
        parameters: [idParam('subscriptionId'), idParam('claimId')],
        post: {
          summary: 'Decide a claim: pending to approved or rejected, approved to paid',
          description:
            'Any other transition is 409 claim_not_pending. The decision records the actor, timestamp and optional note; "total claimed" is the approved-plus-paid sum.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('DecideSubscriptionClaim') } },
          },
          responses: {
            200: {
              description: 'The decided claim with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('SubscriptionClaim') } },
            },
            401: unauthorized,
            404: notFound,
            409: problem('The claim is not pending, or the subscription has ended.'),
            422: validation,
          },
        },
      },

      '/v1/subscription-products': {
        get: {
          summary: 'List welfare products, active only by default',
          parameters: [
            {
              name: 'includeInactive',
              in: 'query',
              description: 'true also returns deactivated products.',
              schema: { type: 'boolean' },
            },
          ],
          responses: {
            200: json('Welfare products in code order.', 'SubscriptionProductList'),
            401: unauthorized,
          },
        },
        post: {
          summary: 'Create a welfare product',
          description:
            'code is trimmed, stored uppercase and matched case-insensitively (409 conflict on a repeat). premiumMinor > 0 is 422 invalid_amount. A household product requires maxDependents >= 1 and a non-empty allowedRelationships subset; an individual product forces 0 and an empty list. Pricing and eligibility are fixed after creation.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('SubscriptionProductCreate') } },
          },
          responses: {
            201: json('Product created; Location names it.', 'SubscriptionProduct'),
            401: unauthorized,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/subscription-products/{code}': {
        parameters: [idParam('code')],
        get: {
          summary: 'Read a welfare product by case-insensitive code',
          responses: {
            200: json('The product.', 'SubscriptionProduct'),
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Activate or deactivate a product; nothing else is mutable',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('SubscriptionProductActive') } },
          },
          responses: {
            200: json('The product with its new active flag.', 'SubscriptionProduct'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/ministries': {
        parameters: [memberNoParam],
        post: {
          summary: 'Assign a ministry by code',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code'],
                  properties: { code: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            201: json('Ministry assigned.', 'Ministry'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/ministries/{code}': {
        parameters: [memberNoParam, idParam('code')],
        delete: {
          summary: 'Remove a ministry assignment',
          parameters: [actorHeader],
          responses: {
            204: noContent('Ministry assignment removed.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/relationships': {
        parameters: [memberNoParam],
        get: {
          summary: 'List spouse, dependents and guardians',
          responses: {
            200: {
              description: 'Relationships from both directions.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      items: { type: 'array', items: ref('Relationship') },
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Link a spouse, dependent or guardian',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RelationshipInput') } },
          },
          responses: {
            201: json('Relationship created.', 'Relationship'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/relationships/{relationshipId}': {
        parameters: [memberNoParam, idParam('relationshipId')],
        delete: {
          summary: 'Remove a relationship',
          parameters: [actorHeader],
          responses: {
            204: noContent('Relationship removed.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/ministries': {
        get: {
          summary: 'List ministries',
          responses: {
            200: {
              description: 'All ministries.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { items: { type: 'array', items: ref('Ministry') } },
                  },
                },
              },
            },
            401: unauthorized,
          },
        },
        post: {
          summary: 'Create a ministry',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('MinistryInput') } },
          },
          responses: {
            201: json('Ministry created.', 'Ministry'),
            401: unauthorized,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/ministries/{code}': {
        parameters: [idParam('code')],
        get: {
          summary: 'Read a ministry',
          responses: {
            200: json('The ministry.', 'Ministry'),
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Rename or deactivate a ministry (code is immutable)',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('MinistryUpdate') } },
          },
          responses: {
            200: json('Ministry updated.', 'Ministry'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        delete: {
          summary: 'Delete an unreferenced ministry',
          parameters: [actorHeader],
          responses: {
            204: noContent('Ministry deleted.'),
            401: unauthorized,
            404: notFound,
            409: conflict,
          },
        },
      },

      '/v1/series': {
        get: {
          summary: 'List event series',
          parameters: [{ name: 'includeArchived', in: 'query', schema: { type: 'boolean' } }],
          responses: {
            200: {
              description: 'Event series with schedules and exceptions.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { items: { type: 'array', items: ref('Series') } },
                  },
                },
              },
            },
            401: unauthorized,
          },
        },
        post: {
          summary: 'Create a series with its first schedule version',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateSeries') } },
          },
          responses: {
            201: json('Series created.', 'Series'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/series/{id}': {
        parameters: [idParam('id')],
        get: {
          summary: 'Read a series',
          responses: {
            200: json('The series.', 'Series'),
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Update or archive a series',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateSeries') } },
          },
          responses: {
            200: json('Series updated.', 'Series'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/series/{id}/schedule': {
        parameters: [idParam('id')],
        post: {
          summary: 'Add a schedule version (effective from a date)',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ScheduleInput') } },
          },
          responses: {
            201: json('Schedule version added.', 'Series'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/series/{id}/exceptions': {
        parameters: [idParam('id')],
        post: {
          summary: 'Cancel or add a date',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('SeriesExceptionInput') } },
          },
          responses: {
            201: json('Exception saved.', 'Series'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/series/{id}/exceptions/{date}': {
        parameters: [idParam('id'), idParam('date')],
        delete: {
          summary: 'Remove an exception',
          parameters: [actorHeader],
          responses: {
            204: noContent('Exception removed.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/series/{id}/summary': {
        parameters: [idParam('id')],
        get: {
          summary: 'Window summary: attendance, offering money and the next occurrence',
          parameters: [
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json('The series window summary.', 'SeriesSummary'),
            400: badRequest,
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/series/{id}/occurrences': {
        parameters: [idParam('id')],
        get: {
          summary: 'Resolve the dates a series actually met',
          parameters: [
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json('Resolved occurrences.', 'OccurrenceList'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/events': {
        get: {
          summary: 'List events in a date window, standalone and series-generated',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'seriesId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'ministry', in: 'query', schema: { type: 'string' } },
            {
              name: 'venueType',
              in: 'query',
              schema: { type: 'string', enum: ['auditorium', 'virtual', 'hybrid'] },
            },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
          ],
          responses: {
            200: json('A page of events with per-session attendance counts.', 'EventList'),
            401: unauthorized,
            422: validation,
          },
        },
        post: {
          summary: 'Create a standalone event with its sessions',
          description:
            'Creates a manual event with no series. The session dates must be unique and inside the event range.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateEvent') } },
          },
          responses: {
            201: json('Event created; Location names the new detail URL.', 'Event'),
            401: unauthorized,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/events/generate': {
        post: {
          summary: 'Generate events from resolved series occurrences',
          description:
            'Idempotent: an event already present for a series date is skipped and never overwritten. Cancelled and extra exceptions are honoured.',
          parameters: [
            actorHeader,
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'to',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            200: json('Generation counts and the new event ids.', 'EventGeneration'),
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/attendance': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'Attendance report for one event session',
          description:
            'Lists the stored rows as present and reports expected as the register-derived roster at the session date. A presbyter-only session roster counts only active presbyters. A date outside the event sessions is a validation error.',
          parameters: [
            {
              name: 'date',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            200: json('Present, expected and the member rows.', 'EventAttendance'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Record manual attendance for a session',
          description:
            'A manual row shadows an imported row for the same member and session; a second manual post is a conflict.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('EventAttendanceInput') } },
          },
          responses: {
            201: json('Attendance recorded; Location names the row.', 'EventAttendanceEntry'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/attendance/{attendanceId}': {
        parameters: [idParam('eventId'), idParam('attendanceId')],
        delete: {
          summary: 'Remove an attendance row for a session',
          description:
            'Deleting an imported row writes a suppression so the next import does not resurrect it.',
          parameters: [actorHeader],
          responses: {
            204: noContent('Attendance removed.'),
            401: unauthorized,
            404: notFound,
            409: conflict,
          },
        },
      },

      '/v1/events/{eventId}': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'Read an event with its sessions, offerings and statistics',
          responses: {
            200: json('The event detail.', 'Event'),
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Update an event; a stale If-Match returns 409',
          description:
            'A cancelled or archived event is read-only. The event number is immutable; sessions may be replaced as a set.',
          parameters: [actorHeader, ifMatchHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateEvent') } },
          },
          responses: {
            200: json('Event updated.', 'Event'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/offerings': {
        get: {
          summary: 'List offerings',
          description:
            'Active offerings by default; active=false lists archived only and includeArchived=true lists both. Newest first.',
          parameters: [
            {
              name: 'active',
              in: 'query',
              schema: { type: 'string', enum: ['true', 'false'] },
            },
            {
              name: 'includeArchived',
              in: 'query',
              schema: { type: 'string', enum: ['true', 'false'] },
            },
          ],
          responses: {
            200: json('Offerings with their current terms.', 'OfferingList'),
            401: unauthorized,
            422: validation,
          },
        },
        post: {
          summary: 'Create an offering with terms version 1',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingInput') } },
          },
          responses: {
            201: json('Offering created; Location names it.', 'Offering'),
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/offerings/summary': {
        get: {
          summary: 'Church landing totals for a UTC date window',
          description:
            'One compute-on-read aggregate for the offerings landing. Money is integer minor units and member-only in `total*`; `currency` is the largest paid currency in the window and every other currency is excluded from the totals (no FX). `visitors` reports paid visitor contribution rows separately. `countedMinor` sums only the current counted-cash observation of each event + offering + session group whose `sessionDate` is in the window and whose currency is the reporting currency; superseded history is never added. `varianceMinor = countedMinor − (totalPaidMinor + visitors.paidMinor)` is a reconciliation indicator and is never added to the gifts. Pledge measures use the relevance predicate (`expectedOn` in the window, or still pending as at the report date with `expectedOn` before `from`) and read status from `pledge_events.at` with the inclusive `at < report date + 1 day` boundary, where the report date is `min(to, today)`; `totalPledgedMinor = totalOutstandingMinor + honored`. Responses carry Cache-Control: no-store.',
          parameters: [
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: {
              description: 'Landing totals with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('ChurchOfferingSummary') } },
            },
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/offerings/{id}': {
        parameters: [idParam('id')],
        get: {
          summary: 'Read an offering and its current terms',
          responses: {
            200: json('The offering.', 'Offering'),
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Archive or reactivate an offering; terms never change here',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingActiveUpdate') } },
          },
          responses: {
            200: json('The offering with its new active flag.', 'Offering'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/offerings/{id}/terms': {
        parameters: [idParam('id')],
        get: {
          summary: 'List every published terms version, newest first',
          responses: {
            200: {
              description: 'Published terms versions.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['items'],
                    properties: {
                      items: { type: 'array', items: ref('OfferingTerms') },
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Publish the next terms version',
          description:
            'The body is a full replacement plus baseVersion and a required reason (NFR-3 audit). A stale base returns 409 terms_version_conflict; a published version is immutable.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingTermsPublish') } },
          },
          responses: {
            201: json('The new terms version.', 'OfferingTerms'),
            401: unauthorized,
            404: notFound,
            409: problem('The terms body was built from a stale baseVersion.'),
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/offerings': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'List the event active offering attachments',
          responses: {
            200: json('Active attachments with current terms.', 'OfferingAttachmentList'),
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Attach an offering to an event',
          description:
            'A cancelled, archived or past event is 409 event_not_active; an inactive offering is 422; an active duplicate is 409 offering_already_attached. An attachment availableUntil must be on or after the event end.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingAttach') } },
          },
          responses: {
            201: json('Attachment created; Location names it.', 'OfferingAttachment'),
            401: unauthorized,
            404: notFound,
            409: problem('The event is not active, or the offering is already attached.'),
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/offerings/{offeringId}': {
        parameters: [idParam('eventId'), idParam('offeringId')],
        delete: {
          summary: 'Detach an offering from an event (end, not delete)',
          parameters: [actorHeader],
          responses: {
            204: noContent('Attachment ended; the row is kept.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/events/{eventId}/offerings/{offeringId}/exceptions': {
        parameters: [idParam('eventId'), idParam('offeringId')],
        get: {
          summary: 'List exception rows for an event attachment, newest first',
          responses: {
            200: json('Exception history.', 'OfferingExceptionList'),
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Append a skip on an event session date',
          description:
            'An event accepts only skip, and the date must be one of its sessions; anything else is 422 invalid_exception_date.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingExceptionInput') } },
          },
          responses: {
            201: json('Exception appended.', 'OfferingException'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/series/{id}/offerings': {
        parameters: [idParam('id')],
        get: {
          summary: 'List the series active offering attachments',
          responses: {
            200: json('Active attachments with current terms.', 'OfferingAttachmentList'),
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Attach an offering to a series for every occurrence',
          description:
            'A series attachment omits availableUntil. An archived series is 409 event_not_active; an active duplicate is 409 offering_already_attached; an inactive offering is 422.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('SeriesOfferingAttach') } },
          },
          responses: {
            201: json('Attachment created; Location names it.', 'OfferingAttachment'),
            401: unauthorized,
            404: notFound,
            409: problem('The series is archived, or the offering is already attached.'),
            422: validation,
          },
        },
      },

      '/v1/series/{id}/offerings/{offeringId}': {
        parameters: [idParam('id'), idParam('offeringId')],
        delete: {
          summary: 'Detach an offering from a series (end, not delete)',
          parameters: [actorHeader],
          responses: {
            204: noContent('Attachment ended; the row is kept.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/series/{id}/offerings/{offeringId}/exceptions': {
        parameters: [idParam('id'), idParam('offeringId')],
        get: {
          summary: 'List exception rows for a series attachment, newest first',
          responses: {
            200: json('Exception history.', 'OfferingExceptionList'),
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Append a skip or opt-in on a series date',
          description:
            'skip requires a date the series meets; opt_in requires an extra date the series records. Anything else is 422 invalid_exception_date.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingExceptionInput') } },
          },
          responses: {
            201: json('Exception appended.', 'OfferingException'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/contributions': {
        get: {
          summary: 'List contributions, newest first',
          description:
            'Visitor rows expose visitorName only; the phone and its hash are never returned. Responses carry Cache-Control: no-store.',
          parameters: [
            { name: 'memberNo', in: 'query', schema: { type: 'string' } },
            { name: 'offeringId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'eventId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: {
              description: 'A page of contributions with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('ContributionList') } },
            },
            401: unauthorized,
            422: validation,
          },
        },
        post: {
          summary: 'Record a member or visitor contribution',
          description:
            'Idempotent by idempotencyKey: an identical canonical payload returns 200 with the same record and reference; a different payload is 409 idempotency_conflict. The server generates the receipt reference. A visitor phone is hashed and never returned. Responses carry Cache-Control: no-store.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ContributionCreate') } },
          },
          responses: {
            201: {
              description: 'Contribution created with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('Contribution') } },
            },
            200: {
              description:
                'Identical repeat of the idempotency key; the stored record and reference, with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('Contribution') } },
            },
            401: unauthorized,
            404: notFound,
            409: problem('The idempotency key was already used for a different contribution.'),
            422: validation,
          },
        },
      },

      '/v1/contributions/groups': {
        post: {
          summary: 'Commit one payment group for a split gift',
          description:
            'One group owns the idempotency key and the total; each child contribution uses `<key>:<n>` and starts initiated. The group and its one intent are written in one transaction. An identical repeat returns 200 with the stored group; a different payload is 409 idempotency_conflict. A pledgeId group has exactly one item matching the pending pledge. Responses carry Cache-Control: no-store.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PaymentGroupCreate') } },
          },
          responses: {
            201: {
              description:
                'Payment group, child contributions and intent created; Location names the group.',
              content: { 'application/json': { schema: ref('PaymentGroupResult') } },
            },
            200: {
              description: 'Identical repeat of the idempotency key; the stored rows.',
              content: { 'application/json': { schema: ref('PaymentGroupResult') } },
            },
            401: unauthorized,
            404: notFound,
            409: problem('The idempotency key was already used for a different payment group.'),
            422: validation,
            502: problem('The gateway rejected the payment; the whole commit rolled back.'),
          },
        },
      },

      '/v1/contributions/summary': {
        get: {
          summary: 'Member and visitor totals by currency',
          description:
            'Both bounds are required. Counts only paid contributions grouped by currency, with no names or contact values. Responses carry Cache-Control: no-store.',
          parameters: [
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: {
              description: 'Totals with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('ContributionSummary') } },
            },
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/pledges': {
        get: {
          summary: 'List pledges, newest first',
          description:
            '`overdue` is derived from expectedOn (pending and before today, UTC) and is never stored. from/to filter expectedOn inclusively. Rows resolve the member, officer and offering display names server-side and carry `nextReminder` (the next pending reminder, or null). Responses carry Cache-Control: no-store.',
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['pending', 'honored', 'dishonored', 'overdue'],
              },
            },
            { name: 'memberNo', in: 'query', schema: { type: 'string' } },
            { name: 'officerMemberNo', in: 'query', schema: { type: 'string' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            200: {
              description: 'A page of pledges with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('PledgeList') } },
            },
            401: unauthorized,
            422: validation,
          },
        },
        post: {
          summary: 'Create a pledge with exactly one follow-up officer',
          description:
            'The officer is the member’s active shepherd, or the active presbyter supplied as followUpOfficerMemberNo; otherwise 422 officer_required. officerReason is an optional 1-500 character note for whoever follows up and is stored in reason, accepted with or without a supplied officer. Idempotent by idempotencyKey: an identical canonical payload returns 200 with the stored pledge; a different payload is 409 idempotency_conflict. Three sms reminders are created in the same transaction; one dated before today (UTC) is cancelled. Responses carry Cache-Control: no-store.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PledgeCreate') } },
          },
          responses: {
            201: {
              description: 'Pledge created with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('Pledge') } },
            },
            200: {
              description:
                'Identical repeat of the idempotency key; the stored pledge, with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('Pledge') } },
            },
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/pledges/{id}': {
        get: {
          summary: 'Read one pledge',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'The pledge with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('Pledge') } },
            },
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/pledges/{id}/settle': {
        post: {
          summary: 'Settle a pledge with an existing paid contribution',
          description:
            'The contribution must be paid and match the pledge member, offering, currency and amount. An identical repeat returns 200 with the stored settlement and appends no second event; a different contribution on a settled pledge is 409 pledge_already_terminal.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            actorHeader,
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PledgeSettle') } },
          },
          responses: {
            200: json('The honored pledge with Cache-Control: no-store.', 'Pledge'),
            401: unauthorized,
            404: notFound,
            409: problem('The pledge is already settled with a different contribution.'),
            422: validation,
          },
        },
      },

      '/v1/pledges/{id}/honor': {
        post: {
          summary: 'Append an honor event',
          description:
            'A pending pledge may be honored after the offering expired. A terminal pledge rejects the transition with 409 pledge_already_terminal.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            actorHeader,
          ],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: ref('PledgeHonor') } },
          },
          responses: {
            200: json('The honored pledge.', 'Pledge'),
            401: unauthorized,
            404: notFound,
            409: problem('The pledge is already honored or dishonored.'),
          },
        },
      },

      '/v1/pledges/{id}/dishonor': {
        post: {
          summary: 'Append a dishonor event with a reason',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            actorHeader,
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PledgeDishonor') } },
          },
          responses: {
            200: json('The dishonored pledge.', 'Pledge'),
            401: unauthorized,
            404: notFound,
            409: problem('The pledge is already honored or dishonored.'),
            422: validation,
          },
        },
      },

      '/v1/pledges/{id}/reassign': {
        post: {
          summary: 'Assign or reassign the follow-up officer with a reason',
          description:
            'The new officer must be an active presbyter. The event records both the from and to officer, so both stay in history.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            actorHeader,
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PledgeReassign') } },
          },
          responses: {
            200: json('The reassigned pledge.', 'Pledge'),
            401: unauthorized,
            404: notFound,
            409: problem('The pledge is already honored or dishonored.'),
            422: validation,
          },
        },
      },

      '/v1/pledges/{id}/reminders': {
        get: {
          summary: 'List reminder records, newest first',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Reminder records with Cache-Control: no-store.',
              content: { 'application/json': { schema: ref('ReminderList') } },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        post: {
          summary: 'Schedule a reminder record',
          description:
            'Only a pending or overdue pledge accepts reminders. A date before today (UTC) is 422 invalid_reminder_date; a duplicate (pledge, date, channel) is 409.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            actorHeader,
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ReminderCreate') } },
          },
          responses: {
            201: json('Reminder recorded.', 'Reminder'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/payments/callback': {
        post: {
          summary: 'Gateway callback (signature-verified, not bearer-protected)',
          description:
            'The X-Payment-Signature header is a hex HMAC-SHA-256 of the exact raw JSON body using the shared gateway secret. An invalid or missing signature is 401; a malformed body is 422; an unknown reference is 404. An amount or currency that differs from the group writes nothing and is 422. A paid callback marks the intent, group and child contributions paid in one transaction; a repeated callback answers 200 with duplicate true. A terminal intent never moves to another status.',
          security: [],
          parameters: [
            {
              name: 'X-Payment-Signature',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('PaymentCallback') } },
          },
          responses: {
            200: json('The reconciled callback result.', 'PaymentCallbackResult'),
            401: problem('The signature is missing or invalid.'),
            404: notFound,
            409: problem('The intent is terminal with a different status.'),
            422: validation,
          },
        },
      },

      '/v1/imports/members': {
        post: {
          summary: 'Import the member register (all-or-nothing)',
          description:
            'Upserts by memberNo, case-insensitively. A duplicate memberNo in the file, an archived member or a purged member fails the whole batch.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('MemberImport') } },
          },
          responses: {
            201: json('Import applied.', 'ImportBatch'),
            401: unauthorized,
            422: problem('The import was rejected; nothing was applied.'),
          },
        },
      },

      '/v1/imports/attendance': {
        post: {
          summary: 'Import an attendance registry (all-or-nothing)',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('AttendanceImport') } },
          },
          responses: {
            201: json('Import applied.', 'ImportBatch'),
            401: unauthorized,
            // Problem does not declare the batchId extension, so the description
            // carries it, mirroring how the reassignment 409 documents currentAssignment.
            422: problem('The import was rejected; nothing was applied.'),
          },
        },
      },

      '/v1/imports/formats': {
        get: {
          summary: 'Column contract for every import kind',
          description:
            'The same registry drives the downloadable Excel templates, so the JSON contract and the workbook always describe the same columns.',
          responses: {
            200: {
              description: 'The import formats.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['formats'],
                    properties: {
                      formats: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['kind', 'filename', 'columns'],
                          properties: {
                            kind: { type: 'string', enum: ['members', 'attendance'] },
                            filename: { type: 'string' },
                            columns: {
                              type: 'array',
                              items: {
                                type: 'object',
                                required: ['name', 'required', 'type', 'example'],
                                properties: {
                                  name: { type: 'string' },
                                  required: { type: 'boolean' },
                                  type: {
                                    type: 'string',
                                    enum: ['text', 'enum', 'date', 'boolean'],
                                  },
                                  example: { type: ['string', 'boolean'] },
                                  notes: { type: 'string' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: unauthorized,
          },
        },
      },

      '/v1/imports/templates/{kind}': {
        parameters: [idParam('kind')],
        get: {
          summary: 'Download an Excel import template',
          description:
            'An .xlsx workbook with a bold header row, one example row, sensible column widths, a frozen header and a Notes sheet. Unknown kinds return 404.',
          responses: {
            200: {
              description: 'The workbook.',
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                  schema: { type: 'string', format: 'binary' },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/imports/{batchId}': {
        parameters: [idParam('batchId')],
        get: {
          summary: 'Read an import batch',
          responses: {
            200: json('The batch record.', 'ImportBatch'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/shepherding/assignments': {
        post: {
          summary: 'Assign a member to a presbyter',
          description:
            'When the member already has an active shepherd, the request must carry replaceAssignmentId and a reason. Otherwise the API returns 409 with a currentAssignment extension so the client can ask for consent.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('AssignmentInput') } },
          },
          responses: {
            201: json('Assignment created.', 'Assignment'),
            401: unauthorized,
            404: notFound,
            409: problem('The member already has a shepherd, or the replacement id is stale.'),
            422: validation,
          },
        },
      },

      '/v1/shepherding/assignments/{assignmentId}': {
        parameters: [idParam('assignmentId')],
        delete: {
          summary: 'End an assignment (history is kept)',
          parameters: [actorHeader],
          responses: {
            204: noContent('Assignment ended.'),
            401: unauthorized,
            404: notFound,
            409: conflict,
          },
        },
      },

      '/v1/shepherding/assignments/{assignmentId}/calls': {
        parameters: [idParam('assignmentId')],
        post: {
          summary: 'Log one call attempt',
          description:
            'Calls are append-only: there is no update and no delete. A correction is another call. stillInChurch is required when outcome is reached.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CallInput') } },
          },
          responses: {
            201: json('Call recorded.', 'Call'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
        get: {
          summary: 'List every call for an assignment',
          responses: {
            200: json('Calls, newest first.', 'CallList'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/shepherding/officers': {
        get: {
          summary: 'List presbyters with list size and call totals',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json('Officers and their totals.', 'OfficerList'),
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/shepherding/officers/{memberNo}/members': {
        parameters: [memberNoParam],
        get: {
          summary: "An officer's shepherding roster",
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json(
              'Roster with a contact count (owned and linked, never values), counts and latest reports.',
              'Roster',
            ),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/shepherding/report': {
        get: {
          summary: 'Church-wide shepherding coverage and call totals',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json('Totals plus one row per officer.', 'ShepherdingReport'),
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/shepherding': {
        parameters: [memberNoParam],
        get: {
          summary: "A member's shepherd, assignment history and calls",
          responses: {
            200: json('Current shepherd, history, counts and recent calls.', 'MemberShepherding'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/events/{eventId}/codes': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'List the session codes without the plain value',
          parameters: [
            {
              name: 'sessionDate',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['active', 'used', 'expired', 'voided'] },
            },
          ],
          responses: {
            200: json('Codes for the session, newest first.', 'CodeList'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Issue a six-digit single-use code for one session',
          description:
            'The plain code appears only in the 201 response; only its HMAC-SHA-256 hash under USSD_CODE_PEPPER is stored. The code expires after 15 minutes.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CodeIssue') } },
          },
          responses: {
            201: json('The issued code, shown once.', 'CodeIssued'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/codes/{id}/void': {
        parameters: [idParam('id')],
        post: {
          summary: 'Void an unused, unexpired code',
          description: 'A second void, or a used or expired code, is 409.',
          parameters: [actorHeader],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: ref('CodeVoid') } },
          },
          responses: {
            200: json('The voided code.', 'CodeItem'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/registration-requests': {
        get: {
          summary: 'List anonymous registration requests',
          description:
            'Requests carry only the one-way phone hash, never the raw phone. Responses carry Cache-Control: no-store.',
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            },
            { name: 'eventId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'sessionDate', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json('Requests, newest first.', 'RegistrationRequestList'),
            401: unauthorized,
            422: validation,
          },
        },
      },

      '/v1/registration-requests/{id}': {
        parameters: [idParam('id')],
        get: {
          summary: 'Read one registration request',
          responses: {
            200: json('The request and its decision.', 'RegistrationRequest'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/registration-requests/{id}/approve': {
        parameters: [idParam('id')],
        post: {
          summary: 'Approve a request and create the member',
          description:
            'The request names seed the ordinary member create path; gender is undisclosed, joinedOn is today in UTC and no contacts are written. A decided request, including a second approval, is 409 registration_not_pending.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RegistrationApprove') } },
          },
          responses: {
            200: json('The approved request linked to the member.', 'RegistrationRequest'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/registration-requests/{id}/reject': {
        parameters: [idParam('id')],
        post: {
          summary: 'Reject a request without creating a member',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RegistrationReject') } },
          },
          responses: {
            200: json('The rejected request with its reason.', 'RegistrationRequest'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/headcounts': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'List one session’s headcount observations',
          description:
            'Returns the current non-superseded observation and the full history, newest first by asOf then recordedAt. A superseded observation stays valid for its own asOf. Operator-only and no-store; no member DTO returns a headcount.',
          parameters: [
            {
              name: 'sessionDate',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            200: json('The current observation, or null, and the observations.', 'HeadcountList'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Record a headcount observation or correct the current one',
          description:
            'Without supersedesId this appends an observation with asOf (default now) inside the session day in the event timezone. With supersedesId it corrects the current non-superseded observation of the same session, keeps that observation’s asOf, may change the mode, and leaves the corrected row in history. Each bucket is 0-10000, the total is the sum and at most 30000, all-zero is allowed, and a mode-violating bucket is 422. A second supersede of the same row is 422.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('HeadcountInput') } },
          },
          responses: {
            201: json('The recorded observation; Location names it.', 'Headcount'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/headcounts/{headcountId}': {
        parameters: [idParam('eventId'), idParam('headcountId')],
        get: {
          summary: 'Read one headcount observation',
          description:
            'Returns the observation named by the Location of a create or correction, including its supersession links. An unknown id, or one belonging to another event, is 404. Operator-only and no-store.',
          responses: {
            200: json('The observation with its supersession links.', 'Headcount'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/offering-counts': {
        parameters: [idParam('eventId')],
        get: {
          summary: "List one session's offering cash count observations",
          description:
            'Returns the current non-superseded observation and the full history of one event + offering + session group, newest first by asOf then recordedAt. Both query parameters are required. The list is the only read target; there is no item GET. Superseded rows stay readable and valid for their own asOf. Operator-only and no-store.',
          parameters: [
            {
              name: 'sessionDate',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'offeringId',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            200: json(
              'The current observation, or null, and the observations.',
              'OfferingCountList',
            ),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Record an offering cash count or correct the current one',
          description:
            "Without supersedesId this appends an observation with asOf defaulting to now, inside the session day in the event timezone. With supersedesId it corrects the group's current non-superseded observation, keeps that observation's asOf, and replaces its lines; the corrected row stays in history. Lines are denominationMinor x pieces, each denomination once, and a zero total is 422. The count snapshots the offering's current terms version and its currency; a different currency is 422. An offering not attached to the event is `offering_not_on_event`, a session the event does not hold is `session_not_in_event`, a cancelled event or session is `event_not_active`, and an unknown, already-superseded, other-group or non-current supersedesId is 422. The response is the created observation; Location names the list read target.",
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('OfferingCountInput') } },
          },
          responses: {
            201: json(
              'The recorded observation; Location names the list read target.',
              'OfferingCount',
            ),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/delegations': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'List the active clocking delegation for a session',
          parameters: [
            {
              name: 'sessionDate',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            200: json('Active delegations.', 'DelegationList'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Delegate clocking duty for one session',
          description:
            'The grantor must be an active senior presbyter and the delegate an active presbyter; one active delegation exists per session.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('DelegationInput') } },
          },
          responses: {
            201: json('The delegation.', 'Delegation'),
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/attendance/summary': {
        parameters: [memberNoParam],
        get: {
          summary: 'Windowed attendance over held sessions that apply to the member',
          description:
            'Counts held, member-trackable, general and member-ministry sessions in the window with the join-date and ministry-assignment floors. `events` lists attended rows only, newest first; absences are never fabricated. Responses carry Cache-Control: no-store.',
          parameters: [
            {
              name: 'from',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: json(
              'Attended count, expected count and attended event rows.',
              'MemberAttendanceWindow',
            ),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/members/{memberNo}/profile': {
        parameters: [memberNoParam],
        get: {
          summary: 'Identity, ministries, shepherd and attendance regularity',
          description:
            'Regularity uses the last five held scoped sessions ending today, the join-date and ministry-assignment floors, and fewer than three sessions is not_enough_data. Responses carry Cache-Control: no-store.',
          responses: {
            200: json('The profile aggregate.', 'MemberProfile'),
            401: unauthorized,
            404: notFound,
          },
        },
      },
    },
  };
}
