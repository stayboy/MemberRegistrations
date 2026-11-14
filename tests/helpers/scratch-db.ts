import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPgDb } from '../../src/db/pg.js';
import type { Db } from '../../src/db/sql.js';

/**
 * A throwaway database on the scratch server named by `TEST_DATABASE_URL`.
 *
 * The pooled `pg` suites call `migrate()` and seed rows. On one shared database
 * that makes parallel test files race on the migration ledger and see each
 * other's rows in global aggregates, so each file takes a database of its own.
 */
export interface ScratchDatabase {
  connectionString: string;
  drop(): Promise<void>;
}

/** The database name is generated (never user input), so it is safe to inline. */
async function admin<T>(connectionString: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export async function createScratchDatabase(connectionString: string): Promise<ScratchDatabase> {
  const name = `pooled_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await admin(connectionString, (client) => client.query(`create database ${name}`));

  return {
    connectionString: withDatabase(connectionString, name),
    drop: async () => {
      await admin(connectionString, (client) =>
        client.query(`drop database if exists ${name} with (force)`),
      );
    },
  };
}

/** A pooled handle on a database of its own; `close()` drops the database. */
export async function createScratchPgDb(connectionString: string): Promise<Db> {
  const scratch = await createScratchDatabase(connectionString);
  const db = createPgDb(scratch.connectionString);

  return {
    ...db,
    async close(): Promise<void> {
      await db.close();
      await scratch.drop();
    },
  };
}
