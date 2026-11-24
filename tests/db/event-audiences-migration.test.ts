import { afterEach, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../../src/db/pglite.js';
import { MIGRATIONS } from '../../src/db/migrations.js';
import type { Db } from '../../src/db/sql.js';

const VERSION = '0028_event_audiences';

async function applyThrough(db: Db, version: string): Promise<void> {
  for (const migration of MIGRATIONS) {
    if (migration.version >= version) break;
    await db.exec(migration.sql);
  }
}

function migrationSql(version: string): string {
  const migration = MIGRATIONS.find((entry) => entry.version === version);
  if (!migration) throw new Error(`No migration ${version}`);
  return migration.sql;
}

async function applyAtomically(db: Db, version: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec(migrationSql(version));
  });
}

/**
 * The migration asserts before it constrains (A-2a): a missed writer, or an
 * event without a number, fails the deploy instead of shipping a zero-roster
 * event. The register is empty, so there is no backfill.
 */
describe('0028 event audiences and the required event number', () => {
  let db: Db | null = null;

  afterEach(async () => {
    await db?.close();
    db = null;
  });

  async function seedEventWithoutSet(): Promise<{ eventId: string; everyoneId: string }> {
    const [{ id: everyoneId }] = await db!.query<{ id: string }>(
      `select id from audiences where system_key = 'everyone'`,
    );
    const [event] = await db!.query<{ id: string }>(
      `insert into events (event_no, name, audience_id, timezone)
       values ('EVT-2026-900','Seedless',$1,'UTC') returning id`,
      [everyoneId],
    );
    return { eventId: event!.id, everyoneId };
  }

  it('refuses an event with no event_audiences row', async () => {
    db = await createPgliteDb();
    await applyThrough(db, VERSION);
    await seedEventWithoutSet();

    await expect(applyAtomically(db, VERSION)).rejects.toThrow(/no event_audiences row/);

    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = 'event_audiences'`,
    );
    expect(tables).toEqual([]);
  });

  it('refuses an event without an event number', async () => {
    db = await createPgliteDb();
    await applyThrough(db, VERSION);
    await applyAtomically(db, VERSION);
    const { eventId, everyoneId } = await seedEventWithoutSet();
    await db.query(
      `insert into event_audiences (event_id, audience_id, sort_order) values ($1,$2,0)`,
      [eventId, everyoneId],
    );
    // A legacy row that lost its number: relax the column so the row can exist,
    // then prove the assertion refuses rather than the ALTER's bare error.
    await db.query(`alter table events alter column event_no drop not null`);
    await db.query(`update events set event_no = null where id = $1`, [eventId]);

    await expect(applyAtomically(db, VERSION)).rejects.toThrow(/no event number/);
  });

  it('requires the number and makes the unique index plain once both hold', async () => {
    db = await createPgliteDb();
    await applyThrough(db, VERSION);
    await applyAtomically(db, VERSION);
    const { eventId, everyoneId } = await seedEventWithoutSet();
    await db.query(
      `insert into event_audiences (event_id, audience_id, sort_order) values ($1,$2,0)`,
      [eventId, everyoneId],
    );

    // Re-applying is a no-op once every event has a set and a number.
    await applyAtomically(db, VERSION);

    const [column] = await db.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'events' and column_name = 'event_no'`,
    );
    expect(column).toEqual({ is_nullable: 'NO' });

    const [index] = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'events' and indexname = 'events_event_no'`,
    );
    expect(index!.indexdef).toContain('UNIQUE INDEX events_event_no');
    expect(index!.indexdef).not.toContain('WHERE');
  });
});
