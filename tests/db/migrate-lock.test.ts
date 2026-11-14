import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../src/db/migrations.js';
import { migrate } from '../../src/db/migrate.js';
import { createPgDb } from '../../src/db/pg.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';
import { createScratchDatabase } from '../helpers/scratch-db.js';

const versions = MIGRATIONS.map((migration) => migration.version);

async function appliedVersions(db: Db): Promise<string[]> {
  const rows = await db.query<{ version: string }>(
    'select version from schema_migrations order by version',
  );
  return rows.map((row) => row.version);
}

describe('migrate under concurrent callers', () => {
  /**
   * Two migrators on one PGlite handle. PGlite serialises the single in-process
   * connection, so this proves idempotence — every version lands once and a later
   * pass re-runs no DDL — rather than the cross-process race. The pooled case
   * below is the one that exercises the actual race.
   */
  it('applies each migration exactly once when two migrators run together', async () => {
    const db = await createPgliteDb();

    try {
      const [first, second] = await Promise.all([migrate(db), migrate(db)]);

      // Both callers resolved, and between them each version was applied once.
      expect([...first, ...second].sort()).toEqual([...versions].sort());
      expect(await appliedVersions(db)).toEqual([...versions].sort());

      // Re-running on a fully migrated database is a no-op rather than a replay.
      expect(await migrate(db)).toEqual([]);
      expect(await appliedVersions(db)).toEqual([...versions].sort());
    } finally {
      await db.close();
    }
  }, 60_000);
});

/**
 * The same race over two independent pooled connections on one database — the
 * shape four test files hit when they each call `migrate()` on the same URL. Set
 * `TEST_DATABASE_URL` to a scratch server (never production) that allows
 * creating databases; the case migrates a database of its own and drops it.
 * Skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('migrate on the pooled pg driver', () => {
  it('applies every migration once across two concurrent migrators', async () => {
    const scratch = await createScratchDatabase(testDatabaseUrl!);
    const first = createPgDb(scratch.connectionString);
    const second = createPgDb(scratch.connectionString);

    try {
      const results = await Promise.all([migrate(first), migrate(second)]);

      // Both migrators resolved instead of one dying on a duplicate relation.
      expect(results).toHaveLength(2);
      expect(results.every((ran) => Array.isArray(ran))).toBe(true);

      // Every version is recorded once, and between the two of them they applied
      // each of them once — the loser waited on the advisory lock and skipped.
      expect([...results[0]!, ...results[1]!].sort()).toEqual([...versions].sort());
      expect(await appliedVersions(first)).toEqual([...versions].sort());
    } finally {
      await Promise.all([first.close(), second.close()]);
      await scratch.drop();
    }
  }, 60_000);
});
