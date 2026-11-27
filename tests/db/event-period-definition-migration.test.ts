import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../src/db/migrations.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';
import { periodById } from '../../src/domain/periods.js';
import type { EventPeriodId } from '../../src/schemas/events.js';

/**
 * `0033_event_period_definition` (member-registrations-event-periods.md, "Named
 * periods"; owner, 2026-11-27): the prose sits beside the name snapshot, so the
 * detail read returns what the row stored rather than today's catalogue. Existing
 * period rows are backfilled from the catalogue, on the recorded basis that the
 * seeded prose last changed on 2026-11-24 (86ec2d5) and period creation landed on
 * 2026-11-25 (748f6d2) - every period row was written after the last change, so
 * today's prose is that row's prose.
 */
const VERSION = '0033_event_period_definition';

function migrationSql(version: string): string {
  const migration = MIGRATIONS.find((entry) => entry.version === version);
  if (!migration) throw new Error(`No migration ${version}`);
  return migration.sql;
}

/** Every migration before this one, in order - the schema a deploy left behind. */
async function applyBefore(db: Db, version: string): Promise<void> {
  for (const migration of MIGRATIONS) {
    if (migration.version === version) break;
    await db.exec(migration.sql);
  }
}

describe('0030 event period definition snapshot', () => {
  let db: Db;
  const ids: Partial<Record<EventPeriodId | 'plain', string>> = {};

  beforeAll(async () => {
    db = await createPgliteDb();
    await applyBefore(db, VERSION);

    const [everyone] = await db.query<{ id: string }>(
      `select id from audiences where system_key = 'everyone'`,
    );
    const audienceId = everyone!.id;

    // Rows written before the column existed: the name snapshot is there and the
    // prose has no home yet.
    const seeds: Array<[EventPeriodId, string, string]> = [
      ['communion-week', 'EVT-2027-201', 'Stored Communion Week'],
      ['gospel-week', 'EVT-2027-202', 'Stored Gospel Week'],
      ['home-cells', 'EVT-2027-203', 'Stored Home Cells'],
    ];
    for (const [id, eventNo, name] of seeds) {
      const [row] = await db.query<{ id: string }>(
        `insert into events (event_no, name, audience_id, period_id, period_cycle, period_name)
         values ($1,$2,$3,$4,'2027-01',$5)
         returning id`,
        [eventNo, name, audienceId, id, periodById(id).name],
      );
      ids[id] = row!.id;
    }

    const [plain] = await db.query<{ id: string }>(
      `insert into events (event_no, name, audience_id)
       values ('EVT-2027-204','Stored Standalone',$1)
       returning id`,
      [audienceId],
    );
    ids.plain = plain!.id;

    await db.transaction(async (tx) => {
      await tx.exec(migrationSql(VERSION));
    });
  });

  afterAll(async () => {
    await db.close();
  });

  it('adds the column as nullable, beside the name snapshot', async () => {
    const [column] = await db.query<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type
         from information_schema.columns
        where table_schema = 'public' and table_name = 'events'
          and column_name = 'period_definition'`,
    );
    expect(column).toEqual({ is_nullable: 'YES', data_type: 'text' });
  });

  it('backfills every seeded period from the catalogue prose', async () => {
    for (const id of ['communion-week', 'gospel-week', 'home-cells'] as EventPeriodId[]) {
      const [row] = await db.query<{ period_definition: string | null }>(
        'select period_definition from events where id = $1',
        [ids[id]],
      );
      // The backfill and the catalogue agree at this migration's moment: a later
      // prose change is a new migration, and this assertion is where it shows.
      expect(row!.period_definition).toBe(periodById(id).definition);
    }
  });

  it('leaves a period-less event null', async () => {
    const [row] = await db.query<{ period_definition: string | null }>(
      'select period_definition from events where id = $1',
      [ids.plain],
    );
    expect(row!.period_definition).toBeNull();
  });

  it('changes nothing when the statements run again', async () => {
    const before = await db.query<{ id: string; period_definition: string | null }>(
      'select id, period_definition from events order by event_no',
    );
    // The `is null` guards make the backfill write-once; a replay is a no-op even
    // though the tracked runner applies each version exactly once.
    await db.exec(migrationSql(VERSION));
    const after = await db.query<{ id: string; period_definition: string | null }>(
      'select id, period_definition from events order by event_no',
    );
    expect(after).toEqual(before);
  });
});
