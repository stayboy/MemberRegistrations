import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { AudienceRepository } from '../../src/repos/audiences.js';
import { EventRepository } from '../../src/repos/events.js';
import { SeriesRepository } from '../../src/repos/series.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

/**
 * The parent read and the audience read on the pooled `pg` driver. Set
 * `TEST_DATABASE_URL` to a scratch server that allows creating databases; the
 * block migrates its own database and drops it afterwards. Skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('parent read on the pooled pg driver', () => {
  let pooled: Db;

  beforeAll(async () => {
    pooled = await createScratchPgDb(testDatabaseUrl!);
    await migrate(pooled);
  });

  afterAll(async () => {
    await pooled.close();
  });

  it('reads the parent detail and the audience reference data', async () => {
    const series = await new SeriesRepository(pooled).create(
      {
        name: 'Pooled Parent Service',
        timezone: 'UTC',
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
      },
      'seed',
    );

    const seeded = await seedEvent(pooled, {
      eventId: series.id,
      eventNo: 'PG-PARENT-1',
      name: 'Pooled Parent Service',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      startTime: '09:00',
      sessions: [{ date: '2026-11-01', startTime: '09:00', endTime: '11:00' }],
    });

    const parent = await new EventRepository(pooled).getParent(
      series.id,
      '2026-10-01',
      '2026-12-31',
    );
    expect(parent).toMatchObject({
      id: series.id,
      eventNo: 'PG-PARENT-1',
      name: 'Pooled Parent Service',
      status: 'active',
      venueType: 'auditorium',
    });
    expect(parent!.recurrence!.schedules[0]!.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
    expect(parent!.occurrences.map((row) => row.id)).toEqual([seeded.occurrenceIds['2026-11-01']]);

    const audiences = await new AudienceRepository(pooled).list();
    const everyone = audiences.find((audience) => audience.systemKey === 'everyone');
    expect(everyone).toMatchObject({ name: 'Everyone', system: true, active: true });
    expect(everyone!.summary).toContain('membership status active');
  });
});
