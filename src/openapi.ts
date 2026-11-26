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
  guardianCandidateListSchema,
  guardianSchema,
  memberAttendanceWindowSchema,
  memberContributionsSummarySchema,
  memberDetailSchema,
  memberListSchema,
  memberMinistrySchema,
  memberProfileSchema,
  memberSummarySchema,
  ministryPositionInputSchema,
  photoUploadSchema,
  presbyterTitleListSchema,
  presbyterTitleOptionSchema,
  purgeSchema,
  relationshipInputSchema,
  relationshipResponseSchema,
  subscriptionInputSchema,
  subscriptionResponseSchema,
  updateMemberSchema,
  acceptanceResultSchema,
  confirmationInputSchema,
  confirmationResultSchema,
  verificationIssueSchema,
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
  audienceListSchema,
  audienceRuleSchema,
  audienceSchema,
  audienceSummarySchema,
  createAudienceSchema,
  updateAudienceSchema,
} from './schemas/audiences.js';
import {
  attendanceImportSchema,
  importBatchSchema,
  memberImportSchema,
} from './schemas/imports.js';
import {
  cancelOccurrenceSchema,
  codeItemSchema,
  codeListSchema,
  createEventParentSchema,
  delegationInputSchema,
  delegationListSchema,
  delegationSchema,
  eventAttendanceEntrySchema,
  eventAttendanceInputSchema,
  eventAttendanceSchema,
  eventGenerationSchema,
  eventListSchema,
  eventOccurrenceSchema,
  eventParentListSchema,
  eventParentSchema,
  eventPeriodListSchema,
  eventPeriodSchema,
  eventPreviewInputSchema,
  eventPreviewSchema,
  eventRecurrenceSchema,
  eventScheduleGuardSchema,
  eventScheduleWriteResultSchema,
  eventScheduleWriteSchema,
  eventSchema,
  eventWindowSummarySchema,
  HEADCOUNT_READ_MODES,
  headcountInputSchema,
  headcountListSchema,
  headcountSchema,
  issueCodeSchema,
  issuedCodeSchema,
  recurrenceExceptionInputSchema,
  recurrenceScheduleInputSchema,
  updateEventParentSchema,
  updateEventSchema,
  voidCodeSchema,
} from './schemas/events.js';
import { EVENT_PERIODS } from './domain/periods.js';
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
  notificationCancelResultSchema,
  notificationChangeInputSchema,
  notificationChangeResultSchema,
  notificationDefaultsSchema,
  notificationDefaultsWriteSchema,
  notificationDeliverySchema,
  notificationFlierSchema,
  notificationInstanceSchema,
  notificationPlanSchema,
  notificationPlanWriteSchema,
  notificationPreviewSchema,
  notificationPublishInputSchema,
  notificationPublishResultSchema,
  notificationSlotSchema,
  notificationTemplateInputSchema,
  notificationTemplateSchema,
  notificationTriggerSchema,
} from './schemas/notifications.js';
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

const dateParam = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
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

const audienceExample = {
  id: '8b2f0f9d-3e7f-4d33-9f9e-2a2f4c6d8e10',
  name: 'Choir',
  system: true,
  systemKey: 'ministry:CHOIR',
  active: true,
  rule: {
    operator: 'allOf',
    clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
  },
  summary: 'Choir - all of ministry CHOIR',
  memberCount: 42,
  createdAt: '2026-11-22T09:00:00.000Z',
  createdBy: 'migration',
  updatedAt: '2026-11-22T09:00:00.000Z',
  updatedBy: 'migration',
};

const audienceSummaryExample = {
  id: audienceExample.id,
  name: audienceExample.name,
  system: audienceExample.system,
  summary: audienceExample.summary,
};

const parentEventExample = {
  id: '0f7c4f4e-6d7a-4e56-9a7c-5b8d8d2f4a11',
  eventNo: 'EVT-2026-014',
  name: 'Sunday Celebration',
  audienceIds: [audienceExample.id],
  audiences: [audienceSummaryExample],
  audienceId: audienceExample.id,
  audience: audienceSummaryExample,
  ministry: { code: 'CHOIR', name: 'Choir' },
  presbyterOnly: false,
  timezone: 'Africa/Lagos',
  description: 'Sunday service',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  startDate: '2026-01-04',
  endDate: null,
  startTime: '09:00',
  endTime: '11:00',
  tracksMembers: true,
  status: 'active',
  schedule: {
    locked: true,
    reasons: [{ code: 'occurrence_started', date: '2026-11-01' }],
  },
  period: null,
  recurrence: {
    schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null }],
    exceptions: [{ date: '2026-12-27', kind: 'cancelled', note: 'Christmas break' }],
  },
  occurrences: [
    {
      id: '3c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      date: '2026-11-01',
      startTime: '09:00',
      endTime: '11:00',
      status: 'held',
      venueType: 'auditorium',
      capture: { asOf: '2026-11-01T10:42:00.000Z', ended: false },
      note: null,
      present: 120,
      expected: 150,
      importedRows: 100,
      source: 'mixed',
      legacyEventNo: 'EVT-2026-014',
    },
  ],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
  summary: {
    from: '2026-09-01',
    to: '2026-11-30',
    nextOccurrence: '2026-11-08',
    attendance: {
      memberSessions: { held: 4, expected: 600, present: 480, rate: 0.8 },
      lastHeld: { date: '2026-11-01', expected: 150, present: 120 },
      headcountSessions: { held: 0 },
      cancelled: 1,
      upcoming: 0,
    },
    offerings: {
      attachedCount: 0,
      currency: 'GHS',
      paidMinor: 0,
      pledgedMinor: 0,
      outstandingMinor: 0,
      countedMinor: 0,
      visitors: { count: 0, paidMinor: 0 },
    },
  },
};

const everyoneAudienceExample = {
  id: 'f4f0c2b0-9c1d-4e2f-8a3b-6d5c4b3a2918',
  name: 'Everyone',
  system: true,
  systemKey: 'everyone',
  active: true,
  rule: {
    operator: 'allOf',
    clauses: [{ attribute: 'membershipStatus', value: 'active' }],
  },
  summary: 'Everyone - all of membership status active',
  memberCount: 480,
  createdAt: '2026-11-22T09:00:00.000Z',
  createdBy: 'migration',
  updatedAt: '2026-11-22T09:00:00.000Z',
  updatedBy: 'migration',
};

const everyoneAudienceSummaryExample = {
  id: everyoneAudienceExample.id,
  name: everyoneAudienceExample.name,
  system: everyoneAudienceExample.system,
  summary: everyoneAudienceExample.summary,
};

