import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { createPgliteDb } from '../../src/db/pglite.js';
import { createPgDb } from '../../src/db/pg.js';
import { createScratchDatabase } from '../helpers/scratch-db.js';
import { migrate } from '../../src/db/migrate.js';
import {
  eventFliers,
  notificationDefaults,
  notificationPlanRevisions,
  notificationPlanSlots,
  notificationPlans,
  notificationTemplates,
} from '../../src/db/schema.js';
import type { Db } from '../../src/db/sql.js';

/**
 * `0030_event_notifications` is the plan side of N-14: six tables, their
 * checks, the composite foreign keys to `(plan_id, revision)` and the partial
 * unique index that keeps one published revision. The send side is R3's
 * `0032_notification_send`, so none of its tables may exist yet.
 */
const PLAN_TABLES = [
  'notification_plans',
  'notification_plan_revisions',
  'notification_plan_slots',
  'notification_templates',
  'event_fliers',
  'notification_defaults',
];

const SEND_TABLES = [
  'notification_slot_instances',
  'notification_messages',
  'notification_deliveries',
  'notification_change_notices',
  'member_notification_settings',
  'member_channel_blocks',
  'notification_mutes',
  'notification_preference_events',
];

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
});

afterAll(async () => {
  await db.close();
});

async function tables(): Promise<string[]> {
  const rows = await db.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  return rows.map((row) => row.table_name);
}

let eventSeq = 0;

async function seedEvent(): Promise<string> {
  const [audience] = await db.query<{ id: string }>(
    "select id from audiences where system_key = 'everyone'",
  );
  eventSeq += 1;
  const [event] = await db.query<{ id: string }>(
    `insert into events (event_no, name, audience_id, timezone, start_time, end_time)
     values ($1,'Notification seed',$2,'Africa/Lagos','09:00','12:00')
     returning id`,
    [`EVT-2026-95${eventSeq}`, audience!.id],
  );
  return event!.id;
}

async function seedPlan(): Promise<{ planId: string; eventId: string }> {
  const eventId = await seedEvent();
  const [plan] = await db.query<{ id: string }>(
    `insert into notification_plans (event_id, created_by, updated_by)
     values ($1,'seed','seed') returning id`,
    [eventId],
  );
  await db.query(
    `insert into notification_plan_revisions (plan_id, revision, created_by, updated_by)
     values ($1, 1, 'seed', 'seed')`,
    [plan!.id],
  );
  return { planId: plan!.id, eventId };
}

