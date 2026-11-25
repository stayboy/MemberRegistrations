import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgBoss, fromPglite } from 'pg-boss';
import { migrate } from '../../src/db/migrate.js';
import { MIGRATIONS } from '../../src/db/migrations.js';
import { createPgDb } from '../../src/db/pg.js';
import {
  PGBOSS_PACKAGE_VERSION,
  PGBOSS_SCHEMA_SQL,
  PGBOSS_SCHEMA_VERSION,
} from '../../src/db/pgboss-schema.js';
import { createPglite, type PgliteHandle } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';
import { createPgBossQueue } from '../../src/queue/pgboss.js';
import { buildVendored, renderModule, VENDORED_PATH } from '../../scripts/pgboss-schema.mjs';
import { createScratchDatabase } from '../helpers/scratch-db.js';

/**
 * AC-1 and AC-5 of the round: the tracked migration `0031_pgboss_schema` is the
 * pg-boss release's own DDL, it applies on both drivers, pg-boss starts against
 * it with `migrate: false` and reports no drift, and the vendored file is
 * reproduced exactly by the generator.
 *
 * This is the queue's version of `tests/db/schema-drift.test.ts`: the `pgboss`
 * schema is the documented exception to the Drizzle mirror (AGENTS 12).
 */
const require = createRequire(import.meta.url);
const pgBossManifestPath = require.resolve('pg-boss/package.json');
const pgBossCliPath = resolve(dirname(pgBossManifestPath), 'dist/cli.js');
const installedPgBoss = JSON.parse(readFileSync(pgBossManifestPath, 'utf8')) as {
  version: string;
  pgboss: { schema: number };
};

describe('the vendored pgboss schema', () => {
  it('is migration 0031, after the plan-side 0030 and before the send-side 0032', () => {
    const migration = MIGRATIONS.find((entry) => entry.version === '0031_pgboss_schema');
    expect(migration).toBeDefined();
    expect(migration?.sql).toBe(PGBOSS_SCHEMA_SQL);
    // 0030 is R2's plan side and landed with this round; the send side (0032)
    // is still R3's, so this test guards both ends of the ordering.
    expect(MIGRATIONS.map((entry) => entry.version)).toContain('0030_event_notifications');
    expect(MIGRATIONS.some((entry) => entry.version.startsWith('0032'))).toBe(false);
  });

  it('matches the pinned pg-boss release the package depends on', () => {
    expect(installedPgBoss.version).toBe(PGBOSS_PACKAGE_VERSION);
    expect(installedPgBoss.pgboss.schema).toBe(PGBOSS_SCHEMA_VERSION);

    const generated = buildVendored();
    expect(generated.packageVersion).toBe(PGBOSS_PACKAGE_VERSION);
    expect(generated.schemaVersion).toBe(PGBOSS_SCHEMA_VERSION);
    expect(generated.sql).toBe(PGBOSS_SCHEMA_SQL);
  });

  it('is reproduced byte for byte by scripts/pgboss-schema.mjs', () => {
    const generated = buildVendored();
    expect(renderModule(generated.sql, generated)).toBe(readFileSync(VENDORED_PATH, 'utf8'));
  });
});

describe('0031 on PGlite', () => {
  let handle: PgliteHandle;

  beforeAll(async () => {
    handle = await createPglite();
    await migrate(handle.db);
  });

  afterAll(async () => {
    await handle?.db.close();
  });

  it('installs pgboss at the pinned version and passes pg-boss doctor', async () => {
    const [version] = await handle.db.query<{ version: number | string }>(
      'select version from pgboss.version',
    );
    expect(Number(version?.version)).toBe(PGBOSS_SCHEMA_VERSION);

    // Doctor is what CI runs; detectSchemaDrift() is the same scan, and starting
    // with migrate:false also proves pg-boss accepts the vendored DDL as-is.
    const boss = new PgBoss({
      db: fromPglite(handle.engine),
      backend: 'pglite',
      schema: 'pgboss',
      migrate: false,
      supervise: false,
      schedule: false,
    });
    try {
      await boss.start();
      const drift = await boss.detectSchemaDrift();
      expect(drift.ok).toBe(true);
    } finally {
      await boss.stop();
    }
  });
});

/**
 * Round doc decision 3: a wrong schema version fails with a diagnostic that
 * names the expected version, the generator and the file to commit, rather
 * than pg-boss's own assertion.
 */
describe('the pg-boss boot check', () => {
  it('names the expected version, the generator and the file to commit', async () => {
    const handle = await createPglite();
    try {
      await migrate(handle.db);
      await handle.db.query('update pgboss.version set version = $1', [PGBOSS_SCHEMA_VERSION - 1]);

      const queue = createPgBossQueue({
        db: handle.db,
        connection: { driver: 'pglite', engine: handle.engine },
      });
      const error = await queue.start().then(
        () => null,
        (failure: Error) => failure,
      );

      expect(error?.message).toContain(`expected pgboss schema version ${PGBOSS_SCHEMA_VERSION}`);
      expect(error?.message).toContain('node scripts/pgboss-schema.mjs');
      expect(error?.message).toContain('src/db/pgboss-schema.ts');
    } finally {
      await handle.db.close();
    }
  });
});

/**
 * The `pg` half of AC-1: the migration applies on the pooled driver and the
 * real `pg-boss doctor` CLI reports no drift. `TEST_DATABASE_URL` must name a
 * scratch server that allows creating databases.
 */ const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('0031 and pg-boss doctor on the pooled pg driver', () => {
  let db: Db;
  let connectionString: string;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    const scratch = await createScratchDatabase(testDatabaseUrl!);
    drop = scratch.drop;
    connectionString = scratch.connectionString;
    db = createPgDb(connectionString);
    await migrate(db);
  });

  afterAll(async () => {
    await db?.close();
    await drop?.();
  });

  it('reports the pinned version and no drift', async () => {
    const [version] = await db.query<{ version: number | string }>(
      'select version from pgboss.version',
    );
    expect(Number(version?.version)).toBe(PGBOSS_SCHEMA_VERSION);

    const output = execFileSync(
      process.execPath,
      [pgBossCliPath, 'doctor', '--schema', 'pgboss', '--connection-string', connectionString],
      { encoding: 'utf8' },
    );
    expect(output).toContain(`version ${PGBOSS_SCHEMA_VERSION}`);
    expect(output).toContain('No drift detected');
  });
});
