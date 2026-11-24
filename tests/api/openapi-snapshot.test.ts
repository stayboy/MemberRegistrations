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
      '/v1/events/periods',
      '/v1/events/preview',
      '/v1/series/{id}',
      '/v1/audiences',
      '/v1/audiences/{id}',
    ]) {
      expect(paths[path]).toBeDefined();
    }

    const events = paths['/v1/events'] as {
      get: { responses: Record<string, { content?: Record<string, { examples?: unknown }> }> };
    };
    expect(events.get.responses['200']!.content!['application/json']!.examples).toBeTruthy();
  });
});
