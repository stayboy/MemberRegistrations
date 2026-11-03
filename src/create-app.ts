import express, { Router, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { bearerAuth } from './auth.js';
import { createMailer, type Mailer } from './authn/mailer.js';
import { authRouter, corsMiddleware, gatewayAuth } from './authn/router.js';
import { AuthService, DEFAULT_AUTH_CONFIG, type AuthConfig } from './authn/service.js';
import { DEFAULT_CORS_ORIGINS } from './config/env.js';
import { errorHandler, notFoundHandler, sendProblem } from './errors/problem.js';
import { buildOpenApiDocument } from './openapi.js';
import { AuthRepository } from './repos/auth.js';
import { ImportRepository } from './repos/imports.js';
import { MemberRepository } from './repos/members.js';
import { MinistryRepository } from './repos/ministries.js';
import { SeriesRepository } from './repos/series.js';
import { ShepherdingRepository } from './repos/shepherding.js';
import { importsRouter } from './routes/imports.js';
import { membersRouter } from './routes/members.js';
import { ministriesRouter } from './routes/ministries.js';
import { seriesRouter } from './routes/series.js';
import { memberShepherdingRouter, shepherdingRouter } from './routes/shepherding.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import type { Db } from './db/sql.js';

export interface AppOptions {
  db: Db;
  bearerToken?: string;
  logger?: Logger;
  logLevel?: string;
  mailer?: Mailer;
  authConfig?: Partial<AuthConfig>;
  corsOrigins?: string[];
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

  app.disable('x-powered-by');
  // Vercel appends the client address to X-Forwarded-For; trust one hop so a
  // client-supplied prefix cannot choose its own rate-limit IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

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

  const v1 = Router();
  v1.use('/members', membersRouter(members));
  v1.use('/members', memberShepherdingRouter(shepherding));
  v1.use('/subscriptions', subscriptionsRouter(members));
  v1.use('/ministries', ministriesRouter(ministries));
  v1.use('/series', seriesRouter(series));
  v1.use('/imports', importsRouter(imports));
  v1.use('/shepherding', shepherdingRouter(shepherding));

  app.use('/v1', gate, v1);

  // Browser routes: CORS first, so OPTIONS never reaches a session check.
  app.use('/auth', corsMiddleware(corsOrigins), authRouter(auth, mailer, logger));
  app.use('/gateway', corsMiddleware(corsOrigins));
  app.use('/gateway/v1', gatewayAuth(auth, options.bearerToken), v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.logger = logger;
  return app;
}
