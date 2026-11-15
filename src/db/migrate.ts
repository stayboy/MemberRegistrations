import { MIGRATIONS } from './migrations.js';
import type { Db } from './sql.js';

/**
 * Creates the ledger. `create table if not exists` is itself racy: two
 * migrators that both see the table missing can collide in the catalog. A
 * transaction-scoped advisory lock on a fixed key serialises the bootstrap, so
 * the second migrator waits and then finds the table.
 */
async function ensureMigrationsTable(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['schema_migrations']);
    await tx.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);
  });
}

/**
 * Applies every migration that has not run yet. Migrations are not run on
 * request: a deploy runs `npm run db:migrate` as an explicit step.
 *
 * Checking and applying is atomic against another migrator working on the same
 * database (parallel test files, a deploy overlapping a second deploy). Inside
 * each per-migration transaction the migration version is locked with a
 * transaction-scoped advisory lock and `schema_migrations` is re-read, so the
 * loser of the race skips instead of re-running the DDL. The lock releases on
 * commit or rollback, and two migrators touching different versions never
 * block each other.
 */
export async function migrate(db: Db): Promise<string[]> {
  await ensureMigrationsTable(db);

  const applied = new Set(
    (await db.query<{ version: string }>('select version from schema_migrations')).map(
      (row) => row.version,
    ),
  );

  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const appliedHere = await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [migration.version]);
      const [existing] = await tx.query<Record<string, unknown>>(
        'select 1 from schema_migrations where version = $1',
        [migration.version],
      );
      if (existing) return false;

      for (const statement of migration.logged ?? []) {
        const [row] = await tx.query<{ count: number | string }>(statement.sql);
        if (process.env.NODE_ENV !== 'test') {
          console.log(
            `${migration.version}: ${statement.label}: ${Number(row?.count ?? 0)} row(s)`,
          );
        }
      }
      await tx.exec(migration.sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [migration.version]);
      return true;
    });

    if (appliedHere) ran.push(migration.version);
  }

  return ran;
}
