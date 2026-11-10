import { loadEnv } from './config/env.js';
import { createMailer } from './authn/mailer.js';
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

const app = createApp({
  db,
  bearerToken: env.API_BEARER_TOKEN,
  logLevel: env.LOG_LEVEL,
  mailer: createMailer(env),
  authConfig: {
    magicLinkTtlMinutes: env.AUTH_MAGIC_LINK_TTL_MINUTES,
    sessionIdleMinutes: env.AUTH_SESSION_IDLE_MINUTES,
    sessionAbsoluteMinutes: env.AUTH_SESSION_ABSOLUTE_MINUTES,
    magicLinkBaseUrl: env.UI_BASE_URL,
  },
  corsOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  visitorPhonePepper: env.VISITOR_PHONE_PEPPER,
  paymentGatewaySecret: env.PAYMENT_GATEWAY_SECRET,
  paymentsEnabled: env.PAYMENTS_ENABLED,
  ussd: {
    enabled: env.USSD_ENABLED,
    gatewaySecret: env.USSD_GATEWAY_SECRET,
    phonePepper: env.USSD_PHONE_PEPPER,
    codePepper: env.USSD_CODE_PEPPER,
    naloUserId: env.USSD_NALO_USER_ID,
    naloMaxMsgChars: env.USSD_NALO_MAX_MSG_CHARS,
  },
});

if (process.env.VERCEL !== '1') {
  app.listen(env.PORT, () => {
    console.log(`MemberRegistrations API listening on http://localhost:${env.PORT}`);
  });
}

export default app;
