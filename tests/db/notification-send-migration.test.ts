import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { createPgliteDb } from '../../src/db/pglite.js';
import { createPgDb } from '../../src/db/pg.js';
import { migrate } from '../../src/db/migrate.js';
import {
  memberChannelBlocks,
  memberNotificationSettings,
  notificationChangeNotices,
  notificationDeliveries,
  notificationMessages,
  notificationMutes,
  notificationPreferenceEvents,
  notificationSlotInstances,
} from '../../src/db/schema.js';
import type { Db } from '../../src/db/sql.js';
import { createScratchDatabase } from '../helpers/scratch-db.js';

/**
 * AC-1: `0032_notification_send` applies on PGlite and `pg`; exactly the eight
 * send-side tables exist with their checks and partial indexes, and the
 * Drizzle mirror matches the SQL the tracked runner owns (AGENTS §12).
 */
const SEND_TABLES = [
  'notification_slot_instances',
  'notification_change_notices',
  'notification_messages',
  'notification_deliveries',
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
  await db?.close();
});

async function tableNames(handle: Db): Promise<string[]> {
  const rows = await handle.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  return rows.map((row) => row.table_name);
}

async function columns(
  handle: Db,
  table: string,
): Promise<Array<{ name: string; nullable: boolean }>> {
  const rows = await handle.query<{ column_name: string; is_nullable: string }>(
    `select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  );
  return rows.map((row) => ({ name: row.column_name, nullable: row.is_nullable === 'YES' }));
}

async function checkNames(handle: Db, table: string): Promise<string[]> {
  const rows = await handle.query<{ conname: string }>(
    `select c.conname from pg_constraint c
       join pg_class t on t.oid = c.conrelid
      where c.contype = 'c' and t.relname = $1 order by c.conname`,
    [table],
  );
  return rows.map((row) => row.conname);
}

async function indexNames(handle: Db, table: string): Promise<string[]> {
  const rows = await handle.query<{ name: string }>(
    `select i.relname as name from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
       join pg_class t on t.oid = ix.indrelid
      where t.relname = $1 and not ix.indisprimary order by i.relname`,
    [table],
  );
  return rows.map((row) => row.name);
}

function schemaColumns(table: PgTable): Array<{ name: string; nullable: boolean }> {
  return getTableConfig(table).columns.map((column) => ({
    name: column.name,
    nullable: !column.notNull,
  }));
}

function schemaChecks(table: PgTable): string[] {
  return getTableConfig(table)
    .checks.map((check) => check.name)
    .sort();
}

function schemaIndexNames(table: PgTable): string[] {
  return getTableConfig(table)
    .indexes.map((index) => index.config.name ?? '')
    .sort();
}

const mirror: Array<[string, PgTable]> = [
  ['notification_change_notices', notificationChangeNotices],
  ['notification_slot_instances', notificationSlotInstances],
  ['notification_messages', notificationMessages],
  ['notification_deliveries', notificationDeliveries],
  ['member_notification_settings', memberNotificationSettings],
  ['member_channel_blocks', memberChannelBlocks],
  ['notification_mutes', notificationMutes],
  ['notification_preference_events', notificationPreferenceEvents],
];

describe('0032_notification_send on PGlite', () => {
  it('creates exactly the eight send-side tables', async () => {
    const present = await tableNames(db);
    for (const table of SEND_TABLES) expect(present).toContain(table);
    // No ninth table was smuggled in.
    expect(present.filter((name) => name.startsWith('notification_')).sort()).toEqual(
      [
        'notification_change_notices',
        'notification_defaults',
        'notification_deliveries',
        'notification_messages',
        'notification_mutes',
        'notification_plan_revisions',
        'notification_plan_slots',
        'notification_plans',
        'notification_preference_events',
        'notification_slot_instances',
        'notification_templates',
      ].sort(),
    );
  });

  it('keys an instance on plan, date and instant, exempting cancelled rows', async () => {
    const [row] = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'notification_slot_instances_key'",
    );
    expect(row?.indexdef).toMatch(/unique index/i);
    expect(row?.indexdef).toContain("WHERE (status <> 'cancelled'::text)");
    expect(row?.indexdef).toContain('COALESCE(occurrence_date');
    const [due] = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'notification_slot_instances_due'",
    );
    expect(due?.indexdef).toContain("WHERE (status = 'scheduled'::text)");
  });

  it('holds the closed sets: delivery status, skip reason and error code', async () => {
    const checks = await checkNames(db, 'notification_deliveries');
    expect(checks).toEqual(
      expect.arrayContaining([
        'notification_deliveries_channel_check',
        'notification_deliveries_status_check',
        'notification_deliveries_skip_reason_check',
        'notification_deliveries_last_error_code_check',
        'notification_deliveries_own_message_check',
      ]),
    );
  });

  it('rejects an own-routed delivery with no message (FR-47)', async () => {
    // Build the minimum parent rows a delivery needs.
    const [audience] = await db.query<{ id: string }>(
      "select id from audiences where system_key = 'everyone'",
    );
    const [event] = await db.query<{ id: string }>(
      `insert into events (event_no, name, status, audience_id)
       values ('EVT-0032-1','Send probe','active',$1) returning id`,
      [audience!.id],
    );
    const [plan] = await db.query<{ id: string }>(
      `insert into notification_plans (event_id, created_by, updated_by)
       values ($1,'seed','seed') returning id`,
      [event!.id],
    );
    const [revision] = await db.query<{ revision: number }>(
      `insert into notification_plan_revisions (plan_id, revision, created_by, updated_by)
       values ($1,1,'seed','seed') returning revision`,
      [plan!.id],
    );
    const [slot] = await db.query<{ id: string }>(
      `insert into notification_plan_slots
         (plan_id, revision, kind, anchor, offset_minutes, sort_order)
       values ($1,$2,'announce','publish',0,0) returning id`,
      [plan!.id, revision!.revision],
    );
    const [instance] = await db.query<{ id: string }>(
      `insert into notification_slot_instances
         (plan_id, slot_id, kind, revision, send_at, status)
       values ($1,$2,'announce',1, now(), 'scheduled') returning id`,
      [plan!.id, slot!.id],
    );
    const [member] = await db.query<{ id: string }>(
      `insert into members (member_no, created_by, updated_by)
       values ('M-0032-1','seed','seed') returning id`,
    );

    await expect(
      db.query(
        `insert into notification_deliveries
           (instance_id, member_id, channel, routed_via, status)
         values ($1,$2,'sms','own','pending')`,
        [instance!.id, member!.id],
      ),
    ).rejects.toThrow(/notification_deliveries_own_message_check/);

    // A guardian-routed row with no message is allowed.
    await db.query(
      `insert into notification_deliveries
         (instance_id, member_id, channel, routed_via, status)
       values ($1,$2,'sms','guardian','pending')`,
      [instance!.id, member!.id],
    );
  });

  it('matches the Drizzle mirror on every column, check and index name', async () => {
    for (const [table, drizzle] of mirror) {
      expect(await columns(db, table)).toEqual(schemaColumns(drizzle));
      expect(await checkNames(db, table)).toEqual(schemaChecks(drizzle));
      expect(await indexNames(db, table)).toEqual(schemaIndexNames(drizzle));
    }
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('0032_notification_send on the pooled pg driver', () => {
  let pool: Db;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    const scratch = await createScratchDatabase(testDatabaseUrl!);
    drop = scratch.drop;
    pool = createPgDb(scratch.connectionString);
    await migrate(pool);
  });

  afterAll(async () => {
    await pool?.close();
    await drop?.();
  });

  it('applies the same eight tables and the partial instance key', async () => {
    const present = await tableNames(pool);
    for (const table of SEND_TABLES) expect(present).toContain(table);

    const [row] = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'notification_slot_instances_key'",
    );
    expect(row?.indexdef).toContain("status <> 'cancelled'::text");
  });
});
