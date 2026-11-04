import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { createPgliteDb } from '../../src/db/pglite.js';
import { migrate } from '../../src/db/migrate.js';
import { eventSeries, ministries, seriesExceptions, seriesSchedules } from '../../src/db/schema.js';
import type { Db } from '../../src/db/sql.js';

interface ColumnShape {
  name: string;
  nullable: boolean;
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

function assertMatches(actual: ColumnShape[], expected: ColumnShape[], tableName: string): void {
  const sort = (rows: ColumnShape[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name));
  if (JSON.stringify(sort(actual)) !== JSON.stringify(sort(expected))) {
    throw new Error(
      `schema drift on ${tableName}: db=${JSON.stringify(sort(actual))} schema=${JSON.stringify(sort(expected))}`,
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
    ['event_series', eventSeries],
    ['series_schedules', seriesSchedules],
    ['series_exceptions', seriesExceptions],
  ];

  it('matches the committed SQL migrations', async () => {
    for (const [name, table] of tables) {
      assertMatches(await dbColumns(db, name), schemaColumns(table), name);
    }
  });

  it('fails on a deliberate column mismatch', async () => {
    const actual = await dbColumns(db, 'ministries');
    const expected = [...schemaColumns(ministries), { name: 'ghost_column', nullable: true }];
    expect(() => assertMatches(actual, expected, 'ministries')).toThrow(/drift/);
  });
});
