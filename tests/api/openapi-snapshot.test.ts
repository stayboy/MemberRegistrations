import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/openapi.js';

describe('OpenAPI contract snapshot', () => {
  it('matches the committed openapi.json', () => {
    const snapshot = JSON.parse(
      readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'),
    );
    expect(buildOpenApiDocument()).toEqual(snapshot);
  });

  it('names the round endpoints and their success examples', () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, unknown>;
    for (const path of [
      '/v1/events',
      '/v1/events/{eventId}',
      '/v1/events/{eventId}/schedule',
      '/v1/events/periods',
      '/v1/events/preview',
      '/v1/series/{id}',
      '/v1/audiences',
      '/v1/audiences/{id}',
      '/v1/notification-summary',
      '/v1/notification-deliveries',
      '/v1/notification-preferences',
      '/v1/notification-digest',
      '/v1/notification-deliveries/{id}/replay',
      '/v1/notification-deliveries/retry',
      '/v1/members/{memberNo}/notifications',
      '/v1/members/{memberNo}/notification-deliveries',
      '/v1/members/{memberNo}/notification-settings',
      '/v1/members/{memberNo}/notification-mutes/{id}/revoke',
      '/v1/members/{memberNo}/channel-blocks/{id}/revoke',
    ]) {
      expect(paths[path]).toBeDefined();
    }

    const events = paths['/v1/events'] as {
      get: { responses: Record<string, { content?: Record<string, { examples?: unknown }> }> };
    };
    expect(events.get.responses['200']!.content!['application/json']!.examples).toBeTruthy();

    const schedule = paths['/v1/events/{eventId}/schedule'] as {
      put: {
        requestBody: { content: Record<string, { schema?: unknown }> };
        responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      };
    };
    expect(schedule.put.requestBody.content['application/json']!.schema).toEqual({
      $ref: '#/components/schemas/EventScheduleWrite',
    });
    expect(schedule.put.responses['200']!.content!['application/json']!.schema).toEqual({
      $ref: '#/components/schemas/EventScheduleWriteResult',
    });
    const components = document.components as {
      schemas: Record<string, { anyOf?: unknown[]; required?: string[] }>;
    };
    expect(components.schemas.EventScheduleWrite!.anyOf).toHaveLength(2);
    expect(components.schemas.EventParent!.required).toContain('schedule');
  });
});