/** A created standalone event: draft, manual occurrences, no recurrence. */
const createdEventParentExample = {
  id: '6a9d4c1e-2b7f-4c8a-9d0e-1f2a3b4c5d6e',
  eventNo: 'EVT-2026-023',
  name: 'Harvest Thanksgiving',
  audienceIds: [everyoneAudienceExample.id],
  audiences: [everyoneAudienceSummaryExample],
  audienceId: everyoneAudienceExample.id,
  audience: everyoneAudienceSummaryExample,
  ministry: null,
  presbyterOnly: false,
  timezone: 'Africa/Lagos',
  description: 'Three evenings of thanksgiving',
  venueType: 'hybrid',
  venueName: 'Main Auditorium + Zoom',
  startDate: '2026-11-27',
  endDate: '2026-11-29',
  startTime: '17:00',
  endTime: '19:30',
  tracksMembers: true,
  status: 'draft',
  schedule: { locked: false, reasons: [] },
  period: null,
  recurrence: null,
  occurrences: [
    {
      id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
      date: '2026-11-27',
      startTime: '17:00',
      endTime: '19:30',
      status: 'scheduled',
      venueType: 'hybrid',
      capture: null,
      note: null,
      present: 0,
      expected: 120,
      importedRows: 0,
      source: 'none',
      legacyEventNo: null,
    },
    {
      id: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f',
      date: '2026-11-28',
      startTime: '17:00',
      endTime: '19:30',
      status: 'scheduled',
      venueType: 'hybrid',
      capture: null,
      note: null,
      present: 0,
      expected: 120,
      importedRows: 0,
      source: 'none',
      legacyEventNo: null,
    },
    {
      id: 'd3e4f5a6-b7c8-4d9e-8f0a-2b3c4d5e6f70',
      date: '2026-11-29',
      startTime: '17:00',
      endTime: '19:30',
      status: 'scheduled',
      venueType: 'hybrid',
      capture: null,
      note: null,
      present: 0,
      expected: 120,
      importedRows: 0,
      source: 'none',
      legacyEventNo: null,
    },
  ],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
  summary: {
    from: '2026-11-27',
    to: '2026-11-29',
    nextOccurrence: '2026-11-27',
    attendance: {
      memberSessions: { held: 0, expected: 360, present: 0, rate: null },
      lastHeld: null,
      headcountSessions: { held: 0 },
      cancelled: 0,
      upcoming: 3,
    },
    offerings: {
      attachedCount: 0,
      currency: 'GHS',
      paidMinor: 0,
      pledgedMinor: 0,
      outstandingMinor: 0,
      countedMinor: 0,
      visitors: { count: 0, paidMinor: 0 },
    },
  },
};

/** The same event after "Save and activate". */
const activatedEventParentExample = {
  ...createdEventParentExample,
  status: 'active',
};

/** The archived parent; history stays readable. */
const archivedEventParentExample = {
  ...activatedEventParentExample,
  status: 'archived',
};

const cancelledOccurrenceExample = {
  ...createdEventParentExample.occurrences[0],
  status: 'cancelled',
  note: 'Public holiday - moved to 2 December',
  capture: null,
  present: 0,
  importedRows: 0,
  source: 'none',
};

/** A schedule version was appended; the earlier version stays readable. */
const recurrenceVersionsExample = {
  schedules: [
    { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
    {
      effectiveFrom: '2027-01-03',
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU',
      endsOn: '2027-12-26',
    },
  ],
  exceptions: [{ date: '2026-12-27', kind: 'cancelled', note: 'Christmas break' }],
};

const recurrenceExceptionExample = {
  schedules: recurrenceVersionsExample.schedules,
  exceptions: [
    ...recurrenceVersionsExample.exceptions,
    { date: '2026-11-29', kind: 'extra', note: 'Harvest thanksgiving' },
  ],
};

/** The extra date was removed; the schedules and the other exception are untouched. */
const recurrenceExceptionRemovedExample = {
  schedules: recurrenceExceptionExample.schedules,
  exceptions: recurrenceExceptionExample.exceptions.filter(
    (exception) => exception.date !== '2026-11-29',
  ),
};

const youngAdultsAudienceExample = {
  id: '2e6c8a4b-7d1f-4a3c-8b5e-9f0a1c2d3e4f',
  name: 'Young Adults',
  system: false,
  systemKey: null,
  active: true,
  rule: {
    operator: 'allOf',
    clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 35 }],
  },
  summary: 'Young Adults - all of age 18-35',
  memberCount: 36,
  createdAt: '2026-11-23T10:15:00.000Z',
  createdBy: 'officer_ada',
  updatedAt: '2026-11-23T10:15:00.000Z',
  updatedBy: 'officer_ada',
};

const editedYoungAdultsAudienceExample = {
  ...youngAdultsAudienceExample,
  name: 'Young Adults 18-40',
  rule: {
    operator: 'allOf',
    clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 40 }],
  },
  summary: 'Young Adults 18-40 - all of age 18-40',
  updatedAt: '2026-11-23T11:40:00.000Z',
};

/** The served catalogue itself, so the contract example cannot drift from it. */
const eventPeriodListExample = { items: EVENT_PERIODS };

const notificationPlanExample = {
  planId: '6a1d2f5e-0c3b-4a7e-9a4f-2f1f7b8c0d11',
  eventId: '0f7d8a3c-2b5e-4f6a-9c1d-3e5a7b9c1d2e',
  revision: 2,
  status: 'draft',
  etag: '"r2"',
  contentEtag: '"c8f1a2b3c4d5e6f7"',
  slots: [
    {
      id: 'b0c1d2e3-f4a5-4b6c-8d7e-9f0a1b2c3d4e',
      kind: 'announce',
      anchor: 'publish',
      offsetMinutes: 0,
      sortOrder: 0,
    },
    {
      id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      kind: 'last',
      anchor: 'occurrence_end',
      offsetMinutes: -1440,
      sortOrder: 1,
    },
  ],
  templates: [
    {
      channel: 'ussd',
      subject: null,
      body: null,
      bodyText: '{{eventName}} is on {{eventDate}} at {{startTime}}, {{venue}}.',
      templateName: null,
      parameterMap: null,
    },
    {
      channel: 'sms',
      subject: null,
      body: null,
      bodyText: '{{firstName}}, {{eventName}} starts {{eventDate}} {{startTime}} at {{venue}}.',
      templateName: null,
      parameterMap: null,
    },
  ],
  flier: null,
  revisions: [
    {
      revision: 1,
      status: 'published',
      publishedAt: '2026-11-20T09:15:00.000Z',
      cancelledAt: null,
    },
    { revision: 2, status: 'draft', publishedAt: null, cancelledAt: null },
  ],
  publish: {
    enabled: true,
    reason: 'Publishing materialises instances and fans them out to the audience.',
  },
};

const notificationPreviewExample = {
  revision: 2,
  at: '2026-12-06',
  renders: {
    email: {
      subject: 'The Convention starts on 6 December',
      html: '<div style="font-family:Arial,Helvetica,sans-serif"><p>Ada, the Convention starts on 6 December at 09:00 at the Auditorium.</p></div>',
      text: 'Ada, the Convention starts on 6 December at 09:00 at the Auditorium.',
      attachments: [],
    },
    whatsapp: {
      templateName: 'event_announce',
      parameters: [
        { name: 'firstName', slot: 1, value: 'Ada' },
        { name: 'eventName', slot: 2, value: 'The Convention' },
      ],
      body: 'Ada · The Convention',
      headerMediaUrl: '/fliers/7c1f2a3b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8',
    },
    sms: {
      body: 'Ada, The Convention starts 2026-12-06 09:00 at the Auditorium.',
      encoding: 'gsm7',
      length: 63,
      segments: 1,
    },
    ussd: {
      body: 'The Convention is on 2026-12-06 at 09:00, Auditorium.',
      screens: ['The Convention is on 2026-12-06 at 09:00, Auditorium.'],
      budget: 120,
    },
  },
  counts: { audience: 120, email: 64, whatsapp: 88, sms: 120, ussd: 118 },
  sample: { memberNo: 'M-1042', displayName: 'Ada Mensah' },
  excluded: {
    counts: {
      channel_blocked: 3,
      event_muted: 1,
      period_muted: 0,
      cadence_filtered: 2,
      no_contact: 1,
    },
    sample: [{ memberNo: 'M-2001', displayName: 'Kofi Boateng' }],
  },
};

