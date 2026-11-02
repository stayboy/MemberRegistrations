import { createApp } from './create-app.js';
import { loadEnv } from './config/env.js';
import { createMemberStore } from './store/factory.js';

try {
  // Node >= 20.6: load `.env` for local development; absent in production.
  process.loadEnvFile();
} catch {
  // No `.env` file — environment comes from the process (Vercel).
}

const env = loadEnv();

const app = createApp({
  store: createMemberStore(env),
  bearerToken: env.API_BEARER_TOKEN,
  logLevel: env.LOG_LEVEL,
});

// Vercel's zero-config Express support consumes the default export; only bind a
// socket when running as a normal long-lived Node process (local dev, Docker).
export default app;

if (process.env.VERCEL !== '1') {
  app.listen(env.PORT, () => {
    console.log(`MemberRegistrations API listening on http://localhost:${env.PORT}`);
  });
}
