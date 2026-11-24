import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../src/db/migrations.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';
import { HeadcountRepository } from '../../src/repos/headcounts.js';

/** The schema on the last day before headcounts became lanes. */
async function preLaneDb(): Promise<Db> {
  const db = await createPgliteDb();
  for (const migration of MIGRATIONS) {
    if (migration.version === '0022_headcount_lanes') break;
    await db.exec(migration.sql);
  }
  return db;
}

async function seededEvent(db: Db, eventNo: string, sessionDate: string): Promise<string> {
  const [event] = await db.query<{ id: string }>(
    `insert into event_instances
       (event_no, name, timezone, start_date, end_date, venue_type, status, source, sessions)
     values ($1, $1, 'UTC', $2, $2, 'auditorium', 'held', 'manual', $3::jsonb)
     returning id`,
    [eventNo, sessionDate, JSON.stringify([{ date: sessionDate, status: 'held' }])],
  );
  return event!.id;
}

async function insertLegacyHeadcount(
  db: Db,
  eventId: string,
  options: {
    mode: 'adults' | 'children' | 'mixed';
    sessionDate?: string;
    asOf?: string;
    /** Pins the insert clock, so an ordering key never falls back to `now()`. */
    recordedAt?: string;
    adultMale?: number;
    adultFemale?: number;
    adultUnspecified?: number;
    childMale?: number;
    childFemale?: number;
    childUnspecified?: number;
    supersedesId?: string | null;
  },
): Promise<string> {
  const buckets = {
    adultMale: options.adultMale ?? 0,
    adultFemale: options.adultFemale ?? 0,
    adultUnspecified: options.adultUnspecified ?? 0,
    childMale: options.childMale ?? 0,
    childFemale: options.childFemale ?? 0,
    childUnspecified: options.childUnspecified ?? 0,
  };
  const total = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  const [row] = await db.query<{ id: string }>(
    `insert into event_session_headcounts (
       event_instance_id, session_date, as_of, mode,
       adult_male, adult_female, adult_unspecified,
       child_male, child_female, child_unspecified,
       total, ended, recorded_by, supersedes_id, recorded_at
     )
     values ($1, coalesce($11::date, current_date), coalesce($12::timestamptz, now()), $2,
             $3, $4, $5, $6, $7, $8, $9, false, 'legacy', $10,
             coalesce($13::timestamptz, now()))
     returning id`,
    [
      eventId,
      options.mode,
      buckets.adultMale,
      buckets.adultFemale,
      buckets.adultUnspecified,
      buckets.childMale,
      buckets.childFemale,
      buckets.childUnspecified,
      total,
      options.supersedesId ?? null,
      options.sessionDate ?? null,
      options.asOf ?? null,
      options.recordedAt ?? null,
    ],
  );
  return row!.id;
}

async function lineRows(
  db: Db,
  headcountId: string,
): Promise<Array<{ bucket_code: string; count: number; label: string }>> {
  return db.query<{ bucket_code: string; count: number; label: string }>(
    `select l.bucket_code, l.count, b.label
       from headcount_lines l
       join headcount_buckets b on b.mode_code = l.mode_code and b.code = l.bucket_code
      where l.headcount_id = $1
      order by b.sort_order, l.bucket_code`,
    [headcountId],
  );
}

