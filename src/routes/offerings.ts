import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import {
  attachSchema,
  exceptionInputSchema,
  listQuerySchema,
  seriesAttachSchema,
  setActiveSchema,
  termsInputSchema,
  termsPublishSchema,
} from '../schemas/offerings.js';
import type { OfferingRepository } from '../repos/offerings.js';

const idSchema = z.string().uuid();

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function offeringLocation(id: string): string {
  return `/v1/offerings/${encodeURIComponent(id)}`;
}

function eventAttachmentLocation(eventId: string, offeringId: string): string {
  return `/v1/events/${encodeURIComponent(eventId)}/offerings/${encodeURIComponent(offeringId)}`;
}

function seriesAttachmentLocation(seriesId: string, offeringId: string): string {
  return `/v1/series/${encodeURIComponent(seriesId)}/offerings/${encodeURIComponent(offeringId)}`;
}

function actor(req: Request): string {
  return actorOf(req);
}

export function offeringsRouter(repo: OfferingRepository): Router {
  const router = Router();

  router.get('/offerings', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    noStore(res);
    res.json({ items: await repo.list(query) });
  });

  router.post('/offerings', async (req, res) => {
    const input = termsInputSchema.parse(req.body);
    const offering = await repo.create(input, actor(req));
    res.setHeader('Location', offeringLocation(offering.id));
    noStore(res);
    res.status(201).json(offering);
  });

  router.get('/offerings/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    noStore(res);
    res.json(await repo.get(id));
  });

  router.put('/offerings/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = setActiveSchema.parse(req.body);
    noStore(res);
    res.json(await repo.setActive(id, input.active, actor(req)));
  });

  router.get('/offerings/:id/terms', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    noStore(res);
    res.json({ items: await repo.listTerms(id) });
  });

  router.post('/offerings/:id/terms', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = termsPublishSchema.parse(req.body);
    const terms = await repo.publishTerms(id, input, actor(req));
    noStore(res);
    res.status(201).json(terms);
  });

  router.get('/events/:eventId/offerings', async (req, res) => {
    const eventId = idSchema.parse(req.params.eventId);
    noStore(res);
    res.json({ items: await repo.listEventAttachments(eventId) });
  });

  router.post('/events/:eventId/offerings', async (req, res) => {
    const eventId = idSchema.parse(req.params.eventId);
    const input = attachSchema.parse(req.body);
    const attachment = await repo.attachToEvent(eventId, input, actor(req));
    res.setHeader('Location', eventAttachmentLocation(eventId, input.offeringId));
    noStore(res);
    res.status(201).json(attachment);
  });

  router.delete('/events/:eventId/offerings/:offeringId', async (req, res) => {
    const eventId = idSchema.parse(req.params.eventId);
    const offeringId = idSchema.parse(req.params.offeringId);
    await repo.detachFromEvent(eventId, offeringId, actor(req));
    res.status(204).end();
  });

  router.get('/events/:eventId/offerings/:offeringId/exceptions', async (req, res) => {
    const eventId = idSchema.parse(req.params.eventId);
    const offeringId = idSchema.parse(req.params.offeringId);
    noStore(res);
    res.json({ items: await repo.listExceptions('event', eventId, offeringId) });
  });

  router.post('/events/:eventId/offerings/:offeringId/exceptions', async (req, res) => {
    const eventId = idSchema.parse(req.params.eventId);
    const offeringId = idSchema.parse(req.params.offeringId);
    const input = exceptionInputSchema.parse(req.body);
    const row = await repo.addException('event', eventId, offeringId, input, actor(req));
    res.setHeader(
      'Location',
      `${eventAttachmentLocation(eventId, offeringId)}/exceptions/${encodeURIComponent(row.id)}`,
    );
    noStore(res);
    res.status(201).json(row);
  });

  router.get('/series/:id/offerings', async (req, res) => {
    const seriesId = idSchema.parse(req.params.id);
    noStore(res);
    res.json({ items: await repo.listSeriesAttachments(seriesId) });
  });

  router.post('/series/:id/offerings', async (req, res) => {
    const seriesId = idSchema.parse(req.params.id);
    const input = seriesAttachSchema.parse(req.body);
    const attachment = await repo.attachToSeries(seriesId, input, actor(req));
    res.setHeader('Location', seriesAttachmentLocation(seriesId, input.offeringId));
    noStore(res);
    res.status(201).json(attachment);
  });

  router.delete('/series/:id/offerings/:offeringId', async (req, res) => {
    const seriesId = idSchema.parse(req.params.id);
    const offeringId = idSchema.parse(req.params.offeringId);
    await repo.detachFromSeries(seriesId, offeringId, actor(req));
    res.status(204).end();
  });

  router.get('/series/:id/offerings/:offeringId/exceptions', async (req, res) => {
    const seriesId = idSchema.parse(req.params.id);
    const offeringId = idSchema.parse(req.params.offeringId);
    noStore(res);
    res.json({ items: await repo.listExceptions('series', seriesId, offeringId) });
  });

  router.post('/series/:id/offerings/:offeringId/exceptions', async (req, res) => {
    const seriesId = idSchema.parse(req.params.id);
    const offeringId = idSchema.parse(req.params.offeringId);
    const input = exceptionInputSchema.parse(req.body);
    const row = await repo.addException('series', seriesId, offeringId, input, actor(req));
    res.setHeader(
      'Location',
      `${seriesAttachmentLocation(seriesId, offeringId)}/exceptions/${encodeURIComponent(row.id)}`,
    );
    noStore(res);
    res.status(201).json(row);
  });

  return router;
}
