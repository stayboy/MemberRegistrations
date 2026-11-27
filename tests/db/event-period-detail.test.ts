import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';
import { EVENT_PERIODS } from '../../src/domain/periods.js';
import { EventRepository } from '../../src/repos/events.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

/**
 * The **single event read's** period (member-registrations-event-periods.md,
 * "The detail read carries it, and only the detail"; owner, 2026-11-27): the
 * `definition` is the snapshot the create wrote beside the name, and `dates` is
 * the event's shape measured from its own stored occurrences - no second column,
 * no live catalogue lookup. The list row (and the write's answer) keeps the
 * provenance alone.
 *
 * It runs on both drivers: PGlite always, the pooled `pg` server only when
 * `TEST_DATABASE_URL` names a scratch server that allows creating databases.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/** A window wide enough for any cycle the one-off create resolves to. */
const WINDOW = { from: '2026-11-01', to: '2027-03-31' };

function registerPeriodDetailSuite(label: string, connect: () => Promise<Db>, skip = false): void {
  describe.skipIf(skip)(`period detail on ${label}`, () => {
    let db: Db;

    beforeAll(async () => {
      db = await connect();
      await migrate(db);
    });

    afterAll(async () => {
      await db.close();
    });

    /** A one-off period event: the server resolves one cycle to ordinary rows. */
    async function oneOff(id: (typeof EVENT_PERIODS)[number]['id'], name: string) {
      return new EventRepository(db).createParent(
        {
          name,
          timezone: 'UTC',
          venueType: 'auditorium',
          startTime: '09:00',
          tracksMembers: true,
          period: { id, cycleMonth: '2027-01' },
        },
        'seed',
      );
    }

    it('agrees with the catalogue’s shape for every seeded period resolved once', async () => {
      const events = new EventRepository(db);

      for (const seeded of EVENT_PERIODS) {
        const created = await oneOff(seeded.id, `Detail ${seeded.id}`);
        const detail = await events.getParentDetail(created.id, WINDOW.from, WINDOW.to);

        // A one-off week holds its seven dates, a one-off single date holds one,
        // so the derivation and the catalogue's `dates` agree on the shape.
        expect(detail?.period).toMatchObject({ id: seeded.id, dates: seeded.dates });
        // The definition is the snapshot the create wrote - the catalogue prose
        // of that moment.
        expect(detail?.period?.definition).toBe(seeded.definition);
      }
    });

    it('reports `week` for a monthly whole-week period from its own dates', async () => {
      const events = new EventRepository(db);
      const created = await events.createParent(
        {
          name: 'Detail Monthly Communion',
          timezone: 'UTC',
          venueType: 'auditorium',
          startTime: '09:00',
          tracksMembers: true,
          period: { id: 'communion-week', frequency: 'monthly', effectiveFrom: '2027-01-01' },
        },
        'seed',
      );

      const detail = await events.getParentDetail(created.id, WINDOW.from, WINDOW.to);
      expect(detail?.period).toMatchObject({ id: 'communion-week', dates: 'week' });
    });

    it('reports `date` for a monthly single-date period a month apart', async () => {
      const events = new EventRepository(db);
      const created = await events.createParent(
        {
          name: 'Detail Monthly Home Cells',
          timezone: 'UTC',
          venueType: 'auditorium',
          startTime: '09:00',
          tracksMembers: true,
          period: { id: 'home-cells', frequency: 'monthly', effectiveFrom: '2027-01-01' },
        },
        'seed',
      );

      const detail = await events.getParentDetail(created.id, WINDOW.from, WINDOW.to);
      expect(detail?.period).toMatchObject({ id: 'home-cells', dates: 'date' });
    });

    it('reads the definition snapshot, never today’s catalogue', async () => {
      const events = new EventRepository(db);
      const created = await oneOff('communion-week', 'Detail Snapshot');

      // The catalogue cannot be reached through the column, so changing the row
      // is enough to prove the read does not look anything up.
      await db.query('update events set period_definition = $2 where id = $1', [
        created.id,
        'The parish’s own words, as written at save.',
      ]);

      const detail = await events.getParentDetail(created.id, WINDOW.from, WINDOW.to);
      expect(detail?.period?.definition).toBe('The parish’s own words, as written at save.');
    });

    it('reports a null shape when the event holds no occurrence at all', async () => {
      const events = new EventRepository(db);
      const created = await oneOff('communion-week', 'Detail Without Rows');

      // A period create always resolves at least one date, so the only way to hold
      // none is for the rows to be gone; the shape then comes from nothing.
      await db.query('delete from event_occurrences where event_id = $1', [created.id]);

      const detail = await events.getParentDetail(created.id, WINDOW.from, WINDOW.to);
      expect(detail?.period).toMatchObject({ id: 'communion-week', dates: null });
    });

    it('keeps the list row to the provenance alone', async () => {
      const events = new EventRepository(db);
      const created = await oneOff('gospel-week', 'Detail List Gospel');

      const listed = await events.getParent(created.id, WINDOW.from, WINDOW.to);
      expect(listed?.period).toMatchObject({ id: 'gospel-week', name: 'Gospel Week' });
      expect(listed?.period).not.toHaveProperty('dates');
      expect(listed?.period).not.toHaveProperty('definition');
    });

    it('carries a null period for an event not created from one', async () => {
      const events = new EventRepository(db);
      const created = await events.createParent(
        {
          name: 'Detail Standalone',
          timezone: 'UTC',
          venueType: 'auditorium',
          startTime: '09:00',
          tracksMembers: true,
          occurrences: [{ date: '2027-02-14' }],
        },
        'seed',
      );

      const detail = await events.getParentDetail(created.id, WINDOW.from, WINDOW.to);
      expect(detail?.period).toBeNull();
    });
  });
}

registerPeriodDetailSuite('PGlite', () => createPgliteDb());
registerPeriodDetailSuite('pooled pg', () => createScratchPgDb(testDatabaseUrl!), !testDatabaseUrl);
