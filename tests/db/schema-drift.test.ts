import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import {
  eventSeries,
  eventSessionHeadcounts,
  eventSessionOfferingCountLines,
  eventSessionOfferingCounts,
  members,
  ministries,
  ministryPositions,
  presbyterTitles,
  seriesExceptions,
  seriesSchedules,
  subscriptionClaims,
  subscriptionCoverage,
  subscriptionPayments,
  subscriptionProducts,
  subscriptions,
  ussdSessions,
} from '../../src/db/schema.js';
import type { Db } from '../../src/db/sql.js';

interface ColumnShape {
  name: string;
  nullable: boolean;
}

interface IndexShape {
  name: string;
  unique: boolean;
  columns: string[];
}

interface ForeignKeyShape {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

function schemaColumns(table: PgTable): ColumnShape[] {
  return getTableConfig(table).columns.map((column) => ({
    name: column.name,
    nullable: !column.notNull,
  }));
}

async function dbColumns(db: Db, tableName: string): Promise<ColumnShape[]> {
  const rows = await db.query<{ column_name: string; is_nullable: string }>(
    `select column_name, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [tableName],
  );
  return rows.map((row) => ({ name: row.column_name, nullable: row.is_nullable === 'YES' }));
}

function schemaIndexes(table: PgTable): IndexShape[] {
  return getTableConfig(table).indexes.map((index) => ({
    name: index.config.name ?? '',
    unique: index.config.unique,
    columns: index.config.columns.map((column) => (column as { name: string }).name),
  }));
}

async function dbIndexes(db: Db, tableName: string): Promise<IndexShape[]> {
  const rows = await db.query<{ name: string; is_unique: boolean; columns: string[] }>(
    `select i.relname as name, ix.indisunique as is_unique,
            array_agg(a.attname order by k.ord) as columns
       from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
       join pg_class t on t.oid = ix.indrelid
       join pg_namespace n on n.oid = t.relnamespace
       join lateral unnest(ix.indkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      where n.nspname = 'public' and t.relname = $1 and not ix.indisprimary
      group by i.relname, ix.indisunique
      order by i.relname`,
    [tableName],
  );
  return rows.map((row) => ({ name: row.name, unique: row.is_unique, columns: row.columns }));
}

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

function schemaForeignKeys(table: PgTable): ForeignKeyShape[] {
  return getTableConfig(table)
    .foreignKeys.flatMap((foreignKey) => {
      const reference = foreignKey.reference();
      const foreignTable = getTableConfig(reference.foreignTable).name;
      return reference.columns.map((column, index) => ({
        column: column.name,
        foreignTable,
        foreignColumn: reference.foreignColumns[index]!.name,
      }));
    })
    .sort((left, right) => left.column.localeCompare(right.column));
}

async function dbForeignKeys(db: Db, tableName: string): Promise<ForeignKeyShape[]> {
  const rows = await db.query<{
    column_name: string;
    foreign_table: string;
    foreign_column: string;
  }>(
    `select kcu.column_name, ccu.table_name as foreign_table, ccu.column_name as foreign_column
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and tc.table_name = $1
      order by kcu.column_name`,
    [tableName],
  );
  return rows.map((row) => ({
    column: row.column_name,
    foreignTable: row.foreign_table,
    foreignColumn: row.foreign_column,
  }));
}

function schemaCheckNames(table: PgTable): string[] {
  return getTableConfig(table)
    .checks.map((constraint) => constraint.name)
    .sort();
}

async function dbCheckNames(db: Db, tableName: string): Promise<string[]> {
  const rows = await db.query<{ conname: string }>(
    `select c.conname
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'c' and n.nspname = 'public' and t.relname = $1
      order by c.conname`,
    [tableName],
  );
  return rows.map((row) => row.conname);
}

function assertMatches(actual: ColumnShape[], expected: ColumnShape[], tableName: string): void {
  if (JSON.stringify(sortByName(actual)) !== JSON.stringify(sortByName(expected))) {
    throw new Error(
      `schema drift on ${tableName}: db=${JSON.stringify(sortByName(actual))} schema=${JSON.stringify(sortByName(expected))}`,
    );
  }
}

describe('ORM schema drift', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
  });

  afterAll(async () => {
    await db.close();
  });

  const tables: Array<[string, PgTable]> = [
    ['ministries', ministries],
    ['members', members],
    ['presbyter_titles', presbyterTitles],
    ['ministry_positions', ministryPositions],
    ['event_series', eventSeries],
    ['series_schedules', seriesSchedules],
    ['series_exceptions', seriesExceptions],
    ['subscriptions', subscriptions],
    ['subscription_products', subscriptionProducts],
    ['subscription_payments', subscriptionPayments],
    ['subscription_claims', subscriptionClaims],
    ['subscription_coverage', subscriptionCoverage],
    ['ussd_sessions', ussdSessions],
    ['event_session_headcounts', eventSessionHeadcounts],
    ['event_session_offering_counts', eventSessionOfferingCounts],
    ['event_session_offering_count_lines', eventSessionOfferingCountLines],
  ];

  it('matches the committed SQL migrations', async () => {
    for (const [name, table] of tables) {
      assertMatches(await dbColumns(db, name), schemaColumns(table), name);
    }
  });

  it('matches the subscription_payments index names, uniqueness and columns', async () => {
    const actual = await dbIndexes(db, 'subscription_payments');
    const expected = schemaIndexes(subscriptionPayments);
    expect(sortByName(actual)).toEqual(sortByName(expected));
  });

  it('matches the headcount and provider-correlation indexes', async () => {
    expect(sortByName(await dbIndexes(db, 'event_session_headcounts'))).toEqual(
      sortByName(schemaIndexes(eventSessionHeadcounts)),
    );
    expect(sortByName(await dbIndexes(db, 'ussd_sessions'))).toEqual(
      sortByName(schemaIndexes(ussdSessions)),
    );
  });

  it('matches the offering-count indexes', async () => {
    expect(sortByName(await dbIndexes(db, 'event_session_offering_counts'))).toEqual(
      sortByName(schemaIndexes(eventSessionOfferingCounts)),
    );
    // The line table's only index is its composite primary key; the drift
    // helper excludes primary keys, so both sides are empty.
    expect(sortByName(await dbIndexes(db, 'event_session_offering_count_lines'))).toEqual(
      sortByName(schemaIndexes(eventSessionOfferingCountLines)),
    );
  });

  it('matches the offering-count foreign keys and checks', async () => {
    for (const [name, table] of [
      ['event_session_offering_counts', eventSessionOfferingCounts],
      ['event_session_offering_count_lines', eventSessionOfferingCountLines],
    ] as Array<[string, PgTable]>) {
      expect(await dbForeignKeys(db, name)).toEqual(schemaForeignKeys(table));
      expect(await dbCheckNames(db, name)).toEqual(schemaCheckNames(table));
    }
  });

  it('matches the officer-title foreign keys and checks', async () => {
    expect(await dbCheckNames(db, 'presbyter_titles')).toEqual(schemaCheckNames(presbyterTitles));
    expect(await dbForeignKeys(db, 'members')).toEqual(schemaForeignKeys(members));
    expect(await dbForeignKeys(db, 'member_ministries')).toContainEqual({
      column: 'position_code',
      foreignTable: 'ministry_positions',
      foreignColumn: 'code',
    });
  });

  it('fails on a deliberate column mismatch', async () => {
    const actual = await dbColumns(db, 'ministries');
    const expected = [...schemaColumns(ministries), { name: 'ghost_column', nullable: true }];
    expect(() => assertMatches(actual, expected, 'ministries')).toThrow(/drift/);
  });
});
