import { Router } from 'express';
import { actorOf } from '../actor.js';
import { attendanceImportSchema, eventImportSchema } from '../schemas/imports.js';
import type { ImportRepository } from '../repos/imports.js';

export function importsRouter(repo: ImportRepository): Router {
  const router = Router();

  router.post('/events', async (req, res) => {
    const { rows } = eventImportSchema.parse(req.body);
    const batch = await repo.importEvents(rows, actorOf(req));
    res.status(201).json(batch);
  });

  router.post('/attendance', async (req, res) => {
    const { rows } = attendanceImportSchema.parse(req.body);
    const batch = await repo.importAttendance(rows, actorOf(req));
    res.status(201).json(batch);
  });

  router.get('/:batchId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await repo.getBatch(req.params.batchId));
  });

  return router;
}
