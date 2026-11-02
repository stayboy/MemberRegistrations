import { loadEnv } from './config/env.js';
import { createApp } from './create-app.js';
import { migrate } from './db/migrate.js';
import { createPgDb } from './db/pg.js';
import type { Db } from './db/sql.js';

const env = loadEnv();

let db: Db;
if (env.DATABASE_URL) {
  db = createPgDb(env.DATABASE_URL);
} else {
  // Zero-setup local development: a real Postgres compiled to WASM. Data is
  // ephemeral by design; production always supplies DATABASE_URL.
  const { createPgliteDb } = await import('./db/pglite.js');
  db = await createPgliteDb();
  await migrate(db);
}

const app = createApp({ db, bearerToken: env.API_BEARER_TOKEN, logLevel: env.LOG_LEVEL });

if (process.env.VERCEL !== '1') {
  app.listen(env.PORT, () => {
    console.log(`MemberRegistrations API listening on http://localhost:${env.PORT}`);
  });
}

export default app;
