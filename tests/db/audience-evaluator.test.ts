import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { evaluateAudience } from '../../src/domain/audience-evaluator.js';
import { audienceMembers } from '../../src/repos/audience-members.js';
import { AudienceRepository } from '../../src/repos/audiences.js';
import { EventRepository } from '../../src/repos/events.js';
import type { AudienceRule } from '../../src/schemas/audiences.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

/**
 * The audience predicate (member-registrations-event-audience.md A-3) on both
 * drivers. One register is seeded and every clause kind and operator is asked
 * for a count at a fixed date; the repository case proves the roster uses the
 * rule and not the legacy presbyter projection.
 */

const EVAL_DATE = '2026-06-15';

interface SeedMemberOptions {
  gender?: 'male' | 'female' | 'other' | 'undisclosed';
  dob?: string | null;
  joinedOn?: string;
  isPresbyter?: boolean;
  membershipStatus?: 'visitor' | 'active';
  archivedAt?: string | null;
}

async function seedMember(
  db: Db,
  memberNo: string,
  options: SeedMemberOptions = {},
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `insert into members (
       member_no, first_name, last_name, gender, dob, joined_on, is_presbyter,
       membership_status, archived_at, created_by, updated_by
     ) values ($1,$2,'Test',$3,$4,$5,$6,$7,$8,'seed','seed')
     returning id`,
    [
      memberNo,
      memberNo,
      options.gender ?? 'undisclosed',
      options.dob ?? null,
      options.joinedOn ?? '2020-01-01',
      options.isPresbyter ?? false,
      options.membershipStatus ?? 'active',
      options.archivedAt ?? null,
    ],
  );
  return row!.id;
}

async function assignMinistry(db: Db, memberId: string, code: string): Promise<void> {
  await db.query(
    `insert into member_ministries (member_id, ministry_id, assigned_on)
     values ($1, (select id from ministries where code = $2), '2020-01-01')`,
    [memberId, code],
  );
}

/**
 * Seven evaluated members at EVAL_DATE: one adult male and one youth in CHOIR,
 * one adult female and one adult in an inactive ministry, one presbyter, one
 * member with no dob, one registered visitor in CHOIR. A future joiner is out
 * by `joined_on`, an archived member out by `archived_at`.
 */
async function seedRegister(db: Db): Promise<void> {
  const adultMale = await seedMember(db, 'EV-ADULT-MALE', {
    gender: 'male',
    dob: '1990-01-01',
  });
  await assignMinistry(db, adultMale, 'CHOIR');

  const youth = await seedMember(db, 'EV-YOUTH-FEMALE', {
    gender: 'female',
    dob: '2011-06-15',
  });
  await assignMinistry(db, youth, 'CHOIR');

  const adultFemale = await seedMember(db, 'EV-ADULT-FEMALE', {
    gender: 'female',
    dob: '1985-05-05',
  });
  await assignMinistry(db, adultFemale, 'PRAYER');

  await seedMember(db, 'EV-PRESBYTER', {
    gender: 'male',
    dob: '1970-01-01',
    isPresbyter: true,
  });

  const visitor = await seedMember(db, 'EV-VISITOR', {
    gender: 'female',
    dob: '1995-03-03',
    membershipStatus: 'visitor',
  });
  await assignMinistry(db, visitor, 'CHOIR');

  const future = await seedMember(db, 'EV-FUTURE', {
    gender: 'male',
    dob: '1990-01-01',
    joinedOn: '2026-07-01',
  });
  await assignMinistry(db, future, 'CHOIR');

  await seedMember(db, 'EV-NO-DOB', { gender: 'undisclosed' });

  const archived = await seedMember(db, 'EV-ARCHIVED', {
    gender: 'male',
    dob: '1990-01-01',
    archivedAt: '2026-01-01T00:00:00Z',
  });
  await assignMinistry(db, archived, 'CHOIR');

  const inactiveMinistry = await seedMember(db, 'EV-INACTIVE-MINISTRY', {
    gender: 'male',
    dob: '1990-01-01',
  });
  await assignMinistry(db, inactiveMinistry, 'PRAYER');

  await db.query(`update ministries set active = false where code = 'PRAYER'`);
}

async function count(db: Db, rule: AudienceRule, date = EVAL_DATE): Promise<number> {
  return evaluateAudience(rule, await audienceMembers(db, date), date);
}

