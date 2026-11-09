import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { sqlState } from '../../src/errors/sqlstate.js';

let db: Db;
let eventId: string;
let offeringId: string;
let firstCountId: string;

async function errorCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return sqlState(error);
  }
}

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);

  const [event] = await db.query<{ id: string }>(
    `insert into event_instances (event_no, name, timezone, start_date, end_date, status, source, sessions)
     values ('CONSTRAINT-1', 'Constraint service', 'UTC', '2026-11-01', '2026-11-01', 'scheduled', 'manual',
             jsonb_build_array(jsonb_build_object('date', '2026-11-01', 'startTime', '09:00')))
     returning id`,
  );
  eventId = event!.id;
  const [offering] = await db.query<{ id: string }>(
    'insert into offerings default values returning id',
  );
  offeringId = offering!.id;

  const [count] = await db.query<{ id: string }>(
    `insert into event_session_offering_counts
       (event_instance_id, offering_id, session_date, currency, terms_version, as_of, recorded_by)
     values ($1, $2, '2026-11-01', 'GHS', 1, '2026-11-01T09:00:00.000Z', 'seed')
     returning id`,
    [eventId, offeringId],
  );
  firstCountId = count!.id;
});

afterAll(async () => {
  await db.close();
});

describe('event_session_offering_counts constraints', () => {
  it('accepts one line per denomination and rejects a repeated one', async () => {
    await db.query(
      `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
       values ($1, 2000, 3)`,
      [firstCountId],
    );

    const repeated = await errorCode(() =>
      db.query(
        `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
         values ($1, 2000, 4)`,
        [firstCountId],
      ),
    );
    expect(repeated).toBe('23505');
  });

  it('rejects a non-positive denomination or piece count', async () => {
    expect(
      await errorCode(() =>
        db.query(
          `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
           values ($1, 0, 1)`,
          [firstCountId],
        ),
      ),
    ).toBe('23514');
    expect(
      await errorCode(() =>
        db.query(
          `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
           values ($1, 100, 0)`,
          [firstCountId],
        ),
      ),
    ).toBe('23514');
  });

  it('keeps supersedes_id unique when present and allows repeated nulls', async () => {
    const [second] = await db.query<{ id: string }>(
      `insert into event_session_offering_counts
         (event_instance_id, offering_id, session_date, currency, terms_version, as_of, recorded_by, supersedes_id)
       values ($1, $2, '2026-11-01', 'GHS', 1, '2026-11-01T09:05:00.000Z', 'seed', $3)
       returning id`,
      [eventId, offeringId, firstCountId],
    );
    expect(second!.id).toBeTruthy();

    expect(
      await errorCode(() =>
        db.query(
          `insert into event_session_offering_counts
             (event_instance_id, offering_id, session_date, currency, terms_version, as_of, recorded_by, supersedes_id)
           values ($1, $2, '2026-11-01', 'GHS', 1, '2026-11-01T09:10:00.000Z', 'seed', $3)`,
          [eventId, offeringId, firstCountId],
        ),
      ),
    ).toBe('23505');
  });

  it('cascades a count delete to its lines', async () => {
    const [count] = await db.query<{ id: string }>(
      `insert into event_session_offering_counts
         (event_instance_id, offering_id, session_date, currency, terms_version, as_of, recorded_by)
       values ($1, $2, '2026-11-01', 'GHS', 1, '2026-11-01T10:00:00.000Z', 'seed')
       returning id`,
      [eventId, offeringId],
    );
    await db.query(
      `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
       values ($1, 500, 2)`,
      [count!.id],
    );
    await db.query('delete from event_session_offering_counts where id = $1', [count!.id]);
    const lines = await db.query(
      'select 1 from event_session_offering_count_lines where count_id = $1',
      [count!.id],
    );
    expect(lines).toHaveLength(0);
  });
});
