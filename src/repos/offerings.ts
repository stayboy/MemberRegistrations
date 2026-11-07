import type { Db, DbClient } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import {
  EventNotActiveError,
  InvalidExceptionDateError,
  NotFoundError,
  OfferingAlreadyAttachedError,
  TermsVersionConflictError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { isHeldOccurrence } from './occurrences.js';
import type {
  AttachInput,
  ChurchOfferingSummary,
  ExceptionInput,
  ExceptionRowItem,
  OfferingKind,
  OfferingsListQuery,
  SeriesAttachInput,
  TermsInput,
  TermsPublishInput,
} from '../schemas/offerings.js';

export interface OfferingTermsItem {
  version: number;
  name: string | null;
  purpose: string;
  kind: OfferingKind;
  currency: string;
  targetMinor: number | null;
  defaultAmountMinor: number | null;
  startsOn: string | null;
  endsOn: string | null;
  availableUntil: string | null;
  scripture: string | null;
  gatewayAccount: string | null;
  gatewayMetadata: Record<string, string> | null;
  /** Audit (NFR-3): who published this version, when, and why. */
  createdAt: string;
  createdBy: string;
  /** Null for version 1; required on every later version. */
  reason: string | null;
}

export interface OfferingStatsItem {
  attachedEvents: number;
  pledgedMinor: number;
  paidMinor: number;
  pendingMinor: number;
  honorRate: number;
  contributionCount: number;
}

export interface OfferingItem {
  id: string;
  active: boolean;
  terms: OfferingTermsItem;
  createdAt: string;
}

export interface EventOfferingItem {
  offeringId: string;
  /** Resolved by the API: the custom name, or `${event.name} · ${kindLabel}`. */
  name: string;
  availableUntil: string | null;
  expired: boolean;
  terms: OfferingTermsItem;
  exceptions: Array<{ date: string; kind: 'skip' | 'opt_in'; note: string | null }>;
  stats: OfferingStatsItem;
}

export interface OfferingAttachmentItem {
  attachmentId: string;
  offeringId: string;
  availableUntil: string | null;
  terms: OfferingTermsItem;
}

export type ExceptionKind = 'event' | 'series';

const KIND_LABELS: Record<OfferingKind, string> = {
  freewill: 'Freewill',
  tithe: 'Tithe',
  building: 'Building',
  missions: 'Missions',
  other: 'Other',
};

const TERMS_COLUMNS = `
  t.version,
  t.name,
  t.purpose,
  t.kind,
  t.currency,
  t.target_minor,
  t.default_amount_minor,
  t.starts_on,
  t.ends_on,
  t.available_until,
  t.scripture,
  t.gateway_account,
  t.gateway_metadata,
  t.reason,
  t.created_at as terms_created_at,
  t.created_by as terms_created_by`;

const CURRENT_TERMS_JOIN = `
  join lateral (
    select *
    from offering_terms t
    where t.offering_id = o.id
    order by t.version desc
    limit 1
  ) t on true`;

const INSERT_TERMS_SQL = `
insert into offering_terms (
  offering_id, version, name, purpose, kind, currency,
  target_minor, default_amount_minor, starts_on, ends_on, available_until,
  scripture, gateway_account, gateway_metadata, reason, created_by
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
returning version, name, purpose, kind, currency,
          target_minor, default_amount_minor, starts_on, ends_on, available_until,
          scripture, gateway_account, gateway_metadata, reason,
          created_at as terms_created_at, created_by as terms_created_by
`;

/**
 * The landing's contribution half: the reporting currency (largest paid
 * currency in the window, tie broken by code), the member totals, the visitor
 * block and the by-member/by-offering/by-event paid totals. One statement, so
 * no per-row read (NFR-1, NFR-5).
 */
export const OFFERING_SUMMARY_CONTRIBUTIONS_SQL = `
with bounds as (
  select $1::date as from_date, $2::date as to_date
),
chosen as (
  -- No FX: the largest paid currency in the window wins (23-Q8).
  select coalesce((
    select c2.currency
      from contributions c2, bounds b
     where c2.status = 'paid'
       and c2.session_date between b.from_date and b.to_date
     group by c2.currency
     order by sum(c2.amount_minor) desc, c2.currency asc
     limit 1
  ), 'GHS') as currency
),
paid as (
  select c.member_id, c.offering_id, c.event_instance_id, c.session_date, c.amount_minor
    from contributions c, bounds b, chosen ch
   where c.status = 'paid'
     and c.session_date between b.from_date and b.to_date
     and c.currency = ch.currency
),
member_totals as (
  select m.member_no,
         coalesce(
           nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), ''),
           nullif(btrim(m.other_names), ''),
           m.member_no
         ) as name,
         sum(p.amount_minor) as paid_minor,
         max(p.session_date) as last_given_on
    from paid p
    join members m on m.id = p.member_id
   group by m.id, m.member_no, m.first_name, m.last_name, m.other_names
   order by sum(p.amount_minor) desc, lower(m.member_no) asc
   limit 10
),
offering_totals as (
  select p.offering_id,
         coalesce(nullif(btrim(t.name), ''), t.purpose) as name,
         sum(p.amount_minor) as paid_minor
    from paid p
    join lateral (
      select name, purpose
        from offering_terms t
       where t.offering_id = p.offering_id
       order by t.version desc
       limit 1
    ) t on true
   where p.member_id is not null
   group by p.offering_id, t.name, t.purpose
),
event_totals as (
  select p.event_instance_id as event_id, e.name, sum(p.amount_minor) as paid_minor
    from paid p
    join event_instances e on e.id = p.event_instance_id
   where p.member_id is not null
   group by p.event_instance_id, e.name
)
select ch.currency,
       coalesce((select sum(amount_minor) from paid where member_id is not null), 0)::bigint
         as total_paid,
       (select count(*) from paid where member_id is null)::int as visitor_count,
       coalesce((select sum(amount_minor) from paid where member_id is null), 0)::bigint
         as visitor_paid,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'memberNo', mt.member_no,
                  'name', mt.name,
                  'paidMinor', mt.paid_minor,
                  'lastGivenOn', mt.last_given_on
                ) order by mt.paid_minor desc, lower(mt.member_no) asc)
           from member_totals mt
       ), '[]'::jsonb) as members,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'offeringId', ot.offering_id,
                  'name', ot.name,
                  'paidMinor', ot.paid_minor
                ) order by ot.paid_minor desc, lower(ot.name) asc, ot.offering_id asc)
           from offering_totals ot
       ), '[]'::jsonb) as offerings,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'eventId', et.event_id,
                  'name', et.name,
                  'paidMinor', et.paid_minor
                ) order by et.paid_minor desc, lower(et.name) asc, et.event_id asc)
           from event_totals et
       ), '[]'::jsonb) as events
  from chosen ch
`;

/**
 * The landing's pledge half. A pledge is in scope when `expectedOn` is in the
 * window, or it is still pending as at the report date (min(to, today)) with an
 * `expectedOn` before `from` (23-Q9, R3). Its status is read from
 * `pledge_events.at` with the inclusive boundary `at < report date + 1 day`
 * (R2/R7), never from the mutable `pledges.status`. One statement.
 */
export const OFFERING_SUMMARY_PLEDGES_SQL = `
with bounds as (
  select $1::date as from_date,
         $2::date as to_date,
         least($2::date, $3::date) as report_date
),
bounded as (
  select pe.pledge_id,
         max(pe.at) filter (where pe.kind = 'honored') as honored_at,
         max(pe.at) filter (where pe.kind = 'dishonored') as dishonored_at
    from pledge_events pe, bounds b
   where (pe.at at time zone 'UTC') < (b.report_date + 1)::timestamp
   group by pe.pledge_id
),
staged as (
  select p.member_id, m.member_no, p.offering_id, p.event_instance_id,
         p.amount_minor, p.expected_on,
         case
           when b.dishonored_at is not null
                and (b.honored_at is null or b.dishonored_at > b.honored_at) then 'dishonored'
           when b.honored_at is not null then 'honored'
           else 'pending'
         end as as_of_status
    from pledges p
    join members m on m.id = p.member_id
    left join bounded b on b.pledge_id = p.id
   where p.currency = $4
),
in_scope as (
  select s.*
    from staged s, bounds b
   where s.expected_on between b.from_date and b.to_date
      or (s.expected_on < b.from_date and s.as_of_status = 'pending')
),
member_totals as (
  select member_no,
         coalesce(sum(amount_minor) filter (where as_of_status <> 'dishonored'), 0) as pledged,
         coalesce(sum(amount_minor) filter (where as_of_status = 'pending'), 0) as outstanding
    from in_scope
   group by member_id, member_no
),
offering_totals as (
  select i.offering_id,
         coalesce(nullif(btrim(t.name), ''), t.purpose) as name,
         coalesce(sum(i.amount_minor) filter (where i.as_of_status <> 'dishonored'), 0) as pledged,
         coalesce(sum(i.amount_minor) filter (where i.as_of_status = 'pending'), 0) as outstanding
    from in_scope i
    join lateral (
      select name, purpose
        from offering_terms t
       where t.offering_id = i.offering_id
       order by t.version desc
       limit 1
    ) t on true
   group by i.offering_id, t.name, t.purpose
),
event_totals as (
  select i.event_instance_id,
         e.name,
         coalesce(sum(i.amount_minor) filter (where i.as_of_status <> 'dishonored'), 0) as pledged,
         coalesce(sum(i.amount_minor) filter (where i.as_of_status = 'pending'), 0) as outstanding
    from in_scope i
    join event_instances e on e.id = i.event_instance_id
   group by i.event_instance_id, e.name
)
select coalesce((
         select sum(amount_minor) from in_scope where as_of_status <> 'dishonored'
       ), 0)::bigint as total_pledged,
       coalesce((
         select sum(amount_minor) from in_scope where as_of_status = 'pending'
       ), 0)::bigint as total_outstanding,
       (select count(*) from in_scope s, bounds b
         where s.as_of_status = 'pending' and s.expected_on >= b.report_date)::int as pending_count,
       (select count(*) from in_scope s, bounds b
         where s.as_of_status = 'pending' and s.expected_on < b.report_date)::int as overdue_count,
       (select count(*) from in_scope where as_of_status = 'honored')::int as honored_count,
       (select count(*) from in_scope where as_of_status = 'dishonored')::int as dishonored_count,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'memberNo', mt.member_no,
                  'pledgedMinor', mt.pledged,
                  'outstandingMinor', mt.outstanding
                ) order by lower(mt.member_no))
           from member_totals mt
       ), '[]'::jsonb) as members,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'offeringId', ot.offering_id,
                  'name', ot.name,
                  'pledgedMinor', ot.pledged,
                  'outstandingMinor', ot.outstanding
                ) order by lower(ot.name), ot.offering_id)
           from offering_totals ot
       ), '[]'::jsonb) as offerings,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'eventId', et.event_instance_id,
                  'name', et.name,
                  'pledgedMinor', et.pledged,
                  'outstandingMinor', et.outstanding
                ) order by lower(et.name), et.event_instance_id)
           from event_totals et
       ), '[]'::jsonb) as events
`;

type TermsRow = {
  version: number | string;
  name: string | null;
  purpose: string;
  kind: string;
  currency: string;
  target_minor: number | string | null;
  default_amount_minor: number | string | null;
  starts_on: unknown;
  ends_on: unknown;
  available_until: unknown;
  scripture: string | null;
  gateway_account: string | null;
  gateway_metadata: unknown;
  reason: string | null;
  terms_created_at: unknown;
  terms_created_by: string;
};

type OfferingRow = TermsRow & {
  id: string;
  active: boolean;
  created_at: unknown;
};

type AttachmentRow = TermsRow & {
  attachment_id: string;
  offering_id: string;
  event_instance_id: string | null;
  series_id: string | null;
  /** The attachment's own date, aliased away from the terms date. */
  attachment_available_until: unknown;
};

type EventContextRow = {
  id: string;
  name: string;
  end_date: unknown;
  series_id: string | null;
  sessions: unknown;
};

type EventGuardRow = {
  id: string;
  status: string;
  end_date: unknown;
  sessions: unknown;
};

type SummaryContributionRow = {
  currency: string;
  total_paid: number | string;
  visitor_count: number | string;
  visitor_paid: number | string;
  members: unknown;
  offerings: unknown;
  events: unknown;
};

type SummaryPledgeRow = {
  total_pledged: number | string;
  total_outstanding: number | string;
  pending_count: number | string;
  overdue_count: number | string;
  honored_count: number | string;
  dishonored_count: number | string;
  members: unknown;
  offerings: unknown;
  events: unknown;
};

type SummaryMemberJson = {
  memberNo: string;
  name: string;
  paidMinor: number | string;
  lastGivenOn: string | null;
};

type SummaryPaidGroupJson = {
  offeringId?: string;
  eventId?: string;
  name: string;
  paidMinor: number | string;
};

type SummaryPledgedGroupJson = {
  memberNo?: string;
  offeringId?: string;
  eventId?: string;
  name?: string;
  pledgedMinor: number | string;
  outstandingMinor: number | string;
};

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function requiredDate(value: unknown): string {
  return isoDate(value)!;
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
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

function parseMetadata(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, string>;
}

function termsFromRow(row: TermsRow): OfferingTermsItem {
  return {
    version: Number(row.version),
    name: row.name,
    purpose: row.purpose,
    kind: row.kind as OfferingKind,
    currency: row.currency,
    targetMinor: numberOrNull(row.target_minor),
    defaultAmountMinor: numberOrNull(row.default_amount_minor),
    startsOn: isoDate(row.starts_on),
    endsOn: isoDate(row.ends_on),
    availableUntil: isoDate(row.available_until),
    scripture: row.scripture,
    gatewayAccount: row.gateway_account,
    gatewayMetadata: parseMetadata(row.gateway_metadata),
    createdAt: isoTimestamp(row.terms_created_at),
    createdBy: row.terms_created_by,
    reason: row.reason,
  };
}

function offeringFromRow(row: OfferingRow): OfferingItem {
  return {
    id: row.id,
    active: row.active,
    terms: termsFromRow(row),
    createdAt: isoTimestamp(row.created_at),
  };
}

type TermsValues = Omit<OfferingTermsItem, 'version' | 'createdAt' | 'createdBy' | 'reason'>;

function normalizeTerms(input: TermsInput): TermsValues {
  const name = input.name?.trim() ? input.name.trim() : null;
  return {
    name,
    purpose: input.purpose.trim(),
    kind: input.kind,
    currency: input.currency,
    targetMinor: input.targetMinor ?? null,
    defaultAmountMinor: input.defaultAmountMinor ?? null,
    startsOn: input.startsOn ? assertDate(input.startsOn, 'startsOn') : null,
    endsOn: input.endsOn ? assertDate(input.endsOn, 'endsOn') : null,
    availableUntil: input.availableUntil
      ? assertDate(input.availableUntil, 'availableUntil')
      : null,
    scripture: input.scripture ?? null,
    gatewayAccount: input.gatewayAccount ?? null,
    gatewayMetadata: input.gatewayMetadata ?? null,
  };
}

function termsParams(
  offeringId: string,
  version: number,
  terms: TermsValues,
  reason: string | null,
  actor: string,
): unknown[] {
  return [
    offeringId,
    version,
    terms.name,
    terms.purpose,
    terms.kind,
    terms.currency,
    terms.targetMinor,
    terms.defaultAmountMinor,
    terms.startsOn,
    terms.endsOn,
    terms.availableUntil,
    terms.scripture,
    terms.gatewayAccount,
    terms.gatewayMetadata === null ? null : JSON.stringify(terms.gatewayMetadata),
    reason,
    actor,
  ];
}

export function emptyOfferingStats(): OfferingStatsItem {
  return {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  };
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The effective expiry of an attachment: its own date, else the offering's
 * terms date, else the event (or occurrence) end date.
 */
export function effectiveAvailableUntil(input: {
  attachmentAvailableUntil: string | null;
  termsAvailableUntil: string | null;
  eventEndDate: string | null;
}): string | null {
  return input.attachmentAvailableUntil ?? input.termsAvailableUntil ?? input.eventEndDate ?? null;
}

/** After `availableUntil` a new gift is rejected; a pending pledge still survives. */
export function isExpired(availableUntil: string | null, todayUtc: string): boolean {
  return availableUntil !== null && todayUtc > availableUntil;
}

async function currentTerms(db: DbClient, offeringId: string): Promise<OfferingTermsItem> {
  const [row] = await db.query<TermsRow>(
    `select ${TERMS_COLUMNS}
       from offering_terms t
      where t.offering_id = $1
      order by t.version desc
      limit 1`,
    [offeringId],
  );
  if (!row) throw new NotFoundError(`Offering ${offeringId} has no published terms`);
  return termsFromRow(row);
}

async function assertActiveOffering(db: DbClient, offeringId: string): Promise<void> {
  const [offering] = await db.query<{ active: boolean }>(
    'select active from offerings where id = $1',
    [offeringId],
  );
  if (!offering) throw new NotFoundError(`Offering ${offeringId} was not found`);
  if (!offering.active) {
    throw new ValidationError(`Offering ${offeringId} is archived and cannot be attached`);
  }
}

async function assertNotAttached(
  db: DbClient,
  offeringId: string,
  target: { eventId?: string; seriesId?: string },
): Promise<void> {
  const [existing] = target.eventId
    ? await db.query<{ id: string }>(
        `select id from event_instance_offerings
          where offering_id = $1 and event_instance_id = $2 and detached_on is null`,
        [offeringId, target.eventId],
      )
    : await db.query<{ id: string }>(
        `select id from event_instance_offerings
          where offering_id = $1 and series_id = $2 and detached_on is null`,
        [offeringId, target.seriesId],
      );
  if (existing) {
    throw new OfferingAlreadyAttachedError(
      `Offering ${offeringId} is already attached to this ${target.eventId ? 'event' : 'series'}`,
    );
  }
}

async function activeAttachmentId(
  db: DbClient,
  kind: ExceptionKind,
  targetId: string,
  offeringId: string,
): Promise<string> {
  const [row] =
    kind === 'event'
      ? await db.query<{ id: string }>(
          `select id from event_instance_offerings
            where event_instance_id = $1 and offering_id = $2 and detached_on is null`,
          [targetId, offeringId],
        )
      : await db.query<{ id: string }>(
          `select id from event_instance_offerings
            where series_id = $1 and offering_id = $2 and detached_on is null`,
          [targetId, offeringId],
        );
  if (!row) {
    throw new NotFoundError(
      `Offering ${offeringId} has no active attachment on this ${kind === 'event' ? 'event' : 'series'}`,
    );
  }
  return row.id;
}

function exceptionRow(row: {
  id: string;
  date: unknown;
  kind: string;
  note: string | null;
  created_at: unknown;
  created_by: string;
}): ExceptionRowItem {
  return {
    id: row.id,
    date: requiredDate(row.date),
    kind: row.kind as 'skip' | 'opt_in',
    note: row.note,
    createdAt: isoTimestamp(row.created_at),
    createdBy: row.created_by,
  };
}

export class OfferingRepository {
  constructor(private readonly db: Db) {}

  async create(input: TermsInput, actor: string): Promise<OfferingItem> {
    const terms = normalizeTerms(input);

    const id = await this.db.transaction(async (tx) => {
      const [offering] = await tx.query<{ id: string }>(
        'insert into offerings default values returning id',
      );
      await tx.query(INSERT_TERMS_SQL, termsParams(offering!.id, 1, terms, null, actor));
      return offering!.id;
    });

    return this.get(id);
  }

  async get(id: string): Promise<OfferingItem> {
    const [row] = await this.db.query<OfferingRow>(
      `select o.id, o.active, o.created_at, ${TERMS_COLUMNS}
         from offerings o
         ${CURRENT_TERMS_JOIN}
        where o.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError(`Offering ${id} was not found`);
    return offeringFromRow(row);
  }

  /**
   * Default: active only. `active=false`: archived only. `includeArchived=true`:
   * both. Newest first; the catalogue is small enough not to page.
   */
  async list(query: OfferingsListQuery): Promise<OfferingItem[]> {
    const activeFilter =
      query.includeArchived === 'true' ? null : query.active === 'false' ? false : true;
    const rows = await this.db.query<OfferingRow>(
      `select o.id, o.active, o.created_at, ${TERMS_COLUMNS}
         from offerings o
         ${CURRENT_TERMS_JOIN}
        where ($1::boolean is null or o.active = $1::boolean)
        order by o.created_at desc, o.id desc`,
      [activeFilter],
    );
    return rows.map(offeringFromRow);
  }

  async listTerms(id: string): Promise<OfferingTermsItem[]> {
    const [offering] = await this.db.query('select 1 from offerings where id = $1', [id]);
    if (!offering) throw new NotFoundError(`Offering ${id} was not found`);

    const rows = await this.db.query<TermsRow>(
      `select ${TERMS_COLUMNS}
         from offering_terms t
        where t.offering_id = $1
        order by t.version desc`,
      [id],
    );
    return rows.map(termsFromRow);
  }

  /**
   * Church landing totals (ticket 23). Two batched statements — contributions,
   * then the as-at pledge measures — with no per-row read (NFR-1, NFR-5).
   * `currency` is the largest paid currency in the window (tie broken by code)
   * and every other currency is excluded from all totals (23-Q8, R2). The
   * report date is `min(to, today)` (R2/R7).
   */
  async summary(
    from: string,
    to: string,
    todayUtc = todayUtcDate(),
  ): Promise<ChurchOfferingSummary> {
    const [contributions] = await this.db.query<SummaryContributionRow>(
      OFFERING_SUMMARY_CONTRIBUTIONS_SQL,
      [from, to],
    );
    const currency = contributions?.currency ?? 'GHS';
    const [pledges] = await this.db.query<SummaryPledgeRow>(OFFERING_SUMMARY_PLEDGES_SQL, [
      from,
      to,
      todayUtc,
      currency,
    ]);

    const pledgeByMember = new Map<string, { pledgedMinor: number; outstandingMinor: number }>();
    for (const row of parseJsonArray(pledges?.members) as SummaryPledgedGroupJson[]) {
      if (!row.memberNo) continue;
      pledgeByMember.set(row.memberNo, {
        pledgedMinor: Number(row.pledgedMinor),
        outstandingMinor: Number(row.outstandingMinor),
      });
    }
    const members = (parseJsonArray(contributions?.members) as SummaryMemberJson[]).map((row) => ({
      memberNo: row.memberNo,
      name: row.name,
      paidMinor: Number(row.paidMinor),
      pledgedMinor: pledgeByMember.get(row.memberNo)?.pledgedMinor ?? 0,
      outstandingMinor: pledgeByMember.get(row.memberNo)?.outstandingMinor ?? 0,
      lastGivenOn: row.lastGivenOn,
    }));

    const offerings = new Map<string, ChurchOfferingSummary['offerings'][number]>();
    for (const row of parseJsonArray(contributions?.offerings) as SummaryPaidGroupJson[]) {
      if (!row.offeringId) continue;
      offerings.set(row.offeringId, {
        offeringId: row.offeringId,
        name: row.name,
        paidMinor: Number(row.paidMinor),
        pledgedMinor: 0,
        outstandingMinor: 0,
      });
    }
    for (const row of parseJsonArray(pledges?.offerings) as SummaryPledgedGroupJson[]) {
      if (!row.offeringId) continue;
      const existing = offerings.get(row.offeringId);
      if (existing) {
        existing.pledgedMinor = Number(row.pledgedMinor);
        existing.outstandingMinor = Number(row.outstandingMinor);
        continue;
      }
      offerings.set(row.offeringId, {
        offeringId: row.offeringId,
        name: row.name ?? 'Offering',
        paidMinor: 0,
        pledgedMinor: Number(row.pledgedMinor),
        outstandingMinor: Number(row.outstandingMinor),
      });
    }

    const events = new Map<string, ChurchOfferingSummary['events'][number]>();
    for (const row of parseJsonArray(contributions?.events) as SummaryPaidGroupJson[]) {
      if (!row.eventId) continue;
      events.set(row.eventId, {
        eventId: row.eventId,
        name: row.name,
        paidMinor: Number(row.paidMinor),
        pledgedMinor: 0,
        outstandingMinor: 0,
      });
    }
    for (const row of parseJsonArray(pledges?.events) as SummaryPledgedGroupJson[]) {
      if (!row.eventId) continue;
      const existing = events.get(row.eventId);
      if (existing) {
        existing.pledgedMinor = Number(row.pledgedMinor);
        existing.outstandingMinor = Number(row.outstandingMinor);
        continue;
      }
      events.set(row.eventId, {
        eventId: row.eventId,
        name: row.name ?? 'Event',
        paidMinor: 0,
        pledgedMinor: Number(row.pledgedMinor),
        outstandingMinor: Number(row.outstandingMinor),
      });
    }

    const groupSort = (
      left: { name: string; paidMinor: number; pledgedMinor: number },
      right: { name: string; paidMinor: number; pledgedMinor: number },
      leftId: string,
      rightId: string,
    ): number =>
      right.paidMinor - left.paidMinor ||
      right.pledgedMinor - left.pledgedMinor ||
      left.name.localeCompare(right.name) ||
      leftId.localeCompare(rightId);

    return {
      from,
      to,
      currency,
      totalPaidMinor: Number(contributions?.total_paid ?? 0),
      totalPledgedMinor: Number(pledges?.total_pledged ?? 0),
      totalOutstandingMinor: Number(pledges?.total_outstanding ?? 0),
      visitors: {
        count: Number(contributions?.visitor_count ?? 0),
        paidMinor: Number(contributions?.visitor_paid ?? 0),
      },
      members,
      offerings: [...offerings.values()].sort((left, right) =>
        groupSort(left, right, left.offeringId, right.offeringId),
      ),
      events: [...events.values()].sort((left, right) =>
        groupSort(left, right, left.eventId, right.eventId),
      ),
      pledges: {
        pending: Number(pledges?.pending_count ?? 0),
        honored: Number(pledges?.honored_count ?? 0),
        dishonored: Number(pledges?.dishonored_count ?? 0),
        overdue: Number(pledges?.overdue_count ?? 0),
      },
    };
  }

  /** A stale `baseVersion` is a conflict; a published version is never edited. */
  async publishTerms(
    id: string,
    input: TermsPublishInput,
    actor: string,
  ): Promise<OfferingTermsItem> {
    const terms = normalizeTerms(input);

    return this.db.transaction(async (tx) => {
      const [offering] = await tx.query<{ id: string }>(
        'select id from offerings where id = $1 for update',
        [id],
      );
      if (!offering) throw new NotFoundError(`Offering ${id} was not found`);

      const [current] = await tx.query<{ version: number | string | null }>(
        'select max(version) as version from offering_terms where offering_id = $1',
        [id],
      );
      const currentVersion = Number(current?.version ?? 0);
      if (currentVersion !== input.baseVersion) {
        throw new TermsVersionConflictError(
          `Terms version ${input.baseVersion} is not current (latest is ${currentVersion})`,
        );
      }

      const version = currentVersion + 1;
      const [inserted] = await tx.query<TermsRow>(
        INSERT_TERMS_SQL,
        termsParams(id, version, terms, input.reason, actor),
      );
      return termsFromRow(inserted!);
    });
  }

  async setActive(id: string, active: boolean, actor: string): Promise<OfferingItem> {
    const [updated] = await this.db.query<{ id: string }>(
      `update offerings
          set active = $2, updated_at = now(), updated_by = $3
        where id = $1
        returning id`,
      [id, active, actor],
    );
    if (!updated) throw new NotFoundError(`Offering ${id} was not found`);
    return this.get(id);
  }

  async attachToEvent(
    eventId: string,
    input: AttachInput,
    actor: string,
  ): Promise<OfferingAttachmentItem> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx.query<EventGuardRow>(
        'select id, status, end_date, sessions from event_instances where id = $1',
        [eventId],
      );
      if (!event) throw new NotFoundError(`Event ${eventId} was not found`);

      const endDate = requiredDate(event.end_date);
      if (event.status === 'cancelled' || event.status === 'archived') {
        throw new EventNotActiveError(
          `Event ${eventId} is ${event.status} and cannot take offerings`,
        );
      }
      if (endDate < todayUtcDate()) {
        throw new EventNotActiveError(`Event ${eventId} has already ended`);
      }

      await assertActiveOffering(tx, input.offeringId);

      const availableUntil = input.availableUntil
        ? assertDate(input.availableUntil, 'availableUntil')
        : null;
      if (availableUntil !== null && availableUntil < endDate) {
        throw new ValidationError(
          `availableUntil ${availableUntil} must be on or after the event end ${endDate}`,
        );
      }

      await assertNotAttached(tx, input.offeringId, { eventId });

      try {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into event_instance_offerings
             (event_instance_id, series_id, offering_id, available_until, attached_by)
           values ($1, null, $2, $3, $4)
           returning id`,
          [eventId, input.offeringId, availableUntil, actor],
        );
        return {
          attachmentId: inserted!.id,
          offeringId: input.offeringId,
          availableUntil,
          terms: await currentTerms(tx, input.offeringId),
        };
      } catch (error) {
        if (sqlState(error) === '23505') {
          throw new OfferingAlreadyAttachedError(
            `Offering ${input.offeringId} is already attached to event ${eventId}`,
          );
        }
        throw error;
      }
    });
  }

  async attachToSeries(
    seriesId: string,
    input: SeriesAttachInput,
    actor: string,
  ): Promise<OfferingAttachmentItem> {
    return this.db.transaction(async (tx) => {
      const [series] = await tx.query<{ id: string; archived_at: unknown }>(
        'select id, archived_at from event_series where id = $1',
        [seriesId],
      );
      if (!series) throw new NotFoundError(`Series ${seriesId} was not found`);
      if (series.archived_at !== null && series.archived_at !== undefined) {
        throw new EventNotActiveError(`Series ${seriesId} is archived and cannot take offerings`);
      }

      await assertActiveOffering(tx, input.offeringId);
      await assertNotAttached(tx, input.offeringId, { seriesId });

      try {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into event_instance_offerings
             (event_instance_id, series_id, offering_id, available_until, attached_by)
           values (null, $1, $2, null, $3)
           returning id`,
          [seriesId, input.offeringId, actor],
        );
        return {
          attachmentId: inserted!.id,
          offeringId: input.offeringId,
          availableUntil: null,
          terms: await currentTerms(tx, input.offeringId),
        };
      } catch (error) {
        if (sqlState(error) === '23505') {
          throw new OfferingAlreadyAttachedError(
            `Offering ${input.offeringId} is already attached to series ${seriesId}`,
          );
        }
        throw error;
      }
    });
  }

  async detachFromEvent(eventId: string, offeringId: string, actor: string): Promise<void> {
    const [detached] = await this.db.query<{ id: string }>(
      `update event_instance_offerings
          set detached_on = now(), detached_by = $3
        where event_instance_id = $1 and offering_id = $2 and detached_on is null
        returning id`,
      [eventId, offeringId, actor],
    );
    if (!detached) {
      throw new NotFoundError(
        `Offering ${offeringId} has no active attachment on event ${eventId}`,
      );
    }
  }

  async detachFromSeries(seriesId: string, offeringId: string, actor: string): Promise<void> {
    const [detached] = await this.db.query<{ id: string }>(
      `update event_instance_offerings
          set detached_on = now(), detached_by = $3
        where series_id = $1 and offering_id = $2 and detached_on is null
        returning id`,
      [seriesId, offeringId, actor],
    );
    if (!detached) {
      throw new NotFoundError(
        `Offering ${offeringId} has no active attachment on series ${seriesId}`,
      );
    }
  }

  async listEventAttachments(eventId: string): Promise<OfferingAttachmentItem[]> {
    const [event] = await this.db.query('select 1 from event_instances where id = $1', [eventId]);
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    return this.listAttachments('event_instance_id', eventId);
  }

  async listSeriesAttachments(seriesId: string): Promise<OfferingAttachmentItem[]> {
    const [series] = await this.db.query('select 1 from event_series where id = $1', [seriesId]);
    if (!series) throw new NotFoundError(`Series ${seriesId} was not found`);
    return this.listAttachments('series_id', seriesId);
  }

  private async listAttachments(
    column: 'event_instance_id' | 'series_id',
    targetId: string,
  ): Promise<OfferingAttachmentItem[]> {
    const rows = await this.db.query<AttachmentRow>(
      `select a.id as attachment_id, a.offering_id, a.event_instance_id, a.series_id,
              a.available_until as attachment_available_until, ${TERMS_COLUMNS}
         from event_instance_offerings a
         join offerings o on o.id = a.offering_id
         ${CURRENT_TERMS_JOIN}
        where a.${column} = $1 and a.detached_on is null
        order by a.attached_on, a.id`,
      [targetId],
    );
    return rows.map((row) => ({
      attachmentId: row.attachment_id,
      offeringId: row.offering_id,
      availableUntil: isoDate(row.attachment_available_until),
      terms: termsFromRow(row),
    }));
  }

  /**
   * Append a skip/opt-in. An event accepts `skip` on one of its session dates;
   * a series accepts `skip` on a date it meets and `opt_in` on an extra date.
   */
  async addException(
    kind: ExceptionKind,
    targetId: string,
    offeringId: string,
    input: ExceptionInput,
    actor: string,
  ): Promise<ExceptionRowItem> {
    const date = assertDate(input.date);
    const note = input.note ?? null;

    return this.db.transaction(async (tx) => {
      const attachmentId = await activeAttachmentId(tx, kind, targetId, offeringId);

      if (kind === 'event') {
        const [event] = await tx.query<{ sessions: unknown }>(
          'select sessions from event_instances where id = $1',
          [targetId],
        );
        const sessionDates = new Set(
          parseJsonArray(event!.sessions).map((session) =>
            requiredDate((session as { date?: unknown }).date),
          ),
        );
        if (input.kind !== 'skip') {
          throw new InvalidExceptionDateError('An event attachment accepts only a skip exception');
        }
        if (!sessionDates.has(date)) {
          throw new InvalidExceptionDateError(`${date} is not a session date of event ${targetId}`);
        }
      } else if (input.kind === 'skip') {
        if (!(await isHeldOccurrence(tx, targetId, date))) {
          throw new InvalidExceptionDateError(`${date} is not a date the series meets`);
        }
      } else {
        const [extra] = await tx.query<{ occurs_on: unknown }>(
          `select occurs_on from series_exceptions
            where series_id = $1 and occurs_on = $2 and kind = 'extra'`,
          [targetId, date],
        );
        if (!extra) {
          throw new InvalidExceptionDateError(`${date} is not an extra date of the series`);
        }
      }

      const [inserted] = await tx.query<{
        id: string;
        date: unknown;
        kind: string;
        note: string | null;
        created_at: unknown;
        created_by: string;
      }>(
        `insert into offering_exceptions (attachment_id, date, kind, note, created_by)
         values ($1, $2, $3, $4, $5)
         returning id, date, kind, note, created_at, created_by`,
        [attachmentId, date, input.kind, note, actor],
      );
      return exceptionRow(inserted!);
    });
  }

  async listExceptions(
    kind: ExceptionKind,
    targetId: string,
    offeringId: string,
  ): Promise<ExceptionRowItem[]> {
    const attachmentId = await activeAttachmentId(this.db, kind, targetId, offeringId);
    const rows = await this.db.query<{
      id: string;
      date: unknown;
      kind: string;
      note: string | null;
      created_at: unknown;
      created_by: string;
    }>(
      `select id, date, kind, note, created_at, created_by
         from offering_exceptions
        where attachment_id = $1
        order by created_at desc, id desc`,
      [attachmentId],
    );
    return rows.map(exceptionRow);
  }
}

/**
 * One batched read for the event aggregate: active event and series
 * attachments, their current terms, effective exceptions and active-attachment
 * counts. No query runs per event.
 */
export async function eventOfferingsFor(
  db: DbClient,
  eventIds: string[],
  todayUtc: string,
): Promise<Map<string, EventOfferingItem[]>> {
  const result = new Map<string, EventOfferingItem[]>();
  for (const id of eventIds) result.set(id, []);
  if (eventIds.length === 0) return result;

  const events = await db.query<EventContextRow>(
    `select id, name, end_date, series_id, sessions
       from event_instances
      where id = any($1::uuid[])`,
    [eventIds],
  );
  if (events.length === 0) return result;

  const seriesIds = [
    ...new Set(events.map((event) => event.series_id).filter((id): id is string => id !== null)),
  ];

  const attachments = await db.query<AttachmentRow>(
    `select a.id as attachment_id, a.offering_id, a.event_instance_id, a.series_id,
            a.available_until as attachment_available_until, ${TERMS_COLUMNS}
       from event_instance_offerings a
       join lateral (
         select *
         from offering_terms t
         where t.offering_id = a.offering_id
         order by t.version desc
         limit 1
       ) t on true
      where a.detached_on is null
        and (a.event_instance_id = any($1::uuid[]) or a.series_id = any($2::uuid[]))
      order by a.attached_on, a.id`,
    [eventIds, seriesIds],
  );

  const attachmentIds = attachments.map((attachment) => attachment.attachment_id);
  const exceptionRows =
    attachmentIds.length === 0
      ? []
      : await db.query<{
          attachment_id: string;
          date: unknown;
          kind: string;
          note: string | null;
        }>(
          `select attachment_id, date, kind, note
             from offering_exceptions
            where attachment_id = any($1::uuid[])
            order by created_at desc, id desc`,
          [attachmentIds],
        );

  // Newest first, so the first row seen for a date is the effective exception.
  const effective = new Map<
    string,
    Map<string, { date: string; kind: 'skip' | 'opt_in'; note: string | null }>
  >();
  for (const row of exceptionRows) {
    const byDate = effective.get(row.attachment_id) ?? new Map();
    const date = requiredDate(row.date);
    if (!byDate.has(date)) {
      byDate.set(date, { date, kind: row.kind as 'skip' | 'opt_in', note: row.note });
    }
    effective.set(row.attachment_id, byDate);
  }

  const offeredIds = [...new Set(attachments.map((attachment) => attachment.offering_id))];
  const counts =
    offeredIds.length === 0
      ? []
      : await db.query<{ offering_id: string; attached_events: number | string }>(
          `select offering_id, count(*)::int as attached_events
             from event_instance_offerings
            where detached_on is null
              and event_instance_id is not null
              and offering_id = any($1::uuid[])
            group by offering_id`,
          [offeredIds],
        );
  const countsByOffering = new Map(
    counts.map((row) => [row.offering_id, Number(row.attached_events)]),
  );

  for (const event of events) {
    const sessionDates = new Set(
      parseJsonArray(event.sessions).map((session) =>
        requiredDate((session as { date?: unknown }).date),
      ),
    );
    const items = result.get(event.id)!;

    for (const attachment of attachments) {
      const appliesToEvent =
        attachment.event_instance_id === event.id ||
        (event.series_id !== null && attachment.series_id === event.series_id);
      if (!appliesToEvent) continue;

      const terms = termsFromRow(attachment);
      const availableUntil = effectiveAvailableUntil({
        attachmentAvailableUntil: isoDate(attachment.attachment_available_until),
        termsAvailableUntil: terms.availableUntil,
        eventEndDate: requiredDate(event.end_date),
      });
      const exceptions = [...(effective.get(attachment.attachment_id)?.values() ?? [])]
        .filter((exception) => sessionDates.has(exception.date))
        .sort((a, b) => a.date.localeCompare(b.date));

      items.push({
        offeringId: attachment.offering_id,
        name: terms.name?.trim() ? terms.name.trim() : `${event.name} · ${KIND_LABELS[terms.kind]}`,
        availableUntil,
        expired: isExpired(availableUntil, todayUtc),
        terms,
        exceptions,
        stats: {
          attachedEvents: countsByOffering.get(attachment.offering_id) ?? 0,
          pledgedMinor: 0,
          paidMinor: 0,
          pendingMinor: 0,
          honorRate: 0,
          contributionCount: 0,
        },
      });
    }
  }

  return result;
}
