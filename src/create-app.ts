import express, { Router, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { bearerAuth } from './auth.js';
import { createMailer, type Mailer } from './authn/mailer.js';
import { authRouter, corsMiddleware, gatewayAuth } from './authn/router.js';
import { AuthService, DEFAULT_AUTH_CONFIG, type AuthConfig } from './authn/service.js';
import {
  DEFAULT_CORS_ORIGINS,
  DEFAULT_PAYMENT_GATEWAY_SECRET,
  DEFAULT_USSD_CODE_PEPPER,
  DEFAULT_USSD_GATEWAY_SECRET,
  DEFAULT_USSD_NALO_MAX_MSG_CHARS,
  DEFAULT_USSD_NALO_USER_ID,
  DEFAULT_USSD_PHONE_PEPPER,
  DEFAULT_VISITOR_PHONE_PEPPER,
} from './config/env.js';
import { errorHandler, notFoundHandler, sendProblem } from './errors/problem.js';
import { buildOpenApiDocument } from './openapi.js';
import { StubPaymentGateway, type PaymentGateway } from './payments/gateway.js';
import { AttendanceCodeRepository } from './repos/attendance-codes.js';
import { AuthRepository } from './repos/auth.js';
import { ClockingRepository } from './repos/clocking.js';
import { ContributionRepository } from './repos/contributions.js';
import { EventRepository } from './repos/events.js';
import { HeadcountRepository } from './repos/headcounts.js';
import { ImportRepository } from './repos/imports.js';
import { MemberRepository } from './repos/members.js';
import { RegistrationRequestRepository } from './repos/registration-requests.js';
import { MinistryRepository } from './repos/ministries.js';
import { OfferingRepository } from './repos/offerings.js';
import { PaymentGroupRepository } from './repos/payment-groups.js';
import { PledgeRepository } from './repos/pledges.js';
import { SeriesRepository } from './repos/series.js';
import { ShepherdingRepository } from './repos/shepherding.js';
import { SubscriptionProductRepository } from './repos/subscription-products.js';
import { SubscriptionRepository } from './repos/subscriptions.js';
import { UssdRepository } from './repos/ussd.js';
import { attendanceCodesRouter } from './routes/attendance-codes.js';
import { contributionsRouter } from './routes/contributions.js';
import { eventsRouter } from './routes/events.js';
import { importsRouter } from './routes/imports.js';
import { membersRouter } from './routes/members.js';
import { ministriesRouter } from './routes/ministries.js';
import { offeringsRouter } from './routes/offerings.js';
import { paymentGroupsRouter } from './routes/payment-groups.js';
import { paymentsRouter } from './routes/payments.js';
import { pledgesRouter } from './routes/pledges.js';
import { registrationRequestsRouter } from './routes/registration-requests.js';
import { seriesRouter } from './routes/series.js';
import { memberShepherdingRouter, shepherdingRouter } from './routes/shepherding.js';
import { subscriptionProductsRouter } from './routes/subscription-products.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { devUssdRouter } from './routes/dev-ussd.js';
import { ussdRouter } from './routes/ussd.js';
import { buildUssdAdapters } from './ussd/adapters.js';
import { createUssdServices } from './ussd/services.js';
import type { Db } from './db/sql.js';

export interface AppOptions {
  db: Db;
  bearerToken?: string;
  logger?: Logger;
  logLevel?: string;
  mailer?: Mailer;
  authConfig?: Partial<AuthConfig>;
  corsOrigins?: string[];
  visitorPhonePepper?: string;
  /** Tests inject a fake; the default is the in-process stub. */
  paymentGateway?: PaymentGateway;
  paymentGatewaySecret?: string;
  ussd?: {
    enabled?: boolean;
    gatewaySecret?: string;
    phonePepper?: string;
    codePepper?: string;
    naloUserId?: string;
    naloMaxMsgChars?: number;
  };
}

/**
 * App factory - no listening side effects, so Supertest can exercise the real
 * middleware stack in-process.
 */
export function createApp(options: AppOptions): Express {
  const logger = options.logger ?? pino({ level: options.logLevel ?? 'info' });
  const app = express();

  const members = new MemberRepository(options.db);
  const ministries = new MinistryRepository(options.db);
  const series = new SeriesRepository(options.db);
  const imports = new ImportRepository(options.db);
  const shepherding = new ShepherdingRepository(options.db);
  const events = new EventRepository(options.db);
  const headcounts = new HeadcountRepository(options.db);
  const offerings = new OfferingRepository(options.db);
  const visitorPhonePepper = options.visitorPhonePepper ?? DEFAULT_VISITOR_PHONE_PEPPER;
  const contributions = new ContributionRepository(options.db, visitorPhonePepper);
  const pledges = new PledgeRepository(options.db);
  const gateway = options.paymentGateway ?? new StubPaymentGateway();
  const paymentGroups = new PaymentGroupRepository(
    options.db,
    contributions,
    gateway,
    visitorPhonePepper,
  );
  const ussdRepository = new UssdRepository(options.db);
  const subscriptionProducts = new SubscriptionProductRepository(options.db);
  const subscriptions = new SubscriptionRepository(options.db);

  const authConfig: AuthConfig = { ...DEFAULT_AUTH_CONFIG, ...options.authConfig };
  const auth = new AuthService(new AuthRepository(options.db), authConfig);
  const mailer =
    options.mailer ??
    createMailer({
      NODE_ENV: process.env.NODE_ENV,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      MAGIC_LINK_FROM: process.env.MAGIC_LINK_FROM,
    });
  const corsOrigins =
    options.corsOrigins ??
    (process.env.CORS_ALLOWED_ORIGINS ?? DEFAULT_CORS_ORIGINS)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  const paymentGatewaySecret =
    options.paymentGatewaySecret ??
    process.env.PAYMENT_GATEWAY_SECRET ??
    DEFAULT_PAYMENT_GATEWAY_SECRET;
  const ussd = {
    enabled: options.ussd?.enabled ?? process.env.USSD_ENABLED === 'true',
    gatewaySecret:
      options.ussd?.gatewaySecret ?? process.env.USSD_GATEWAY_SECRET ?? DEFAULT_USSD_GATEWAY_SECRET,
    phonePepper:
      options.ussd?.phonePepper ?? process.env.USSD_PHONE_PEPPER ?? DEFAULT_USSD_PHONE_PEPPER,
    codePepper:
      options.ussd?.codePepper ?? process.env.USSD_CODE_PEPPER ?? DEFAULT_USSD_CODE_PEPPER,
    naloUserId:
      options.ussd?.naloUserId ?? process.env.USSD_NALO_USER_ID ?? DEFAULT_USSD_NALO_USER_ID,
    naloMaxMsgChars:
      options.ussd?.naloMaxMsgChars ??
      Number(process.env.USSD_NALO_MAX_MSG_CHARS ?? DEFAULT_USSD_NALO_MAX_MSG_CHARS),
  };
  const attendanceCodes = new AttendanceCodeRepository(options.db, ussd.codePepper);
  const registrationRequests = new RegistrationRequestRepository(options.db, members);
  const clocking = new ClockingRepository(options.db);
  const ussdServices = createUssdServices({
    db: options.db,
    members,
    offerings,
    pledges,
    paymentGroups,
    events,
    headcounts,
    attendanceCodes,
    clocking,
    subscriptionProducts,
    subscriptions,
  });

  app.disable('x-powered-by');
  // Vercel appends the client address to X-Forwarded-For; trust one hop so a
  // client-supplied prefix cannot choose its own rate-limit IP.
  app.set('trust proxy', 1);
  app.use(helmet());

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    // Capture before routing: a mounted router trims its prefix from req.url,
    // and the finish callback can run while that trimmed value is still set.
    const path = req.originalUrl.split('?')[0];
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path,
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        },
        'request completed',
      );
    });
    next();
  });

  // The USSD aggregator HMAC covers the exact raw frame. The provider routes
  // are mounted outside the bearer namespace and before the global JSON parser.
  const ussdAdapters = buildUssdAdapters({
    repo: ussdRepository,
    gatewaySecret: ussd.gatewaySecret,
    naloUserId: ussd.naloUserId,
    naloMaxMsgChars: ussd.naloMaxMsgChars,
  });
  const ussdDeps = {
    repo: ussdRepository,
    services: ussdServices,
    phonePepper: ussd.phonePepper,
  };
  app.use('/ussd', express.raw({ type: 'application/json', limit: '64kb' }));
  app.use(ussdRouter(ussdAdapters, ussdDeps, { enabled: ussd.enabled }));

  // The dev-only simulator gateway builds the provider wire server-side. It is
  // registered before the global JSON parser so its production refusal cannot
  // be pre-empted by a body-parse error.
  app.use(
    devUssdRouter(ussdAdapters, ussdDeps, {
      enabled: ussd.enabled,
      gatewaySecret: ussd.gatewaySecret,
      naloUserId: ussd.naloUserId,
    }),
  );

  // The callback HMAC covers the exact raw body, so this route is mounted
  // before the global JSON parser and before the bearer gate.
  app.use('/v1/payments/callback', express.raw({ type: 'application/json', limit: '256kb' }));
  app.use('/v1/payments', paymentsRouter(paymentGroups, paymentGatewaySecret));

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    try {
      await options.db.query('select 1');
      res.json({ status: 'ok', uptimeSeconds: Number(process.uptime().toFixed(3)) });
    } catch {
      sendProblem(
        res,
        503,
        'Service Unavailable',
        'The database is unreachable.',
        'database_unavailable',
      );
    }
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  const gate: RequestHandler = options.bearerToken
    ? bearerAuth(options.bearerToken)
    : (_req, _res, next) => next();

  const contributionsRoutes = contributionsRouter(contributions);
  // Registered before any contribution id route so `groups` is never read as an id.
  contributionsRoutes.use('/groups', paymentGroupsRouter(paymentGroups));

  const v1 = Router();
  // Mounted at the root so it owns both /offerings and the event/series
  // attachment paths without a second router for each parent.
  v1.use(offeringsRouter(offerings));
  v1.use('/contributions', contributionsRoutes);
  v1.use('/pledges', pledgesRouter(pledges));
  v1.use('/members', membersRouter(members, subscriptions));
  v1.use('/members', memberShepherdingRouter(shepherding));
  v1.use('/subscriptions', subscriptionsRouter(subscriptions));
  v1.use('/subscription-products', subscriptionProductsRouter(subscriptionProducts));
  v1.use('/ministries', ministriesRouter(ministries));
  v1.use('/series', seriesRouter(series));
  v1.use('/imports', importsRouter(imports));
  // Registered before /events so /events/:eventId/codes reaches this router.
  v1.use(attendanceCodesRouter(attendanceCodes));
  v1.use('/events', eventsRouter(events, clocking, headcounts));
  v1.use('/registration-requests', registrationRequestsRouter(registrationRequests));
  v1.use('/shepherding', shepherdingRouter(shepherding));

  app.use('/v1', gate, v1);

  // Browser routes: CORS first, so OPTIONS never reaches a session check.
  app.use('/auth', corsMiddleware(corsOrigins), authRouter(auth, mailer, logger));
  app.use('/gateway', corsMiddleware(corsOrigins));
  app.use('/gateway/v1', gatewayAuth(auth, options.bearerToken), v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.logger = logger;
  app.locals.ussd = ussd;
  return app;
}
