import { loadEnv } from '../config/env.js';
import { migrate } from './migrate.js';
import { createPgDb } from './pg.js';

/** Explicit migration step: `npm run db:migrate`. Never runs on request. */
const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run migrations');
  process.exit(1);
}

const db = createPgDb(env.DATABASE_URL);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await db.close();
}
