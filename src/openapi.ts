import { z } from 'zod';
import {
  attendanceEntrySchema,
  attendanceResponseSchema,
  contactInputSchema,
  createMemberSchema,
  memberResponseSchema,
  updateMemberSchema,
} from './schemas/member.js';
import {
  healthResponseSchema,
  ministryRequestSchema,
  memberListResponseSchema,
  problemSchema,
  subscriptionRequestSchema,
} from './schemas/api.js';

type JsonSchema = Record<string, unknown>;

/**
 * Zod is the single source of truth for the contract: request/response schemas
 * are converted to JSON Schema (OpenAPI 3.1 dialect) rather than hand-written.
 */
function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io }) as JsonSchema;
  delete json.$schema;
  return json;
}

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ref('Problem') } },
});

const jsonResponse = (description: string, name: string) => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});

const memberNotFound = problemResponse('Member not found.');

const memberNoParam = {
  name: 'memberNo',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' },
};

const contactIdParam = {
  name: 'contactId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MemberRegistrations API',
      version: '1.0.0',
      description:
        'Member registration lookup, CRUD, and derived attendance for the school register.',
    },
    servers: [{ url: '/', description: 'Current deployment' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Member: toSchema(memberResponseSchema, 'output'),
        CreateMemberRequest: toSchema(createMemberSchema, 'input'),
        UpdateMemberRequest: toSchema(updateMemberSchema, 'input'),
        ContactInput: toSchema(contactInputSchema, 'input'),
        AttendanceEntry: toSchema(attendanceEntrySchema, 'output'),
        Attendance: toSchema(attendanceResponseSchema, 'output'),
        MemberList: toSchema(memberListResponseSchema, 'output'),
        SubscriptionRequest: toSchema(subscriptionRequestSchema, 'input'),
        MinistryRequest: toSchema(ministryRequestSchema, 'input'),
        Health: toSchema(healthResponseSchema, 'output'),
        Problem: toSchema(problemSchema, 'output'),
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness probe',
          security: [],
          responses: { 200: jsonResponse('Service is alive.', 'Health') },
        },
      },
      '/members': {
        get: {
          summary: 'List member registrations',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            { name: 'q', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: jsonResponse('A page of members.', 'MemberList'),
            401: problemResponse('Missing or invalid bearer token.'),
            422: problemResponse('Invalid query parameters.'),
          },
        },
        post: {
          summary: 'Create a member registration',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateMemberRequest') } },
          },
          responses: {
            201: jsonResponse('Member created.', 'Member'),
            409: problemResponse('A member with this member number already exists.'),
            422: problemResponse('Invalid request body.'),
          },
        },
      },
      '/members/{memberNo}': {
        parameters: [memberNoParam],
        get: {
          summary: 'Look up a member registration',
          responses: {
            200: jsonResponse('The member registration.', 'Member'),
            404: memberNotFound,
          },
        },
        put: {
          summary: 'Replace the mutable parts of a member registration',
          parameters: [
            {
              name: 'If-Match',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateMemberRequest') } },
          },
          responses: {
            200: jsonResponse('Member updated.', 'Member'),
            404: memberNotFound,
            409: problemResponse('The member was modified since the supplied ETag.'),
            422: problemResponse('Invalid request body.'),
          },
        },
        delete: {
          summary: 'Delete a member registration',
          responses: {
            204: { description: 'Member deleted.' },
            404: memberNotFound,
          },
        },
      },
      '/members/{memberNo}/attendance': {
        parameters: [memberNoParam],
        get: {
          summary: 'Read derived attendance for a member',
          responses: {
            200: jsonResponse('Attendance entries and per-event summary.', 'Attendance'),
            404: memberNotFound,
          },
        },
        post: {
          summary: 'Record an attendance entry for a member',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('AttendanceEntry') } },
          },
          responses: {
            201: jsonResponse('Attendance recorded.', 'AttendanceEntry'),
            404: memberNotFound,
            409: problemResponse('Attendance for this event and date already exists.'),
            422: problemResponse('Invalid request body.'),
          },
        },
      },
      '/members/{memberNo}/contacts': {
        parameters: [memberNoParam],
        post: {
          summary: 'Add a contact to a member',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ContactInput') } },
          },
          responses: {
            201: { description: 'Contact added.' },
            404: memberNotFound,
            409: problemResponse('Duplicate contact.'),
            422: problemResponse('Invalid request body.'),
          },
        },
      },
      '/members/{memberNo}/contacts/{contactId}': {
        parameters: [memberNoParam, contactIdParam],
        delete: {
          summary: 'Remove a contact from a member',
          responses: {
            204: { description: 'Contact removed.' },
            404: problemResponse('Member or contact not found.'),
          },
        },
      },
      '/members/{memberNo}/subscriptions': {
        parameters: [memberNoParam],
        post: {
          summary: 'Activate a service subscription',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('SubscriptionRequest') } },
          },
          responses: {
            201: { description: 'Subscription activated.' },
            404: memberNotFound,
            409: problemResponse('The subscription is already active.'),
            422: problemResponse('Invalid request body.'),
          },
        },
      },
      '/members/{memberNo}/subscriptions/{kind}': {
        parameters: [
          memberNoParam,
          {
            name: 'kind',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['life-insurance', 'credit-union'] },
          },
        ],
        delete: {
          summary: 'Deactivate a service subscription',
          responses: {
            204: { description: 'Subscription deactivated.' },
            404: problemResponse('Member or active subscription not found.'),
          },
        },
      },
      '/members/{memberNo}/ministries': {
        parameters: [memberNoParam],
        post: {
          summary: 'Assign a ministry',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('MinistryRequest') } },
          },
          responses: {
            201: { description: 'Ministry assigned.' },
            404: memberNotFound,
            409: problemResponse('The member already serves in this ministry.'),
            422: problemResponse('Invalid request body.'),
          },
        },
      },
      '/members/{memberNo}/ministries/{ministry}': {
        parameters: [
          memberNoParam,
          {
            name: 'ministry',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['pemem', 'women-ministry', 'choir', 'prayer'],
            },
          },
        ],
        delete: {
          summary: 'Remove a ministry assignment',
          responses: {
            204: { description: 'Ministry assignment removed.' },
            404: problemResponse('Member or ministry assignment not found.'),
          },
        },
      },
    },
  };
}