const notificationInstanceExample = {
  id: '2b3c4d5e-6f70-4a8b-9c1d-2e3f4a5b6c7d',
  planId: '6a1d2f5e-0c3b-4a7e-9a4f-2f1f7b8c0d11',
  kind: 'announce',
  revision: 2,
  occurrenceDate: '2026-12-06',
  sendAt: '2026-12-06T08:00:00.000Z',
  deliveryAt: '2026-12-06T08:00:00.000Z',
  status: 'scheduled',
  recipientCount: 0,
  sentCount: 0,
  skippedCount: 0,
  failedCount: 0,
};

const notificationPublishExample = {
  planId: notificationInstanceExample.planId,
  revision: 2,
  status: 'published',
  contentEtag: '"c8f1a2b3c4d5e6f7"',
  created: 1,
  instances: [notificationInstanceExample],
};

const notificationCancelExample = {
  planId: notificationInstanceExample.planId,
  revision: 2,
  status: 'cancelled',
  cancelledAt: '2026-12-06T07:00:00.000Z',
  cancelledInstances: 1,
};

const notificationDeliveryExample = {
  id: '3c4d5e6f-7081-4b9c-8d2e-3f4a5b6c7d8e',
  instanceId: notificationInstanceExample.id,
  memberId: '4d5e6f70-8192-4c0d-9e3f-4a5b6c7d8e9f',
  memberNo: 'M-1042',
  channel: 'sms',
  routedVia: 'own',
  contactId: '5e6f7081-92a3-4d1e-8f4a-5b6c7d8e9f01',
  destinationMasked: '***1042',
  status: 'failed',
  skipReason: null,
  attempts: 1,
  lastErrorCode: 'transport_unavailable',
  sentAt: null,
  createdAt: '2026-12-06T08:00:00.000Z',
};

