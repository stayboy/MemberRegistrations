import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pino, { type Logger } from 'pino';
import { bearerAuth } from './auth.js';
import { errorHandler, notFoundHandler } from './errors/problem.js';
import { buildOpenApiDocument } from './openapi.js';
import { membersRouter } from './routes/members.js';
import type { MemberStore } from './store/member-store.js';

export interface AppOptions {
  store: MemberStore;
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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Number(process.uptime().toFixed(3)) });
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  const gate: RequestHandler = options.bearerToken
    ? bearerAuth(options.bearerToken)
    : (_req, _res, next) => next();

  app.use('/members', gate, membersRouter(options.store));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.logger = logger;
  return app;
}
