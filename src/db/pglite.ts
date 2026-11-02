import { PGlite } from '@electric-sql/pglite';
import type { Db, DbClient, Row } from './sql.js';

/**
 * Test adapter: a real Postgres engine compiled to WASM, in-process.
 * `generate_series`, date arithmetic and constraints behave as in production.
 */
export async function createPgliteDb(): Promise<Db> {
  const pglite = new PGlite();
  await pglite.waitReady;

  const client = (tx: PGlite): DbClient => ({
    async query<T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<T[]> {
      const result = await tx.query<T>(text, params ? [...params] : undefined);
      return result.rows;
    },
    async exec(text: string): Promise<void> {
      await tx.exec(text);
    },
  });

  return {
    query: client(pglite).query,
    exec: client(pglite).exec,
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      return pglite.transaction(async (tx) => fn(client(tx as unknown as PGlite)));
    },
    close: () => pglite.close(),
  };
}
