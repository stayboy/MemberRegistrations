import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { bearerAuth } from './auth.js';
import { errorHandler, notFoundHandler, sendProblem } from './errors/problem.js';
import { buildOpenApiDocument } from './openapi.js';
import { ImportRepository } from './repos/imports.js';
import { MemberRepository } from './repos/members.js';
import { MinistryRepository } from './repos/ministries.js';
import { SeriesRepository } from './repos/series.js';
import { importsRouter } from './routes/imports.js';
import { membersRouter } from './routes/members.js';
import { ministriesRouter } from './routes/ministries.js';
import { seriesRouter } from './routes/series.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import type { Db } from './db/sql.js';

export interface AppOptions {
  db: Db;
  bearerToken?: string;
  logger?: Logger;
  logLevel?: string;
}

/**
 * App factory — no listening side effects, so Supertest can exercise the real
 * middleware stack in-process.
 */
export function createApp(options: AppOptions): Express {
  const logger = options.logger ?? pino({ level: options.logLevel ?? 'info' });
  const app = express();

  const members = new MemberRepository(options.db);
  const ministries = new MinistryRepository(options.db);
  const series = new SeriesRepository(options.db);
  const imports = new ImportRepository(options.db);

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
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

  app.use('/v1/members', gate, membersRouter(members));
  app.use('/v1/subscriptions', gate, subscriptionsRouter(members));
  app.use('/v1/ministries', gate, ministriesRouter(ministries));
  app.use('/v1/series', gate, seriesRouter(series));
  app.use('/v1/imports', gate, importsRouter(imports));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.logger = logger;
  return app;
}
