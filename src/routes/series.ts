import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { NotFoundError } from '../errors/domain-errors.js';
import { dateStringSchema } from '../schemas/common.js';
import {
  createSeriesSchema,
  scheduleInputSchema,
  seriesExceptionInputSchema,
  updateSeriesSchema,
} from '../schemas/reference.js';
import type { SeriesRepository } from '../repos/series.js';

export function seriesRouter(repo: SeriesRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: await repo.list(includeArchived) });
  });

  router.post('/', async (req, res) => {
    const input = createSeriesSchema.parse(req.body);
    const created = await repo.create(
      {
        name: input.name,
        ministryCode: input.ministryCode ?? null,
        presbyterOnly: input.presbyterOnly,
        timezone: input.timezone,
        description: input.description ?? null,
        effectiveFrom: input.schedule.effectiveFrom,
        rrule: input.schedule.rrule,
        endsOn: input.schedule.endsOn ?? null,
      },
      actorOf(req),
    );
    res.status(201).json(created);
  });

  router.get('/:id', async (req, res) => {
    const series = await repo.get(req.params.id);
    if (!series) throw new NotFoundError(`Series ${req.params.id} was not found`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(series);
  });

  router.put('/:id', async (req, res) => {
    const input = updateSeriesSchema.parse(req.body);
    res.json(await repo.update(req.params.id, input, actorOf(req)));
  });

  router.post('/:id/schedule', async (req, res) => {
    const input = scheduleInputSchema.parse(req.body);
    res.status(201).json(
      await repo.addSchedule(
        req.params.id,
        {
          effectiveFrom: input.effectiveFrom,
          rrule: input.rrule,
          endsOn: input.endsOn ?? null,
        },
        actorOf(req),
      ),
    );
  });

  router.post('/:id/exceptions', async (req, res) => {
    const input = seriesExceptionInputSchema.parse(req.body);
    res.status(201).json(await repo.setException(req.params.id, input, actorOf(req)));
  });

  router.delete('/:id/exceptions/:date', async (req, res) => {
    const date = dateStringSchema.parse(req.params.date);
    actorOf(req);
    await repo.removeException(req.params.id, date);
    res.status(204).end();
  });

  router.get('/:id/occurrences', async (req, res) => {
    const query = z.object({ from: dateStringSchema, to: dateStringSchema }).parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      seriesId: req.params.id,
      from: query.from,
      to: query.to,
      dates: await repo.occurrences(req.params.id, query.from, query.to),
    });
  });

  return router;
}
