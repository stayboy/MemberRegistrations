import type { Db, DbClient } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import {
  ConflictError,
  EventNotActiveError,
  IdempotencyConflictError,
  InvalidExpectedDateError,
  InvalidReminderDateError,
  NotFoundError,
  OfferingExpiredError,
  OfferingNotOnEventError,
  OfficerRequiredError,
  PledgeAlreadyTerminalError,
  SessionNotInEventError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type {
  AddReminderInput,
  CreatePledgeInput,
  PledgeItem,
  PledgeListQuery,
  ReminderItem,
} from '../schemas/pledges.js';

export interface CreatedPledge {
  /** False for an identical repeat of an idempotency key; the route answers 200. */
  created: boolean;
  pledge: PledgeItem;
}

type PledgeRow = {
  id: string;
  member_no: string;
  offering_id: string;
  event_instance_id: string;
  session_date: unknown;
  amount_minor: number | string;
  currency: string;
  expected_on: unknown;
  officer_member_no: string;
  status: string;
  reason: string | null;
  terms_version: number | string;
  idempotency_key: string;
  created_at: unknown;
};

type StoredPledgeRow = PledgeRow & {
  member_id: string;
  officer_member_id: string;
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

type MemberRow = {
  id: string;
  archived_at: unknown;
  purged_at: unknown;
};

type ReminderRow = {
  id: string;
  pledge_id: string;
  scheduled_for: unknown;
  channel: string;
  status: string;
  sent_at: unknown;
};

/** The canonical request the idempotency comparison is based on. */
type CanonicalPayload = {
  memberId: string | null;
  offeringId: string;
  eventId: string;
  sessionDate: string | null;
  amountMinor: number;
  currency: string;
  expectedOn: string;
  /** Compared only when the caller supplied a follow-up officer. */
  officerId: string | null;
  reason: string | null;
  idempotencyKey: string;
};

const PLEDGE_COLUMNS = `
  p.id,
  m.member_no,
  p.offering_id,
  p.event_instance_id,
  p.session_date,
  p.amount_minor,
  p.currency,
  p.expected_on,
  o.member_no as officer_member_no,
  p.status,
  p.reason,
  p.terms_version,
  p.idempotency_key,
  p.created_at`;

const PLEDGE_FROM = `
  from pledges p
  join members m on m.id = p.member_id
  join members o on o.id = p.officer_member_id`;

const REMINDER_COLUMNS = `
  id, pledge_id, scheduled_for, channel, status, sent_at`;

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
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

function findSession(sessions: unknown, date: string): { status: string } | null {
  for (const entry of parseJsonArray(sessions)) {
    const session = entry as { date?: unknown; status?: unknown };
    if (isoDate(session.date) === date) {
      return { status: String(session.status ?? 'scheduled') };
    }
  }
  return null;
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

function reasonOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pledgeFromRow(row: PledgeRow, todayUtc: string): PledgeItem {
  const expectedOn = isoDate(row.expected_on)!;
  return {
    id: row.id,
    memberNo: row.member_no,
    offeringId: row.offering_id,
    eventId: row.event_instance_id,
    sessionDate: isoDate(row.session_date),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    expectedOn,
    followUpOfficerMemberNo: row.officer_member_no,
    status:
      row.status === 'pending' && expectedOn < todayUtc
        ? 'overdue'
        : (row.status as PledgeItem['status']),
    reason: row.reason,
    termsVersion: Number(row.terms_version),
    idempotencyKey: row.idempotency_key,
    createdAt: isoTimestamp(row.created_at)!,
  };
}

function reminderFromRow(row: ReminderRow): ReminderItem {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    scheduledFor: isoDate(row.scheduled_for)!,
    channel: row.channel as ReminderItem['channel'],
    status: row.status as ReminderItem['status'],
    sentAt: isoTimestamp(row.sent_at),
  };
}

export class PledgeRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreatePledgeInput, actor: string): Promise<CreatedPledge> {
    const today = todayUtcDate();
    const expectedOn = assertDate(input.expectedOn, 'expectedOn');
    const sessionDate = input.sessionDate ? assertDate(input.sessionDate, 'sessionDate') : null;

    // Idempotency wins over current entity state: a retry must return the
    // stored pledge even after the member, offering or pledge became read-only.
    const memberLookup = await this.findMember(this.db, input.memberNo);
    const suppliedOfficer = input.followUpOfficerMemberNo
      ? await this.findMember(this.db, input.followUpOfficerMemberNo)
      : null;

    const existing = await this.findByKey(this.db, input.idempotencyKey);
    if (existing) {
      return {
        created: false,
        pledge: this.samePayloadOrThrow(existing, {
          memberId: memberLookup?.id ?? null,
          offeringId: input.offeringId,
          eventId: input.eventId,
          sessionDate,
          amountMinor: input.amountMinor,
          currency: input.currency ?? existing.currency,
          expectedOn,
          officerId: suppliedOfficer?.id ?? null,
          reason: reasonOrNull(input.officerReason),
          idempotencyKey: input.idempotencyKey,
        }),
      };
    }

    // Only a new pledge runs the entity and business checks.
    if (!memberLookup || memberLookup.archived_at != null || memberLookup.purged_at != null) {
      throw new NotFoundError(`Member ${input.memberNo} was not found`);
    }

    const event = await this.resolveEvent(this.db, input.eventId);
    if (sessionDate !== null) {
      const session = findSession(event.sessions, sessionDate);
      if (!session) {
        throw new SessionNotInEventError(`Event ${input.eventId} has no session on ${sessionDate}`);
      }
      if (session.status === 'cancelled') {
        throw new SessionNotInEventError(
          `The session on ${sessionDate} is cancelled and cannot take pledges`,
        );
      }
    }

    const offering = await this.resolveOffering(this.db, input.offeringId);
    const attachments = await this.db.query<AttachmentExpiryRow>(
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

    const pledgeDate = sessionDate ?? today;
    const expiry = earliestExpiry(attachments, isoDate(event.end_date));
    if (expiry !== null && pledgeDate > expiry) {
      throw new OfferingExpiredError(
        `Offering ${input.offeringId} expired on ${expiry}; ${pledgeDate} is too late`,
      );
    }

    const currency = input.currency ?? offering.currency;
    if (currency !== offering.currency) {
      throw new ValidationError(
        `currency ${currency} does not match the offering currency ${offering.currency}`,
      );
    }

    if (expectedOn < today) {
      throw new InvalidExpectedDateError(`expectedOn ${expectedOn} is before today (UTC)`);
    }

    const officerId = await this.resolveOfficer(
      memberLookup.id,
      input.followUpOfficerMemberNo,
      input.officerReason,
    );
    const reason = reasonOrNull(input.officerReason);

    const canonical: CanonicalPayload = {
      memberId: memberLookup.id,
      offeringId: input.offeringId,
      eventId: input.eventId,
      sessionDate,
      amountMinor: input.amountMinor,
      currency,
      expectedOn,
      officerId,
      reason,
      idempotencyKey: input.idempotencyKey,
    };

    try {
      const id = await this.db.transaction(async (tx) => {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into pledges (
             member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
             expected_on, officer_member_id, status, reason, terms_version, idempotency_key,
             created_by
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12)
           returning id`,
          [
            memberLookup.id,
            input.offeringId,
            input.eventId,
            sessionDate,
            input.amountMinor,
            currency,
            expectedOn,
            officerId,
            reason,
            offering.version,
            input.idempotencyKey,
            actor,
          ],
        );

        await tx.query(
          `insert into pledge_events (pledge_id, kind, actor)
           values ($1, 'created', $2)`,
          [inserted!.id, actor],
        );

        for (const days of [-7, 0, 7]) {
          const scheduledFor = shiftDate(expectedOn, days);
          await tx.query(
            `insert into reminders (pledge_id, scheduled_for, channel, status)
             values ($1, $2, 'sms', $3)`,
            [inserted!.id, scheduledFor, scheduledFor < today ? 'cancelled' : 'pending'],
          );
        }

        return inserted!.id;
      });

      return { created: true, pledge: await this.getById(id) };
    } catch (error) {
      if (sqlState(error) === '23505') {
        const duplicate = await this.findByKey(this.db, input.idempotencyKey);
        if (duplicate) {
          return { created: false, pledge: this.samePayloadOrThrow(duplicate, canonical) };
        }
      }
      throw error;
    }
  }

  async getById(id: string): Promise<PledgeItem> {
    return this.get(this.db, id);
  }

  async list(query: PledgeListQuery): Promise<{ items: PledgeItem[]; nextCursor?: string }> {
    const today = todayUtcDate();
    const rows = await this.db.query<PledgeRow>(
      `select ${PLEDGE_COLUMNS}
         ${PLEDGE_FROM}
        where ($1::text is null or lower(m.member_no) = lower($1::text))
          and ($2::text is null or lower(o.member_no) = lower($2::text))
          and ($3::date is null or p.expected_on >= $3::date)
          and ($4::date is null or p.expected_on <= $4::date)
          and (
            $5::text is null
            or ($5::text = 'pending' and p.status = 'pending' and p.expected_on >= $6::date)
            or ($5::text = 'overdue' and p.status = 'pending' and p.expected_on < $6::date)
            or ($5::text in ('honored', 'dishonored') and p.status = $5::text)
          )
          and (
            $7::uuid is null
            or (p.created_at, p.id) < (
              select created_at, id from pledges where id = $7::uuid
            )
          )
        order by p.created_at desc, p.id desc
        limit $8`,
      [
        query.memberNo ?? null,
        query.officerMemberNo ?? null,
        query.from ?? null,
        query.to ?? null,
        query.status ?? null,
        today,
        query.cursor ?? null,
        query.limit + 1,
      ],
    );

    const items = rows.slice(0, query.limit).map((row) => pledgeFromRow(row, today));
    const more = rows.length > query.limit;
    const last = items[items.length - 1];
    return more && last ? { items, nextCursor: last.id } : { items };
  }

  async honor(id: string, actor: string): Promise<PledgeItem> {
    await this.db.transaction(async (tx) => {
      const pledge = await this.lockPledge(tx, id);
      await tx.query(`update pledges set status = 'honored' where id = $1`, [pledge.id]);
      await tx.query(
        `insert into pledge_events (pledge_id, kind, actor) values ($1, 'honored', $2)`,
        [pledge.id, actor],
      );
    });
    return this.getById(id);
  }

  async dishonor(id: string, reason: string, actor: string): Promise<PledgeItem> {
    const trimmed = this.requireReason(reason, 'dishonor');
    await this.db.transaction(async (tx) => {
      const pledge = await this.lockPledge(tx, id);
      await tx.query(`update pledges set status = 'dishonored' where id = $1`, [pledge.id]);
      await tx.query(
        `insert into pledge_events (pledge_id, kind, actor, reason)
         values ($1, 'dishonored', $2, $3)`,
        [pledge.id, actor, trimmed],
      );
    });
    return this.getById(id);
  }

  async reassign(
    id: string,
    officerMemberNo: string,
    reason: string,
    actor: string,
  ): Promise<PledgeItem> {
    const trimmed = this.requireReason(reason, 'reassign');
    await this.db.transaction(async (tx) => {
      const pledge = await this.lockPledge(tx, id);
      const officer = await this.findActivePresbyter(tx, officerMemberNo);
      if (!officer) {
        throw new ValidationError(`Member ${officerMemberNo} is not an active presbyter`);
      }

      await tx.query(`update pledges set officer_member_id = $2 where id = $1`, [
        pledge.id,
        officer.id,
      ]);
      await tx.query(
        `insert into pledge_events (
           pledge_id, kind, actor, reason, from_officer_member_id, to_officer_member_id
         ) values ($1, 'reassigned', $2, $3, $4, $5)`,
        [pledge.id, actor, trimmed, pledge.officer_member_id, officer.id],
      );
    });
    return this.getById(id);
  }

  async addReminder(id: string, input: AddReminderInput, _actor: string): Promise<ReminderItem> {
    const scheduledFor = assertDate(input.scheduledFor, 'scheduledFor');
    const today = todayUtcDate();
    if (scheduledFor < today) {
      throw new InvalidReminderDateError(`scheduledFor ${scheduledFor} is before today (UTC)`);
    }

    const [pledge] = await this.db.query<{ status: string }>(
      'select status from pledges where id = $1',
      [id],
    );
    if (!pledge) throw new NotFoundError(`Pledge ${id} was not found`);
    if (pledge.status !== 'pending') {
      throw new PledgeAlreadyTerminalError(
        `Pledge ${id} is ${pledge.status}; reminders are closed`,
      );
    }

    try {
      const [row] = await this.db.query<ReminderRow>(
        `insert into reminders (pledge_id, scheduled_for, channel, status)
         values ($1, $2, $3, 'pending')
         returning ${REMINDER_COLUMNS}`,
        [id, scheduledFor, input.channel],
      );
      return reminderFromRow(row!);
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(
          `A ${input.channel} reminder already exists for pledge ${id} on ${scheduledFor}`,
        );
      }
      throw error;
    }
  }

  async listReminders(id: string): Promise<ReminderItem[]> {
    const [pledge] = await this.db.query('select 1 from pledges where id = $1', [id]);
    if (!pledge) throw new NotFoundError(`Pledge ${id} was not found`);

    const rows = await this.db.query<ReminderRow>(
      `select ${REMINDER_COLUMNS}
         from reminders
        where pledge_id = $1
        order by scheduled_for desc, id desc`,
      [id],
    );
    return rows.map(reminderFromRow);
  }

  private async get(db: DbClient, id: string): Promise<PledgeItem> {
    const [row] = await db.query<PledgeRow>(
      `select ${PLEDGE_COLUMNS}
         ${PLEDGE_FROM}
        where p.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError(`Pledge ${id} was not found`);
    return pledgeFromRow(row, todayUtcDate());
  }

  private async lockPledge(
    db: DbClient,
    id: string,
  ): Promise<{ id: string; status: string; officer_member_id: string }> {
    const [row] = await db.query<{ id: string; status: string; officer_member_id: string }>(
      'select id, status, officer_member_id from pledges where id = $1 for update',
      [id],
    );
    if (!row) throw new NotFoundError(`Pledge ${id} was not found`);
    if (row.status !== 'pending') {
      throw new PledgeAlreadyTerminalError(`Pledge ${id} is ${row.status} and cannot transition`);
    }
    return row;
  }

  private requireReason(value: string, action: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      throw new ValidationError(`reason must be 3-500 characters for ${action}`);
    }
    return trimmed;
  }

  private async resolveOfficer(
    memberId: string,
    suppliedOfficerMemberNo: string | undefined,
    officerReason: string | undefined,
  ): Promise<string> {
    if (suppliedOfficerMemberNo) {
      const officer = await this.findActivePresbyter(this.db, suppliedOfficerMemberNo);
      if (!officer) {
        throw new ValidationError(`Member ${suppliedOfficerMemberNo} is not an active presbyter`);
      }
      if (!reasonOrNull(officerReason)) {
        throw new ValidationError(
          'officerReason is required when followUpOfficerMemberNo is supplied',
        );
      }
      return officer.id;
    }

    const [shepherd] = await this.db.query<{ id: string }>(
      `select o.id
         from shepherding_assignments a
         join members o on o.id = a.officer_member_id
        where a.member_id = $1
          and a.ended_on is null
          and o.is_presbyter
          and o.archived_at is null
          and o.purged_at is null
        order by a.assigned_on desc, a.created_at desc
        limit 1`,
      [memberId],
    );
    if (!shepherd) {
      throw new OfficerRequiredError(
        'The member has no active shepherd; supply an active presbyter as followUpOfficerMemberNo',
      );
    }
    return shepherd.id;
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

  private async findActivePresbyter(
    db: DbClient,
    memberNo: string,
  ): Promise<{ id: string } | null> {
    const [row] = await db.query<{ id: string }>(
      `select id
         from members
        where lower(member_no) = lower($1)
          and is_presbyter
          and archived_at is null
          and purged_at is null`,
      [memberNo],
    );
    return row ?? null;
  }

  private async resolveEvent(db: DbClient, eventId: string): Promise<EventRow> {
    const [row] = await db.query<EventRow>(
      `select status, sessions, end_date, series_id
         from event_instances
        where id = $1`,
      [eventId],
    );
    if (!row) throw new NotFoundError(`Event ${eventId} was not found`);
    if (row.status === 'cancelled' || row.status === 'archived') {
      throw new EventNotActiveError(`Event ${eventId} is ${row.status} and cannot take pledges`);
    }
    return row;
  }

  private async resolveOffering(
    db: DbClient,
    offeringId: string,
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
    if (!row.active) {
      throw new ValidationError(`Offering ${offeringId} is archived and cannot take pledges`);
    }
    if (row.currency === null || row.version === null) {
      throw new NotFoundError(`Offering ${offeringId} has no published terms`);
    }
    return { currency: row.currency, version: Number(row.version) };
  }

  private async findByKey(db: DbClient, idempotencyKey: string): Promise<StoredPledgeRow | null> {
    const [row] = await db.query<StoredPledgeRow>(
      `select ${PLEDGE_COLUMNS},
              p.member_id,
              p.officer_member_id
         ${PLEDGE_FROM}
        where p.idempotency_key = $1`,
      [idempotencyKey],
    );
    return row ?? null;
  }

  /** The canonical request: member, target, money, date and the supplied officer. */
  private samePayloadOrThrow(stored: StoredPledgeRow, expected: CanonicalPayload): PledgeItem {
    const same =
      stored.member_id === expected.memberId &&
      stored.offering_id === expected.offeringId &&
      stored.event_instance_id === expected.eventId &&
      isoDate(stored.session_date) === expected.sessionDate &&
      Number(stored.amount_minor) === expected.amountMinor &&
      stored.currency === expected.currency &&
      isoDate(stored.expected_on) === expected.expectedOn &&
      (expected.officerId === null || stored.officer_member_id === expected.officerId) &&
      (stored.reason ?? null) === expected.reason;
    if (!same) {
      throw new IdempotencyConflictError(
        `Idempotency key ${expected.idempotencyKey} was already used for a different pledge`,
      );
    }
    return pledgeFromRow(stored, todayUtcDate());
  }
}
