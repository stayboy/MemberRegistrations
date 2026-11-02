import { Router, type Response } from 'express';
import {
  Member,
  MINISTRIES,
  type Ministry,
  SUBSCRIPTION_KINDS,
  type SubscriptionKind,
} from '../domain/member.js';
import { NotFoundError, ValidationError } from '../errors/domain-errors.js';
import {
  attendanceEntrySchema,
  contactInputSchema,
  createMemberSchema,
  updateMemberSchema,
} from '../schemas/member.js';
import {
  listQuerySchema,
  ministryRequestSchema,
  subscriptionRequestSchema,
} from '../schemas/api.js';
import type { MemberStore, StoredMember } from '../store/member-store.js';

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

function assertMemberNo(value: string): string {
  if (!MEMBER_NO_PATTERN.test(value)) {
    throw new ValidationError(
      'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
    );
  }
  return value;
}

/** ETags travel quoted on the wire; the stores hold the raw value. */
function toEtag(raw: string): string {
  return `"${raw.replace(/"/g, '')}"`;
}

function fromIfMatch(header: string | undefined): string | undefined {
  if (!header) return undefined;
  // `If-Match: *` means "only if it exists"; the store already loaded it.
  if (header.trim() === '*') return undefined;
  const normalized = header.replace(/^W\//, '').replace(/"/g, '').trim();
  return normalized || undefined;
}

async function requireMember(store: MemberStore, memberNo: string): Promise<StoredMember> {
  const stored = await store.get(memberNo);
  if (!stored) throw new NotFoundError(`Member ${memberNo} was not found`);
  return stored;
}

function sendMember(res: Response, stored: StoredMember, status = 200): void {
  res.setHeader('ETag', toEtag(stored.etag));
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(stored.member.toJSON());
}

/**
 * Thin HTTP layer: parse input, delegate the decision to the aggregate, persist
 * the result. Domain errors bubble to the problem+json error middleware.
 */
export function membersRouter(store: MemberStore): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const page = await store.list(query);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      items: page.items.map((item) => item.member.toJSON()),
      ...(page.cursor ? { nextCursor: page.cursor } : {}),
    });
  });

  router.post('/', async (req, res) => {
    const input = createMemberSchema.parse(req.body);
    const member = Member.create(input);
    const stored = await store.insert(member);

    res.setHeader('Location', `/members/${encodeURIComponent(member.memberNo)}`);
    sendMember(res, stored, 201);
  });

  router.get('/:memberNo', async (req, res) => {
    const stored = await requireMember(store, assertMemberNo(req.params.memberNo));
    sendMember(res, stored);
  });

  router.put('/:memberNo', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const input = updateMemberSchema.parse(req.body);
    const current = await requireMember(store, memberNo);

    current.member.update(input);
    const stored = await store.replace(
      current.member,
      fromIfMatch(req.header('if-match')) ?? current.etag,
    );
    sendMember(res, stored);
  });

  router.delete('/:memberNo', async (req, res) => {
    const deleted = await store.delete(assertMemberNo(req.params.memberNo));
    if (!deleted) throw new NotFoundError(`Member ${req.params.memberNo} was not found`);
    res.status(204).end();
  });

  router.get('/:memberNo/attendance', async (req, res) => {
    const stored = await requireMember(store, assertMemberNo(req.params.memberNo));

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      memberNo: stored.member.memberNo,
      entries: stored.member.attendance,
      summary: stored.member.attendanceSummary(),
    });
  });

  router.post('/:memberNo/attendance', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const entry = attendanceEntrySchema.parse(req.body);
    const current = await requireMember(store, memberNo);

    current.member.recordAttendance(entry);
    const stored = await store.replace(current.member, current.etag);

    res.setHeader('ETag', toEtag(stored.etag));
    res.status(201).json(entry);
  });

  router.post('/:memberNo/contacts', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const input = contactInputSchema.parse(req.body);
    const current = await requireMember(store, memberNo);

    const contact = current.member.addContact(input);
    const stored = await store.replace(current.member, current.etag);

    res.setHeader('ETag', toEtag(stored.etag));
    res.status(201).json(contact);
  });

  router.delete('/:memberNo/contacts/:contactId', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const current = await requireMember(store, memberNo);

    current.member.removeContact(req.params.contactId);
    await store.replace(current.member, current.etag);
    res.status(204).end();
  });

  router.post('/:memberNo/subscriptions', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const { kind } = subscriptionRequestSchema.parse(req.body);
    const current = await requireMember(store, memberNo);

    current.member.subscribe(kind);
    const stored = await store.replace(current.member, current.etag);

    res.setHeader('ETag', toEtag(stored.etag));
    res.status(201).json({ kind, status: 'active' });
  });

  router.delete('/:memberNo/subscriptions/:kind', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const kind = parseSubscriptionKind(req.params.kind);
    const current = await requireMember(store, memberNo);

    current.member.unsubscribe(kind);
    await store.replace(current.member, current.etag);
    res.status(204).end();
  });

  router.post('/:memberNo/ministries', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const { ministry } = ministryRequestSchema.parse(req.body);
    const current = await requireMember(store, memberNo);

    current.member.assignMinistry(ministry);
    const stored = await store.replace(current.member, current.etag);

    res.setHeader('ETag', toEtag(stored.etag));
    res.status(201).json({ ministry });
  });

  router.delete('/:memberNo/ministries/:ministry', async (req, res) => {
    const memberNo = assertMemberNo(req.params.memberNo);
    const ministry = parseMinistry(req.params.ministry);
    const current = await requireMember(store, memberNo);

    current.member.removeMinistry(ministry);
    await store.replace(current.member, current.etag);
    res.status(204).end();
  });

  return router;
}

function parseSubscriptionKind(value: string): SubscriptionKind {
  const parsed = subscriptionRequestSchema.shape.kind.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(`kind must be one of: ${SUBSCRIPTION_KINDS.join(', ')}`);
  }
  return parsed.data;
}

function parseMinistry(value: string): Ministry {
  const parsed = ministryRequestSchema.shape.ministry.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(`ministry must be one of: ${MINISTRIES.join(', ')}`);
  }
  return parsed.data;
}
