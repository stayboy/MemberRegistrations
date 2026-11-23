import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { MIGRATIONS } from '../../src/db/migrations.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';
import { seedEvent } from '../helpers/event-fixtures.js';

describe('event parent and occurrences', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('accepts a standalone three-session event as one parent with three occurrences', async () => {
    const seeded = await seedEvent(db, {
      eventNo: 'EV-1',
      name: 'Strategic Conference',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      startTime: '09:00',
      sessions: [
        { date: '2026-03-01', startTime: '09:00', endTime: '17:00' },
        { date: '2026-03-02', startTime: '09:00', endTime: '17:00' },
        { date: '2026-03-03', startTime: '09:00', endTime: '12:00' },
      ],
    });

    const [event] = await db.query<{ id: string; audience_id: string | null }>(
      'select id, audience_id from events where event_no = $1',
      ['EV-1'],
    );
    expect(event!.id).toBe(seeded.eventId);
    expect(event!.audience_id).toBeTruthy();

    const occurrences = await db.query<{ date: Date | string }>(
      'select date from event_occurrences where event_id = $1 order by date',
      [seeded.eventId],
    );
    expect(
      occurrences.map((row) =>
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10),
      ),
    ).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('rejects a second occurrence for the same parent and date', async () => {
    const seeded = await seedEvent(db, {
      eventNo: 'EV-2',
      name: 'One Day',
      startDate: '2026-04-01',
      endDate: '2026-04-01',
      sessions: [{ date: '2026-04-01' }],
    });

    await expect(
      db.query(
        `insert into event_occurrences (event_id, date, status)
         values ($1, '2026-04-01', 'scheduled')`,
        [seeded.eventId],
      ),
    ).rejects.toThrow();
  });

  it('keeps the legacy ministry and presbyter columns as audience projections', async () => {
    const seeded = await seedEvent(db, {
      eventNo: 'EV-3',
      name: 'Choir Presbyters',
      ministryCode: 'CHOIR',
      presbyterOnly: true,
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      sessions: [{ date: '2026-05-01' }],
    });
    const [row] = await db.query<{ ministry_id: string | null; presbyter_only: boolean }>(
      'select ministry_id, presbyter_only from events where id = $1',
      [seeded.eventId],
    );
    expect(row!.ministry_id).toBeTruthy();
    expect(row!.presbyter_only).toBe(true);
  });
});

describe('0005 event-instance backfill', () => {
  // The replay runs in a hook, not inside `it`: instantiating Wasm Postgres and
  // replaying the early migrations is a before-load step, and `hookTimeout` is
  // the liveness guard the test timeout is not (AGENTS.md §8, round record).
  let db: Db;

  beforeAll(async () => {
    db = await createPgliteDb();
    for (const migration of MIGRATIONS) {
      if (migration.version >= '0005_event_instances') break;
      await db.exec(migration.sql);
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it('turns a pre-migration occurrence and attendance into an event instance', async () => {
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
    await db.query(
      `insert into attendance_suppressions (member_id, series_id, occurs_on, suppressed_by)
       values ($1, $2, '2026-01-18', 'test')`,
      [member!.id, series!.id],
    );

    const migration = MIGRATIONS.find((entry) => entry.version === '0005_event_instances');
    await db.exec(migration!.sql);

    const instances = await db.query<{
      id: string;
      name: string;
      start_date: Date | string;
      sessions: unknown;
    }>('select id, name, start_date, sessions from event_instances order by start_date');
    const dates = (value: Date | string) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    expect(instances.map((row) => dates(row.start_date))).toEqual([
      '2026-01-04',
      '2026-01-11',
      '2026-01-18',
    ]);
    expect(instances.every((row) => row.name === 'Sunday Service')).toBe(true);
    expect(instances.every((row) => Array.isArray(row.sessions) && row.sessions.length === 1)).toBe(
      true,
    );

    const rows = await db.query<{ event_instance_id: string; session_date: Date | string }>(
      'select event_instance_id, session_date from attendance order by session_date',
    );
    expect(rows.map((row) => dates(row.session_date))).toEqual(['2026-01-04', '2026-01-11']);
    expect(rows.every((row) => row.event_instance_id !== null)).toBe(true);

    const suppressions = await db.query<{
      event_instance_id: string;
      session_date: Date | string;
    }>('select event_instance_id, session_date from attendance_suppressions order by session_date');
    expect(suppressions.map((row) => dates(row.session_date))).toEqual(['2026-01-18']);
    expect(suppressions.every((row) => row.event_instance_id !== null)).toBe(true);
  });
});
