import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema.js';
import type { Db, DbClient, Row } from './sql.js';

/** The embedded engine and its `Db` port, sharing one instance. */
export interface PgliteHandle {
  engine: PGlite;
  db: Db;
}

/**
 * Test adapter: a real Postgres engine compiled to WASM, in-process.
 * `generate_series`, date arithmetic and constraints behave as in production.
 * The Drizzle handle is bound to the same engine (or transaction) as the client.
 *
 * The engine is exposed beside the port because a second consumer needs the
 * same instance, not a second database: pg-boss runs inside this engine in
 * tests and in the zero-setup local path.
 */
export async function createPglite(): Promise<PgliteHandle> {
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
    // Bound to the same engine/transaction, so an ORM write joins transaction().
    orm: drizzle(tx, { schema }),
  });

  return {
    engine: pglite,
    db: {
      ...client(pglite),
      async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
        return pglite.transaction(async (tx) => fn(client(tx as unknown as PGlite)));
      },
      close: () => pglite.close(),
    },
  };
}

export async function createPgliteDb(): Promise<Db> {
  return (await createPglite()).db;
}