describe('0030_event_notifications', () => {
  it('creates the six plan-side tables and none of the send-side ones', async () => {
    const present = await tables();
    for (const name of PLAN_TABLES) expect(present).toContain(name);
    for (const name of SEND_TABLES) expect(present).not.toContain(name);
  });

  it('keeps one published revision per plan with a partial unique index', async () => {
    const [index] = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'notification_plan_one_published'",
    );
    expect(index?.indexdef).toMatch(/unique index/i);
    expect(index?.indexdef).toContain("WHERE (status = 'published'");
  });

  it('refuses a kind outside the closed set and an offset outside one week', async () => {
    const { planId } = await seedPlan();
    await expect(
      db.query(
        `insert into notification_plan_slots (plan_id, revision, kind, anchor, offset_minutes, sort_order)
         values ($1, 1, 'change', 'publish', 0, 0)`,
        [planId],
      ),
    ).rejects.toThrow(/notification_plan_slots_kind_check/);
    await expect(
      db.query(
        `insert into notification_plan_slots (plan_id, revision, kind, anchor, offset_minutes, sort_order)
         values ($1, 1, 'announce', 'publish', 10081, 0)`,
        [planId],
      ),
    ).rejects.toThrow(/notification_plan_slots_offset_check/);
  });

  it('requires a slot to belong to an existing (plan, revision) pair', async () => {
    const { planId } = await seedPlan();
    await expect(
      db.query(
        `insert into notification_plan_slots (plan_id, revision, kind, anchor, offset_minutes, sort_order)
         values ($1, 9, 'announce', 'publish', 0, 0)`,
        [planId],
      ),
    ).rejects.toThrow(/notification_plan_slots_revision_fkey/);
  });

  it('ties published status to a publish stamp and allows one published row', async () => {
    const { planId } = await seedPlan();
    await expect(
      db.query(`update notification_plan_revisions set status = 'published' where plan_id = $1`, [
        planId,
      ]),
    ).rejects.toThrow(/notification_plan_revisions_published_check/);

    await db.query(
      `update notification_plan_revisions
          set status = 'published', published_at = now()
        where plan_id = $1 and revision = 1`,
      [planId],
    );
    await db.query(
      `insert into notification_plan_revisions (plan_id, revision, created_by, updated_by)
       values ($1, 2, 'seed', 'seed')`,
      [planId],
    );
    await expect(
      db.query(
        `update notification_plan_revisions
            set status = 'published', published_at = now()
          where plan_id = $1 and revision = 2`,
        [planId],
      ),
    ).rejects.toThrow(/notification_plan_one_published/);
  });

  it('holds the email, WhatsApp and client-HTML template shapes', async () => {
    const { planId } = await seedPlan();
    const document = JSON.stringify({ type: 'doc', content: [] });
    await expect(
      db.query(
        `insert into notification_templates (plan_id, revision, channel, body_json, body_text, created_by)
         values ($1, 1, 'sms', $2::jsonb, 'hello', 'seed')`,
        [planId, document],
      ),
    ).rejects.toThrow(/notification_templates_no_client_html_check/);

    await expect(
      db.query(
        `insert into notification_templates (plan_id, revision, channel, subject, body_json, created_by)
         values ($1, 1, 'email', 'Subject', $2::jsonb, 'seed')`,
        [planId, document],
      ),
    ).rejects.toThrow(/notification_templates_email_body_check/);

    await expect(
      db.query(
        `insert into notification_templates (plan_id, revision, channel, created_by)
         values ($1, 1, 'whatsapp', 'seed')`,
        [planId],
      ),
    ).rejects.toThrow(/notification_templates_template_name_check/);

    await expect(
      db.query(
        `insert into notification_templates
           (plan_id, revision, channel, body_text, template_name, created_by)
         values ($1, 1, 'whatsapp', 'prose', 'event_announce', 'seed')`,
        [planId],
      ),
    ).rejects.toThrow(/notification_templates_whatsapp_text_check/);
  });

  it('caps the flier at 2 MiB and one storage shape', async () => {
    const { planId } = await seedPlan();
    const insertFlier = (values: unknown[]) =>
      db.query(
        `insert into event_fliers
           (plan_id, revision, token, storage, storage_key, bytes, content_type, byte_size,
            sha256, uploaded_by)
         values ($1, 1, $2, $3, $4, $5, $6, $7, $8, 'seed')`,
        [planId, ...values],
      );

    await expect(
      insertFlier([
        'a'.repeat(64),
        's3',
        'fliers/a',
        null,
        'image/png',
        2 * 1024 * 1024 + 1,
        'hash',
      ]),
    ).rejects.toThrow(/event_fliers_byte_size_check/);

    await expect(
      insertFlier(['b'.repeat(64), 'db', null, new Uint8Array([1]), 'text/plain', 1, 'hash']),
    ).rejects.toThrow(/event_fliers_content_type_check/);

    // `db` without bytes, and `s3` with bytes, are both a half-written row.
    await expect(
      insertFlier(['c'.repeat(64), 'db', null, null, 'image/png', 1, 'hash']),
    ).rejects.toThrow(/event_fliers_storage_shape_check/);
    await expect(
      insertFlier(['d'.repeat(64), 's3', 'fliers/d', new Uint8Array([1]), 'image/png', 1, 'hash']),
    ).rejects.toThrow(/event_fliers_storage_shape_check/);
  });

  it('holds the church defaults to one closed row and a closed send mode', async () => {
    await expect(
      db.query(
        `insert into notification_defaults (id, slots, church_name, send_mode, updated_by)
         values ('other','[]'::jsonb,'Church','always','seed')`,
      ),
    ).rejects.toThrow(/notification_defaults_id_check/);

    await expect(
      db.query(
        `insert into notification_defaults (id, slots, church_name, send_mode, updated_by)
         values ('church','[]'::jsonb,'Church','sometimes','seed')`,
      ),
    ).rejects.toThrow(/notification_defaults_send_mode_check/);
  });
});

// -- the Drizzle mirror (AGENTS 12) -------------------------------------------

interface ColumnShape {
  name: string;
  nullable: boolean;
}

