import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { MIGRATIONS } from '../../src/db/migrations.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';

describe('event instances', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('accepts a standalone three-session event with no series', async () => {
    const sessions = [
      { date: '2026-03-01', startTime: '09:00', endTime: '17:00', status: 'scheduled' },
      { date: '2026-03-02', startTime: '09:00', endTime: '17:00', status: 'scheduled' },
      { date: '2026-03-03', startTime: '09:00', endTime: '12:00', status: 'scheduled' },
    ];

    await db.query(
      `insert into event_instances
         (event_no, name, timezone, start_date, end_date, venue_type, status, source, sessions)
       values ('EV-1', 'Strategic Conference', 'UTC', '2026-03-01', '2026-03-03', 'auditorium',
               'scheduled', 'manual', $1::jsonb)`,
      [JSON.stringify(sessions)],
    );

    const [row] = await db.query<{ series_id: string | null; sessions: unknown }>(
      'select series_id, sessions from event_instances where event_no = $1',
      ['EV-1'],
    );
    expect(row!.series_id).toBeNull();
    expect(Array.isArray(row!.sessions)).toBe(true);
    expect((row!.sessions as unknown[]).length).toBe(3);
  });

  it('enforces the series foreign key when series_id is set', async () => {
    await expect(
      db.query(
        `insert into event_instances
           (series_id, name, start_date, end_date, venue_type, status, source, sessions)
         values ('00000000-0000-0000-0000-000000000000', 'Orphan', '2026-03-01', '2026-03-01',
                 'auditorium', 'scheduled', 'series', '[]'::jsonb)`,
      ),
    ).rejects.toThrow();
  });
});

describe('0005 event-instance backfill', () => {
  it('turns a pre-migration occurrence and attendance into an event instance', async () => {
    const db = await createPgliteDb();
    for (const migration of MIGRATIONS) {
      if (migration.version >= '0005_event_instances') break;
      await db.exec(migration.sql);
    }

    const [series] = await db.query<{ id: string }>(
      `insert into event_series (name, created_by, updated_by) values ('Sunday Service', 'test', 'test')
       returning id`,
    );
    const [member] = await db.query<{ id: string }>(
      `insert into members (member_no, created_by, updated_by) values ('M-9001', 'test', 'test')
       returning id`,
    );
    await db.query(
      `insert into event_occurrences (series_id, occurs_on, event_no) values ($1, '2026-01-04', 'E-1')`,
      [series!.id],
    );
    await db.query(
      `insert into attendance (member_id, series_id, occurs_on, source, created_by)
       values ($1, $2, '2026-01-04', 'manual', 'test')`,
      [member!.id, series!.id],
    );
    // A manual attendance with no occurrence row must still resolve to an event instance.
    await db.query(
      `insert into attendance (member_id, series_id, occurs_on, source, created_by)
       values ($1, $2, '2026-01-11', 'manual', 'test')`,
      [member!.id, series!.id],
    );

    const migration = MIGRATIONS.find((entry) => entry.version === '0005_event_instances');
    await db.exec(migration!.sql);

    const instances = await db.query<{ id: string; name: string; start_date: Date | string }>(
      'select id, name, start_date from event_instances order by start_date',
    );
    const dates = (value: Date | string) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    expect(instances.map((row) => dates(row.start_date))).toEqual(['2026-01-04', '2026-01-11']);
    expect(instances.every((row) => row.name === 'Sunday Service')).toBe(true);

    const rows = await db.query<{ event_instance_id: string; session_date: Date | string }>(
      'select event_instance_id, session_date from attendance order by session_date',
    );
    expect(rows.map((row) => dates(row.session_date))).toEqual(['2026-01-04', '2026-01-11']);
    expect(rows.every((row) => row.event_instance_id !== null)).toBe(true);
  });
});
