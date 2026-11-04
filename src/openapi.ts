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
  memberDetailSchema,
  memberListSchema,
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
  updateSeriesSchema,
} from './schemas/reference.js';
import {
  attendanceImportSchema,
  importBatchSchema,
  memberImportSchema,
} from './schemas/imports.js';
import {
  createEventSchema,
  eventAttendanceEntrySchema,
  eventAttendanceInputSchema,
  eventAttendanceSchema,
  eventGenerationSchema,
  eventListSchema,
  eventSchema,
  updateEventSchema,
} from './schemas/events.js';
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
        CreateMember: toSchema(createMemberSchema, 'input'),
        UpdateMember: toSchema(updateMemberSchema, 'input'),
        PurgeMember: toSchema(purgeSchema, 'input'),
        Contact: toSchema(contactResponseSchema, 'output'),
        ContactInput: toSchema(contactInputSchema, 'input'),
        Subscription: toSchema(subscriptionResponseSchema, 'output'),
        SubscriptionInput: toSchema(subscriptionInputSchema, 'input'),
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
        OccurrenceList: toSchema(occurrenceListSchema, 'output'),
        Event: toSchema(eventSchema, 'output'),
        EventList: toSchema(eventListSchema, 'output'),
        EventGeneration: toSchema(eventGenerationSchema, 'output'),
        CreateEvent: toSchema(createEventSchema, 'input'),
        UpdateEvent: toSchema(updateEventSchema, 'input'),
        EventAttendance: toSchema(eventAttendanceSchema, 'output'),
        EventAttendanceEntry: toSchema(eventAttendanceEntrySchema, 'output'),
        EventAttendanceInput: toSchema(eventAttendanceInputSchema, 'input'),
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

      '/v1/members': {
        get: {
          summary: 'List member registrations',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'contact', in: 'query', schema: { type: 'string' } },
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
        post: {
          summary: 'Create a subscription; household scope takes explicit coverage',
          parameters: [actorHeader],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('SubscriptionInput') } },
          },
          responses: {
            201: json('Subscription created.', 'Subscription'),
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
            404: notFound,
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
            'Lists the stored rows as present and reports expected as the register at the session date. A date outside the event sessions is a validation error.',
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
            200: json('Roster with contacts, counts and latest reports.', 'Roster'),
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
    },
  };
}