const notificationDefaultsExample = {
  slots: [
    { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
    { kind: 'reminder', anchor: 'event_start', offsetMinutes: -1440 },
    { kind: 'starts', anchor: 'occurrence_start', offsetMinutes: 0 },
    { kind: 'last', anchor: 'occurrence_end', offsetMinutes: -1440 },
  ],
  churchName: 'Grace Assembly',
  emailSignature: 'Grace Assembly · Events Desk',
  emailReplyTo: 'events@example.org',
  smsConfirmThreshold: 250,
  whatsappTemplates: { announce: 'event_announce', last: 'event_last_call' },
  sendMode: 'window',
  sendFrom: '08:00',
  sendTo: '20:00',
  sendHour: '14:00',
  churchTimezone: 'Africa/Lagos',
  digestHour: '09:00',
  failureDigestTo: 'office@example.org',
  failureDigestEnabled: true,
  trigger: { kind: 'continuous' },
  updatedAt: '2026-11-24T10:00:00.000Z',
  updatedBy: 'test-admin',
};

const notificationFlierExample = {
  token: '7c1f2a3b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8',
  contentType: 'image/webp',
  byteSize: 184320,
  sha256: '1b3c6e0b0ff6a0c3a3f6f9c7d1c2b4a5e6f708192a3b4c5d6e7f8091a2b3c4d5e',
  url: '/fliers/7c1f2a3b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8',
  uploadedAt: '2026-11-24T11:20:00.000Z',
};

/** A period preview: the resolved dates and both counts, nothing persisted. */
const eventPeriodPreviewExample = {
  occurrences: [
    { date: '2026-12-28', expected: 410 },
    { date: '2026-12-29', expected: 402 },
    { date: '2026-12-30', expected: 118 },
    { date: '2026-12-31', expected: 96 },
    { date: '2027-01-01', expected: 88 },
    { date: '2027-01-02', expected: 54 },
    { date: '2027-01-03', expected: 76 },
  ],
  audienceCounts: [
    { id: everyoneAudienceExample.id, count: 480 },
    { id: youngAdultsAudienceExample.id, count: 36 },
  ],
};

/** One regenerated occurrence, shared by the two rule-rewrite examples. */
const scheduleWriteOccurrenceExample = {
  id: '5d6e7f80-91a2-4b3c-8d4e-5f60718293a4',
  date: '2026-11-15',
  startTime: '09:00',
  endTime: '11:00',
  status: 'scheduled',
  venueType: 'auditorium',
  capture: null,
  note: null,
  present: 0,
  expected: 150,
  importedRows: 0,
  source: 'none',
  legacyEventNo: null,
};

/** A recurrence rewrite: the stored rule, no period, and the regenerated window. */
const eventScheduleWriteExample = {
  recurrence: {
    schedules: [
      {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU',
        endsOn: null,
      },
    ],
    exceptions: [{ date: '2026-12-27', kind: 'cancelled', note: 'Christmas break' }],
  },
  period: null,
  occurrences: [
    scheduleWriteOccurrenceExample,
    {
      ...scheduleWriteOccurrenceExample,
      id: '6e7f8091-a2b3-4c4d-9e5f-60718293a4b5',
      date: '2026-11-29',
    },
  ],
  generated: true,
};

/** A period rewrite: the stored provenance (no `cycle`) and the regenerated window. */
const eventSchedulePeriodWriteExample = {
  recurrence: null,
  period: { id: 'communion-week', name: 'Communion Week', frequency: 'monthly', day: 'SUN' },
  occurrences: [
    { ...scheduleWriteOccurrenceExample, date: '2026-11-29' },
    {
      ...scheduleWriteOccurrenceExample,
      id: '7f8091a2-b3c4-4d5e-8f60-718293a4b5c6',
      date: '2026-12-27',
    },
  ],
  generated: true,
};

const legacyEventExample = {
  id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  eventNo: 'EVT-2026-101',
  name: 'Sunday Celebration',
  seriesId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  ministry: { code: 'CHOIR', name: 'Choir' },
  timezone: 'Africa/Lagos',
  startDate: '2026-11-01',
  endDate: '2026-11-01',
  startTime: '09:00',
  endTime: '11:00',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  description: 'Sunday service',
  status: 'active',
  source: 'series',
  tracksMembers: true,
  presbyterOnly: false,
  sessions: [
    {
      date: '2026-11-01',
      startTime: '09:00',
      endTime: '11:00',
      status: 'held',
      capture: { asOf: '2026-11-01T10:42:00.000Z', ended: false },
      note: null,
      present: 120,
      expected: 150,
      importedRows: 100,
      source: 'mixed',
    },
  ],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
};

const legacySeriesExample = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Sunday Celebration',
  ministry: { code: 'CHOIR', name: 'Choir' },
  presbyterOnly: false,
  timezone: 'Africa/Lagos',
  description: 'Sunday service',
  archivedAt: null,
  schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null }],
  exceptions: [{ date: '2026-12-27', kind: 'cancelled', note: 'Christmas break' }],
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
        PhotoUpload: toSchema(photoUploadSchema, 'output'),
        VerificationIssue: toSchema(verificationIssueSchema, 'output'),
        ConfirmationInput: toSchema(confirmationInputSchema, 'input'),
        ConfirmationResult: toSchema(confirmationResultSchema, 'output'),
        AcceptanceResult: toSchema(acceptanceResultSchema, 'output'),
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
        MemberMinistry: toSchema(memberMinistrySchema, 'output'),
        PresbyterTitleOption: toSchema(presbyterTitleOptionSchema, 'output'),
        PresbyterTitleList: toSchema(presbyterTitleListSchema, 'output'),
        Guardian: toSchema(guardianSchema, 'output'),
        GuardianCandidateList: toSchema(guardianCandidateListSchema, 'output'),
        MinistryPositionInput: toSchema(ministryPositionInputSchema, 'input'),
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
        EventRecurrence: toSchema(eventRecurrenceSchema, 'output'),
        EventScheduleGuard: toSchema(eventScheduleGuardSchema, 'output'),
        EventScheduleWrite: toSchema(eventScheduleWriteSchema, 'input'),
        EventScheduleWriteResult: toSchema(eventScheduleWriteResultSchema, 'output'),
        EventOccurrence: toSchema(eventOccurrenceSchema, 'output'),
        EventWindowSummary: toSchema(eventWindowSummarySchema, 'output'),
        EventParent: toSchema(eventParentSchema, 'output'),
        EventParentList: toSchema(eventParentListSchema, 'output'),
        EventPeriod: toSchema(eventPeriodSchema, 'output'),
        EventPeriodList: toSchema(eventPeriodListSchema, 'output'),
        EventPreviewInput: toSchema(eventPreviewInputSchema, 'input'),
        EventPreview: toSchema(eventPreviewSchema, 'output'),
        AudienceSummary: toSchema(audienceSummarySchema, 'output'),
        AudienceRule: toSchema(audienceRuleSchema, 'output'),
        Audience: toSchema(audienceSchema, 'output'),
        AudienceList: toSchema(audienceListSchema, 'output'),
        EventGeneration: toSchema(eventGenerationSchema, 'output'),
        CreateEvent: toSchema(createEventParentSchema, 'input'),
        UpdateEvent: toSchema(updateEventParentSchema, 'input'),
        UpdateEventLegacy: toSchema(updateEventSchema, 'input'),
        CancelOccurrence: toSchema(cancelOccurrenceSchema, 'input'),
        EventScheduleInput: toSchema(recurrenceScheduleInputSchema, 'input'),
        EventExceptionInput: toSchema(recurrenceExceptionInputSchema, 'input'),
        AudienceCreate: toSchema(createAudienceSchema, 'input'),
        AudienceUpdate: toSchema(updateAudienceSchema, 'input'),
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
        NotificationSlot: toSchema(notificationSlotSchema, 'output'),
        NotificationTemplate: toSchema(notificationTemplateSchema, 'output'),
        NotificationPlan: toSchema(notificationPlanSchema, 'output'),
        NotificationPlanWrite: toSchema(notificationPlanWriteSchema, 'input'),
        NotificationTemplateInput: toSchema(notificationTemplateInputSchema, 'input'),
        NotificationPreview: toSchema(notificationPreviewSchema, 'output'),
        NotificationFlier: toSchema(notificationFlierSchema, 'output'),
        NotificationDefaults: toSchema(notificationDefaultsSchema, 'output'),
        NotificationDefaultsWrite: toSchema(notificationDefaultsWriteSchema, 'input'),
        NotificationTrigger: toSchema(notificationTriggerSchema, 'output'),
        NotificationPublish: toSchema(notificationPublishInputSchema, 'input'),
        NotificationPublishResult: toSchema(notificationPublishResultSchema, 'output'),
        NotificationCancelResult: toSchema(notificationCancelResultSchema, 'output'),
        NotificationChange: toSchema(notificationChangeInputSchema, 'input'),
        NotificationChangeResult: toSchema(notificationChangeResultSchema, 'output'),
        NotificationInstance: toSchema(notificationInstanceSchema, 'output'),
        NotificationDelivery: toSchema(notificationDeliverySchema, 'output'),
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
              name: 'guardianEligible',
              in: 'query',
              description:
                'Only `true`: answer the guardian candidates instead of a member page — members aged 18 or over that are reachable through an own contact or a chain of at most three links (Phase 1).',
              schema: { type: 'string', enum: ['true'] },
            },
            {
              name: 'forMemberNo',
              in: 'query',
              description:
                'With guardianEligible: the member whose guardian is being chosen. It and its descendants are excluded; an unknown number excludes nothing.',
              schema: { type: 'string' },
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
              description:
                'Legacy name for the parent event id; required when include contains attendance unless eventId is supplied.',
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'eventId',
              in: 'query',
              description:
                'The parent event id when include contains attendance; seriesId remains the legacy name.',
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

      '/v1/presbyter-titles': {
        get: {
          summary: 'List the active presbyter titles',
          responses: {
            200: json('The active reference titles, ordered by label.', 'PresbyterTitleList'),
            401: unauthorized,
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

      '/v1/members/{memberNo}/photo': {
        parameters: [memberNoParam],
        put: {
          summary: 'Store the member profile photo',
          description:
            'Raw image bytes (1 byte to 2 MiB) whose Content-Type is image/webp, image/jpeg or image/png. The magic bytes must agree with the header, so a renamed text file is refused. The client re-encodes to a 512-square WebP or JPEG before upload; no filename or EXIF value is stored or logged.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: {
              'image/webp': { schema: { type: 'string', format: 'binary' } },
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
            },
          },
          responses: {
            200: json('The new photo timestamp with Cache-Control: no-store.', 'PhotoUpload'),
            400: problem(
              'The body is empty, the content type is unsupported, or the bytes do not match it (unsupported_photo).',
            ),
            401: unauthorized,
            404: notFound,
            413: problem('The body exceeds 2 MiB (photo_too_large).'),
          },
        },
        get: {
          summary: 'Read the member profile photo',
          description:
            'The stored bytes with their own ETag (`"<memberNo>-<epoch ms>-<byte length>"`), Cache-Control: private, max-age=300, Content-Disposition: inline and nosniff. A matching If-None-Match is 304; a member with no photo is 404 (photo_not_found).',
          responses: {
            200: {
              description: 'The stored image.',
              headers: {
                ETag: { schema: { type: 'string' } },
                'Cache-Control': { schema: { type: 'string' } },
              },
              content: {
                'image/webp': { schema: { type: 'string', format: 'binary' } },
                'image/jpeg': { schema: { type: 'string', format: 'binary' } },
                'image/png': { schema: { type: 'string', format: 'binary' } },
              },
            },
            304: noContent('If-None-Match matched the current ETag.'),
            401: unauthorized,
            404: problem('The member was not found, or has no photo (photo_not_found).'),
          },
        },
        delete: {
          summary: 'Remove the member profile photo',
          parameters: [actorHeader],
          responses: {
            204: noContent('The photo columns are cleared; avatars fall back to initials.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/verification/otp': {
        parameters: [memberNoParam],
        post: {
          summary: 'Start a member verification code',
          description:
            'Resolves one destination from the member’s own contacts: the first unproven email, else the first unproven WhatsApp, else the first unproven phone (a proven contact is skipped, MR-24/AC-MR46). It generates one six-digit code and one single-use acceptance-page token, binds them to that contact and stores only their hashes plus a hash of the contact’s value (MR-26). The message carries the code and the link, for every channel. The response lists the masked destination and the expiry, never the code or the link. A member with no own email, WhatsApp or phone is 409 no_own_contact; a member whose every owned contact is proven, or who is officer-confirmed, is 409 already_verified; one send per 60 seconds and five per hour are 429 too_many_requests; a destination with no configured sender is 503 delivery_unavailable and nothing is stored.',
          parameters: [actorHeader],
          responses: {
            202: json(
              'The code was sent; the masked destination and the expiry, with Cache-Control: no-store.',
              'VerificationIssue',
            ),
            401: unauthorized,
            404: notFound,
            409: problem(
              'The member has no own email, WhatsApp or phone (no_own_contact), or every owned contact is proven or the member is officer-confirmed (already_verified).',
            ),
            429: problem('The send throttle refused the request (too_many_requests).'),
            503: problem('A destination has no configured sender (delivery_unavailable).'),
          },
        },
      },

      '/v1/members/{memberNo}/verification': {
        parameters: [memberNoParam],
        delete: {
          summary: 'Withdraw a member verification',
          description:
            'Withdraws every contact proof and the officer confirmation with an audit, and consumes any live code. It never removes a contact and never blocks an identified number (MR-31).',
          parameters: [actorHeader],
          responses: {
            204: noContent('The proofs, the confirmation and any live code are withdrawn.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/members/{memberNo}/confirmation': {
        parameters: [memberNoParam],
        post: {
          summary: 'Confirm the member with an audited reason',
          description:
            'Records an append-only officer confirmation (actor, reason, instant). MemberDetail.confirmedAt reads the latest non-withdrawn row; a phone proof alone does not make requires_verified pass. The officer never sees or types a code (MR-52).',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ConfirmationInput') } },
          },
          responses: {
            201: json('The confirmation instant.', 'ConfirmationResult'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        delete: {
          summary: 'Withdraw the officer confirmation',
          description:
            'Withdraws the active confirmation with an audit; contact proofs are untouched. An unknown or purged member is 404 (MR-52).',
          parameters: [actorHeader],
          responses: {
            204: noContent('The active confirmation is withdrawn.'),
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/portal/verification/accept': {
        post: {
          summary: 'Accept a verification code on the public member acceptance page',
          description:
            'Unauthenticated by design: the single-use token and the six-digit code are the credential, whatever channel the code was sent to, and the answer carries only the masked destination. A wrong code is 400 code_invalid, an expired one 400 code_expired, the fifth wrong one 400 too_many_tries, and the per-token and per-address rate limit is 429 too_many_requests. The route answers no member data and the log carries no code, token or destination value (MR-51).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'code'],
                  properties: {
                    token: { type: 'string' },
                    code: { type: 'string', pattern: '^\\d{6}$' },
                  },
                },
              },
            },
          },
          responses: {
            200: json('The bound contact was proven.', 'AcceptanceResult'),
            400: problem('code_invalid, code_expired or too_many_tries.'),
            429: problem('The token or the address is over its window (too_many_requests).'),
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
        parameters: [
          memberNoParam,
          {
            name: 'code',
            in: 'path',
            required: true,
            description:
              'The ministry code, matched case-insensitively; the wire carries no ministry id.',
            schema: { type: 'string' },
          },
        ],
        put: {
          summary: 'Set, replace or clear the position held in one ministry',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('MinistryPositionInput') } },
          },
          responses: {
            200: json('The membership with its position; null when cleared.', 'MemberMinistry'),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
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

      '/v1/audiences': {
        get: {
          summary: 'List audiences',
          description:
            'System and custom reference data. Active audiences only by default; includeArchived=true also returns archived custom audiences. `countAt=YYYY-MM-DD` evaluates each audience at that UTC date and adds `memberCount` to every item; without it the field is absent. The counts are each audience on its own and do not sum to an event’s roster, which is the intersection.',
          parameters: [
            {
              name: 'includeArchived',
              in: 'query',
              schema: { type: 'string', enum: ['true', 'false'] },
            },
            {
              name: 'countAt',
              in: 'query',
              description:
                'The UTC date the per-audience `memberCount` is evaluated at; omit to leave it out.',
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            200: {
              description:
                'Audiences with their structured rule and server-rendered summary, and their member count at `countAt` when it was supplied.',
              content: {
                'application/json': {
                  schema: ref('AudienceList'),
                  examples: {
                    default: {
                      summary: 'System and custom audiences with a count date',
                      value: { items: [audienceExample] },
                    },
                  },
                },
              },
            },
            401: unauthorized,
          },
        },
        post: {
          summary: 'Create a custom audience',
          description:
            'Creates a custom audience from its name and rule; 201 with Location. System audiences are seeded and read-only, so they are never created here. There is no delete: a custom audience is archived through PUT with `{ active: false }`.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('AudienceCreate') } },
          },
          responses: {
            201: {
              description: 'The created audience with its structured rule and summary.',
              content: {
                'application/json': {
                  schema: ref('Audience'),
                  examples: {
                    youngAdults: {
                      summary: 'A custom age-band audience',
                      value: youngAdultsAudienceExample,
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/v1/audiences/{id}': {
        parameters: [idParam('id')],
        get: {
          summary: 'Read one audience',
          responses: {
            200: {
              description: 'The audience with its structured rule and summary.',
              content: {
                'application/json': {
                  schema: ref('Audience'),
                  examples: {
                    ministry: { summary: 'A seeded ministry audience', value: audienceExample },
                  },
                },
              },
            },
          },
        },
        put: {
          summary: 'Edit a custom audience',
          description:
            'Edits a custom audience name, rule or active state. A system audience is refused with 409 audience_system. There is no delete: archiving is `{ active: false }`, and an archived audience stays resolvable for events that already reference it.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('AudienceUpdate') } },
          },
          responses: {
            200: {
              description: 'The edited audience with its structured rule and summary.',
              content: {
                'application/json': {
                  schema: ref('Audience'),
                  examples: {
                    renamed: {
                      summary: 'A custom age-band audience edited',
                      value: editedYoungAdultsAudienceExample,
                    },
                  },
                },
              },
            },
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
          summary: 'Read a series, or its parent detail with view=parent',
          parameters: [
            {
              name: 'view',
              in: 'query',
              description: 'Omit for the legacy series read; `parent` serves the parent detail.',
              schema: { type: 'string', enum: ['parent'] },
            },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: {
              description: 'The legacy series, or the parent detail with view=parent.',
              content: {
                'application/json': {
                  schema: { oneOf: [ref('Series'), ref('EventParent')] },
                  examples: {
                    legacy: { summary: 'Legacy series read (no view)', value: legacySeriesExample },
                    parent: {
                      summary: 'Parent detail with view=parent',
                      value: parentEventExample,
                    },
                  },
                },
              },
            },
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
          summary: 'List events in a date window, standalone, series-generated or period-generated',
          parameters: [
            {
              name: 'view',
              in: 'query',
              description: 'Omit for the legacy event list; `parent` serves the parent read.',
              schema: { type: 'string', enum: ['parent'] },
            },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'seriesId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'ministry', in: 'query', schema: { type: 'string' } },
            {
              name: 'venueType',
              in: 'query',
              schema: { type: 'string', enum: ['auditorium', 'virtual', 'hybrid'] },
            },
            {
              name: 'period',
              in: 'query',
              description: 'Only events created from this named period.',
              schema: {
                type: 'string',
                enum: ['communion-week', 'gospel-week', 'home-cells'],
              },
            },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
          ],
          responses: {
            200: {
              description:
                'A legacy page of event instances, or the parent read with `view=parent` and a required from/to.',
              content: {
                'application/json': {
                  schema: { oneOf: [ref('EventList'), ref('EventParentList')] },
                  examples: {
                    legacy: {
                      summary: 'Legacy event-instance list (no view)',
                      value: { items: [legacyEventExample] },
                    },
                    parent: {
                      summary: 'Parent read with view=parent',
                      value: { items: [parentEventExample] },
                    },
                  },
                },
              },
            },
            401: unauthorized,
            422: validation,
          },
        },
        post: {
          summary: 'Create the parent, with manual occurrences, one recurrence or one period',
          description:
            'Creates the parent as a draft. Supply exactly one of manual `occurrences` (standalone), one `recurrence` (recurring) or a `period` - `{ id, cycleMonth }` for one cycle or `{ id, frequency: "monthly", day?, effectiveFrom? }` for a monthly rule the server resolves - never more than one; the range is derived from them and is not accepted, so `startDate`/`endDate` are read-only. A period resolves to ordinary occurrences in the same transaction and records its provenance (`period { id, name, cycle?, frequency?, day? }`); `effectiveFrom` anchors the 90-day window and is never stored, and a day on a single-date period is refused by name. `audienceIds` is the ordered applicability set (at least one, duplicates refused) and defaults to the seeded Everyone audience; `audienceId` remains a one-element alias for one round and, when both are sent, `audienceIds` wins and the alias must equal its first element. Composition is intersection: a member is in the event when they match every audience. `tracksMembers` defaults to true and `timezone` to UTC. `eventNo` is minted by the server and refused here by name (`422`); the retired `ministry` and `presbyterOnly` fields are likewise not part of the payload. 201 with Location naming the new detail URL.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateEvent') } },
          },
          responses: {
            201: {
              description: 'The created parent in its draft state, with its occurrences.',
              content: {
                'application/json': {
                  schema: ref('EventParent'),
                  examples: {
                    standalone: {
                      summary: 'A created standalone event with three occurrences',
                      value: createdEventParentExample,
                    },
                  },
                },
              },
            },
            422: validation,
          },
        },
      },

      '/v1/events/generate': {
        post: {
          summary: 'Generate missing occurrences for series and period events',
          description:
            'Idempotent: an event already present for a series or period date is skipped and never overwritten, so a past date is never moved. Walks both kinds over the same `from..to` window - an rrule version, or a monthly period rule that keeps its parent’s times. Cancelled and extra exceptions are honoured for a series.',
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

      '/v1/events/periods': {
        get: {
          summary: 'List the named periods the event form can choose',
          description:
            'The three declared periods - Communion Week, Gospel Week and Home Cells - as `{ id, name, definition, dates }`, served from the code catalogue. `dates` is the resolver’s `kind` projected onto the wire: `week` resolves to seven dates and may take a `day`; `date` resolves to one date and refuses it. A period resolves to UTC calendar dates and is stored as ordinary occurrences, so this is a read-only choice list, not a resource.',
          responses: {
            200: {
              description: 'The three periods with their declared definitions.',
              content: {
                'application/json': {
                  schema: ref('EventPeriodList'),
                  examples: {
                    catalogue: {
                      summary: 'The three declared periods',
                      value: eventPeriodListExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
          },
        },
      },

      '/v1/events/preview': {
        post: {
          summary: 'Resolve a recurrence or a named period to dates, without persisting',
          description:
            'Resolves `recurrence` or a `period` - exactly one - to the dates the event would be created with. A period takes either create shape: `{ id, cycleMonth }` resolves one cycle once, and `{ id, frequency: "monthly", day?, effectiveFrom? }` walks the create’s 90-day window from `effectiveFrom` (default today, UTC), skipping dates that have passed. Nothing is written. `occurrences[].expected` is the intersection count for the supplied audience set at that date; `audienceCounts[]` carries each audience’s own count, which is a secondary label and does not sum to `expected`. An empty intersection is a real answer, not an error.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('EventPreviewInput') } },
          },
          responses: {
            200: {
              description: 'The resolved dates with their intersection and per-audience counts.',
              content: {
                'application/json': {
                  schema: ref('EventPreview'),
                  examples: {
                    period: {
                      summary: 'Communion Week 2027-01 resolved, with both counts',
                      value: eventPeriodPreviewExample,
                    },
                  },
                },
              },
            },
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
          parameters: [
            {
              name: 'view',
              in: 'query',
              description: 'Omit for the legacy detail; `parent` serves the parent read.',
              schema: { type: 'string', enum: ['parent'] },
            },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: {
              description:
                'The legacy detail, or the parent detail with recurrence, occurrences and window summary.',
              content: {
                'application/json': {
                  schema: { oneOf: [ref('Event'), ref('EventParent')] },
                  examples: {
                    legacy: { summary: 'Legacy event detail (no view)', value: legacyEventExample },
                    parent: {
                      summary: 'Parent detail with view=parent',
                      value: parentEventExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        patch: {
          summary: 'Update the parent (partial); a stale If-Match returns 409',
          description:
            'Updates the parent from its partial fields and is the write the UI uses. `audienceIds` replaces the whole audience set when present (`audienceId` is its one-element alias and must match the first element when both are sent). It carries no occurrence set and no `eventNo` - the event number is minted and immutable, so sending one is refused by name (`422`); `recurrence` and `period` are refused by name too (`422`), because the schedule is written by `PUT /v1/events/{eventId}/schedule` and a stripped key would be a lost edit. A stale If-Match is refused, and the retired `ministry` and `presbyterOnly` fields are not part of the payload.',
          parameters: [actorHeader, ifMatchHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateEvent') } },
          },
          responses: {
            200: {
              description: 'The updated parent.',
              content: {
                'application/json': {
                  schema: ref('EventParent'),
                  examples: {
                    activated: {
                      summary: 'A draft parent activated after "Save and activate"',
                      value: activatedEventParentExample,
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          summary:
            'The legacy per-instance update during the transition; it retires when the UI moves',
          description:
            'The legacy per-instance update kept for the deployed UI; the parent write is PATCH and this form retires when the UI moves. A cancelled or archived event is read-only. The event number is immutable; sessions may be replaced as a set.',
          parameters: [actorHeader, ifMatchHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateEventLegacy') } },
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

      '/v1/events/{eventId}/archive': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Archive the event parent',
          description:
            'Archives the parent; its occurrences, attendance and giving history stay readable and it is never hard deleted.',
          parameters: [actorHeader],
          responses: {
            200: {
              description: 'The archived parent.',
              content: {
                'application/json': {
                  schema: ref('EventParent'),
                  examples: {
                    archived: {
                      summary: 'An event archived after its last service',
                      value: archivedEventParentExample,
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/v1/events/{eventId}/schedule': {
        parameters: [idParam('eventId')],
        put: {
          summary: 'Replace an event’s rule under the edit guard',
          description:
            'The edit form’s save. The body takes exactly one arm - `{ recurrence: { rrule, endsOn? } }` for a recurring event, or `{ period: { frequency, day? } }` for a period event - and the arm must match the event’s type, which is fixed at create (`422` otherwise). `day` is `MON`-`SUN`, never the rrule’s `MO`-`SU`. The guard is enforced server-side: the parent read’s `schedule.locked` is computed by the same function this write calls, and a write while it is closed answers `409 recurrence_locked`. `effectiveFrom` is derived from the version in force, never sent. The write replaces the version in force with the same `effectiveFrom` (or the stored period fields) in one transaction, deletes only future `scheduled` rows - a future `cancelled` row survives, and exceptions re-apply on regeneration - then regenerates the event’s current window; it never extends the horizon, and `generated: false` says the window could not be produced. The answer carries the rule and provenance stored after the write, not an echo of the request.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('EventScheduleWrite') } },
          },
          responses: {
            200: {
              description:
                'The rule in force after the write, its period provenance, and the regenerated window.',
              content: {
                'application/json': {
                  schema: ref('EventScheduleWriteResult'),
                  examples: {
                    recurrence: {
                      summary: 'A recurring event’s rule rewritten to a fortnightly Sunday',
                      value: eventScheduleWriteExample,
                    },
                    period: {
                      summary: 'A period event’s rule rewritten to monthly Sundays',
                      value: eventSchedulePeriodWriteExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            409: problem(
              'The edit guard is closed (`recurrence_locked`): an occurrence has started, or offering, attendance or import history exists.',
            ),
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/occurrences/{date}/cancel': {
        parameters: [idParam('eventId'), dateParam('date')],
        post: {
          summary: 'Cancel one occurrence with a reason',
          description:
            'Cancels the occurrence named by its UTC date and stores the reason as its `note`; the occurrence becomes read-only and its history stays readable.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CancelOccurrence') } },
          },
          responses: {
            200: {
              description: 'The cancelled occurrence.',
              content: {
                'application/json': {
                  schema: ref('EventOccurrence'),
                  examples: {
                    cancelled: {
                      summary: 'An occurrence cancelled for a public holiday',
                      value: cancelledOccurrenceExample,
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/v1/events/{eventId}/recurrence/versions': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Add a recurrence schedule version',
          description:
            'Appends a schedule version; earlier versions stay readable and only future generation changes. `rrule` carries the RRULE body, never COUNT or UNTIL, because the end is `endsOn`.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('EventScheduleInput') } },
          },
          responses: {
            201: {
              description: 'The recurrence with the appended schedule version.',
              content: {
                'application/json': {
                  schema: ref('EventRecurrence'),
                  examples: {
                    appended: {
                      summary: 'A second schedule version appended',
                      value: recurrenceVersionsExample,
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/v1/events/{eventId}/recurrence/exceptions': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Cancel or add one recurrence date',
          description:
            'Appends an exception: `cancelled` generates no occurrence for its date and requires a non-empty `note`, `extra` generates one. The exception history is append-only.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('EventExceptionInput') } },
          },
          responses: {
            201: {
              description: 'The recurrence with the appended exception.',
              content: {
                'application/json': {
                  schema: ref('EventRecurrence'),
                  examples: {
                    extra: {
                      summary: 'An extra occurrence added',
                      value: recurrenceExceptionExample,
                    },
                  },
                },
              },
            },
          },
        },
      },

      '/v1/events/{eventId}/recurrence/exceptions/{date}': {
        parameters: [idParam('eventId'), dateParam('date')],
        delete: {
          summary: 'Remove an exception',
          description:
            'Removes the exception for one UTC date and returns the recomputed recurrence. The schedules are untouched; only the exception list changes.',
          parameters: [actorHeader],
          responses: {
            200: {
              description: 'The recurrence with the exception removed.',
              content: {
                'application/json': {
                  schema: ref('EventRecurrence'),
                  examples: {
                    removed: {
                      summary: 'An extra date removed, the schedules untouched',
                      value: recurrenceExceptionRemovedExample,
                    },
                  },
                },
              },
            },
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
            'The request names seed the ordinary member create path; gender is undisclosed and joinedOn is today in UTC. The pending request retains the caller’s number encrypted; phoneOwnership decides it: own writes it as the member’s owned phone contact (no guardian is required, and a guardianMemberNo sent with own is 422 validation_error naming the field), borrowed links the number to guardianMemberNo, which is then required and validated like any other (18+, reachable, chain rules). The member, its contact and the guardian link are one transaction, so a refusal is 422 guardian_not_eligible or 422 validation_error naming the missing guardian and the request stays pending; a number already owned by another member is 409 contact_in_use naming the owner, whether the pre-check or the unique index catches it. A decided request, including a second approval, is 409 registration_not_pending. The encrypted value is erased on every decision (MR-50, MR-53).',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RegistrationApprove') } },
          },
          responses: {
            200: json('The approved request linked to the member.', 'RegistrationRequest'),
            401: unauthorized,
            404: notFound,
            409: problem(
              'contact_in_use when the number belongs to another member, or registration_not_pending when the request was already decided.',
            ),
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
          summary: 'List one session’s headcount lanes and observations',
          description:
            'Returns the current observation per lane as a map keyed by mode (each nullable) and the full history, newest first by asOf then recordedAt. The four live lanes are always present; the retired mixed lane appears only when the session has legacy rows. An optional mode filter limits the observations to one lane and returns that lane alone in current. A superseded observation stays valid for its own asOf. Operator-only and no-store; no member DTO returns a headcount.',
          parameters: [
            {
              name: 'sessionDate',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'mode',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: [...HEADCOUNT_READ_MODES] },
            },
          ],
          responses: {
            200: json(
              'The per-lane current observations (each null when not recorded) and the observations.',
              'HeadcountList',
            ),
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
        post: {
          summary: 'Record a headcount observation or correct the current one',
          description:
            'Records one mode’s observation. Without supersedesId it supersedes that lane’s current observation and takes asOf (default now) inside the session day in the event timezone. With supersedesId it corrects the current observation of that row’s lane, keeps its asOf, and leaves the corrected row in history; it may move into another lane only when that lane has no current observation, otherwise it is 422 naming that lane. lines are a subset of the mode’s declared buckets with no duplicates, each 0-10000, the total is their sum and at most 30000; an all-zero set writes no lines. The retired mixed mode is refused. A second supersede of the same row is 422.',
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

      '/v1/events/{eventId}/notification-plan': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'Read the event’s notification plan',
          description:
            'The plan an event has or would have: its latest revision, that revision’s slots and per-channel templates, the flier metadata and the revision history. An event with no plan yet reads an empty revision 1 rather than a 404; a missing event is a 404. `publish` states that the verb is not part of this round (R2 authors and previews; R3 sends), with its reason. The response carries `Cache-Control: no-store` and an `ETag` naming the revision for `If-Match`.',
          responses: {
            200: {
              description: 'The plan, its latest revision and its history.',
              content: {
                'application/json': {
                  schema: ref('NotificationPlan'),
                  examples: {
                    draft: {
                      summary: 'A published revision with an edited draft',
                      value: notificationPlanExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        put: {
          summary: 'Create or edit the draft revision',
          description:
            'One PUT carries the whole revision: its slot set (1–12 slots; `announce|reminder|starts|last` with an allowed anchor and an offset in [-10080, 10080]) and its templates. A draft edits in place; a published or cancelled revision is frozen, so the write lands on revision + 1 with its own slots and templates and the old revision keeps its own. When `slots` is omitted, a first revision copies the church defaults’ standard template and a later one copies the revision it edits. Two slots resolving to the same instant for one occurrence answer `422 duplicate_slot_time`. A stale `If-Match` answers `412`.',
          parameters: [actorHeader, ifMatchHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('NotificationPlanWrite') } },
          },
          responses: {
            200: {
              description: 'The revision as stored after the write.',
              content: {
                'application/json': {
                  schema: ref('NotificationPlan'),
                  examples: {
                    edited: {
                      summary: 'An edit written as revision 2',
                      value: notificationPlanExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            412: problem('The plan has moved past the revision the `If-Match` names.'),
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/notification-plan/preview': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Preview the four renders, the counts and the SMS segments',
          description:
            'Renders email (HTML plus the stored plain-text alternative and the flier as an inline attachment), WhatsApp (its approved template name with ordered parameter values and the flier as header media), SMS (with its GSM-7/UCS-2 encoding and 160/153 or 70/67 segmentation) and USSD (the inbox body paginated into screens under the adapter budget). When a body is supplied the preview renders that body, so an officer can check a draft edit; otherwise it renders the stored revision. Per-channel counts apply the destination resolution to the event’s audience intersection at the preview date. It writes nothing and calls no provider. The exclusion sample is R3’s: it needs the preference tables.',
          responses: {
            200: {
              description: 'The four renders, the per-channel counts and the sample recipient.',
              content: {
                'application/json': {
                  schema: ref('NotificationPreview'),
                  examples: {
                    preview: {
                      summary: 'A single-occurrence announce',
                      value: notificationPreviewExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/notification-plan/publish': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Publish the draft revision and materialise its instances',
          description:
            'Requires an `active` event and a saved draft. `If-Match` pins a content token over slots, templates and flier (not the revision, because a draft edits in place). Materialises one instance per slot and occurrence over the 90-day horizon and applies the send-time policy to `delivery_at`. Refusals: `409 event_not_active`, `409 cadence_too_coarse` when a `starts` slot meets a trigger coarser than 15 minutes, `422 slot_in_past`, `422 duplicate_slot_time`, `422 template_required`, and `412 plan_content_stale` on a stale token. Republishing the published revision returns the same instances and creates none.',
          parameters: [actorHeader, ifMatchHeader],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: ref('NotificationPublish') } },
          },
          responses: {
            200: {
              description: 'The published revision and its instances.',
              content: {
                'application/json': {
                  schema: ref('NotificationPublishResult'),
                  examples: {
                    published: { summary: 'A first publish', value: notificationPublishExample },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            409: conflict,
            412: problem('The plan content has moved past the token in `If-Match`.'),
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/notification-plan/cancel': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Cancel the published revision',
          description:
            'Cancels the plan’s `scheduled` instances; created inbox messages and sent deliveries remain. A queued job drains as a no-op because the handler claims with a status re-check, and a cancelled instance does not block republishing the same moment.',
          parameters: [actorHeader],
          responses: {
            200: {
              description: 'The cancelled revision and how many instances stopped.',
              content: {
                'application/json': {
                  schema: ref('NotificationCancelResult'),
                  examples: {
                    cancelled: { summary: 'A cancelled plan', value: notificationCancelExample },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            409: problem('The plan has no published revision (plan_not_published).'),
          },
        },
      },

      '/v1/events/{eventId}/notification-plan/change': {
        parameters: [idParam('eventId')],
        post: {
          summary: 'Publish a one-off change notice',
          description:
            'Writes its own `notification_change_notices` row and its own `change` instance to the published plan’s audience. It touches no slot and no future instance; the notice carries its own WhatsApp template and parameters and its own email subject and body because a published revision is frozen.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('NotificationChange') } },
          },
          responses: {
            201: {
              description: 'The notice and its instance.',
              content: { 'application/json': { schema: ref('NotificationChangeResult') } },
            },
            401: unauthorized,
            404: notFound,
            409: conflict,
            422: validation,
          },
        },
      },

      '/v1/events/{eventId}/notification-plan/instances': {
        parameters: [idParam('eventId')],
        get: {
          summary: 'Read the plan’s instances and their counts',
          responses: {
            200: {
              description: 'Every instance for the plan, ordered by send instant.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['instances'],
                    properties: {
                      instances: { type: 'array', items: ref('NotificationInstance') },
                    },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
      },

      '/v1/notification-deliveries/{id}/retry': {
        parameters: [idParam('id')],
        post: {
          summary: 'Retry a failed delivery once (audited)',
          description:
            'Accepts only a `failed` delivery (`409 delivery_not_failed` otherwise), re-renders from the revision the instance pinned, re-checks live mutes and blocks (so a retry may end `skipped`), and records `field = delivery_retry`, `source = admin` and the actor.',
          parameters: [actorHeader],
          responses: {
            200: {
              description: 'The delivery, now pending.',
              content: {
                'application/json': {
                  schema: ref('NotificationDelivery'),
                  examples: {
                    retried: { summary: 'A retried delivery', value: notificationDeliveryExample },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
            409: problem('The delivery is not failed (delivery_not_failed).'),
          },
        },
      },

      '/v1/events/{eventId}/flier': {
        parameters: [idParam('eventId')],
        put: {
          summary: 'Upload the draft revision’s flier',
          description:
            'One image of `image/webp`, `image/jpeg` or `image/png`, at most 2 MiB, sniffed by its magic bytes (a content type that disagrees with the bytes is refused). It is stored in the configured `FlierStore` (`db` in the register, or `s3` such as MinIO locally and R2 hosted) and the row records the store, the storage key, the media type, the size, the sha256 and a 32-byte token. Uploading on a published revision writes a new revision with a new token, so a sent URL keeps resolving to the image it was sent with.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: {
              'image/webp': { schema: { type: 'string', format: 'binary' } },
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
            },
          },
          responses: {
            200: {
              description: 'The stored flier’s metadata and its public URL.',
              content: {
                'application/json': {
                  schema: ref('NotificationFlier'),
                  examples: {
                    uploaded: { summary: 'A WebP poster', value: notificationFlierExample },
                  },
                },
              },
            },
            400: badRequest,
            401: unauthorized,
            404: notFound,
            409: conflict,
            413: problem('The flier exceeds the 2 MiB limit.'),
          },
        },
        get: {
          summary: 'Read the flier’s metadata',
          description:
            'The type, size, hash, upload time and public URL; `404 flier_not_found` when the revision has none.',
          responses: {
            200: {
              description: 'The stored flier’s metadata.',
              content: {
                'application/json': {
                  schema: ref('NotificationFlier'),
                  examples: {
                    stored: { summary: 'A stored flier', value: notificationFlierExample },
                  },
                },
              },
            },
            401: unauthorized,
            404: notFound,
          },
        },
        delete: {
          summary: 'Remove the revision’s flier',
          description:
            'Removes the object and its row; removing one that is already absent is still 204.',
          parameters: [actorHeader],
          responses: { 204: noContent('The flier is gone.'), 401: unauthorized, 404: notFound },
        },
      },

      '/fliers/{token}': {
        parameters: [idParam('token')],
        get: {
          summary: 'The public flier image (no bearer)',
          description:
            'Public by design and outside `/v1`: the 32-byte token is the whole credential and the URL is forwarded with every email and shown as the WhatsApp template’s header media. The app streams the object from the configured store, so no bucket is ever exposed directly. Immutable for a year, because a token names one object for ever.',
          security: [],
          responses: {
            200: {
              description: 'The image bytes.',
              content: {
                'image/webp': { schema: { type: 'string', format: 'binary' } },
                'image/jpeg': { schema: { type: 'string', format: 'binary' } },
                'image/png': { schema: { type: 'string', format: 'binary' } },
              },
            },
            404: notFound,
          },
        },
      },

      '/v1/notification-defaults': {
        get: {
          summary: 'Read the church notification defaults',
          description:
            'The standard slot template a new plan copies, the church name, the email signature and reply-to, the SMS confirmation threshold, the approved WhatsApp template names and the send-time policy fields. A deployment with no stored row answers the built-in defaults rather than a 404.',
          responses: {
            200: {
              description: 'The stored defaults, or the built-in ones when none is stored.',
              content: {
                'application/json': {
                  schema: ref('NotificationDefaults'),
                  examples: {
                    stored: { summary: 'The church row', value: notificationDefaultsExample },
                  },
                },
              },
            },
            401: unauthorized,
          },
        },
        put: {
          summary: 'Edit the church notification defaults',
          description:
            'A partial write; every omitted field keeps its stored value. The standard slot template is validated against the same kind/anchor pairing a plan uses. The deployed trigger cadence is configuration, not a default, and is not writable here.',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('NotificationDefaultsWrite') } },
          },
          responses: {
            200: {
              description: 'The defaults after the write.',
              content: {
                'application/json': {
                  schema: ref('NotificationDefaults'),
                  examples: {
                    edited: {
                      summary: 'The row after an edit',
                      value: notificationDefaultsExample,
                    },
                  },
                },
              },
            },
            401: unauthorized,
            422: validation,
          },
        },
      },
    },
  };
}
