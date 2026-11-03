import { waitUntil } from '@vercel/functions';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Logger } from 'pino';
import { UnauthorizedError } from '../errors/domain-errors.js';
import { sendProblem } from '../errors/problem.js';
import { exchangeRequestSchema, magicLinkRequestSchema } from '../schemas/auth.js';
import type { Mailer } from './mailer.js';
import type { AuthService } from './service.js';

const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_MINUTES = 15;

/** Keep serverless functions alive after the response; no-op locally. */
function inBackground(task: Promise<void>): void {
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

export function sessionTokenOf(req: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '');
  return match?.[1]?.trim() || null;
}

/**
 * CORS is scoped to the browser routes. Preflight runs before any session
 * check, because a browser does not send Authorization on OPTIONS.
 */
export function corsMiddleware(origins: readonly string[]): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Vary', 'Origin');
    const origin = req.header('origin');

    if (!origin) {
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
      return;
    }

    if (!origins.includes(origin)) {
      if (req.method === 'OPTIONS') {
        res.status(403).end();
        return;
      }
      sendProblem(res, 403, 'Forbidden', 'This origin is not allowed.', 'cors_rejected');
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
    res.setHeader('Access-Control-Expose-Headers', 'ETag, Location');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function authRouter(service: AuthService, mailer: Mailer, logger: Logger): Router {
  const router = Router();

  router.post('/magic-link', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { email } = magicLinkRequestSchema.parse(req.body);
    const normalized = email.trim().toLowerCase();
    const ip = req.ip ?? 'unknown';

    const withinEmail = await service.consumeRateLimit(
      `email:${normalized}`,
      EMAIL_LIMIT,
      WINDOW_MINUTES,
    );
    const withinIp = await service.consumeRateLimit(`ip:${ip}`, IP_LIMIT, WINDOW_MINUTES);

    if (withinEmail && withinIp) {
      const link = await service.requestLink(normalized);
      if (link) {
        const delivery = mailer
          .sendMagicLink({
            to: link.officer.email,
            link: service.magicLinkUrl(link.token),
            expiresInMinutes: link.expiresInMinutes,
          })
          .catch((error: unknown) => {
            logger.warn({ err: error }, 'magic link delivery failed');
          });
        // Delivery must not shape the response, or timing reveals whether the
        // address belongs to an active officer.
        inBackground(delivery);
      }
    }

    // Same status and body for known, unknown, inactive and rate-limited addresses.
    res.status(202).json({ status: 'accepted' });
  });

  router.post('/exchange', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { token } = exchangeRequestSchema.parse(req.body);
    const session = await service.exchange(token);
    if (!session) throw new UnauthorizedError('The sign-in link is invalid or has expired.');

    res.json({
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      officer: session.officer,
    });
  });

  router.get('/me', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = sessionTokenOf(req);
    const session = token ? await service.authenticate(token) : null;
    if (!session) throw new UnauthorizedError('The session is invalid or has expired.');

    res.json({
      officerId: session.officer.id,
      name: session.officer.name,
      email: session.officer.email,
      actorId: session.officer.actorId,
      expiresAt: session.expiresAt,
    });
  });

  router.post('/logout', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = sessionTokenOf(req);
    if (token) await service.logout(token);
    res.status(204).end();
  });

  return router;
}

/**
 * Validates the browser session, then swaps it for the server-side API bearer
 * and the derived actor. Downstream routers see a normal authenticated call.
 */
export function gatewayAuth(service: AuthService, bearerToken?: string): RequestHandler {
  return async (req: Request, res: Response, next) => {
    const token = sessionTokenOf(req);
    const session = token ? await service.authenticate(token) : null;
    if (!session) throw new UnauthorizedError('The session is invalid or has expired.');

    if (bearerToken) req.headers.authorization = `Bearer ${bearerToken}`;
    else delete req.headers.authorization;
    req.headers['x-actor-id'] = session.officer.actorId;
    res.locals.session = session;
    next();
  };
}
