import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { memberNoParamSchema } from '../schemas/common.js';
import {
  attendanceInputSchema,
  contactInputSchema,
  createMemberSchema,
  listQuerySchema,
  purgeSchema,
  relationshipInputSchema,
  subscriptionInputSchema,
  updateMemberSchema,
} from '../schemas/members.js';
import type { MemberDetail, MemberRepository } from '../repos/members.js';

function memberNo(req: Request): string {
  return memberNoParamSchema.parse(req.params.memberNo);
}

/** Wire ETags are quoted; the stored value is the row version. */
function etag(version: number): string {
  return `"v${version}"`;
}

function expectedVersion(req: Request): number | undefined {
  const header = req.header('if-match');
  if (!header || header.trim() === '*') return undefined;
  const match = /^"?v?(\d+)"?$/.exec(header.trim());
  return match ? Number(match[1]) : undefined;
}

function sendMember(res: Response, member: MemberDetail, status = 200): void {
  res.setHeader('ETag', etag(member.version));
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(member);
}

export function membersRouter(repo: MemberRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const page = await repo.list(query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(page);
  });

  router.post('/', async (req, res) => {
    const input = createMemberSchema.parse(req.body);
    const member = await repo.create(input, actorOf(req));
    res.setHeader('Location', `/v1/members/${encodeURIComponent(member.memberNo)}`);
    sendMember(res, member, 201);
  });

  router.get('/:memberNo', async (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    const member = await repo.get(memberNo(req), includeArchived);
    if (!member) {
      res
        .status(404)
        .type('application/problem+json')
        .json({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Member ${req.params.memberNo} was not found`,
          code: 'not_found',
        });
      return;
    }
    sendMember(res, member);
  });

  router.put('/:memberNo', async (req, res) => {
    const input = updateMemberSchema.parse(req.body);
    const member = await repo.update(memberNo(req), input, actorOf(req), expectedVersion(req));
    sendMember(res, member);
  });

  router.delete('/:memberNo', async (req, res) => {
    await repo.archive(memberNo(req), actorOf(req));
    res.status(204).end();
  });

  router.post('/:memberNo/restore', async (req, res) => {
    const member = await repo.restore(memberNo(req), actorOf(req));
    sendMember(res, member);
  });

  router.post('/:memberNo/purge', async (req, res) => {
    const { confirm } = purgeSchema.parse(req.body);
    await repo.purge(memberNo(req), confirm, actorOf(req));
    res.status(204).end();
  });

  router.get('/:memberNo/attendance', async (req, res) => {
    const series = await repo.getAttendance(memberNo(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ memberNo: req.params.memberNo, series });
  });

  router.get('/:memberNo/contributions/summary', async (req, res) => {
    const summary = await repo.contributionsSummary(memberNo(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(summary);
  });

  router.post('/:memberNo/attendance', async (req, res) => {
    const input = attendanceInputSchema.parse(req.body);
    const entry = await repo.recordAttendance(memberNo(req), input, actorOf(req));
    res.status(201).json(entry);
  });

  router.delete('/:memberNo/attendance/:attendanceId', async (req, res) => {
    await repo.deleteAttendance(memberNo(req), req.params.attendanceId, actorOf(req));
    res.status(204).end();
  });

  router.post('/:memberNo/contacts', async (req, res) => {
    const input = contactInputSchema.parse(req.body);
    const contact = await repo.addContact(memberNo(req), input, actorOf(req));
    res.status(201).json(contact);
  });

  router.put('/:memberNo/contacts/:contactId', async (req, res) => {
    const input = contactInputSchema.partial().parse(req.body);
    const contact = await repo.updateContact(
      memberNo(req),
      req.params.contactId,
      input,
      actorOf(req),
    );
    res.json(contact);
  });

  router.delete('/:memberNo/contacts/:contactId', async (req, res) => {
    await repo.removeContact(memberNo(req), req.params.contactId, actorOf(req));
    res.status(204).end();
  });

  router.post('/:memberNo/contacts/link', async (req, res) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.body);
    const contact = await repo.linkContact(memberNo(req), contactId, actorOf(req));
    res.status(201).json(contact);
  });

  router.delete('/:memberNo/contacts/link/:contactId', async (req, res) => {
    await repo.unlinkContact(memberNo(req), req.params.contactId, actorOf(req));
    res.status(204).end();
  });

  router.post('/:memberNo/subscriptions', async (req, res) => {
    const input = subscriptionInputSchema.parse(req.body);
    const subscription = await repo.addSubscription(memberNo(req), input, actorOf(req));
    res.status(201).json(subscription);
  });

  router.delete('/:memberNo/subscriptions/:subscriptionId', async (req, res) => {
    await repo.endSubscription(memberNo(req), req.params.subscriptionId, actorOf(req));
    res.status(204).end();
  });

  router.post('/:memberNo/ministries', async (req, res) => {
    const { code } = z.object({ code: z.string().min(2).max(16) }).parse(req.body);
    const ministry = await repo.assignMinistry(memberNo(req), code, actorOf(req));
    res.status(201).json(ministry);
  });

  router.delete('/:memberNo/ministries/:code', async (req, res) => {
    await repo.removeMinistry(memberNo(req), req.params.code, actorOf(req));
    res.status(204).end();
  });

  router.get('/:memberNo/relationships', async (req, res) => {
    const member = await repo.get(memberNo(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items: member?.relationships ?? [] });
  });

  router.post('/:memberNo/relationships', async (req, res) => {
    const input = relationshipInputSchema.parse(req.body);
    const relationship = await repo.addRelationship(memberNo(req), input, actorOf(req));
    res.status(201).json(relationship);
  });

  router.delete('/:memberNo/relationships/:relationshipId', async (req, res) => {
    await repo.removeRelationship(memberNo(req), req.params.relationshipId, actorOf(req));
    res.status(204).end();
  });

  return router;
}
