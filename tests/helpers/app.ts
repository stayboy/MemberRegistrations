import pino from 'pino';
import type { Express } from 'express';
import { createApp } from '../../src/create-app.js';
import { migrate } from '../../src/db/migrate.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';

export const TOKEN = 'test-token-please-change';

export interface TestApp {
  app: Express;
  db: Db;
  close(): Promise<void>;
}

/** Real app, real Postgres semantics (PGlite), no mocking of the database. */
export async function createTestApp(): Promise<TestApp> {
  const db = await createPgliteDb();
  await migrate(db);
  const app = createApp({
    db,
    bearerToken: TOKEN,
    logger: pino({ level: 'silent' }),
  });
  return { app, db, close: () => db.close() };
}

export const writeHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'X-Actor-Id': 'test-admin',
};

export const readHeaders = {
  Authorization: `Bearer ${TOKEN}`,
};
