import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { sendProblem } from '../errors/problem.js';
import { PhotoTooLargeError, UnsupportedPhotoError } from '../errors/domain-errors.js';
import {
  isPhotoContentType,
  mediaTypeOf,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  sniffPhotoType,
} from '../domain/photos.js';
import { memberNoParamSchema } from '../schemas/common.js';
import {
  attendanceInputSchema,
  contactInputSchema,
  createMemberSchema,
  listQuerySchema,
  memberAttendanceWindowQuerySchema,
  ministryPositionInputSchema,
  purgeSchema,
  relationshipInputSchema,
  subscriptionInputSchema,
  updateMemberSchema,
} from '../schemas/members.js';
import { subscribeProductSchema } from '../schemas/subscriptions.js';
import type { MemberDetail, MemberRepository } from '../repos/members.js';
import type { SubscriptionRepository } from '../repos/subscriptions.js';

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

/**
 * Raw image bodies, capped at 2 MiB (MR-16). `express.raw` raises
 * `entity.too.large`; the wrapper turns it into the photo contract's 413 code
 * rather than the JSON parser's generic `payload_too_large`.
 */
const photoParser = express.raw({ type: [...PHOTO_CONTENT_TYPES], limit: PHOTO_MAX_BYTES });

function parsePhotoBody(req: Request, res: Response, next: NextFunction): void {
  photoParser(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === 'entity.too.large') {
      next(new PhotoTooLargeError());
      return;
    }
    next(error);
  });
}

/** A comma-separated `If-None-Match` matches the current tag, weak or exact. */
function matchesEtag(header: string | undefined, current: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === current || value === `W/${current}`);
}

/**
 * `<memberNo>-<photoUpdatedAt epoch ms>-<byte length>`, quoted as HTTP requires.
 * The length is part of the tag so two uploads that share a millisecond differ
 * when their byte lengths differ.
 */
function photoEtag(memberNo: string, updatedAt: string, byteLength: number): string {
  return `"${memberNo}-${new Date(updatedAt).getTime()}-${byteLength}"`;
}

export function membersRouter(
  repo: MemberRepository,
  subscriptions: SubscriptionRepository,
): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    if (query.guardianEligible) {
      // MR-40: the guardian picker's own projection, not a member page.
      const items = await repo.guardianCandidates(query.forMemberNo);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ items });
      return;
    }
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

  // -- photo (MR-14..MR-18) ------------------------------------------------

  router.put('/:memberNo/photo', parsePhotoBody, async (req, res) => {
    const no = memberNo(req);
    const contentType = mediaTypeOf(req.header('content-type'));
    if (!isPhotoContentType(contentType)) throw new UnsupportedPhotoError();
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (bytes.length === 0) {
      throw new UnsupportedPhotoError('The photo body is empty');
    }
    const sniffed = sniffPhotoType(bytes);
    if (sniffed === null || sniffed !== contentType) {
      throw new UnsupportedPhotoError(
        'The photo bytes are not a WebP, JPEG or PNG image matching the request content type',
      );
    }

    const photoUpdatedAt = await repo.setPhoto(no, bytes, sniffed);
    // MR-21: the log carries the member number and byte length, never the
    // bytes, the source filename or an EXIF value.
    const logger = req.app.locals.logger as
      { info: (fields: Record<string, unknown>, message: string) => void } | undefined;
    logger?.info({ memberNo: no, byteLength: bytes.length }, 'member photo stored');

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ photoUpdatedAt });
  });

  router.get('/:memberNo/photo', async (req, res) => {
    const photo = await repo.getPhoto(memberNo(req));
    if (!photo) {
      sendProblem(
        res,
        404,
        'Not Found',
        `Member ${req.params.memberNo} has no photo`,
        'photo_not_found',
      );
      return;
    }

    const tag = photoEtag(photo.memberNo, photo.updatedAt, photo.bytes.length);
    res.setHeader('ETag', tag);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (matchesEtag(req.header('if-none-match'), tag)) {
      res.status(304).end();
      return;
    }
    res.status(200).end(photo.bytes);
  });

  router.delete('/:memberNo/photo', async (req, res) => {
    await repo.clearPhoto(memberNo(req));
    res.status(204).end();
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

  router.get('/:memberNo/attendance/summary', async (req, res) => {
    const { from, to } = memberAttendanceWindowQuerySchema.parse(req.query);
    const summary = await repo.attendanceSummary(memberNo(req), from, to);
    res.setHeader('Cache-Control', 'no-store');
    res.json(summary);
  });

  router.get('/:memberNo/profile', async (req, res) => {
    const profile = await repo.profile(memberNo(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json(profile);
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

  router.get('/:memberNo/subscriptions', async (req, res) => {
    const items = await subscriptions.memberSubscriptions(memberNo(req));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items });
  });

  router.post('/:memberNo/subscriptions', async (req, res) => {
    if (req.body && typeof req.body.productCode === 'string') {
      const input = subscribeProductSchema.parse(req.body);
      const subscription = await subscriptions.subscribe(memberNo(req), input, actorOf(req));
      res.setHeader(
        'Location',
        `/v1/members/${encodeURIComponent(req.params.memberNo)}/subscriptions/${subscription.id}`,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json(subscription);
      return;
    }
    const input = subscriptionInputSchema.parse(req.body);
    const subscription = await repo.addSubscription(memberNo(req), input, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
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

  router.put('/:memberNo/ministries/:code', async (req, res) => {
    const { positionCode } = ministryPositionInputSchema.parse(req.body);
    const ministry = await repo.setMinistryPosition(
      memberNo(req),
      req.params.code,
      positionCode,
      actorOf(req),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json(ministry);
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
