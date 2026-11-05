import { MIGRATIONS } from './migrations.js';
import type { Db } from './sql.js';

/**
 * Applies every migration that has not run yet. Migrations are not run on
 * request: a deploy runs `npm run db:migrate` as an explicit step.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await db.query<{ version: string }>('select version from schema_migrations')).map(
      (row) => row.version,
    ),
  );

  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    await db.transaction(async (tx) => {
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
    });
    ran.push(migration.version);
  }

  return ran;
}