describe('0022 headcount lanes backfill', () => {
  it('reshapes every row into non-zero lines and keeps each chain as it was', async () => {
    const db = await preLaneDb();
    try {
      const eventId = await seededEvent(db, 'LEGACY-1', '2026-01-04');
      const zeroEventId = await seededEvent(db, 'LEGACY-2', '2026-01-04');

      const adults = await insertLegacyHeadcount(db, eventId, {
        mode: 'adults',
        adultMale: 20,
        adultFemale: 30,
        childUnspecified: 5,
      });
      const children = await insertLegacyHeadcount(db, eventId, {
        mode: 'children',
        childMale: 4,
        childFemale: 6,
        adultUnspecified: 2,
      });
      // The legacy chain that matters: mixed supersedes adults.
      const mixed = await insertLegacyHeadcount(db, eventId, {
        mode: 'mixed',
        adultMale: 3,
        adultFemale: 4,
        childMale: 5,
        childFemale: 6,
        supersedesId: adults,
      });
      const zero = await insertLegacyHeadcount(db, zeroEventId, { mode: 'adults' });

      const migration = MIGRATIONS.find((entry) => entry.version === '0022_headcount_lanes');
      expect(migration).toBeTruthy();
      await db.exec(migration!.sql);

      // One line per non-zero column, in the mode's declared order.
      expect(await lineRows(db, adults)).toEqual([
        { bucket_code: 'adult-male', count: 20, label: 'Adult men' },
        { bucket_code: 'adult-female', count: 30, label: 'Adult women' },
        { bucket_code: 'child-unspecified', count: 5, label: 'Children' },
      ]);
      expect((await lineRows(db, children)).map((line) => line.bucket_code)).toEqual([
        'child-male',
        'child-female',
        'adult-unspecified',
      ]);
      expect(await lineRows(db, mixed)).toEqual([
        { bucket_code: 'adult-male', count: 3, label: 'Adult men' },
        { bucket_code: 'adult-female', count: 4, label: 'Adult women' },
        { bucket_code: 'child-male', count: 5, label: 'Boys' },
        { bucket_code: 'child-female', count: 6, label: 'Girls' },
      ]);
      // An all-zero observation carries no lines and keeps its total of zero.
      expect(await lineRows(db, zero)).toEqual([]);
      const [zeroRow] = await db.query<{ total: number }>(
        'select total from event_session_headcounts where id = $1',
        [zero],
      );
      expect(zeroRow!.total).toBe(0);

      // No row was added and no chain was rewritten: mixed still supersedes
      // adults, and the adults lane therefore has no current observation.
      const rows = await db.query<{ id: string; supersedes_id: string | null }>(
        `select id, supersedes_id from event_session_headcounts
            where event_instance_id = $1 order by as_of`,
        [eventId],
      );
      expect(rows).toHaveLength(3);
      expect(rows.find((row) => row.id === mixed)!.supersedes_id).toBe(adults);
      const supersededIds = new Set(rows.map((row) => row.supersedes_id));
      expect(
        rows
          .filter((row) => !supersededIds.has(row.id))
          .map((row) => row.id)
          .sort(),
      ).toEqual([children, mixed].sort());

      // The six fixed bucket columns are gone; the line table points at the
      // (mode, code) bucket pair, so a bucket from another mode is rejected.
      const bucketColumns = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
            where table_schema = 'public' and table_name = 'event_session_headcounts'
              and column_name in
                ('adult_male','adult_female','adult_unspecified','child_male','child_female','child_unspecified')`,
      );
      expect(bucketColumns).toEqual([]);
      await expect(
        db.query(
          `insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
             values ($1, 'adults', 'child-male', 1)`,
          [adults],
        ),
      ).rejects.toThrow();

      // Modes and buckets are data: mixed is retired, its four buckets stay
      // readable, and the two specialised lanes arrived with their buckets.
      const modes = await db.query<{ code: string; retired: boolean }>(
        'select code, retired from headcount_modes order by code',
      );
      expect(modes).toEqual([
        { code: 'adults', retired: false },
        { code: 'children', retired: false },
        { code: 'mixed', retired: true },
        { code: 'presbyters', retired: false },
        { code: 'visitors', retired: false },
      ]);
      const modeBuckets = await db.query<{ mode_code: string; code: string }>(
        `select mode_code, code from headcount_buckets
            where mode_code in ('mixed','visitors','presbyters')
            order by mode_code, sort_order`,
      );
      expect(modeBuckets).toEqual([
        { mode_code: 'mixed', code: 'adult-male' },
        { mode_code: 'mixed', code: 'adult-female' },
        { mode_code: 'mixed', code: 'child-male' },
        { mode_code: 'mixed', code: 'child-female' },
        { mode_code: 'presbyters', code: 'elder' },
        { mode_code: 'presbyters', code: 'deaconess' },
        { mode_code: 'presbyters', code: 'deacon' },
        { mode_code: 'visitors', code: 'visitor-male' },
        { mode_code: 'visitors', code: 'visitor-female' },
        { mode_code: 'visitors', code: 'visitor-children' },
      ]);
    } finally {
      await db.close();
    }
  }, 60_000);

  it('reads the newest of duplicate legacy tips and supersedes only that one on the next write', async () => {
    const db = await preLaneDb();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const eventId = await seededEvent(db, 'LEGACY-3', today);
      // The old write path did not supersede on a plain count, so one lane can
      // hold two current observations (HC-27). Both ordering keys are pinned:
      // a seed that leaned on `now()` would order by id whenever the suite ran
      // before the seeded time of day.
      const older = await insertLegacyHeadcount(db, eventId, {
        mode: 'adults',
        sessionDate: today,
        asOf: `${today}T08:00:00.000Z`,
        recordedAt: `${today}T08:00:00.000Z`,
        adultMale: 10,
      });
      const newer = await insertLegacyHeadcount(db, eventId, {
        mode: 'adults',
        sessionDate: today,
        asOf: `${today}T10:00:00.000Z`,
        recordedAt: `${today}T10:00:00.000Z`,
        adultMale: 20,
      });

      const migration = MIGRATIONS.find((entry) => entry.version === '0022_headcount_lanes');
      expect(migration).toBeTruthy();
      await db.exec(migration!.sql);
      // The parent model lands after the lane reshape; the repository reads it.
      // 0028 is excluded on purpose: it asserts that every event already has an
      // `event_audiences` row, and this synthetic legacy event predates that
      // writer obligation. The refusal itself is covered by
      // `event-audiences-migration.test.ts`.
      for (const later of MIGRATIONS) {
        if (later.version > '0022_headcount_lanes' && later.version < '0028_event_audiences') {
          await db.exec(later.sql);
        }
      }

      // The reshape tolerates the duplicate tips: no row added, none rewritten,
      // none deleted, and both stay non-superseded.
      const rows = await db.query<{ id: string; supersedes_id: string | null }>(
        `select h.id, h.supersedes_id
           from event_session_headcounts h
           join event_occurrences o on o.id = h.occurrence_id
          where o.event_id = $1
          order by h.as_of`,
        [eventId],
      );
      expect(rows).toEqual([
        { id: older, supersedes_id: null },
        { id: newer, supersedes_id: null },
      ]);
      expect(await lineRows(db, older)).toEqual([
        { bucket_code: 'adult-male', count: 10, label: 'Adult men' },
      ]);
      expect(await lineRows(db, newer)).toEqual([
        { bucket_code: 'adult-male', count: 20, label: 'Adult men' },
      ]);

      // "The" current takes the newest by asOf, then recordedAt, then id.
      const repository = new HeadcountRepository(db);
      const page = await repository.get(eventId, today);
      expect(page.current.adults?.id).toBe(newer);
      expect(page.current.adults?.asOf).toBe(`${today}T10:00:00.000Z`);
      expect(page.observations.map((row) => row.id)).toEqual([newer, older]);

      // A later write supersedes the newest tip and leaves the older one as the
      // history it is. Its own `asOf` is pinned later than both tips, so the new
      // row is the newest whatever the wall clock says.
      const written = await repository.record(
        eventId,
        {
          sessionDate: today,
          mode: 'adults',
          asOf: `${today}T11:00:00.000Z`,
          lines: [{ code: 'adult-male', count: 30 }],
        },
        'headcount-writer',
      );
      expect(written.supersedesId).toBe(newer);
      const after = await repository.get(eventId, today);
      expect(after.current.adults?.id).toBe(written.id);
      expect(after.observations.find((row) => row.id === older)?.supersededBy).toBeNull();
    } finally {
      await db.close();
    }
  }, 60_000);
});
