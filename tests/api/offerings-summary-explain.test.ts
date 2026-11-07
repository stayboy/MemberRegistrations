import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import {
  OFFERING_SUMMARY_CONTRIBUTIONS_SQL,
  OFFERING_SUMMARY_PLEDGES_SQL,
  OfferingRepository,
} from '../../src/repos/offerings.js';

const DAY_MS = 86_400_000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const today = todayUtc();
const from = shiftDate(today, -30);
const to = today;

let db: Db;

function findSeqScans(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) findSeqScans(child, found);
    return found;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (record['Node Type'] === 'Seq Scan' && typeof record['Relation Name'] === 'string') {
      found.push(record['Relation Name']);
    }
    for (const value of Object.values(record)) findSeqScans(value, found);
  }
  return found;
}

function parsePlan(row: Record<string, unknown>): unknown {
  const raw = Object.values(row)[0];
  if (typeof raw === 'string') return JSON.parse(raw) as unknown;
  return raw;
}

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);

  await db.query(
    `insert into members (member_no, first_name, last_name, gender, created_by, updated_by)
     values ('EX-1','Plan','Member','undisclosed','seed','seed')`,
  );
  const [member] = await db.query<{ id: string }>(
    `select id from members where member_no = 'EX-1'`,
  );
  const [offering] = await db.query<{ id: string }>(
    'insert into offerings default values returning id',
  );
  await db.query(
    `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
     values ($1, 1, 'Plan Tithe', 'Plan fixture', 'tithe', 'GHS', 'seed')`,
    [offering!.id],
  );
  const [event] = await db.query<{ id: string }>(
    `insert into event_instances (event_no, name, start_date, end_date, status, source, sessions)
     values ('EX-EVT-1', 'Plan Service', $1::date, $1::date, 'scheduled', 'manual', '[]'::jsonb)
     returning id`,
    [from],
  );

  // A few hundred rows make the planner's index choice meaningful; the shape
  // assertion below still disables sequential scans for determinism.
  await db.query(
    `insert into contributions (
       member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
       channel, status, reference, idempotency_key, terms_version, created_by
     )
     select $1, $2, $3, $4::date + (i % 20), 1000 + i, 'GHS', 'manual', 'paid',
            'EX-SUM-' || i, 'ex-sum-' || i, 1, 'seed'
       from generate_series(1, 400) as i`,
    [member!.id, offering!.id, event!.id, from],
  );
  await db.query(
    `insert into pledges (
       member_id, offering_id, event_instance_id, amount_minor, currency, expected_on,
       officer_member_id, status, terms_version, idempotency_key, created_by
     )
     select $1, $2, $3, 2000 + i, 'GHS', $4::date + (i % 60), $1, 'pending', 1,
            'ex-pledge-' || i, 'seed'
       from generate_series(1, 200) as i`,
    [member!.id, offering!.id, event!.id, from],
  );
  await db.query(
    `insert into pledge_events (pledge_id, kind, actor, at)
     select p.id, 'created', 'seed', now() - interval '60 days'
       from pledges p`,
  );
});

afterAll(async () => {
  await db.close();
});

describe('offerings summary query shape', () => {
  it('runs a bounded number of statements for one landing read', async () => {
    let statements = 0;
    const proxy = new Proxy(db, {
      get(target, property) {
        if (property === 'query') {
          return (text: string, params?: readonly unknown[]) => {
            statements += 1;
            return target.query(text, params);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const started = performance.now();
    const summary = await new OfferingRepository(proxy as Db).summary(from, to, today);
    const wallClockMs = performance.now() - started;

    expect(summary.from).toBe(from);
    expect(statements).toBeLessThanOrEqual(4);

    // Observation only: wall-clock is environment-dependent and never a gate.
    // The shape guard covers contributions and pledges; the pledge_events
    // aggregation is bounded to that small append-only history and is outside
    // the guard's scope.
    console.info(`offerings summary: ${statements} statements in ${wallClockMs.toFixed(1)} ms`);
  });

  it('never sequentially scans contributions or pledges', async () => {
    await db.exec('set enable_seqscan = off');
    try {
      const plans: Array<readonly [string, readonly unknown[]]> = [
        [OFFERING_SUMMARY_CONTRIBUTIONS_SQL, [from, to]],
        [OFFERING_SUMMARY_PLEDGES_SQL, [from, to, today, 'GHS']],
      ];

      for (const [sql, params] of plans) {
        const rows = await db.query<Record<string, unknown>>(
          `explain (format json) ${sql}`,
          params,
        );
        expect(rows).toHaveLength(1);
        const relations = findSeqScans(parsePlan(rows[0]!));
        expect(relations.filter((name) => name === 'contributions' || name === 'pledges')).toEqual(
          [],
        );
      }
    } finally {
      await db.exec('set enable_seqscan = on');
    }
  });
});
