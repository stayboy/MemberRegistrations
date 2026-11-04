import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe('ORM boundary', () => {
  it('keeps Drizzle out of routes, Zod schemas and OpenAPI', () => {
    const files = [...filesUnder('src/routes'), ...filesUnder('src/schemas'), 'src/openapi.ts'];
    const offenders = files.filter((file) =>
      /from\s+['"]drizzle-orm/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
