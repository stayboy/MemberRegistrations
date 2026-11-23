import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import { MIGRATIONS } from '../../src/db/migrations.js';
import type { Db } from '../../src/db/sql.js';

const PARENT_VERSION = '0026_event_parent';

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

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Run one migration in a transaction so a failed assert rolls every change back. */
async function applyAtomically(db: Db, version: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec(migrationSql(version));
  });
}

interface Fixture {
  seriesId: string;
  seriesInstanceId: string;
  standaloneInstanceId: string;
  draftInstanceId: string;
  archivedSeriesId: string;
  archivedSeriesInstanceId: string;
  member1: string;
  member2: string;
  offeringId: string;
  headcountRootId: string;
  headcountCorrectionId: string;
  offeringCountRootId: string;
  offeringCountCorrectionId: string;
  codeId: string;
  registrationId: string;
  importBatchId: string;
  contributionSeriesId: string;
  contributionStandaloneId: string;
  pledgeIds: string[];
  counts: Record<string, number>;
}

async function seedLegacy(db: Db): Promise<Fixture> {
  const [series] = await db.query<{ id: string }>(
    `insert into event_series (name, ministry_id, timezone, created_by, updated_by)
     select 'Sunday Service', id, 'UTC', 'seed', 'seed' from ministries where code = 'CHOIR'
     returning id`,
  );
  const seriesId = series!.id;
  await db.query(
    `insert into series_schedules (series_id, effective_from, rrule, ends_on, created_by)
     values ($1,'2025-01-05','FREQ=WEEKLY;BYDAY=SU','2026-02-01','seed')`,
    [seriesId],
  );
  await db.query(
    `insert into series_exceptions (series_id, occurs_on, kind, note, created_by)
     values ($1,'2026-01-11','cancelled','Snow','seed')`,
    [seriesId],
  );

  const [seriesInstance] = await db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, status, source, sessions, tracks_members, presbyter_only
     ) values ('EVT-2026-101',$1,'Sunday Service','UTC','2026-01-04','2026-01-04',
               '08:15','09:45','virtual','held','series',
               '[{"date":"2026-01-04","startTime":"08:15","endTime":"09:45","status":"held"}]'::jsonb,
               true, false)
     returning id`,
    [seriesId],
  );
  const [cancelledSeriesInstance] = await db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, status, source, sessions, tracks_members, presbyter_only
     ) values ('EVT-2025-100',$1,'Sunday Service','UTC','2025-12-28','2025-12-28',
               '07:00','08:00','hybrid','cancelled','series',
               '[{"date":"2025-12-28","startTime":"07:00","endTime":"08:00","status":"cancelled","note":"Cancelled earlier"}]'::jsonb,
               true, false)
     returning id`,
    [seriesId],
  );
  void cancelledSeriesInstance;
  const [standalone] = await db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, status, source, sessions, tracks_members, presbyter_only
     ) values ('STD-2026-1',null,'Standalone Conference','UTC','2026-02-01','2026-02-02',
               '17:00','20:00','auditorium','scheduled','manual',
               '[{"date":"2026-02-01","startTime":"17:00","endTime":"20:00","status":"scheduled"},
                 {"date":"2026-02-02","startTime":"17:00","endTime":"18:00","status":"cancelled","note":"Power cut"}]'::jsonb,
               true, true)
     returning id`,
  );
  const [draft] = await db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, status, source, sessions, tracks_members, presbyter_only
     ) values ('DRAFT-2026-1',null,'Draft Conference','UTC','2026-03-01','2026-03-01',
               '09:00','10:00','auditorium','draft','manual',
               '[{"date":"2026-03-01","startTime":"09:00","endTime":"10:00","status":"held"}]'::jsonb,
               true, false)
     returning id`,
  );

  const [archivedSeries] = await db.query<{ id: string }>(
    `insert into event_series (name, ministry_id, timezone, archived_at, created_by, updated_by)
     select 'Archived Service', id, 'UTC', now(), 'seed', 'seed'
       from ministries where code = 'CHOIR'
     returning id`,
  );
  await db.query(
    `insert into series_schedules (series_id, effective_from, rrule, ends_on, created_by)
     values ($1,'2026-04-05','FREQ=WEEKLY;BYDAY=SU','2026-04-05','seed')`,
    [archivedSeries!.id],
  );
  const [archivedInstance] = await db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, venue_type, status, source,
       sessions, tracks_members, presbyter_only
     ) values ('EVT-2026-401',$1,'Archived Service','UTC','2026-04-05','2026-04-05',
               'auditorium','scheduled','series',
               '[{"date":"2026-04-05","status":"scheduled"}]'::jsonb,true,false)
     returning id`,
    [archivedSeries!.id],
  );

  const [m1] = await db.query<{ id: string }>(
    `insert into members (member_no, first_name, last_name, created_by, updated_by)
     values ('MIG-1','Ada','Bello','seed','seed') returning id`,
  );
  const [m2] = await db.query<{ id: string }>(
    `insert into members (member_no, first_name, last_name, created_by, updated_by)
     values ('MIG-2','Bisi','Okafor','seed','seed') returning id`,
  );

  const [offering] = await db.query<{ id: string }>(
    'insert into offerings default values returning id',
  );
  await db.query(
    `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
     values ($1,1,'Sunday Offering','Seed','freewill','GHS','seed')`,
    [offering!.id],
  );
  await db.query(
    `insert into event_instance_offerings
       (event_instance_id, series_id, offering_id, attached_by)
     values ($1,null,$2,'series-instance'), ($3,null,$2,'standalone-instance'),
            (null,$4,$2,'series-level')`,
    [seriesInstance!.id, offering!.id, standalone!.id, seriesId],
  );

  const [batch] = await db.query<{ id: string }>(
    `insert into import_batches
       (kind, actor, row_count, checksum, event_instance_id, session_date, as_of, ended)
     values ('attendance','seed',1,'checksum-legacy',$1,'2026-01-04','2026-01-04T12:00:00Z',false)
     returning id`,
    [seriesInstance!.id],
  );

  await db.query(
    `insert into attendance (member_id, event_instance_id, session_date, source, import_batch_id, created_by)
     values ($1,$2,'2026-01-04','manual',null,'seed'),
            ($3,$2,'2026-01-04','import',$4,'seed'),
            ($1,$5,'2026-02-01','manual',null,'seed')`,
    [m1!.id, seriesInstance!.id, m2!.id, batch!.id, standalone!.id],
  );
  await db.query(
    `insert into attendance_suppressions (member_id, event_instance_id, session_date, suppressed_by)
     values ($1,$2,'2026-01-04','seed')`,
    [m2!.id, seriesInstance!.id],
  );

  const [headcountRoot] = await db.query<{ id: string }>(
    `insert into event_session_headcounts (
       event_instance_id, session_date, as_of, mode, total, ended, recorded_by
     ) values ($1,'2026-01-04','2026-01-04T09:00:00Z','adults',50,false,'seed')
     returning id`,
    [seriesInstance!.id],
  );
  const [headcountCorrection] = await db.query<{ id: string }>(
    `insert into event_session_headcounts (
       event_instance_id, session_date, as_of, mode, total, ended, recorded_by, supersedes_id
     ) values ($1,'2026-01-04','2026-01-04T09:05:00Z','adults',52,false,'seed',$2)
     returning id`,
    [seriesInstance!.id, headcountRoot!.id],
  );
  await db.query(
    `insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
     values ($1,'adults','adult-male',20), ($1,'adults','adult-female',30),
            ($2,'adults','adult-male',22), ($2,'adults','adult-female',30)`,
    [headcountRoot!.id, headcountCorrection!.id],
  );

  const [countRoot] = await db.query<{ id: string }>(
    `insert into event_session_offering_counts (
       event_instance_id, offering_id, session_date, currency, terms_version, as_of, recorded_by
     ) values ($1,$2,'2026-01-04','GHS',1,'2026-01-04T12:00:00Z','seed')
     returning id`,
    [seriesInstance!.id, offering!.id],
  );
  const [countCorrection] = await db.query<{ id: string }>(
    `insert into event_session_offering_counts (
       event_instance_id, offering_id, session_date, currency, terms_version, as_of,
       recorded_by, supersedes_id
     ) values ($1,$2,'2026-01-04','GHS',1,'2026-01-04T12:05:00Z','seed',$3)
     returning id`,
    [seriesInstance!.id, offering!.id, countRoot!.id],
  );
  await db.query(
    `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
     values ($1,1000,3), ($2,1000,4), ($2,500,2)`,
    [countRoot!.id, countCorrection!.id],
  );

  const [code] = await db.query<{ id: string }>(
    `insert into attendance_codes (
       code_hash, purpose, event_instance_id, session_date, issued_by, expires_at
     ) values ('code-hash-legacy','registration',$1,'2026-01-04','seed', now() + interval '1 day')
     returning id`,
    [seriesInstance!.id],
  );
  const [registration] = await db.query<{ id: string }>(
    `insert into registration_requests (
       reference, first_name, last_name, phone_hash, event_instance_id, session_date, code_id
     ) values ('REG-LEGACY1','Yaa','Asante','phone-hash',$1,'2026-01-04',$2)
     returning id`,
    [seriesInstance!.id, code!.id],
  );

  await db.query(
    `insert into clocking_delegations (
       event_instance_id, session_date, from_member_id, to_member_id, reason, created_by
     ) values ($1,'2026-01-04',$2,$3,'Away','seed')`,
    [seriesInstance!.id, m1!.id, m2!.id],
  );

  const [contributionSeries] = await db.query<{ id: string }>(
    `insert into contributions (
       member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
       channel, status, reference, idempotency_key, terms_version, created_by
     ) values ($1,$2,$3,'2026-01-04',5000,'GHS','manual','paid','MIG-REF-1','mig-key-1',1,'seed')
     returning id`,
    [m1!.id, offering!.id, seriesInstance!.id],
  );
  const [contributionStandalone] = await db.query<{ id: string }>(
    `insert into contributions (
       member_id, visitor_name, visitor_phone_hash, offering_id, event_instance_id, session_date,
       amount_minor, currency, channel, status, reference, idempotency_key, terms_version, created_by
     ) values (null,'Visitor','visitor-hash',$1,$2,'2026-02-01',7000,'GHS','manual','paid',
               'MIG-REF-2','mig-key-2',1,'seed')
     returning id`,
    [offering!.id, standalone!.id],
  );

  const pledgeIds: string[] = [];
  for (const [instanceId, date, key] of [
    [seriesInstance!.id, '2026-01-04', 'mig-pledge-1'],
    [standalone!.id, '2026-02-01', 'mig-pledge-2'],
  ] as const) {
    const [pledge] = await db.query<{ id: string }>(
      `insert into pledges (
         member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
         expected_on, officer_member_id, status, terms_version, idempotency_key, created_by
       ) values ($1,$2,$3,$4,3000,'GHS','2026-12-01',$5,'pending',1,$6,'seed')
       returning id`,
      [m1!.id, offering!.id, instanceId, date, m2!.id, key],
    );
    pledgeIds.push(pledge!.id);
  }

  const counts: Record<string, number> = {};
  for (const table of [
    'attendance',
    'attendance_suppressions',
    'event_session_headcounts',
    'event_session_offering_counts',
    'registration_requests',
    'attendance_codes',
    'clocking_delegations',
    'import_batches',
    'contributions',
    'pledges',
  ]) {
    const [row] = await db.query<{ count: number | string }>(
      `select count(*)::int as count from ${table}`,
    );
    counts[table] = Number(row!.count);
  }

  return {
    seriesId,
    seriesInstanceId: seriesInstance!.id,
    standaloneInstanceId: standalone!.id,
    draftInstanceId: draft!.id,
    archivedSeriesId: archivedSeries!.id,
    archivedSeriesInstanceId: archivedInstance!.id,
    member1: m1!.id,
    member2: m2!.id,
    offeringId: offering!.id,
    headcountRootId: headcountRoot!.id,
    headcountCorrectionId: headcountCorrection!.id,
    offeringCountRootId: countRoot!.id,
    offeringCountCorrectionId: countCorrection!.id,
    codeId: code!.id,
    registrationId: registration!.id,
    importBatchId: batch!.id,
    contributionSeriesId: contributionSeries!.id,
    contributionStandaloneId: contributionStandalone!.id,
    pledgeIds,
    counts,
  };
}

async function tableCounts(db: Db, tables: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [row] = await db.query<{ count: number | string }>(
      `select count(*)::int as count from ${table}`,
    );
    counts[table] = Number(row!.count);
  }
  return counts;
}

describe('0026 event-parent migration', () => {
  let db: Db;
  let fixture: Fixture;

  beforeAll(async () => {
    db = await createPgliteDb();
    await applyThrough(db, PARENT_VERSION);
    fixture = await seedLegacy(db);
    await applyAtomically(db, PARENT_VERSION);
    // 0027 needs the parented events; apply it so the final schema is reachable.
    await applyAtomically(db, '0027_event_audience_membership');
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates one parent per series or standalone event and one occurrence per date', async () => {
    const parents = await db.query<{ id: string; event_no: string | null }>(
      `select id, event_no from events where id in ($1,$2) order by id`,
      [fixture.seriesId, fixture.standaloneInstanceId],
    );
    expect(parents).toHaveLength(2);
    const seriesParent = parents.find((row) => row.id === fixture.seriesId)!;
    const standaloneParent = parents.find((row) => row.id === fixture.standaloneInstanceId)!;
    expect(seriesParent.event_no).toMatch(/^EVT-2025-\d{3}$/);
    expect(standaloneParent.event_no).toBe('STD-2026-1');

    const [seriesValues] = await db.query<{
      venue_type: string;
      start_time: string | null;
      end_time: string | null;
    }>('select venue_type, start_time, end_time from events where id = $1', [fixture.seriesId]);
    expect(seriesValues).toEqual({
      venue_type: 'virtual',
      start_time: '08:15',
      end_time: '09:45',
    });

    const seriesOccurrences = await db.query<{
      date: Date | string;
      legacy_event_no: string | null;
      venue_type: string | null;
      start_time: string | null;
      end_time: string | null;
    }>(
      `select date, legacy_event_no, venue_type, start_time, end_time
         from event_occurrences where event_id = $1 order by date`,
      [fixture.seriesId],
    );
    expect(seriesOccurrences).toHaveLength(2);
    expect(seriesOccurrences.map((row) => iso(row.date))).toEqual(['2025-12-28', '2026-01-04']);
    expect(seriesOccurrences[0]!.legacy_event_no).toBe('EVT-2025-100');
    expect(seriesOccurrences[0]!.venue_type).toBe('hybrid');
    expect(seriesOccurrences[0]!.start_time).toBe('07:00');
    expect(seriesOccurrences[1]!.legacy_event_no).toBe('EVT-2026-101');
    expect(seriesOccurrences[1]!.venue_type).toBe('virtual');
    expect(seriesOccurrences[1]!.start_time).toBe('08:15');
    expect(seriesOccurrences[1]!.end_time).toBe('09:45');

    const standaloneOccurrences = await db.query<{ date: Date | string }>(
      'select date from event_occurrences where event_id = $1 order by date',
      [fixture.standaloneInstanceId],
    );
    expect(standaloneOccurrences.map((row) => iso(row.date))).toEqual(['2026-02-01', '2026-02-02']);
  });

  it('preserves draft and archived parent status and schedules a draft occurrence', async () => {
    const parents = await db.query<{ id: string; status: string }>(
      `select id, status from events where id = any($1::uuid[]) order by id`,
      [[fixture.draftInstanceId, fixture.archivedSeriesId]],
    );
    expect(parents.find((row) => row.id === fixture.draftInstanceId)!.status).toBe('draft');
    expect(parents.find((row) => row.id === fixture.archivedSeriesId)!.status).toBe('archived');

    const draftOccurrence = await db.query<{ date: Date | string; status: string }>(
      'select date, status from event_occurrences where event_id = $1',
      [fixture.draftInstanceId],
    );
    expect(draftOccurrence).toHaveLength(1);
    expect(iso(draftOccurrence[0]!.date)).toBe('2026-03-01');
    // The copied session status was `held`; a draft parent's occurrence reads scheduled.
    expect(draftOccurrence[0]!.status).toBe('scheduled');

    const archivedOccurrence = await db.query<{ status: string }>(
      'select status from event_occurrences where event_id = $1',
      [fixture.archivedSeriesId],
    );
    expect(archivedOccurrence).toEqual([{ status: 'scheduled' }]);
  });

  it('maps the three legacy attachment kinds onto event_offerings', async () => {
    const rows = await db.query<{
      attached_by: string;
      event_id: string;
      occurrence_id: string | null;
    }>(
      `select attached_by, event_id, occurrence_id
         from event_offerings order by attached_by`,
    );
    const byKind = new Map(rows.map((row) => [row.attached_by, row]));

    const seriesLevel = byKind.get('series-level')!;
    expect(seriesLevel.event_id).toBe(fixture.seriesId);
    expect(seriesLevel.occurrence_id).toBeNull();

    const seriesInstance = byKind.get('series-instance')!;
    expect(seriesInstance.event_id).toBe(fixture.seriesId);
    const [seriesOccurrence] = await db.query<{ id: string }>(
      `select id from event_occurrences where event_id = $1 and date = '2026-01-04'`,
      [fixture.seriesId],
    );
    expect(seriesInstance.occurrence_id).toBe(seriesOccurrence!.id);

    const standalone = byKind.get('standalone-instance')!;
    expect(standalone.event_id).toBe(fixture.standaloneInstanceId);
    expect(standalone.occurrence_id).toBeNull();

    const indexes = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and indexname in ('event_offerings_active_occurrence', 'event_offerings_active_event')
        order by indexname`,
    );
    expect(indexes.map((row) => row.indexname)).toEqual([
      'event_offerings_active_event',
      'event_offerings_active_occurrence',
    ]);
  });

  it('moves the series recurrence to the parent', async () => {
    const schedules = await db.query<{ rrule: string; ends_on: Date | string | null }>(
      'select rrule, ends_on from event_recurrence_versions where event_id = $1',
      [fixture.seriesId],
    );
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
    const exceptions = await db.query<{ kind: string; note: string | null }>(
      'select kind, note from event_recurrence_exceptions where event_id = $1',
      [fixture.seriesId],
    );
    expect(exceptions).toEqual([{ kind: 'cancelled', note: 'Snow' }]);
  });

  it('rekeys every child row to its occurrence and keeps the row counts', async () => {
    expect(await tableCounts(db, Object.keys(fixture.counts))).toEqual(fixture.counts);

    const attendance = await db.query<{
      id: string;
      event_id: string;
      date: Date | string;
      member_id: string;
    }>(
      `select a.id, o.event_id, o.date, a.member_id
         from attendance a
         join event_occurrences o on o.id = a.occurrence_id
        order by o.date, a.member_id`,
    );
    expect(attendance).toHaveLength(3);
    expect(attendance.map((row) => `${row.event_id}:${iso(row.date)}`)).toEqual([
      `${fixture.seriesId}:2026-01-04`,
      `${fixture.seriesId}:2026-01-04`,
      `${fixture.standaloneInstanceId}:2026-02-01`,
    ]);
    const pairs = await db.query<{ total: number | string; distinct_pairs: number | string }>(
      `select count(*)::int as total,
              count(distinct (occurrence_id, member_id))::int as distinct_pairs
         from attendance`,
    );
    expect(Number(pairs[0]!.total)).toBe(Number(pairs[0]!.distinct_pairs));

    const suppression = await db.query<{ event_id: string; date: Date | string }>(
      `select o.event_id, o.date
         from attendance_suppressions s
         join event_occurrences o on o.id = s.occurrence_id`,
    );
    expect(suppression).toEqual([{ event_id: fixture.seriesId, date: expect.anything() }]);
    expect(iso(suppression[0]!.date)).toBe('2026-01-04');

    const chains = await db.query<{ id: string; supersedes_id: string | null }>(
      `select h.id, h.supersedes_id
         from event_session_headcounts h
         order by h.recorded_at`,
    );
    expect(chains.find((row) => row.id === fixture.headcountCorrectionId)!.supersedes_id).toBe(
      fixture.headcountRootId,
    );
    const countChains = await db.query<{ id: string; supersedes_id: string | null }>(
      `select id, supersedes_id from event_session_offering_counts order by recorded_at`,
    );
    expect(
      countChains.find((row) => row.id === fixture.offeringCountCorrectionId)!.supersedes_id,
    ).toBe(fixture.offeringCountRootId);

    const registration = await db.query<{ event_id: string; session_date: Date | string }>(
      `select o.event_id, r.session_date
         from registration_requests r
         join event_occurrences o on o.id = r.occurrence_id
        where r.id = $1`,
      [fixture.registrationId],
    );
    expect(registration[0]!.event_id).toBe(fixture.seriesId);
    expect(iso(registration[0]!.session_date)).toBe('2026-01-04');

    const code = await db.query<{ event_id: string; session_date: Date | string }>(
      `select o.event_id, c.session_date
         from attendance_codes c
         join event_occurrences o on o.id = c.occurrence_id
        where c.id = $1`,
      [fixture.codeId],
    );
    expect(code[0]!.event_id).toBe(fixture.seriesId);
    expect(iso(code[0]!.session_date)).toBe('2026-01-04');

    const delegations = await db.query<{ event_id: string }>(
      `select o.event_id
         from clocking_delegations d
         join event_occurrences o on o.id = d.occurrence_id`,
    );
    expect(delegations).toEqual([{ event_id: fixture.seriesId }]);

    const batches = await db.query<{ event_id: string | null; session_date: Date | string }>(
      `select o.event_id, b.session_date
         from import_batches b
         left join event_occurrences o on o.id = b.occurrence_id
        where b.id = $1`,
      [fixture.importBatchId],
    );
    expect(batches[0]!.event_id).toBe(fixture.seriesId);
    expect(iso(batches[0]!.session_date)).toBe('2026-01-04');

    const contributions = await db.query<{ id: string; event_id: string }>(
      'select id, event_id from contributions order by created_at',
    );
    expect(contributions.find((row) => row.id === fixture.contributionSeriesId)!.event_id).toBe(
      fixture.seriesId,
    );
    expect(contributions.find((row) => row.id === fixture.contributionStandaloneId)!.event_id).toBe(
      fixture.standaloneInstanceId,
    );

    const pledges = await db.query<{ id: string; event_id: string; session_date: unknown }>(
      'select id, event_id, session_date from pledges order by created_at',
    );
    expect(pledges.map((row) => row.event_id).sort()).toEqual(
      [fixture.seriesId, fixture.standaloneInstanceId].sort(),
    );
    expect(pledges.every((row) => row.session_date !== null)).toBe(true);
  });

  it('drops the legacy tables and columns', async () => {
    const indexes = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'attendance_occurrence_member_key',
            'event_occurrences_event_date',
            'clocking_delegations_active',
            'event_session_headcounts_supersedes',
            'event_session_offering_counts_supersedes'
          )
        order by indexname`,
    );
    expect(indexes.map((row) => row.indexname)).toEqual([
      'attendance_occurrence_member_key',
      'clocking_delegations_active',
      'event_occurrences_event_date',
      'event_session_headcounts_supersedes',
      'event_session_offering_counts_supersedes',
    ]);
    const legacy = await db.query<{ name: string }>(
      `select table_name as name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('event_instances','event_series','series_schedules','series_exceptions',
                             'event_instance_offerings')`,
    );
    expect(legacy).toEqual([]);
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public'
          and column_name in ('event_instance_id','session_date')
          and table_name in ('attendance','attendance_suppressions','clocking_delegations')`,
    );
    expect(columns).toEqual([]);
    // The legacy projections and the offering attachment stay.
    const projections = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'events'
          and column_name in ('ministry_id','presbyter_only')`,
    );
    expect(projections.map((row) => row.column_name).sort()).toEqual([
      'ministry_id',
      'presbyter_only',
    ]);
    const offerings = await db.query<{ count: number | string }>(
      'select count(*)::int as count from event_offerings',
    );
    expect(Number(offerings[0]!.count)).toBe(3);
  });

  it('adds nothing when the runner is asked to run again', async () => {
    const before = await tableCounts(db, ['events', 'event_occurrences', 'attendance']);
    // Mark every migration applied, exactly as a completed run leaves the ledger.
    await db.query(
      `create table if not exists schema_migrations (
         version text primary key, applied_at timestamptz not null default now()
       )`,
    );
    for (const migration of MIGRATIONS) {
      await db.query('insert into schema_migrations (version) values ($1) on conflict do nothing', [
        migration.version,
      ]);
    }
    expect(await migrate(db)).toEqual([]);
    expect(await tableCounts(db, ['events', 'event_occurrences', 'attendance'])).toEqual(before);
  });
});

describe('0026 aborts on an unresolvable row or a duplicate session date', () => {
  it('aborts and rolls back when a child date is not an occurrence', async () => {
    const db = await createPgliteDb();
    try {
      await applyThrough(db, PARENT_VERSION);
      const [instance] = await db.query<{ id: string }>(
        `insert into event_instances (
           event_no, name, timezone, start_date, end_date, venue_type, status, source, sessions
         ) values ('BAD-1','Bad','UTC','2026-01-04','2026-01-04','auditorium','scheduled','manual',
                   '[{"date":"2026-01-04","status":"scheduled"}]'::jsonb)
         returning id`,
      );
      const [member] = await db.query<{ id: string }>(
        `insert into members (member_no, created_by, updated_by)
         values ('BAD-M1','seed','seed') returning id`,
      );
      // Drop the old guard so the bad row can exist as a data defect would.
      await db.query('drop trigger attendance_session_guard on attendance');
      await db.query(
        `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
         values ($1,$2,'2026-01-05','manual','seed')`,
        [member!.id, instance!.id],
      );

      await expect(applyAtomically(db, PARENT_VERSION)).rejects.toThrow(/no occurrence/);
      const [legacy] = await db.query<{ name: string }>(
        `select table_name as name from information_schema.tables
          where table_schema = 'public' and table_name = 'event_instances'`,
      );
      expect(legacy!.name).toBe('event_instances');
    } finally {
      await db.close();
    }
  });

  it('aborts on duplicate dates in a standalone sessions array', async () => {
    const db = await createPgliteDb();
    try {
      await applyThrough(db, PARENT_VERSION);
      await db.query(
        `insert into event_instances (
           event_no, name, timezone, start_date, end_date, venue_type, status, source, sessions
         ) values ('BAD-2','Duplicate','UTC','2026-01-04','2026-01-04','auditorium','scheduled','manual',
                   '[{"date":"2026-01-04"},{"date":"2026-01-04"}]'::jsonb)`,
      );
      await expect(applyAtomically(db, PARENT_VERSION)).rejects.toThrow(/sessions on/);
    } finally {
      await db.close();
    }
  });
});
