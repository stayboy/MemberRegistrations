import type { Db, DbClient } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import { generateReference, hashVisitorPhone } from '../domain/contributions.js';
import {
  ConflictError,
  EventNotActiveError,
  IdempotencyConflictError,
  NotFoundError,
  OfferingExpiredError,
  OfferingNotOnEventError,
  SessionNotInEventError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type {
  ContributionItem,
  ContributionListQuery,
  ContributionSummaryItem,
  CreateContributionInput,
} from '../schemas/contributions.js';

export interface CreatedContribution {
  /** False for an identical repeat of an idempotency key; the route answers 200. */
  created: boolean;
  contribution: ContributionItem;
}

type ContributionRow = {
  id: string;
  member_no: string | null;
  visitor_name: string | null;
  offering_id: string;
  event_instance_id: string;
  session_date: unknown;
  amount_minor: number | string;
  currency: string;
  channel: string;
  status: string;
  reference: string;
  idempotency_key: string;
  terms_version: number | string;
  created_at: unknown;
};

type StoredContributionRow = ContributionRow & {
  member_id: string | null;
  visitor_phone_hash: string | null;
};

type EventRow = {
  status: string;
  sessions: unknown;
  end_date: unknown;
  series_id: string | null;
};

type OfferingTermsRow = {
  active: boolean;
  currency: string | null;
  version: number | string | null;
};

type AttachmentExpiryRow = {
  attachment_available_until: unknown;
  terms_available_until: unknown;
};

type SummaryRow = {
  currency: string;
  member_count: number | string;
  member_paid_minor: number | string;
  visitor_count: number | string;
  visitor_paid_minor: number | string;
};

type MemberRow = {
  id: string;
  archived_at: unknown;
  purged_at: unknown;
};

/** The canonical request the idempotency comparison is based on. */
type CanonicalPayload = {
  memberId: string | null;
  visitorName: string | null;
  visitorPhoneHash: string | null;
  offeringId: string;
  eventId: string;
  sessionDate: string;
  amountMinor: number;
  currency: string;
  channel: string;
  status: string;
  idempotencyKey: string;
};

const CONTRIBUTION_COLUMNS = `
  c.id,
  m.member_no,
  c.visitor_name,
  c.offering_id,
  c.event_instance_id,
  c.session_date,
  c.amount_minor,
  c.currency,
  c.channel,
  c.status,
  c.reference,
  c.idempotency_key,
  c.terms_version,
  c.created_at`;

const CONTRIBUTION_FROM = `
  from contributions c
  left join members m on m.id = c.member_id`;

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function contributionFromRow(row: ContributionRow): ContributionItem {
  return {
    id: row.id,
    memberNo: row.member_no,
    visitorName: row.visitor_name,
    offeringId: row.offering_id,
    eventId: row.event_instance_id,
    sessionDate: isoDate(row.session_date)!,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    channel: row.channel as ContributionItem['channel'],
    status: row.status as ContributionItem['status'],
    reference: row.reference,
    idempotencyKey: row.idempotency_key,
    termsVersion: Number(row.terms_version),
    createdAt: isoTimestamp(row.created_at),
  };
}

/** The effective expiry is the earliest date among the active attachments. */
function earliestExpiry(rows: AttachmentExpiryRow[], eventEndDate: string | null): string | null {
  const dates = rows
    .map(
      (row) =>
        isoDate(row.attachment_available_until) ??
        isoDate(row.terms_available_until) ??
        eventEndDate,
    )
    .filter((date): date is string => date !== null);
  return dates.length === 0 ? null : dates.sort()[0]!;
}

function findSession(sessions: unknown, date: string): { status: string } | null {
  for (const entry of parseJsonArray(sessions)) {
    const session = entry as { date?: unknown; status?: unknown };
    if (isoDate(session.date) === date) {
      return { status: String(session.status ?? 'scheduled') };
    }
  }
  return null;
}

export interface CreateWithinOptions {
  paymentGroupId?: string;
  /**
   * A pledge already passed the event, attachment, expiry and session gates
   * when it was created, so redemption reuses that validation and skips them.
   * The normal contribution path never sets this.
   */
  skipEventGates?: boolean;
  /** A pledge may be redeemed after its offering was archived. */
  allowInactiveOffering?: boolean;
}

export class ContributionRepository {
  constructor(
    private readonly db: Db,
    private readonly visitorPhonePepper: string,
  ) {}

  async create(input: CreateContributionInput, actor: string): Promise<CreatedContribution> {
    return this.createWithin(this.db, input, actor);
  }

  async createWithin(
    db: DbClient,
    input: CreateContributionInput,
    actor: string,
    options: CreateWithinOptions = {},
  ): Promise<CreatedContribution> {
    const sessionDate = assertDate(input.sessionDate, 'sessionDate');

    // The idempotency key wins over current entity state: a retry must return
    // the stored record even after the member, offering or event became
    // read-only. A purged or archived member still exists, so its id matches.
    const memberLookup = input.memberNo ? await this.findMember(db, input.memberNo) : null;
    const visitorName = memberLookup ? null : (input.visitorName ?? null);
    const visitorPhoneHash = input.visitorPhone
      ? hashVisitorPhone(input.visitorPhone, this.visitorPhonePepper)
      : null;

    const existing = await this.findByKey(db, input.idempotencyKey);
    if (existing) {
      return {
        created: false,
        contribution: this.samePayloadOrThrow(existing, {
          memberId: memberLookup?.id ?? null,
          visitorName,
          visitorPhoneHash,
          offeringId: input.offeringId,
          eventId: input.eventId,
          sessionDate,
          amountMinor: input.amountMinor,
          currency: input.currency ?? existing.currency,
          channel: input.channel,
          status: input.status,
          idempotencyKey: input.idempotencyKey,
        }),
      };
    }

    // Only a new gift runs the entity and business checks.
    if (
      input.memberNo &&
      (!memberLookup || memberLookup.archived_at != null || memberLookup.purged_at != null)
    ) {
      throw new NotFoundError(`Member ${input.memberNo} was not found`);
    }

    const event = await this.resolveEvent(db, input.eventId, options.skipEventGates === true);

    if (options.skipEventGates !== true) {
      const session = findSession(event.sessions, sessionDate);
      if (!session) {
        throw new SessionNotInEventError(`Event ${input.eventId} has no session on ${sessionDate}`);
      }
      if (session.status === 'cancelled') {
        throw new SessionNotInEventError(
          `The session on ${sessionDate} is cancelled and cannot take contributions`,
        );
      }
    }

    const offering = await this.resolveOffering(
      db,
      input.offeringId,
      options.allowInactiveOffering === true,
    );
    const termsCurrency = offering.currency;
    const termsVersion = offering.version;

    if (options.skipEventGates !== true) {
      const attachments = await db.query<AttachmentExpiryRow>(
        `select a.available_until as attachment_available_until,
                t.available_until as terms_available_until
           from event_instance_offerings a
           join lateral (
             select available_until
               from offering_terms t
              where t.offering_id = a.offering_id
              order by t.version desc
              limit 1
           ) t on true
          where a.detached_on is null
            and a.offering_id = $1
            and (
              a.event_instance_id = $2::uuid
              or ($3::uuid is not null and a.series_id = $3::uuid)
            )`,
        [input.offeringId, input.eventId, event.series_id],
      );
      if (attachments.length === 0) {
        throw new OfferingNotOnEventError(
          `Offering ${input.offeringId} is not attached to event ${input.eventId}`,
        );
      }

      const expiry = earliestExpiry(attachments, isoDate(event.end_date));
      if (expiry !== null && sessionDate > expiry) {
        throw new OfferingExpiredError(
          `Offering ${input.offeringId} expired on ${expiry}; ${sessionDate} is too late`,
        );
      }
    }

    const currency = input.currency ?? termsCurrency;
    if (currency !== termsCurrency) {
      throw new ValidationError(
        `currency ${currency} does not match the offering currency ${termsCurrency}`,
      );
    }

    const status = input.status;

    const canonical: CanonicalPayload = {
      memberId: memberLookup?.id ?? null,
      visitorName,
      visitorPhoneHash,
      offeringId: input.offeringId,
      eventId: input.eventId,
      sessionDate,
      amountMinor: input.amountMinor,
      currency,
      channel: input.channel,
      status,
      idempotencyKey: input.idempotencyKey,
    };

    // A reference collision is retried; an idempotency-key collision re-reads
    // the winner and applies the same canonical comparison.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const [inserted] = await db.query<{ id: string }>(
          `insert into contributions (
             member_id, visitor_name, visitor_phone_hash, offering_id, event_instance_id,
             session_date, amount_minor, currency, channel, status, reference, idempotency_key,
             terms_version, created_by, payment_group_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           returning id`,
          [
            memberLookup?.id ?? null,
            visitorName,
            visitorPhoneHash,
            input.offeringId,
            input.eventId,
            sessionDate,
            input.amountMinor,
            currency,
            input.channel,
            status,
            generateReference(),
            input.idempotencyKey,
            termsVersion,
            actor,
            options.paymentGroupId ?? null,
          ],
        );
        return { created: true, contribution: await this.readById(db, inserted!.id) };
      } catch (error) {
        if (sqlState(error) !== '23505') throw error;
        const duplicate = await this.findByKey(db, input.idempotencyKey);
        if (duplicate) {
          return { created: false, contribution: this.samePayloadOrThrow(duplicate, canonical) };
        }
      }
    }

    throw new ConflictError('Could not allocate a unique contribution reference');
  }

  async list(query: ContributionListQuery): Promise<{
    items: ContributionItem[];
    nextCursor?: string;
  }> {
    const rows = await this.db.query<ContributionRow>(
      `select ${CONTRIBUTION_COLUMNS}
         ${CONTRIBUTION_FROM}
        where ($1::text is null or lower(m.member_no) = lower($1::text))
          and ($2::uuid is null or c.offering_id = $2::uuid)
          and ($3::uuid is null or c.event_instance_id = $3::uuid)
          and ($4::date is null or c.session_date >= $4::date)
          and ($5::date is null or c.session_date <= $5::date)
          and (
            $6::uuid is null
            or (c.created_at, c.id) < (
              select created_at, id from contributions where id = $6::uuid
            )
          )
        order by c.created_at desc, c.id desc
        limit $7`,
      [
        query.memberNo ?? null,
        query.offeringId ?? null,
        query.eventId ?? null,
        query.from ?? null,
        query.to ?? null,
        query.cursor ?? null,
        query.limit + 1,
      ],
    );

    const items = rows.slice(0, query.limit).map(contributionFromRow);
    const more = rows.length > query.limit;
    const last = items[items.length - 1];
    return more && last ? { items, nextCursor: last.id } : { items };
  }

  /** Reads one contribution, or null when it does not exist. */
  async getById(id: string): Promise<ContributionItem | null> {
    const [row] = await this.db.query<ContributionRow>(
      `select ${CONTRIBUTION_COLUMNS}
         ${CONTRIBUTION_FROM}
        where c.id = $1`,
      [id],
    );
    return row ? contributionFromRow(row) : null;
  }

  /** Child contributions of one payment group, in the split's selection order. */
  async listByPaymentGroup(paymentGroupId: string): Promise<ContributionItem[]> {
    const rows = await this.db.query<ContributionRow>(
      `select ${CONTRIBUTION_COLUMNS}
         ${CONTRIBUTION_FROM}
        where c.payment_group_id = $1
        order by coalesce(
          nullif(reverse(split_part(reverse(c.idempotency_key), ':', 1)), '')::int,
          0
        )`,
      [paymentGroupId],
    );
    return rows.map(contributionFromRow);
  }

  /** Totals by currency, counting only paid rows; no names or contact values. */
  async summary(
    from: string,
    to: string,
  ): Promise<{
    from: string;
    to: string;
    items: ContributionSummaryItem[];
  }> {
    const rows = await this.db.query<SummaryRow>(
      `select c.currency,
              count(*) filter (where c.member_id is not null)::int as member_count,
              coalesce(sum(c.amount_minor) filter (where c.member_id is not null), 0)
                as member_paid_minor,
              count(*) filter (where c.member_id is null)::int as visitor_count,
              coalesce(sum(c.amount_minor) filter (where c.member_id is null), 0)
                as visitor_paid_minor
         from contributions c
        where c.status = 'paid'
          and c.session_date >= $1::date
          and c.session_date <= $2::date
        group by c.currency
        order by c.currency`,
      [from, to],
    );

    return {
      from,
      to,
      items: rows.map((row) => ({
        currency: row.currency,
        memberCount: Number(row.member_count),
        memberPaidMinor: Number(row.member_paid_minor),
        visitorCount: Number(row.visitor_count),
        visitorPaidMinor: Number(row.visitor_paid_minor),
      })),
    };
  }

  /** Unfiltered lookup: a purged or archived member still has a row and an id. */
  private async findMember(db: DbClient, memberNo: string): Promise<MemberRow | null> {
    const [row] = await db.query<MemberRow>(
      `select id, archived_at, purged_at
         from members
        where lower(member_no) = lower($1)`,
      [memberNo],
    );
    return row ?? null;
  }

  private async resolveEvent(
    db: DbClient,
    eventId: string,
    allowInactive = false,
  ): Promise<EventRow> {
    const [row] = await db.query<EventRow>(
      `select status, sessions, end_date, series_id
         from event_instances
        where id = $1`,
      [eventId],
    );
    if (!row) throw new NotFoundError(`Event ${eventId} was not found`);
    if (!allowInactive && (row.status === 'cancelled' || row.status === 'archived')) {
      throw new EventNotActiveError(`Event ${eventId} is ${row.status} and cannot take gifts`);
    }
    return row;
  }

  private async resolveOffering(
    db: DbClient,
    offeringId: string,
    allowInactive = false,
  ): Promise<{ currency: string; version: number }> {
    const [row] = await db.query<OfferingTermsRow>(
      `select o.active, t.currency, t.version
         from offerings o
         left join lateral (
           select currency, version
             from offering_terms t
            where t.offering_id = o.id
            order by t.version desc
            limit 1
         ) t on true
        where o.id = $1`,
      [offeringId],
    );
    if (!row) throw new NotFoundError(`Offering ${offeringId} was not found`);
    if (!row.active && !allowInactive) {
      throw new ValidationError(`Offering ${offeringId} is archived and cannot take contributions`);
    }
    if (row.currency === null || row.version === null) {
      throw new NotFoundError(`Offering ${offeringId} has no published terms`);
    }
    return { currency: row.currency, version: Number(row.version) };
  }

  private async findByKey(
    db: DbClient,
    idempotencyKey: string,
  ): Promise<StoredContributionRow | null> {
    const [row] = await db.query<StoredContributionRow>(
      `select ${CONTRIBUTION_COLUMNS},
              c.member_id,
              c.visitor_phone_hash
         ${CONTRIBUTION_FROM}
        where c.idempotency_key = $1`,
      [idempotencyKey],
    );
    return row ?? null;
  }

  private async readById(db: DbClient, id: string): Promise<ContributionItem> {
    const [row] = await db.query<ContributionRow>(
      `select ${CONTRIBUTION_COLUMNS}
         ${CONTRIBUTION_FROM}
        where c.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError(`Contribution ${id} was not found`);
    return contributionFromRow(row);
  }

  /** The canonical request: member or visitor identity, target, money and status. */
  private samePayloadOrThrow(
    stored: StoredContributionRow,
    expected: CanonicalPayload,
  ): ContributionItem {
    const same =
      stored.member_id === expected.memberId &&
      stored.visitor_name === expected.visitorName &&
      stored.visitor_phone_hash === expected.visitorPhoneHash &&
      stored.offering_id === expected.offeringId &&
      stored.event_instance_id === expected.eventId &&
      isoDate(stored.session_date) === expected.sessionDate &&
      Number(stored.amount_minor) === expected.amountMinor &&
      stored.currency === expected.currency &&
      stored.channel === expected.channel &&
      stored.status === expected.status;
    if (!same) {
      throw new IdempotencyConflictError(
        `Idempotency key ${expected.idempotencyKey} was already used for a different contribution`,
      );
    }
    return contributionFromRow(stored);
  }
}
