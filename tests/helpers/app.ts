import pino from 'pino';
import type { Express } from 'express';
import { createApp } from '../../src/create-app.js';
import type { Mailer } from '../../src/authn/mailer.js';
import { NullMailer } from '../../src/authn/mailer.js';
import type { AuthConfig } from '../../src/authn/service.js';
import type { PaymentGateway } from '../../src/payments/gateway.js';
import { migrate } from '../../src/db/migrate.js';
import { createPgliteDb } from '../../src/db/pglite.js';
import type { Db } from '../../src/db/sql.js';

export const TOKEN = 'test-token-please-change';

export interface TestApp {
  app: Express;
  db: Db;
  close(): Promise<void>;
}

export interface TestAppOptions {
  mailer?: Mailer;
  authConfig?: Partial<AuthConfig>;
  corsOrigins?: string[];
  paymentGateway?: PaymentGateway;
  paymentGatewaySecret?: string;
  visitorPhonePepper?: string;
  ussd?: {
    enabled?: boolean;
    gatewaySecret?: string;
    phonePepper?: string;
    codePepper?: string;
    naloUserId?: string;
    naloMaxMsgChars?: number;
  };
}

/** Real app, real Postgres semantics (PGlite), no mocking of the database. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const db = await createPgliteDb();
  await migrate(db);
  const { ussd, ...rest } = options;
  const app = createApp({
    db,
    bearerToken: TOKEN,
    logger: pino({ level: 'silent' }),
    mailer: options.mailer ?? new NullMailer(),
    ...rest,
    // USSD is on for tests unless a test asks for the disabled wiring.
    ussd: { enabled: true, ...ussd },
  });
  return { app, db, close: () => db.close() };
}

/** The same real app with USSD off, for the 503 gate. */
export async function createDisabledUssdTestApp(db?: Db): Promise<TestApp> {
  if (db) {
    // Reuse an existing PGlite instance; the caller owns its lifetime.
    const app = createApp({
      db,
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
      mailer: new NullMailer(),
      ussd: { enabled: false },
    });
    return { app, db, close: async () => {} };
  }
  return createTestApp({ ussd: { enabled: false } });
}

export const writeHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'X-Actor-Id': 'test-admin',
};

export const readHeaders = {
  Authorization: `Bearer ${TOKEN}`,
};
