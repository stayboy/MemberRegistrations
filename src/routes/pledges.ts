import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import type { PledgeRepository } from '../repos/pledges.js';
import { assertDate } from '../domain/contacts.js';
import {
  addReminderSchema,
  createPledgeSchema,
  dishonorSchema,
  honorSchema,
  listPledgesQuerySchema,
  reassignSchema,
  settleSchema,
} from '../schemas/pledges.js';

const idSchema = z.string().uuid();

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

function actor(req: Request): string {
  return actorOf(req);
}

function pledgeLocation(id: string): string {
  return `/v1/pledges/${encodeURIComponent(id)}`;
}

export function pledgesRouter(repo: PledgeRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listPledgesQuerySchema.parse(req.query);
    const from = query.from ? assertDate(query.from, 'from') : undefined;
    const to = query.to ? assertDate(query.to, 'to') : undefined;
    noStore(res);
    res.json(await repo.list({ ...query, from, to }));
  });

  router.post('/', async (req, res) => {
    const input = createPledgeSchema.parse(req.body);
    const result = await repo.create(input, actor(req));
    noStore(res);
    if (result.created) res.setHeader('Location', pledgeLocation(result.pledge.id));
    res.status(result.created ? 201 : 200).json(result.pledge);
  });

  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    noStore(res);
    res.json(await repo.getById(id));
  });

  router.post('/:id/honor', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    honorSchema.parse(req.body ?? {});
    noStore(res);
    res.json(await repo.honor(id, actor(req)));
  });

  router.post('/:id/settle', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = settleSchema.parse(req.body);
    noStore(res);
    res.json(await repo.settle(id, input.contributionId, actor(req)));
  });

  router.post('/:id/dishonor', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = dishonorSchema.parse(req.body);
    noStore(res);
    res.json(await repo.dishonor(id, input.reason, actor(req)));
  });

  router.post('/:id/reassign', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = reassignSchema.parse(req.body);
    noStore(res);
    res.json(await repo.reassign(id, input.officerMemberNo, input.reason, actor(req)));
  });

  router.get('/:id/reminders', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    noStore(res);
    res.json({ items: await repo.listReminders(id) });
  });

  router.post('/:id/reminders', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = addReminderSchema.parse(req.body);
    const reminder = await repo.addReminder(id, input, actor(req));
    res.setHeader('Location', `${pledgeLocation(id)}/reminders/${encodeURIComponent(reminder.id)}`);
    noStore(res);
    res.status(201).json(reminder);
  });

  return router;
}