async function dbColumns(name: string): Promise<ColumnShape[]> {
  const rows = await db.query<{ column_name: string; is_nullable: string }>(
    `select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [name],
  );
  return rows.map((row) => ({ name: row.column_name, nullable: row.is_nullable === 'YES' }));
}

function schemaColumns(table: PgTable): ColumnShape[] {
  return getTableConfig(table).columns.map((column) => ({
    name: column.name,
    nullable: !column.notNull,
  }));
}

async function dbCheckNames(name: string): Promise<string[]> {
  const rows = await db.query<{ conname: string }>(
    `select c.conname from pg_constraint c
       join pg_class t on t.oid = c.conrelid
      where c.contype = 'c' and t.relname = $1 order by c.conname`,
    [name],
  );
  return rows.map((row) => row.conname);
}

async function dbForeignKeyColumns(name: string): Promise<string[]> {
  const rows = await db.query<{ column_name: string }>(
    `select kcu.column_name from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and tc.table_name = $1 order by kcu.column_name`,
    [name],
  );
  return rows.map((row) => row.column_name);
}

describe('the Drizzle mirror of 0030', () => {
  const tables: Array<[string, PgTable]> = [
    ['notification_plans', notificationPlans],
    ['notification_plan_revisions', notificationPlanRevisions],
    ['notification_plan_slots', notificationPlanSlots],
    ['notification_templates', notificationTemplates],
    ['event_fliers', eventFliers],
    ['notification_defaults', notificationDefaults],
  ];

  it('matches every column and its nullability', async () => {
    for (const [name, table] of tables) {
      expect(await dbColumns(name)).toEqual(schemaColumns(table));
    }
  });

  it('matches the named checks and the composite foreign keys', async () => {
    for (const [name, table] of tables) {
      const expectedChecks = getTableConfig(table)
        .checks.map((check) => check.name)
        .sort();
      expect(await dbCheckNames(name)).toEqual(expectedChecks);

      const expectedForeignKeys = getTableConfig(table)
        .foreignKeys.flatMap((foreignKey) =>
          foreignKey.reference().columns.map((column) => column.name),
        )
        .sort();
      expect(await dbForeignKeyColumns(name)).toEqual(expectedForeignKeys);
    }
  });
});

/**
 * The $pg half of criterion 1 (review pass 1, P1). AGENTS.md §12 requires both
 * drivers to pass the same tests, and a migration test that only ran on PGlite
 * would let a Postgres-only defect through. `TEST_DATABASE_URL` must name a
 * scratch server that allows creating databases; CI sets it.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('0030 on the pooled pg driver', () => {
  let db: Db;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    const scratch = await createScratchDatabase(testDatabaseUrl!);
    drop = scratch.drop;
    db = createPgDb(scratch.connectionString);
    await migrate(db);
  });

  afterAll(async () => {
    await db?.close();
    await drop?.();
  });

  it('creates the six plan-side tables and none of the send-side ones', async () => {
    const rows = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = rows.map((row) => row.table_name);

    for (const table of PLAN_TABLES) expect(names).toContain(table);
    for (const table of SEND_TABLES) expect(names).not.toContain(table);
  });

  it('keeps one published revision per plan', async () => {
    // The partial unique index is the only thing that makes "one published" true,
    // and it is the one index a portable-SQL argument cannot vouch for.
    const [audience] = await db.query<{ id: string }>(
      "insert into audiences (name, rule, created_by) values ('pg index probe', '{\"kind\":\"all\"}'::jsonb, 'test') returning id",
    );
    const [event] = await db.query<{ id: string }>(
      "insert into events (event_no, name, status, audience_id) values ('PG-INDEX-1', 'pg index probe', 'draft', $1) returning id",
      [audience!.id],
    );
    await db.query(
      'insert into notification_plans (event_id, created_by, updated_by) values ($1, $2, $2)',
      [event!.id, 'test'],
    );
    await db.query(
      "insert into notification_plan_revisions (plan_id, revision, status, published_at, created_by, updated_by) select id, 1, 'published', now(), 'test', 'test' from notification_plans where event_id = $1",
      [event!.id],
    );

    await expect(
      db.query(
        "insert into notification_plan_revisions (plan_id, revision, status, published_at, created_by, updated_by) select id, 2, 'published', now(), 'test', 'test' from notification_plans where event_id = $1",
        [event!.id],
      ),
    ).rejects.toThrow();
  });
});
