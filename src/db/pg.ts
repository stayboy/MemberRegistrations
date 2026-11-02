import { Pool, types, type PoolClient } from 'pg';
import type { Db, DbClient, Row } from './sql.js';

// Calendar dates stay strings: a JS Date would reintroduce the timezone bug
// that date-only storage exists to avoid.
types.setTypeParser(1082, (value) => value);

/** Production adapter: one pooled connection string, real transactions. */
export function createPgDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });

  const client = (source: Pool | PoolClient): DbClient => ({
    async query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<T[]> {
      const result = await source.query(text, params ? [...params] : undefined);
      return result.rows as T[];
    },
    async exec(text: string): Promise<void> {
      await source.query(text);
    },
  });

  return {
    query: client(pool).query,
    exec: client(pool).exec,
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const connection = await pool.connect();
      try {
        await connection.query('begin');
        const result = await fn(client(connection));
        await connection.query('commit');
        return result;
      } catch (error) {
        await connection.query('rollback');
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => pool.end(),
  };
}
