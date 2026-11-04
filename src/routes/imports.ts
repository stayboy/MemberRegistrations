import { Router } from 'express';
import { actorOf } from '../actor.js';
import { NotFoundError } from '../errors/domain-errors.js';
import { attendanceImportSchema, memberImportSchema } from '../schemas/imports.js';
import {
  buildImportTemplate,
  IMPORT_FORMATS,
  isImportKind,
  type ImportRepository,
} from '../repos/imports.js';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function importsRouter(repo: ImportRepository): Router {
  const router = Router();

  router.get('/formats', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ formats: IMPORT_FORMATS });
  });

  router.get('/templates/:kind', async (req, res) => {
    const { kind } = req.params;
    if (!isImportKind(kind)) {
      throw new NotFoundError(`Import kind ${kind} was not found`);
    }

    const { filename, buffer } = await buildImportTemplate(kind);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  });

  router.post('/members', async (req, res) => {
    const { rows } = memberImportSchema.parse(req.body);
    const batch = await repo.importMembers(rows, actorOf(req));
    res.status(201).json(batch);
  });

  router.post('/attendance', async (req, res) => {
    const request = attendanceImportSchema.parse(req.body);
    const batch = await repo.importAttendance(request, actorOf(req));
    res.status(201).json(batch);
  });

  router.get('/:batchId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await repo.getBatch(req.params.batchId));
  });

  return router;
}
