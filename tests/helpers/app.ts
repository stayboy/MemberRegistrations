import pino from 'pino';
import type { Logger } from 'pino';
import type { Express } from 'express';
import { createApp } from '../../src/create-app.js';
import type { Mailer } from '../../src/authn/mailer.js';
import { NullMailer } from '../../src/authn/mailer.js';
import type { EmailSender, MessageSender, Senders } from '../../src/messaging/senders.js';
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
  /** A test that inspects a log line injects its own sink; the default is silent. */
  logger?: Logger;
  authConfig?: Partial<AuthConfig>;
  corsOrigins?: string[];
  paymentGateway?: PaymentGateway;
  paymentGatewaySecret?: string;
  paymentsEnabled?: boolean;
  visitorPhonePepper?: string;
  /** Verification delivery: `null` sends nothing, so the default app answers 503. */
  senders?: Senders;
  verification?: {
    otpPepper?: string;
    countryCode?: string;
  };
  ussd?: {
    enabled?: boolean;
    gatewaySecret?: string;
    phonePepper?: string;
    codePepper?: string;
    naloUserId?: string;
    naloMaxMsgChars?: number;
  };
}

/** A message one of the capturing senders received; the code is in `body`. */
export interface CapturedMessage {
  channel: 'whatsapp' | 'sms';
  to: string;
  body: string;
}

export interface CapturedEmail {
  to: string;
  subject: string;
  body: string;
}

export interface CapturingSenders {
  senders: Senders;
  messages: CapturedMessage[];
  emails: CapturedEmail[];
}

/** Three configured senders that record what they were asked to deliver. */
export function capturingSenders(): CapturingSenders {
  const messages: CapturedMessage[] = [];
  const emails: CapturedEmail[] = [];

  const messageSender = (channel: 'whatsapp' | 'sms'): MessageSender => ({
    async send(to: string, body: string): Promise<void> {
      messages.push({ channel, to, body });
    },
  });
  const emailSender: EmailSender = {
    async send(to: string, subject: string, body: string): Promise<void> {
      emails.push({ to, subject, body });
    },
  };

  return {
    senders: {
      whatsapp: messageSender('whatsapp'),
      sms: messageSender('sms'),
      email: emailSender,
    },
    messages,
    emails,
  };
}

/** Real app, real Postgres semantics (PGlite), no mocking of the database. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const db = await createPgliteDb();
  await migrate(db);
  const { ussd, paymentsEnabled, senders, verification, ...rest } = options;
  const app = createApp({
    db,
    bearerToken: TOKEN,
    logger: options.logger ?? pino({ level: 'silent' }),
    mailer: options.mailer ?? new NullMailer(),
    ...rest,
    // The default app has no verification sender at all, so a test that wants a
    // send injects `capturingSenders()` and the 503 is the default behaviour.
    senders: senders ?? { whatsapp: null, email: null, sms: null },
    verification,
    // USSD and the payment callback are on for tests unless a test asks for
    // the disabled wiring.
    ussd: { enabled: true, ...ussd },
    paymentsEnabled: paymentsEnabled ?? true,
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

/** The same real app with the payment callback unmounted, for the 404 gate. */
export async function createDisabledPaymentsTestApp(db?: Db): Promise<TestApp> {
  if (db) {
    // Reuse an existing PGlite instance; the caller owns its lifetime.
    const app = createApp({
      db,
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
      mailer: new NullMailer(),
      paymentsEnabled: false,
    });
    return { app, db, close: async () => {} };
  }
  return createTestApp({ paymentsEnabled: false });
}

export const writeHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'X-Actor-Id': 'test-admin',
};

export const readHeaders = {
  Authorization: `Bearer ${TOKEN}`,
};