function registerAudienceSuite(label: string, makeDb: () => Promise<Db>, skip = false): void {
  describe.skipIf(skip)(`audience evaluator on ${label}`, () => {
    let db: Db;

    beforeAll(async () => {
      db = await makeDb();
      await migrate(db);
      await seedRegister(db);
    });

    afterAll(async () => {
      await db.close();
    });

    it('counts a ministry clause against an active ministry assignment', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
        }),
      ).toBe(2);
    });

    it('counts an age band at the evaluation date', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'ageBand', minYears: 13, maxYears: 17 }],
        }),
      ).toBe(1);
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: null }],
        }),
      ).toBe(4);
    });

    it('does not match an age band when the dob is missing', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'ageBand', minYears: 0, maxYears: 100 }],
        }),
      ).toBe(5);
    });

    it('counts a gender clause against the stored value', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'gender', value: 'female' }],
        }),
      ).toBe(2);
    });

    it('counts the presbyter flag', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'presbyter', value: true }],
        }),
      ).toBe(1);
    });

    it('counts membership status: active excludes and visitor includes the visitor', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'membershipStatus', value: 'active' }],
        }),
      ).toBe(6);
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'membershipStatus', value: 'visitor' }],
        }),
      ).toBe(1);
    });

    it('evaluates a visitor only when the rule names the visitor status', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
        }),
      ).toBe(2);
      expect(
        await count(db, {
          operator: 'anyOf',
          clauses: [
            { attribute: 'ministry', ministryCode: 'CHOIR' },
            { attribute: 'membershipStatus', value: 'visitor' },
          ],
        }),
      ).toBe(3);
    });

    it('honours allOf, anyOf and noneOf', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [
            { attribute: 'ministry', ministryCode: 'CHOIR' },
            { attribute: 'presbyter', value: true },
          ],
        }),
      ).toBe(0);
      expect(
        await count(db, {
          operator: 'anyOf',
          clauses: [
            { attribute: 'ministry', ministryCode: 'CHOIR' },
            { attribute: 'presbyter', value: true },
          ],
        }),
      ).toBe(3);
      expect(
        await count(db, {
          operator: 'noneOf',
          clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
        }),
      ).toBe(4);
      expect(
        await count(db, {
          operator: 'noneOf',
          clauses: [{ attribute: 'presbyter', value: true }],
        }),
      ).toBe(5);
    });

    it('excludes members who join after the evaluation date', async () => {
      const everyone: AudienceRule = {
        operator: 'allOf',
        clauses: [{ attribute: 'membershipStatus', value: 'active' }],
      };
      expect(await count(db, everyone, '2019-12-31')).toBe(0);
      expect(await count(db, everyone, '2026-07-01')).toBe(7);
    });

    it('matches nobody for a ministry that is no longer active', async () => {
      expect(
        await count(db, {
          operator: 'allOf',
          clauses: [{ attribute: 'ministry', ministryCode: 'PRAYER' }],
        }),
      ).toBe(0);
    });

    it('reads the roster from the audience, not the legacy projection', async () => {
      const audiences = new AudienceRepository(db);
      const rule: AudienceRule = {
        operator: 'anyOf',
        clauses: [
          { attribute: 'ageBand', minYears: 13, maxYears: 17 },
          { attribute: 'presbyter', value: true },
        ],
      };
      const audience = await audiences.create(
        { name: `Youth or Presbyters ${label}`, rule },
        'seed',
      );

      const events = new EventRepository(db);
      const parent = await events.createParent(
        {
          name: `Audience Roster ${label}`,
          audienceId: audience.id,
          timezone: 'UTC',
          venueType: 'auditorium',
          startTime: '09:00',
          tracksMembers: true,
          occurrences: [{ date: EVAL_DATE }],
        },
        'seed',
      );

      // The rule matches the youth and the presbyter; the legacy pair cannot
      // express either clause, so the projection is general and counts all
      // seven evaluated members, the registered visitor included.
      expect(parent.occurrences[0].expected).toBe(2);
      expect(parent.ministry).toBeNull();
      expect(parent.presbyterOnly).toBe(false);

      const legacy = await events.get(parent.id);
      expect(legacy!.event.sessions[0].expected).toBe(7);
    });

    it('reports zero for a headcount-only event wherever expected is served', async () => {
      const events = new EventRepository(db);
      const parent = await events.createParent(
        {
          name: `Headcount Only ${label}`,
          timezone: 'UTC',
          venueType: 'auditorium',
          startTime: '09:00',
          tracksMembers: false,
          occurrences: [{ date: EVAL_DATE }],
        },
        'seed',
      );

      const etag = (await events.parentEtag(parent.id))!;
      await events.updateParent(parent.id, { status: 'active' }, etag);

      const read = await events.getParent(parent.id, EVAL_DATE, EVAL_DATE);
      expect(read!.occurrences[0].expected).toBe(0);
      expect(read!.summary.attendance.memberSessions.expected).toBe(0);

      const report = await events.getAttendance(parent.id, EVAL_DATE);
      expect(report.expected).toBe(0);
    });
  });
}

registerAudienceSuite('PGlite', () => createPgliteDb());

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
registerAudienceSuite('pooled pg', () => createScratchPgDb(testDatabaseUrl!), !testDatabaseUrl);
