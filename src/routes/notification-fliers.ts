import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { FlierTooLargeError } from '../errors/domain-errors.js';
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from '../domain/photos.js';
import { sendProblem } from '../errors/problem.js';
import type { NotificationPlanRepository } from '../repos/notification-plans.js';

const eventIdSchema = z.string().uuid();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'the flier token is not well formed');

/**
 * Raw image bodies, capped at 2 MiB (N-9, FR-22). `express.raw` raises
 * `entity.too.large`; the wrapper turns it into the flier contract's 413 code
 * rather than the JSON parser's generic `payload_too_large`.
 */
const flierParser = express.raw({ type: [...PHOTO_CONTENT_TYPES], limit: PHOTO_MAX_BYTES });

function parseFlierBody(req: Request, res: Response, next: NextFunction): void {
  flierParser(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === 'entity.too.large') {
      next(new FlierTooLargeError());
      return;
    }
    next(error);
  });
}

/** The officer's flier verbs on an event; each one needs the bearer. */
export function notificationFliersRouter(repo: NotificationPlanRepository): Router {
  const router = Router();

  router.put('/:eventId/flier', parseFlierBody, async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const actor = actorOf(req);
    const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
    const flier = await repo.writeFlier(eventId, bytes, req.header('content-type') ?? '', actor);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(flier);
  });

  router.get('/:eventId/flier', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    const flier = await repo.readFlier(eventId);
    if (!flier) {
      sendProblem(res, 404, 'Not Found', `Event ${eventId} has no flier`, 'flier_not_found');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(flier);
  });

  router.delete('/:eventId/flier', async (req, res) => {
    const eventId = eventIdSchema.parse(req.params.eventId);
    await repo.deleteFlier(eventId, actorOf(req));
    res.status(204).end();
  });

  return router;
}

/**
 * The public, unauthenticated image (N-9): outside `/v1`, as `/ussd/*` is, and
 * immutable because a token names one object for ever. The app streams from the
 * configured store, so no bucket is ever exposed directly.
 */
export function publicFliersRouter(repo: NotificationPlanRepository): Router {
  const router = Router();

  router.get('/:token', async (req, res) => {
    const parsed = tokenSchema.safeParse(req.params.token);
    if (!parsed.success) {
      sendProblem(res, 404, 'Not Found', 'No flier has that token', 'flier_not_found');
      return;
    }
    const flier = await repo.loadFlier(parsed.data);
    if (!flier) {
      sendProblem(res, 404, 'Not Found', 'No flier has that token', 'flier_not_found');
      return;
    }
    res.setHeader('Content-Type', flier.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // Helmet's default is `same-origin`, which would stop a mail client from
    // rendering the poster it was sent; this asset is public and image-only.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200).end(Buffer.from(flier.bytes));
  });

  return router;
}
