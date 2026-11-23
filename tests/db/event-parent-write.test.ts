import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../src/errors/domain-errors.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { AudienceRepository } from '../../src/repos/audiences.js';
import { EventRepository } from '../../src/repos/events.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

const rule = {
  operator: 'allOf' as const,
  clauses: [{ attribute: 'ageBand' as const, minYears: 18, maxYears: 30 }],
};

describe('event-parent writes on PGlite', () => {
  let db: Db;
  let events: EventRepository;
  let audiences: AudienceRepository;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    events = new EventRepository(db);
    audiences = new AudienceRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates a standalone parent, its occurrences and the legacy projection', async () => {
    const [choir] = await db.query<{ id: string }>(
      `select id from audiences where system_key = 'ministry:CHOIR'`,
    );

    const parent = await events.createParent(
      {
        name: 'Repo Standalone',
        audienceId: choir!.id,
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        endTime: '10:30',
        tracksMembers: true,
        occurrences: [{ date: '2026-11-27' }, { date: '2026-11-28', startTime: '18:00' }],
      },
      'seed',
    );

    expect(parent).toMatchObject({
      name: 'Repo Standalone',
      status: 'draft',
      ministry: { code: 'CHOIR' },
      presbyterOnly: false,
      startDate: '2026-11-27',
      endDate: '2026-11-28',
      recurrence: null,
    });
    expect(parent.eventNo).toMatch(/^EVT-\d{4}-\d{3}$/);
    expect(parent.occurrences.map((occurrence) => occurrence.date)).toEqual([
      '2026-11-27',
      '2026-11-28',
    ]);

    const [row] = await db.query<{ ministry_id: string | null; presbyter_only: boolean }>(
      'select ministry_id, presbyter_only from events where id = $1',
      [parent.id],
    );
    expect(row!.ministry_id).not.toBeNull();
    expect(row!.presbyter_only).toBe(false);
  });

  it('creates a recurring parent and generates the seeded window with its exceptions', async () => {
    const parent = await events.createParent(
      {
        eventNo: 'REPO-RECURRING',
        name: 'Repo Recurring',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '19:00',
        tracksMembers: true,
        recurrence: {
          schedules: [
            { effectiveFrom: '2027-01-03', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: '2027-01-31' },
          ],
          exceptions: [{ date: '2027-01-17', kind: 'cancelled', note: 'Away' }],
        },
      },
      'seed',
    );

    expect(parent.recurrence).toEqual({
      schedules: [
        { effectiveFrom: '2027-01-03', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: '2027-01-31' },
      ],
      exceptions: [{ date: '2027-01-17', kind: 'cancelled', note: 'Away' }],
    });
    expect(parent.occurrences.map((occurrence) => occurrence.date)).toEqual([
      '2027-01-03',
      '2027-01-10',
      '2027-01-24',
      '2027-01-31',
    ]);
  });

  it('moves status forward, refuses PATCH archiving, a stale ETag and archives once', async () => {
    const parent = await events.createParent(
      {
        eventNo: 'REPO-STATUS',
        name: 'Repo Status',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        tracksMembers: true,
        occurrences: [{ date: '2026-11-27' }],
      },
      'seed',
    );

    const draftEtag = (await events.parentEtag(parent.id))!;
    await expect(
      events.updateParent(parent.id, { status: 'archived' }, draftEtag),
    ).rejects.toMatchObject({ code: 'status' });

    const active = await events.updateParent(parent.id, { status: 'active' }, draftEtag);
    expect(active.status).toBe('active');

    const activeEtag = (await events.parentEtag(parent.id))!;
    await expect(
      events.updateParent(parent.id, { status: 'archived' }, activeEtag),
    ).rejects.toMatchObject({ code: 'status' });

    await expect(
      events.updateParent(parent.id, { name: 'Stale' }, draftEtag),
    ).rejects.toBeInstanceOf(ConflictError);

    const archived = await events.archiveParent(parent.id);
    expect(archived.status).toBe('archived');
    await expect(events.archiveParent(parent.id)).rejects.toBeInstanceOf(ConflictError);

    const read = await events.getParent(parent.id, '2026-11-01', '2026-12-31');
    expect(read!.occurrences).toHaveLength(1);
  });

  it('cancels one occurrence with its reason, then refuses a repeat and an unknown date', async () => {
    const parent = await events.createParent(
      {
        eventNo: 'REPO-CANCEL',
        name: 'Repo Cancel',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        tracksMembers: true,
        occurrences: [{ date: '2026-11-27' }],
      },
      'seed',
    );

    await expect(
      events.cancelOccurrence(parent.id, '2026-11-27', 'Too early', 'seed'),
    ).rejects.toMatchObject({ code: 'event_draft' });

    const etag = (await events.parentEtag(parent.id))!;
    await events.updateParent(parent.id, { status: 'active' }, etag);

    const cancelled = await events.cancelOccurrence(
      parent.id,
      '2026-11-27',
      'Public holiday',
      'seed',
    );
    expect(cancelled).toMatchObject({ status: 'cancelled', note: 'Public holiday' });

    await expect(
      events.cancelOccurrence(parent.id, '2026-11-27', 'Again', 'seed'),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      events.cancelOccurrence(parent.id, '2026-12-24', 'Unknown', 'seed'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses recurrence writes on a manually dated parent', async () => {
    const parent = await events.createParent(
      {
        eventNo: 'REPO-REC-STANDALONE',
        name: 'Repo Standalone Recurrence',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        tracksMembers: true,
        occurrences: [{ date: '2026-11-27' }],
      },
      'seed',
    );

    await expect(
      events.addRecurrenceVersion(
        parent.id,
        { effectiveFrom: '2027-02-07', rrule: 'FREQ=WEEKLY;BYDAY=SU' },
        'seed',
      ),
    ).rejects.toMatchObject({ code: 'recurrence' });

    await expect(
      events.setRecurrenceException(
        parent.id,
        { date: '2026-11-27', kind: 'cancelled', note: 'Nope' },
        'seed',
      ),
    ).rejects.toMatchObject({ code: 'recurrence' });

    const [row] = await db.query<{ count: number | string }>(
      `select count(*)::int as count from event_recurrence_versions where event_id = $1`,
      [parent.id],
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('appends recurrence versions and upserts/removes exceptions', async () => {
    const parent = await events.createParent(
      {
        eventNo: 'REPO-REC-WRITE',
        name: 'Repo Recurrence Write',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        tracksMembers: true,
        recurrence: {
          schedules: [{ effectiveFrom: '2027-01-03', rrule: 'FREQ=WEEKLY;BYDAY=SU' }],
          exceptions: [],
        },
      },
      'seed',
    );

    const appended = await events.addRecurrenceVersion(
      parent.id,
      { effectiveFrom: '2027-02-07', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU' },
      'seed',
    );
    expect(appended.schedules).toHaveLength(2);

    const withException = await events.setRecurrenceException(
      parent.id,
      { date: '2027-01-17', kind: 'cancelled', note: 'Away' },
      'seed',
    );
    expect(withException.exceptions).toContainEqual({
      date: '2027-01-17',
      kind: 'cancelled',
      note: 'Away',
    });

    const replaced = await events.setRecurrenceException(
      parent.id,
      { date: '2027-01-17', kind: 'extra', note: 'Now extra' },
      'seed',
    );
    expect(replaced.exceptions.filter((exception) => exception.date === '2027-01-17')).toHaveLength(
      1,
    );
    expect(replaced.exceptions[0]).toMatchObject({ kind: 'extra', note: 'Now extra' });

    const removed = await events.removeRecurrenceException(parent.id, '2027-01-17');
    expect(removed.exceptions).toHaveLength(0);
  });

  it('creates and edits a custom audience while refusing a system row', async () => {
    const created = await audiences.create({ name: 'Repo Audience', rule }, 'seed');
    expect(created).toMatchObject({ name: 'Repo Audience', system: false, active: true });

    await expect(audiences.create({ name: 'repo audience', rule }, 'seed')).rejects.toMatchObject({
      code: 'audience_name_in_use',
    });

    const edited = await audiences.update(created.id, { active: false }, 'seed');
    expect(edited.active).toBe(false);

    const [everyone] = await db.query<{ id: string }>(
      `select id from audiences where system_key = 'everyone'`,
    );
    await expect(audiences.update(everyone!.id, { name: 'Nope' }, 'seed')).rejects.toMatchObject({
      code: 'audience_system',
    });
  });
});

/**
 * The same write path on the pooled `pg` driver. Set `TEST_DATABASE_URL` to a
 * scratch server that allows creating databases; the block migrates its own
 * database and drops it afterwards. Skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('event-parent writes on the pooled pg driver', () => {
  let pooled: Db;

  beforeAll(async () => {
    pooled = await createScratchPgDb(testDatabaseUrl!);
    await migrate(pooled);
  });

  afterAll(async () => {
    await pooled.close();
  });

  it('creates a parent and a custom audience through the same repository path', async () => {
    const events = new EventRepository(pooled);
    const parent = await events.createParent(
      {
        eventNo: 'PG-WRITE-1',
        name: 'Pooled Parent Write',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        tracksMembers: true,
        occurrences: [{ date: '2026-11-27' }],
      },
      'seed',
    );
    expect(parent).toMatchObject({ eventNo: 'PG-WRITE-1', status: 'draft' });
    expect(parent.occurrences).toHaveLength(1);

    const audiences = new AudienceRepository(pooled);
    const created = await audiences.create({ name: 'Pooled Audience', rule }, 'seed');
    const edited = await audiences.update(created.id, { name: 'Pooled Audience 2' }, 'seed');
    expect(edited.name).toBe('Pooled Audience 2');
  });
});
