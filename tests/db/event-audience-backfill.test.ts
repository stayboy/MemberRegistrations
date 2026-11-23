import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import { MIGRATIONS } from '../../src/db/migrations.js';
import type { Db } from '../../src/db/sql.js';

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

async function seedSeries(
  db: Db,
  input: { name: string; ministryCode: string | null; presbyterOnly: boolean },
): Promise<{ seriesId: string; instanceId: string }> {
  const [series] = await db.query<{ id: string }>(
    `insert into event_series (name, ministry_id, presbyter_only, timezone, created_by, updated_by)
     values ($1,(select id from ministries where code = $2),$3,'UTC','seed','seed')
     returning id`,
    [input.name, input.ministryCode, input.presbyterOnly],
  );
  await db.query(
    `insert into series_schedules (series_id, effective_from, rrule, ends_on, created_by)
     values ($1,'2026-01-04','FREQ=WEEKLY;BYDAY=SU',null,'seed')`,
    [series!.id],
  );
  const [instance] = await db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, venue_type, status, source,
       sessions, tracks_members, presbyter_only
     ) values (null,$1,$2,'UTC','2026-01-04','2026-01-04','auditorium','scheduled','series',
               '[{"date":"2026-01-04","status":"scheduled"}]'::jsonb,true,$3)
     returning id`,
    [series!.id, input.name, input.presbyterOnly],
  );
  return { seriesId: series!.id, instanceId: instance!.id };
}

describe('0027 audience and membership backfill', () => {
  let db: Db;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await createPgliteDb();
    await applyThrough(db, '0026_event_parent');

    const general = await seedSeries(db, {
      name: 'General One',
      ministryCode: null,
      presbyterOnly: false,
    });
    ids.general = general.seriesId;
    const choir = await seedSeries(db, {
      name: 'Choir One',
      ministryCode: 'CHOIR',
      presbyterOnly: false,
    });
    ids.choir = choir.seriesId;
    const presbyters = await seedSeries(db, {
      name: 'Presbyters One',
      ministryCode: null,
      presbyterOnly: true,
    });
    ids.presbyters = presbyters.seriesId;
    const choirPresbytersA = await seedSeries(db, {
      name: 'Choir Presbyters One',
      ministryCode: 'CHOIR',
      presbyterOnly: true,
    });
    ids.choirPresbytersA = choirPresbytersA.seriesId;
    const choirPresbytersB = await seedSeries(db, {
      name: 'Choir Presbyters Two',
      ministryCode: 'CHOIR',
      presbyterOnly: true,
    });
    ids.choirPresbytersB = choirPresbytersB.seriesId;

    const [active] = await db.query<{ id: string }>(
      `insert into members (member_no, first_name, last_name, created_by, updated_by)
       values ('AUD-1','Active','Member','seed','seed') returning id`,
    );
    const [archived] = await db.query<{ id: string }>(
      `insert into members (member_no, first_name, last_name, archived_at, created_by, updated_by)
       values ('AUD-2','Archived','Member', now(),'seed','seed') returning id`,
    );
    ids.active = active!.id;
    ids.archived = archived!.id;

    await db.exec(migrationSql('0026_event_parent'));
    await db.exec(migrationSql('0027_event_audience_membership'));
  });

  afterAll(async () => {
    await db.close();
  });

  it('maps each legacy pair to its audience, sharing the combination per pair', async () => {
    const rows = await db.query<{
      id: string;
      system_key: string;
      system: boolean;
      rule: unknown;
    }>(
      `select a.id, a.system_key, a.system, a.rule
         from events e
         join audiences a on a.id = e.audience_id
        where e.id = any($1::uuid[])`,
      [Object.values(ids).slice(0, 5)],
    );
    const byKey = new Map(rows.map((row) => [row.system_key, row]));

    expect(byKey.get('everyone')!.id).toBeTruthy();
    expect(byKey.get('ministry:CHOIR')!.id).toBeTruthy();
    expect(byKey.get('presbyters')!.id).toBeTruthy();
    const combination = byKey.get('legacy:CHOIR:presbyters')!;
    expect(combination).toBeTruthy();
    expect(combination.system).toBe(false);
    expect(combination.rule).toEqual({
      operator: 'allOf',
      clauses: [
        { attribute: 'ministry', ministryCode: 'CHOIR' },
        { attribute: 'presbyter', value: true },
      ],
    });

    const events = await db.query<{ id: string; audience_id: string }>(
      'select id, audience_id from events where id = any($1::uuid[])',
      [Object.values(ids).slice(0, 5)],
    );
    const audienceFor = new Map(events.map((row) => [row.id, row.audience_id]));
    expect(audienceFor.get(ids.general)).toBe(byKey.get('everyone')!.id);
    expect(audienceFor.get(ids.choir)).toBe(byKey.get('ministry:CHOIR')!.id);
    expect(audienceFor.get(ids.presbyters)).toBe(byKey.get('presbyters')!.id);
    expect(audienceFor.get(ids.choirPresbytersA)).toBe(combination.id);
    expect(audienceFor.get(ids.choirPresbytersB)).toBe(combination.id);

    const [shared] = await db.query<{ count: number | string }>(
      `select count(*)::int as count from audiences
        where system_key = 'legacy:CHOIR:presbyters'`,
    );
    expect(Number(shared!.count)).toBe(1);
  });

  it('seeds the fixed audiences and one per ministry', async () => {
    const rows = await db.query<{ system_key: string }>(
      `select system_key from audiences where system = true order by system_key`,
    );
    const keys = rows.map((row) => row.system_key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'everyone',
        'presbyters',
        'age:0-12',
        'age:13-17',
        'age:18+',
        'status:visitor',
        'ministry:PEMEM',
        'ministry:WOMEN',
        'ministry:CHOIR',
        'ministry:PRAYER',
      ]),
    );
    const everyone = await db.query<{ rule: unknown }>(
      `select rule from audiences where system_key = 'everyone'`,
    );
    expect(everyone[0]!.rule).toEqual({
      operator: 'allOf',
      clauses: [{ attribute: 'membershipStatus', value: 'active' }],
    });
  });

  it('backfills membership_status active, with archived derived from archived_at', async () => {
    const members = await db.query<{ member_no: string; membership_status: string }>(
      `select member_no, membership_status from members
        where member_no in ('AUD-1','AUD-2') order by member_no`,
    );
    expect(members).toEqual([
      { member_no: 'AUD-1', membership_status: 'active' },
      { member_no: 'AUD-2', membership_status: 'active' },
    ]);
    const [archived] = await db.query<{ archived_at: unknown }>(
      `select archived_at from members where member_no = 'AUD-2'`,
    );
    expect(archived!.archived_at).not.toBeNull();
  });

  it('writes the legacy columns from the audience and leaves them as projections', async () => {
    const [choir] = await db.query<{
      ministry_id: string | null;
      presbyter_only: boolean;
    }>('select ministry_id, presbyter_only from events where id = $1', [ids.choir]);
    const [choirId] = await db.query<{ id: string }>(
      `select id from ministries where code = 'CHOIR'`,
    );
    expect(choir!.ministry_id).toBe(choirId!.id);
    expect(choir!.presbyter_only).toBe(false);

    const [combination] = await db.query<{
      ministry_id: string | null;
      presbyter_only: boolean;
    }>('select ministry_id, presbyter_only from events where id = $1', [ids.choirPresbytersA]);
    expect(combination!.ministry_id).toBe(choirId!.id);
    expect(combination!.presbyter_only).toBe(true);

    const [general] = await db.query<{
      ministry_id: string | null;
      presbyter_only: boolean;
    }>('select ministry_id, presbyter_only from events where id = $1', [ids.general]);
    expect(general).toEqual({ ministry_id: null, presbyter_only: false });
  });

  it('adds no audience or event on a second runner pass', async () => {
    const [before] = await db.query<{ count: number | string }>(
      'select count(*)::int as count from audiences',
    );
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
    const [after] = await db.query<{ count: number | string }>(
      'select count(*)::int as count from audiences',
    );
    expect(Number(after!.count)).toBe(Number(before!.count));
  });
});
