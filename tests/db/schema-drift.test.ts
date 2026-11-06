import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import {
  eventSeries,
  members,
  ministries,
  seriesExceptions,
  seriesSchedules,
  subscriptionClaims,
  subscriptionCoverage,
  subscriptionPayments,
  subscriptionProducts,
  subscriptions,
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
    ['event_series', eventSeries],
    ['series_schedules', seriesSchedules],
    ['series_exceptions', seriesExceptions],
    ['subscriptions', subscriptions],
    ['subscription_products', subscriptionProducts],
    ['subscription_payments', subscriptionPayments],
    ['subscription_claims', subscriptionClaims],
    ['subscription_coverage', subscriptionCoverage],
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

  it('fails on a deliberate column mismatch', async () => {
    const actual = await dbColumns(db, 'ministries');
    const expected = [...schemaColumns(ministries), { name: 'ghost_column', nullable: true }];
    expect(() => assertMatches(actual, expected, 'ministries')).toThrow(/drift/);
  });
});
