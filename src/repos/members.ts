import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  CardInUseError,
  ConflictError,
  NotFoundError,
  SessionClosedError,
  ValidationError,
} from '../errors/domain-errors.js';
import { ageInYears } from '../domain/age.js';
import { summariseAttendance, type AttendanceCounts } from '../domain/attendance.js';
import { assertDate, normalizeContactValue, type ContactKind } from '../domain/contacts.js';
import { seriesStart, todayIn } from '../domain/series.js';
import { sessionIsClosed } from './captures.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import {
  memberContactLinks,
  memberContacts,
  members,
  subscriptionCoverage,
  subscriptions as subscriptionsTable,
} from '../db/schema.js';
import { sqlConstraint, sqlState } from '../errors/sqlstate.js';
import { loadContacts, type ContactDto } from './contacts.js';
import {
  loadCalendar,
  resolveCalendarOccurrences,
  resolveSeriesOccurrences,
} from './occurrences.js';

import {
  GENDERS,
  RELATIONSHIP_TYPES,
  type Gender,
  type RelationshipType,
} from '../domain/member-types.js';
import {
  SubscriptionRepository,
  SUBSCRIPTION_KINDS,
  type SubscriptionDto,
  type SubscriptionKind,
} from './subscriptions.js';

export {
  GENDERS,
  RELATIONSHIP_TYPES,
  SUBSCRIPTION_KINDS,
  type Gender,
  type RelationshipType,
  type SubscriptionDto,
  type SubscriptionKind,
};

export interface MinistryDto {
  code: string;
  name: string;
}

export interface RelationshipDto {
  id: string;
  type: RelationshipType;
  isDependent: boolean;
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  archived: boolean;
}

export interface AttendanceEntryDto {
  id: string;
  date: string;
  source: 'import' | 'manual';
}

export interface AttendanceSeriesDto extends AttendanceCounts {
  seriesId: string;
  seriesName: string;
  ministry: string | null;
  entries: AttendanceEntryDto[];
}

/** Page-level attendance for one series; `lastAttendedOn` is in the same window. */
export interface MemberAttendanceSummary extends AttendanceCounts {
  seriesId: string;
  seriesName: string;
  lastAttendedOn: string | null;
}

export interface MemberSubscriptionSummary {
  id: string;
  kind: SubscriptionKind | null;
  scope: 'individual' | 'household';
  status: 'active' | 'ended';
  role: 'policyholder' | 'covered';
  policyholderMemberNo: string;
  coveredCount: number;
}

export interface MemberContributionWindow {
  from: string;
  to: string;
  paidMinor: number;
}

export interface MemberContributionSummary {
  currency: string;
  week: MemberContributionWindow;
  quarter: MemberContributionWindow;
  year: MemberContributionWindow;
  topEvents: Array<{ eventId: string; name: string; paidMinor: number }>;
}

export interface MemberAttendanceWindow {
  from: string;
  to: string;
  attended: number;
  expected: number;
  events: Array<{ eventId: string; name: string; sessionDate: string }>;
}

export interface MemberProfile {
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  ministries: string[];
  shepherd: {
    memberNo: string;
    name: string;
    gender: Gender;
    age: number | null;
  } | null;
  attendance: {
    status: 'regular' | 'non_regular' | 'not_enough_data';
    attended: number;
    expected: number;
    window: 5;
    lastAttendedOn: string | null;
  };
}

interface ScopedSession {
  eventId: string;
  name: string;
  sessionDate: string;
  startTime: string | null;
  attended: boolean;
}

export interface MemberSummary {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: Gender;
  /** Derived current age, or null when `dob` is missing or in the future. */
  age: number | null;
  placeOfResidence: string | null;
  joinedOn: string | null;
  isPresbyter: boolean;
  archivedAt: string | null;
  /** Count only; the list never carries contact values. */
  contactCount: number;
  ministries: MinistryDto[];
  /** Present only when the list is requested with `include=attendance&seriesId=`. */
  attendance?: MemberAttendanceSummary | null;
  /** Present only when the list is requested with `include=subscriptions`. */
  subscriptions?: MemberSubscriptionSummary[];
}

export interface MemberDetail extends Omit<MemberSummary, 'attendance' | 'subscriptions'> {
  id: string;
  /** Senior presbyter rank; valid only while `isPresbyter` is true. */
  presbyterRank: number | null;
  /** Detail-only back-office card number; null when not on file. */
  membershipCardNo: string | null;
  /** Detail-only officer-set verification timestamp; null means unverified. */
  verifiedAt: string | null;
  maidenName: string | null;
  alias: string | null;
  dob: string | null;
  addressLine: string | null;
  purgedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  contacts: ContactDto[];
  subscriptions: SubscriptionDto[];
  relationships: RelationshipDto[];
  attendance: AttendanceSeriesDto[];
}

export interface ContactInput {
  kind: ContactKind;
  value: string;
  displayOrder?: number;
}

export interface CreateMemberInput {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  maidenName?: string | null;
  alias?: string | null;
  dob?: string | null;
  gender?: Gender;
  placeOfResidence?: string | null;
  addressLine?: string | null;
  joinedOn?: string | null;
  isPresbyter?: boolean;
  presbyterRank?: number | null;
  /** Trimmed, 1-32 characters, case-insensitively unique when present. */
  membershipCardNo?: string | null;
  /** Sets (true) or clears (false) the officer verification timestamp. */
  verified?: boolean;
  contacts?: ContactInput[];
  ministries?: string[];
}

export type UpdateMemberInput = Partial<
  Omit<CreateMemberInput, 'memberNo' | 'contacts' | 'ministries'>
>;

export const LIST_INCLUDES = ['attendance', 'subscriptions'] as const;
export type ListInclude = (typeof LIST_INCLUDES)[number];

export interface ListQuery {
  q?: string;
  contact?: string;
  status?: 'active' | 'archived';
  /** Deprecated alias for active + archived. */
  includeArchived?: boolean;
  /** Active members with no active shepherding assignment (FR-8a). */
  unassigned?: boolean;
  include?: ListInclude[];
  seriesId?: string;
  limit?: number;
  cursor?: string;
}

interface SummaryOptions {
  includeAttendance?: boolean;
  includeSubscriptions?: boolean;
  seriesId?: string;
}

export interface SubscriptionInput {
  kind: SubscriptionKind;
  scope: 'individual' | 'household';
  reference?: string | null;
  startedOn?: string;
  coveredMemberNos?: string[];
}

interface MemberRow extends Row {
  id: string;
  member_no: string;
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
  maiden_name: string | null;
  alias: string | null;
  dob: string | null;
  gender: Gender;
  place_of_residence: string | null;
  address_line: string | null;
  joined_on: string | null;
  is_presbyter: boolean;
  presbyter_rank: number | null;
  membership_card_no: string | null;
  verified_at: Date | string | null;
  archived_at: Date | string | null;
  purged_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/** Aliases keep the snake_case `MemberRow` shape the raw queries returned. */
const memberColumns = {
  id: members.id,
  member_no: members.memberNo,
  first_name: members.firstName,
  last_name: members.lastName,
  other_names: members.otherNames,
  maiden_name: members.maidenName,
  alias: members.alias,
  dob: members.dob,
  gender: members.gender,
  place_of_residence: members.placeOfResidence,
  address_line: members.addressLine,
  joined_on: members.joinedOn,
  is_presbyter: members.isPresbyter,
  presbyter_rank: members.presbyterRank,
  membership_card_no: members.membershipCardNo,
  verified_at: members.verifiedAt,
  archived_at: members.archivedAt,
  purged_at: members.purgedAt,
  version: members.version,
  created_at: members.createdAt,
  updated_at: members.updatedAt,
} as const;

type Statement = ReturnType<typeof sql>;

type MemberSet = Partial<
  Omit<typeof members.$inferInsert, 'version' | 'updatedAt' | 'updatedBy'>
> & {
  version: Statement;
  updatedAt: Statement;
  updatedBy: string;
};

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

function requiredText(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new ValidationError(`${field} is required`);
  return trimmed;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** First + last, with other names only when both are empty. */
function displayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  otherNames: string | null | undefined,
): string {
  const first = firstName?.trim() ?? '';
  const last = lastName?.trim() ?? '';
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return otherNames?.trim() ?? '';
}

function assertMemberNo(value: string): string {
  if (!MEMBER_NO_PATTERN.test(value)) {
    throw new ValidationError(
      'memberNo must be 1-32 characters and contain only letters, digits, hyphens or underscores',
    );
  }
  return value;
}

/** A present card is trimmed to 1-32 characters; blank input clears it. */
function normalizeCardNo(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 32) {
    throw new ValidationError('membershipCardNo must be 1-32 characters');
  }
  return trimmed;
}

/** Bumps the optimistic-concurrency version after any change to the aggregate. */
async function touch(client: DbClient, memberId: string, actor: string): Promise<void> {
  await client.query(
    'update members set version = version + 1, updated_at = now(), updated_by = $2 where id = $1',
    [memberId, actor],
  );
}

export class MemberRepository {
  constructor(private readonly db: Db) {}

  async list(query: ListQuery): Promise<{ items: MemberSummary[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const params: unknown[] = [];
    const where: string[] = [];

    if (query.unassigned) {
      // FR-8a: the same predicate the church report counts, and it implies active.
      where.push(
        `m.archived_at is null and m.purged_at is null
         and not exists (
           select 1 from shepherding_assignments a
           where a.member_id = m.id and a.ended_on is null
         )`,
      );
    } else if (query.status === 'archived') {
      where.push('m.archived_at is not null and m.purged_at is null');
    } else if (query.status === 'active') {
      where.push('m.archived_at is null and m.purged_at is null');
    } else if (query.includeArchived) {
      // Deprecated alias: active + archived, never purged.
      where.push('m.purged_at is null');
    } else {
      where.push('m.archived_at is null and m.purged_at is null');
    }

    if (query.q) {
      params.push(`%${query.q}%`);
      const p = `$${params.length}`;
      where.push(`(
        m.member_no ilike ${p} or m.first_name ilike ${p} or m.last_name ilike ${p}
        or m.other_names ilike ${p} or m.alias ilike ${p} or m.maiden_name ilike ${p}
      )`);
    }

    if (query.contact) {
      const normalized = new Set<string>();
      for (const kind of ['phone', 'whatsapp', 'email'] as const) {
        try {
          normalized.add(normalizeContactValue(kind, query.contact));
        } catch {
          // Not a valid value for this channel; try the next one.
        }
      }
      if (normalized.size === 0) {
        throw new ValidationError('contact must be a phone number or email address');
      }

      params.push([...normalized]);
      const p = `$${params.length}`;
      where.push(`(
        exists (select 1 from member_contacts c where c.member_id = m.id and c.normalized_value = any(${p}::text[]))
        or exists (
          select 1 from member_contact_links l join member_contacts c on c.id = l.contact_id
          where l.member_id = m.id and c.normalized_value = any(${p}::text[])
        )
      )`);
    }

    if (query.cursor) {
      params.push(query.cursor);
      where.push(`lower(m.member_no) > lower($${params.length})`);
    }

    params.push(limit + 1);
    const rows = await this.db.query<MemberRow>(
      `select m.* from members m
       ${where.length ? `where ${where.join(' and ')}` : ''}
       order by lower(m.member_no) asc
       limit $${params.length}`,
      params,
    );

    const page = rows.slice(0, limit);
    const include = new Set(query.include ?? []);
    const items = await this.toSummaries(page, {
      includeAttendance: include.has('attendance'),
      includeSubscriptions: include.has('subscriptions'),
      seriesId: query.seriesId,
    });

    return {
      items,
      ...(rows.length > limit ? { nextCursor: page[page.length - 1]?.member_no } : {}),
    };
  }

  async get(memberNo: string, includeArchived = false): Promise<MemberDetail | null> {
    const row = await this.findRow(memberNo, includeArchived);
    return row ? this.toDetail(row) : null;
  }

  /**
   * One member-scoped aggregate for the USSD "My payments" screen: paid member
   * gifts only (visitor gifts never appear), UTC calendar windows ending today,
   * and the three events with the highest paid amount this year.
   */
  async contributionsSummary(memberNo: string): Promise<MemberContributionSummary> {
    await this.requireRow(memberNo);
    const today = todayIn('UTC');

    const [row] = await this.db.query<{
      week_from: unknown;
      quarter_from: unknown;
      year_from: unknown;
      to_date: unknown;
      week_paid: number | string;
      quarter_paid: number | string;
      year_paid: number | string;
      currency: string;
      top_events: unknown;
    }>(
      `with bounds as (
         select $1::date as to_date,
                date_trunc('week', $1::date)::date as week_from,
                date_trunc('quarter', $1::date)::date as quarter_from,
                date_trunc('year', $1::date)::date as year_from
       ),
       chosen as (
         -- One currency per summary (no FX); the member's largest paid currency wins.
         select coalesce((
           select c2.currency
             from contributions c2
             join members m2 on m2.id = c2.member_id
            where lower(m2.member_no) = lower($2)
              and c2.status = 'paid'
            group by c2.currency
            order by sum(c2.amount_minor) desc, c2.currency asc
            limit 1
         ), 'GHS') as currency
       ),
       totals as (
         select
           coalesce(sum(c.amount_minor) filter (where c.session_date >= b.week_from), 0)
             as week_paid,
           coalesce(sum(c.amount_minor) filter (where c.session_date >= b.quarter_from), 0)
             as quarter_paid,
           coalesce(sum(c.amount_minor) filter (where c.session_date >= b.year_from), 0)
             as year_paid
         from contributions c
         join members m on m.id = c.member_id
         cross join bounds b
         cross join chosen ch
         where lower(m.member_no) = lower($2)
           and c.status = 'paid'
           and c.currency = ch.currency
       ),
       top as (
         select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'eventId', t.event_id,
               'name', t.name,
               'paidMinor', t.paid
             )
             order by t.paid desc, t.name asc, t.event_id asc
           ),
           '[]'::jsonb
         ) as items
         from (
           select e.id as event_id, e.name, sum(c.amount_minor)::bigint as paid
             from contributions c
             join members m on m.id = c.member_id
             join event_instances e on e.id = c.event_instance_id
             cross join bounds b
             cross join chosen ch
            where lower(m.member_no) = lower($2)
              and c.status = 'paid'
              and c.session_date >= b.year_from
              and c.currency = ch.currency
            group by e.id, e.name
            order by paid desc, e.name asc, e.id asc
            limit 3
         ) t
       )
       select b.week_from, b.quarter_from, b.year_from, b.to_date,
              totals.week_paid, totals.quarter_paid, totals.year_paid, chosen.currency,
              top.items as top_events
         from bounds b
         cross join chosen
         cross join totals
         cross join top`,
      [today, memberNo],
    );

    const to = isoDate(row!.to_date)!;
    const topEvents = (
      parseJsonArray(row!.top_events) as Array<{
        eventId: string;
        name: string;
        paidMinor: number | string;
      }>
    ).map((event) => ({
      eventId: event.eventId,
      name: event.name,
      paidMinor: Number(event.paidMinor),
    }));

    return {
      currency: row!.currency,
      week: {
        from: isoDate(row!.week_from)!,
        to,
        paidMinor: Number(row!.week_paid),
      },
      quarter: {
        from: isoDate(row!.quarter_from)!,
        to,
        paidMinor: Number(row!.quarter_paid),
      },
      year: {
        from: isoDate(row!.year_from)!,
        to,
        paidMinor: Number(row!.year_paid),
      },
      topEvents,
    };
  }

  /**
   * Windowed attendance over held, member-trackable sessions that apply to the
   * member. Absences are never fabricated: `events` carries attended rows only.
   */
  async attendanceSummary(
    memberNo: string,
    from: string,
    to: string,
  ): Promise<MemberAttendanceWindow> {
    const row = await this.requireRow(memberNo);
    const fromDate = assertDate(from, 'from');
    const toDate = assertDate(to, 'to');
    if (fromDate > toDate) throw new ValidationError('from must not be after to');

    const sessions = await this.scopedSessions(row.id, fromDate, toDate, null);
    const attended = sessions
      .filter((session) => session.attended)
      .sort(
        (a, b) =>
          b.sessionDate.localeCompare(a.sessionDate) ||
          (b.startTime ?? '').localeCompare(a.startTime ?? '') ||
          a.eventId.localeCompare(b.eventId),
      );

    return {
      from: fromDate,
      to: toDate,
      attended: attended.length,
      expected: sessions.length,
      events: attended.map((session) => ({
        eventId: session.eventId,
        name: session.name,
        sessionDate: session.sessionDate,
      })),
    };
  }

  /**
   * Identity, up to three ministries, the active shepherd and regularity over
   * the last five held scoped sessions. Floors are shared with the summary.
   */
  async profile(memberNo: string): Promise<MemberProfile> {
    const row = await this.requireRow(memberNo);

    const ministries = (await this.ministriesFor(row.id)).slice(0, 3).map((item) => item.name);
    const sessions = await this.scopedSessions(row.id, null, null, 5);
    const attended = sessions.filter((session) => session.attended);
    const lastAttendedOn = attended.length
      ? attended
          .map((session) => session.sessionDate)
          .reduce((latest, date) => (date > latest ? date : latest))
      : null;

    const status: MemberProfile['attendance']['status'] =
      sessions.length < 3
        ? 'not_enough_data'
        : attended.length / sessions.length >= 0.6
          ? 'regular'
          : 'non_regular';

    const [shepherd] = await this.db.query<{
      member_no: string;
      first_name: string | null;
      last_name: string | null;
      other_names: string | null;
      gender: Gender;
      dob: string | Date | null;
    }>(
      `select o.member_no, o.first_name, o.last_name, o.other_names, o.gender, o.dob
         from shepherding_assignments a
         join members o on o.id = a.officer_member_id
        where a.member_id = $1 and a.ended_on is null
        order by a.assigned_on desc, a.created_at desc
        limit 1`,
      [row.id],
    );

    return {
      memberNo: row.member_no,
      name: displayName(row.first_name, row.last_name, row.other_names),
      gender: row.gender,
      age: ageInYears(isoDate(row.dob)),
      ministries,
      shepherd: shepherd
        ? {
            memberNo: shepherd.member_no,
            name: displayName(shepherd.first_name, shepherd.last_name, shepherd.other_names),
            gender: shepherd.gender,
            age: ageInYears(isoDate(shepherd.dob)),
          }
        : null,
      attendance: {
        status,
        attended: attended.length,
        expected: sessions.length,
        window: 5,
        lastAttendedOn,
      },
    };
  }

  /**
   * One scoped-session read shared by the window and the profile. A session is
   * in scope when it is held (on or before the event's today), not cancelled,
   * member-trackable, and either general or in one of the member's active
   * ministries; join and ministry-assignment floors drop sessions entirely.
   */
  private async scopedSessions(
    memberId: string,
    from: string | null,
    to: string | null,
    limit: number | null,
  ): Promise<ScopedSession[]> {
    const rows = await this.db.query<{
      event_id: string;
      name: string;
      session_date: string | Date;
      start_time: string | null;
      attended: boolean;
    }>(
      `select e.id as event_id,
              e.name,
              (session->>'date')::date as session_date,
              e.start_time,
              exists (
                select 1 from attendance a
                 where a.event_instance_id = e.id
                   and a.session_date = (session->>'date')::date
                   and a.member_id = m.id
              ) as attended
         from members m
         join event_instances e on true
         left join event_series se on se.id = e.series_id
         cross join lateral jsonb_array_elements(e.sessions) session
        where m.id = $1
          and e.status not in ('cancelled', 'archived')
          and coalesce(e.tracks_members, true)
          and (not e.presbyter_only or m.is_presbyter)
          and coalesce(session->>'status', 'scheduled') <> 'cancelled'
          and (session->>'date')::date <= (now() at time zone e.timezone)::date
          and ($2::date is null or (session->>'date')::date >= $2::date)
          and ($3::date is null or (session->>'date')::date <= $3::date)
          and (m.joined_on is null or m.joined_on <= (session->>'date')::date)
          and (
            se.id is null
            or se.ministry_id is null
            or exists (
              select 1 from member_ministries mm
              join ministries mi on mi.id = mm.ministry_id
               where mm.member_id = m.id
                 and mm.ministry_id = se.ministry_id
                 and mm.assigned_on <= (session->>'date')::date
                 and mi.active
            )
          )
        order by (session->>'date')::date desc,
                 coalesce(e.start_time, '') desc,
                 e.id desc
        ${limit === null ? '' : 'limit $4'}`,
      limit === null ? [memberId, from, to] : [memberId, from, to, limit],
    );

    return rows.map((row) => ({
      eventId: row.event_id,
      name: row.name,
      sessionDate: isoDate(row.session_date)!,
      startTime: row.start_time,
      attended: row.attended,
    }));
  }

  async create(input: CreateMemberInput, actor: string): Promise<MemberDetail> {
    const id = await this.db.transaction((tx) => this.createWithin(tx, input, actor));
    const detail = await this.findById(id);
    return detail!;
  }

  /**
   * The member create path inside a caller-owned transaction, so approval can
   * create the member and mark its request in one unit of work.
   */
  async createWithin(db: DbClient, input: CreateMemberInput, actor: string): Promise<string> {
    const memberNo = assertMemberNo(requiredText(input.memberNo, 'memberNo'));
    const gender = input.gender ?? 'undisclosed';
    if (!GENDERS.includes(gender)) throw new ValidationError('gender is not recognised');
    const joinedOn = input.joinedOn ? assertDate(input.joinedOn, 'joinedOn') : todayIn('UTC');
    const dob = input.dob ? assertDate(input.dob, 'dob') : null;
    const isPresbyter = input.isPresbyter ?? false;
    const presbyterRank = input.presbyterRank ?? null;
    if (presbyterRank !== null && !isPresbyter) {
      throw new ValidationError('presbyterRank is valid only when isPresbyter is true');
    }
    if (presbyterRank !== null && (!Number.isInteger(presbyterRank) || presbyterRank < 1)) {
      throw new ValidationError('presbyterRank must be a positive integer');
    }
    const membershipCardNo = normalizeCardNo(input.membershipCardNo);
    const verifiedAt = input.verified === true ? new Date() : null;

    try {
      const [row] = await db.orm
        .insert(members)
        .values({
          memberNo,
          firstName: requiredText(input.firstName, 'firstName'),
          lastName: requiredText(input.lastName, 'lastName'),
          otherNames: optionalText(input.otherNames),
          maidenName: optionalText(input.maidenName),
          alias: optionalText(input.alias),
          dob,
          gender,
          placeOfResidence: optionalText(input.placeOfResidence),
          addressLine: optionalText(input.addressLine),
          joinedOn,
          isPresbyter,
          presbyterRank,
          membershipCardNo,
          verifiedAt,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning({ id: members.id });

      for (const [index, contact] of (input.contacts ?? []).entries()) {
        await this.insertContact(db, row!.id, contact, index);
      }
      for (const code of input.ministries ?? []) {
        await this.assignMinistryTx(db, row!.id, code);
      }
      return row!.id;
    } catch (error) {
      if (sqlState(error) === '23505') {
        const constraint = sqlConstraint(error);
        if (constraint === 'members_membership_card_no_ci') {
          throw new CardInUseError(
            `Membership card ${membershipCardNo} already belongs to a member`,
          );
        }
        throw new ConflictError(`A member with number ${memberNo} already exists`);
      }
      throw error;
    }
  }

  async update(
    memberNo: string,
    input: UpdateMemberInput,
    actor: string,
    expectedVersion?: number,
  ): Promise<MemberDetail> {
    const row = await this.requireRow(memberNo);

    if (input.isPresbyter === false && row.is_presbyter) {
      const [active] = await this.db.query<{ count: number }>(
        `select count(*)::int as count from shepherding_assignments
         where officer_member_id = $1 and ended_on is null`,
        [row.id],
      );
      if ((active?.count ?? 0) > 0) {
        throw new ConflictError(
          `Member ${memberNo} still shepherds ${active!.count} member(s); reassign them before clearing the presbyter flag`,
        );
      }
    }

    const fields: Partial<
      Omit<typeof members.$inferInsert, 'version' | 'updatedAt' | 'updatedBy'>
    > = {};

    if (input.firstName !== undefined) {
      fields.firstName = requiredText(input.firstName, 'firstName');
    }
    if (input.lastName !== undefined) {
      fields.lastName = requiredText(input.lastName, 'lastName');
    }
    if (input.otherNames !== undefined) fields.otherNames = input.otherNames;
    if (input.maidenName !== undefined) fields.maidenName = input.maidenName;
    if (input.alias !== undefined) fields.alias = input.alias;
    if (input.dob !== undefined) {
      fields.dob = input.dob ? assertDate(input.dob, 'dob') : null;
    }
    if (input.gender !== undefined) {
      if (!GENDERS.includes(input.gender)) {
        throw new ValidationError('gender is not recognised');
      }
      fields.gender = input.gender;
    }
    if (input.placeOfResidence !== undefined) fields.placeOfResidence = input.placeOfResidence;
    if (input.addressLine !== undefined) fields.addressLine = input.addressLine;
    if (input.joinedOn !== undefined) {
      fields.joinedOn = input.joinedOn ? assertDate(input.joinedOn, 'joinedOn') : null;
    }
    if (input.isPresbyter !== undefined) fields.isPresbyter = input.isPresbyter;
    if (input.membershipCardNo !== undefined) {
      fields.membershipCardNo = normalizeCardNo(input.membershipCardNo);
    }
    if (input.verified !== undefined) {
      fields.verifiedAt = input.verified ? new Date() : null;
    }

    const nextIsPresbyter = input.isPresbyter ?? row.is_presbyter;
    if (input.isPresbyter === false) {
      // Clearing the flag clears the rank in the same write.
      fields.presbyterRank = null;
    }
    if (input.presbyterRank !== undefined) {
      if (
        input.presbyterRank !== null &&
        (!Number.isInteger(input.presbyterRank) || input.presbyterRank < 1)
      ) {
        throw new ValidationError('presbyterRank must be a positive integer');
      }
      if (input.presbyterRank !== null && !nextIsPresbyter) {
        throw new ValidationError('presbyterRank is valid only when isPresbyter is true');
      }
      fields.presbyterRank = input.presbyterRank;
    }

    if (Object.keys(fields).length === 0) throw new ValidationError('No fields to update');

    const set: MemberSet = {
      ...fields,
      version: sql`${members.version} + 1`,
      updatedAt: sql`now()`,
      updatedBy: actor,
    };

    const updated = await this.db.orm
      .update(members)
      .set(set)
      .where(and(eq(members.id, row.id), eq(members.version, expectedVersion ?? row.version)))
      .returning({ id: members.id })
      .catch((error: unknown) => {
        if (
          sqlState(error) === '23505' &&
          sqlConstraint(error) === 'members_membership_card_no_ci'
        ) {
          throw new CardInUseError(
            `Membership card ${String(fields.membershipCardNo)} already belongs to a member`,
          );
        }
        throw error;
      });

    if (updated.length === 0) {
      throw new ConflictError('The member was modified since the supplied ETag');
    }

    const detail = await this.findById(row.id);
    return detail!;
  }

  async archive(memberNo: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);

    const [active] = await this.db.query<{ count: number }>(
      `select count(*)::int as count from shepherding_assignments
       where officer_member_id = $1 and ended_on is null`,
      [row.id],
    );
    if ((active?.count ?? 0) > 0) {
      throw new ConflictError(
        `Member ${memberNo} still shepherds ${active!.count} member(s); reassign them before archiving`,
      );
    }

    await this.db.transaction(async (tx) => {
      // Archiving the sheep ends their assignment; history stays readable.
      await tx.query(
        `update shepherding_assignments
         set ended_on = $2, ended_by = $3, ended_reason = 'member archived'
         where member_id = $1 and ended_on is null`,
        [row.id, todayIn('UTC'), actor],
      );
      await tx.orm
        .update(members)
        .set({
          archivedAt: sql`now()`,
          version: sql`${members.version} + 1`,
          updatedAt: sql`now()`,
          updatedBy: actor,
        })
        .where(eq(members.id, row.id));
    });
  }

  async restore(memberNo: string, actor: string): Promise<MemberDetail> {
    const rows = await this.db.orm
      .update(members)
      .set({
        archivedAt: null,
        version: sql`${members.version} + 1`,
        updatedAt: sql`now()`,
        updatedBy: actor,
      })
      .where(
        and(
          sql`lower(${members.memberNo}) = lower(${memberNo})`,
          sql`${members.archivedAt} is not null`,
          isNull(members.purgedAt),
        ),
      )
      .returning({ id: members.id });
    if (rows.length === 0) {
      throw new ConflictError(`Member ${memberNo} is not archived, or does not exist`);
    }
    const detail = await this.findById(rows[0]!.id);
    return detail!;
  }

  async purge(memberNo: string, confirmation: string, actor: string): Promise<void> {
    if (confirmation !== memberNo) {
      throw new ValidationError('confirmation must repeat the member number exactly');
    }
    const row = await this.findAnyRow(memberNo);
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    if (row.purged_at) throw new ConflictError(`Member ${memberNo} has already been purged`);

    await this.db.transaction(async (tx) => {
      await tx.query('delete from member_contact_links where member_id = $1', [row.id]);
      await tx.query('delete from member_contacts where member_id = $1', [row.id]);
      await tx.query('delete from subscription_coverage where member_id = $1', [row.id]);
      await tx.query('delete from subscription_claims where member_id = $1', [row.id]);
      await tx.query('delete from subscriptions where policyholder_member_id = $1', [row.id]);
      await tx.query(
        'delete from member_relationships where member_id = $1 or related_member_id = $1',
        [row.id],
      );
      await tx.query('delete from member_ministries where member_id = $1', [row.id]);
      // Assignments are never deleted normally; purge is PII erasure, and the
      // cascade removes their calls too.
      await tx.query(
        'delete from shepherding_assignments where officer_member_id = $1 or member_id = $1',
        [row.id],
      );
      await tx.query('delete from attendance_suppressions where member_id = $1', [row.id]);
      await tx.query('delete from attendance where member_id = $1', [row.id]);
      await tx.orm
        .update(members)
        .set({
          firstName: null,
          lastName: null,
          otherNames: null,
          maidenName: null,
          alias: null,
          dob: null,
          placeOfResidence: null,
          addressLine: null,
          gender: 'undisclosed',
          isPresbyter: false,
          presbyterRank: null,
          membershipCardNo: null,
          verifiedAt: null,
          archivedAt: sql`now()`,
          purgedAt: sql`now()`,
          version: sql`${members.version} + 1`,
          updatedAt: sql`now()`,
          updatedBy: actor,
        })
        .where(eq(members.id, row.id));
    });
  }

  // -- contacts ------------------------------------------------------------

  async addContact(memberNo: string, input: ContactInput, actor: string): Promise<ContactDto> {
    const row = await this.requireRow(memberNo);
    const id = await this.db.transaction(async (tx) => {
      const contact = await this.insertContact(tx, row.id, input);
      await touch(tx, row.id, actor);
      return contact.id;
    });
    const contacts = await this.contactsFor(row.id);
    return contacts.find((contact) => contact.id === id)!;
  }

  async updateContact(
    memberNo: string,
    contactId: string,
    input: Partial<ContactInput>,
    actor: string,
  ): Promise<ContactDto> {
    const row = await this.requireRow(memberNo);
    const [existing] = await this.db.query<{
      kind: ContactKind;
      value: string;
      display_order: number;
    }>('select kind, value, display_order from member_contacts where id = $1 and member_id = $2', [
      contactId,
      row.id,
    ]);
    if (!existing) throw new NotFoundError(`Contact ${contactId} was not found`);

    const kind = input.kind ?? existing.kind;
    const value = input.value ?? existing.value;
    const normalized = normalizeContactValue(kind, value);

    try {
      await this.db.transaction(async (tx) => {
        await tx.orm
          .update(memberContacts)
          .set({
            kind,
            value: value.trim(),
            normalizedValue: normalized,
            displayOrder: input.displayOrder ?? existing.display_order,
            updatedAt: sql`now()`,
          })
          .where(eq(memberContacts.id, contactId));
        await touch(tx, row.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Contact value "${value}" already belongs to a member`);
      }
      throw error;
    }

    const contacts = await this.contactsFor(row.id);
    return contacts.find((contact) => contact.id === contactId)!;
  }

  async removeContact(memberNo: string, contactId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.orm
        .delete(memberContacts)
        .where(and(eq(memberContacts.id, contactId), eq(memberContacts.memberId, row.id)))
        .returning({ id: memberContacts.id });
      if (deleted.length === 0) {
        throw new NotFoundError(`Contact ${contactId} was not found on member ${memberNo}`);
      }
      await touch(tx, row.id, actor);
    });
  }

  async linkContact(memberNo: string, contactId: string, actor: string): Promise<ContactDto> {
    const row = await this.requireRow(memberNo);
    const [contact] = await this.db.query<{ member_id: string }>(
      'select member_id from member_contacts where id = $1',
      [contactId],
    );
    if (!contact) throw new NotFoundError(`Contact ${contactId} was not found`);
    if (contact.member_id === row.id) {
      throw new ConflictError('A member already owns this contact');
    }

    try {
      await this.db.transaction(async (tx) => {
        const [next] = await tx.query<{ next: number }>(
          'select coalesce(max(display_order), 0) + 1 as next from member_contact_links where member_id = $1',
          [row.id],
        );
        await tx.orm.insert(memberContactLinks).values({
          memberId: row.id,
          contactId,
          displayOrder: next!.next,
        });
        await touch(tx, row.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('This contact is already linked to the member');
      }
      throw error;
    }

    const contacts = await this.contactsFor(row.id);
    return contacts.find((item) => item.id === contactId)!;
  }

  async unlinkContact(memberNo: string, contactId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.orm
        .delete(memberContactLinks)
        .where(
          and(eq(memberContactLinks.memberId, row.id), eq(memberContactLinks.contactId, contactId)),
        )
        .returning({ id: memberContactLinks.id });
      if (deleted.length === 0) throw new NotFoundError('This contact is not linked to the member');
      await touch(tx, row.id, actor);
    });
  }

  // -- subscriptions -------------------------------------------------------

  async addSubscription(
    memberNo: string,
    input: SubscriptionInput,
    actor: string,
  ): Promise<SubscriptionDto> {
    const row = await this.requireRow(memberNo);
    const startedOn = input.startedOn ? assertDate(input.startedOn, 'startedOn') : todayIn('UTC');

    const subscriptionId = await this.db.transaction(async (tx) => {
      const [created] = await tx.orm
        .insert(subscriptionsTable)
        .values({
          kind: input.kind,
          policyholderMemberId: row.id,
          scope: input.scope,
          reference: optionalText(input.reference),
          startedOn,
          createdBy: actor,
        })
        .returning({ id: subscriptionsTable.id });

      const covered = input.scope === 'household' ? (input.coveredMemberNos ?? []) : [];
      for (const memberNoToCover of covered) {
        const [coveredRow] = await tx.query<{ id: string }>(
          'select id from members where lower(member_no) = lower($1) and purged_at is null',
          [memberNoToCover],
        );
        if (!coveredRow) throw new NotFoundError(`Member ${memberNoToCover} was not found`);
        await this.insertCoverage(tx, created!.id, coveredRow.id, startedOn);
      }

      await touch(tx, row.id, actor);
      return created!.id;
    });

    const subscriptions = await this.subscriptionsFor(row.id);
    return subscriptions.find((item) => item.id === subscriptionId)!;
  }

  async endSubscription(memberNo: string, subscriptionId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const updated = await tx.orm
        .update(subscriptionsTable)
        .set({
          status: 'ended',
          endedOn: sql`coalesce(${subscriptionsTable.endedOn}, ${todayIn('UTC')}::date)`,
          updatedBy: actor,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(subscriptionsTable.id, subscriptionId),
            eq(subscriptionsTable.policyholderMemberId, row.id),
            eq(subscriptionsTable.status, 'active'),
          ),
        )
        .returning({ id: subscriptionsTable.id });
      if (updated.length === 0) throw new NotFoundError('Active subscription was not found');
      await touch(tx, row.id, actor);
    });
  }

  // -- ministries ----------------------------------------------------------

  async assignMinistry(memberNo: string, code: string, actor: string): Promise<MinistryDto> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      await this.assignMinistryTx(tx, row.id, code);
      await touch(tx, row.id, actor);
    });
    const ministries = await this.ministriesFor(row.id);
    return ministries.find((ministry) => ministry.code === code.toUpperCase())!;
  }

  async removeMinistry(memberNo: string, code: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.query(
        `delete from member_ministries mm using ministries mi
         where mm.ministry_id = mi.id and mm.member_id = $1 and lower(mi.code) = lower($2)
         returning mm.ministry_id`,
        [row.id, code],
      );
      if (deleted.length === 0) throw new NotFoundError(`Member does not serve in ${code}`);
      await touch(tx, row.id, actor);
    });
  }

  // -- relationships -------------------------------------------------------

  async addRelationship(
    memberNo: string,
    input: { relatedMemberNo: string; type: RelationshipType; isDependent?: boolean },
    actor: string,
  ): Promise<RelationshipDto> {
    const row = await this.requireRow(memberNo);
    if (!RELATIONSHIP_TYPES.includes(input.type)) {
      throw new ValidationError('relationship type is not recognised');
    }
    const related = await this.requireRow(input.relatedMemberNo);
    if (related.id === row.id) throw new ValidationError('A member cannot be related to itself');

    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          `insert into member_relationships (member_id, related_member_id, type, is_dependent, created_by)
           values ($1,$2,$3,$4,$5)`,
          [row.id, related.id, input.type, input.isDependent ?? false, actor],
        );
        await touch(tx, row.id, actor);
        await touch(tx, related.id, actor);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(
          'This relationship already exists, or the member already has a spouse',
        );
      }
      throw error;
    }

    const relationships = await this.relationshipsFor(row.id);
    return relationships.find((item) => item.memberNo === related.member_no)!;
  }

  async removeRelationship(memberNo: string, relationshipId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const deleted = await tx.query<{ member_id: string; related_member_id: string }>(
        `delete from member_relationships
         where id = $1 and (member_id = $2 or related_member_id = $2)
         returning member_id, related_member_id`,
        [relationshipId, row.id],
      );
      if (deleted.length === 0) throw new NotFoundError('Relationship was not found');
      await touch(tx, deleted[0]!.member_id, actor);
      await touch(tx, deleted[0]!.related_member_id, actor);
    });
  }

  // -- attendance ----------------------------------------------------------

  async getAttendance(memberNo: string): Promise<AttendanceSeriesDto[]> {
    const row = await this.requireRow(memberNo);
    return this.attendanceFor(row);
  }

  async recordAttendance(
    memberNo: string,
    input: { seriesId: string; date: string },
    actor: string,
  ): Promise<AttendanceEntryDto> {
    const row = await this.requireRow(memberNo);
    const date = assertDate(input.date);

    const [series] = await this.db.query<{ name: string; timezone: string }>(
      'select name, timezone from event_series where id = $1 and archived_at is null',
      [input.seriesId],
    );
    if (!series) throw new NotFoundError(`Series ${input.seriesId} was not found`);

    const occurrences = await resolveSeriesOccurrences(this.db, input.seriesId, date, date);
    if (!occurrences.includes(date)) {
      throw new ValidationError(`${date} was not a held occurrence of ${series.name}`);
    }

    // The shared close is checked before the today rule, so a closed past
    // session answers `session_closed`, not a date refusal (AC-33). This path
    // only reads the occurrence; the instance is minted inside the transaction.
    const [closedTarget] = await this.db.query<{ id: string }>(
      'select id from event_instances where series_id = $1 and start_date = $2',
      [input.seriesId, date],
    );
    if (closedTarget && (await sessionIsClosed(this.db, closedTarget.id, date))) {
      throw new SessionClosedError(
        `The session on ${date} is closed; no further per-member write is accepted`,
      );
    }

    // A manual row is accepted only for a session dated today in the event
    // timezone, and never after a shared close.
    if (date !== todayIn(series.timezone)) {
      throw new ValidationError(
        `Per-member attendance is accepted only for a session dated today in ${series.timezone}`,
      );
    }

    try {
      const eventInstanceId = await this.db.transaction(async (tx) => {
        const [instance] = await tx.query<{ id: string }>(
          `insert into event_instances (
             series_id, start_date, end_date, name, timezone, venue_type, status, source, sessions
           )
           select s.id, $2, $2, s.name, s.timezone, 'auditorium', 'scheduled', 'series',
                  jsonb_build_array(jsonb_build_object('date', $2::date, 'startTime', null, 'endTime', null, 'status', 'scheduled'))
           from event_series s where s.id = $1
           on conflict (series_id, start_date) do update set start_date = excluded.start_date
           returning id`,
          [input.seriesId, date],
        );
        if (await sessionIsClosed(tx, instance!.id, date)) {
          throw new SessionClosedError(
            `The session on ${date} is closed; no further per-member write is accepted`,
          );
        }
        await tx.query(
          `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
           values ($1,$2,$3,'manual',$4)`,
          [row.id, instance!.id, date, actor],
        );
        await tx.query(
          'delete from attendance_suppressions where member_id = $1 and event_instance_id = $2 and session_date = $3',
          [row.id, instance!.id, date],
        );
        await touch(tx, row.id, actor);
        return instance!.id;
      });

      const [entry] = await this.db.query<{
        id: string;
        session_date: string;
        source: 'import' | 'manual';
      }>(
        'select id, session_date, source from attendance where member_id = $1 and event_instance_id = $2 and session_date = $3',
        [row.id, eventInstanceId, date],
      );

      return { id: entry!.id, date: isoDate(entry!.session_date)!, source: entry!.source };
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Attendance for ${date} is already recorded`);
      }
      throw error;
    }
  }

  async deleteAttendance(memberNo: string, attendanceId: string, actor: string): Promise<void> {
    const row = await this.requireRow(memberNo);
    await this.db.transaction(async (tx) => {
      const [entry] = await tx.query<{
        event_instance_id: string;
        session_date: string;
        source: 'import' | 'manual';
      }>(
        'select event_instance_id, session_date, source from attendance where id = $1 and member_id = $2',
        [attendanceId, row.id],
      );
      if (!entry) throw new NotFoundError(`Attendance ${attendanceId} was not found`);

      if (await sessionIsClosed(tx, entry.event_instance_id, entry.session_date)) {
        throw new SessionClosedError(
          `The session on ${entry.session_date} is closed; no further per-member write is accepted`,
        );
      }

      await tx.query('delete from attendance where id = $1', [attendanceId]);

      if (entry.source === 'import') {
        await tx.query(
          `insert into attendance_suppressions (member_id, event_instance_id, session_date, suppressed_by)
           values ($1,$2,$3,$4) on conflict do nothing`,
          [row.id, entry.event_instance_id, entry.session_date, actor],
        );
      }

      await touch(tx, row.id, actor);
    });
  }

  // -- internals -----------------------------------------------------------

  async findRow(memberNo: string, includeArchived: boolean): Promise<MemberRow | null> {
    const where = includeArchived
      ? and(sql`lower(${members.memberNo}) = lower(${memberNo})`, isNull(members.purgedAt))
      : and(
          sql`lower(${members.memberNo}) = lower(${memberNo})`,
          isNull(members.purgedAt),
          isNull(members.archivedAt),
        );
    const [row] = await this.db.orm.select(memberColumns).from(members).where(where).limit(1);
    return (row as MemberRow) ?? null;
  }

  /** Purge has to see its own tombstone to answer "already purged". */
  private async findAnyRow(memberNo: string): Promise<MemberRow | null> {
    const [row] = await this.db.orm
      .select(memberColumns)
      .from(members)
      .where(sql`lower(${members.memberNo}) = lower(${memberNo})`)
      .limit(1);
    return (row as MemberRow) ?? null;
  }

  async requireRow(memberNo: string): Promise<MemberRow> {
    const row = await this.findRow(memberNo, false);
    if (!row) throw new NotFoundError(`Member ${memberNo} was not found`);
    return row;
  }

  private async findById(id: string): Promise<MemberDetail | null> {
    const [row] = await this.db.orm
      .select(memberColumns)
      .from(members)
      .where(eq(members.id, id))
      .limit(1);
    return row ? this.toDetail(row as MemberRow) : null;
  }

  private async toSummaries(
    rows: MemberRow[],
    options: SummaryOptions = {},
  ): Promise<MemberSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const contacts = await this.contactsForMany(ids);
    const ministries = await this.ministriesForMany(ids);

    const attendance = options.includeAttendance
      ? await this.attendanceSummaries(rows, options.seriesId)
      : null;
    const subscriptions = options.includeSubscriptions
      ? await this.subscriptionSummaries(ids)
      : null;

    return rows.map((row) => {
      const summary = this.toSummary(
        row,
        (contacts.get(row.id) ?? []).length,
        ministries.get(row.id) ?? [],
      );
      if (attendance) summary.attendance = attendance.get(row.id) ?? null;
      if (subscriptions) summary.subscriptions = subscriptions.get(row.id) ?? [];
      return summary;
    });
  }

  private toSummary(
    row: MemberRow,
    contactCount: number,
    ministries: MinistryDto[],
  ): MemberSummary {
    return {
      memberNo: row.member_no,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      otherNames: row.other_names,
      gender: row.gender,
      age: ageInYears(isoDate(row.dob)),
      placeOfResidence: row.place_of_residence,
      joinedOn: isoDate(row.joined_on),
      isPresbyter: row.is_presbyter,
      archivedAt: isoTimestamp(row.archived_at),
      contactCount,
      ministries,
    };
  }

  private async toDetail(row: MemberRow): Promise<MemberDetail> {
    const [contacts, subscriptions, ministries, relationships, attendance] = await Promise.all([
      this.contactsFor(row.id),
      this.subscriptionsFor(row.id),
      this.ministriesFor(row.id),
      this.relationshipsFor(row.id),
      this.attendanceFor(row),
    ]);

    return {
      ...this.toSummary(row, contacts.length, ministries),
      id: row.id,
      presbyterRank: row.presbyter_rank,
      membershipCardNo: row.membership_card_no,
      verifiedAt: isoTimestamp(row.verified_at),
      maidenName: row.maiden_name,
      alias: row.alias,
      dob: isoDate(row.dob),
      addressLine: row.address_line,
      purgedAt: isoTimestamp(row.purged_at),
      version: row.version,
      createdAt: isoTimestamp(row.created_at)!,
      updatedAt: isoTimestamp(row.updated_at)!,
      contacts,
      subscriptions,
      relationships,
      attendance,
    };
  }

  private async contactsFor(memberId: string): Promise<ContactDto[]> {
    return (await this.contactsForMany([memberId])).get(memberId) ?? [];
  }

  /**
   * One calendar load and one attendance query for the whole page; each member
   * is then clipped to their own window with the same rule the detail uses.
   */
  private async attendanceSummaries(
    rows: MemberRow[],
    seriesId: string | undefined,
  ): Promise<Map<string, MemberAttendanceSummary>> {
    if (!seriesId) {
      throw new ValidationError('seriesId is required when include=attendance');
    }

    const [series] = await this.db.query<{ name: string; timezone: string }>(
      'select name, timezone from event_series where id = $1 and archived_at is null',
      [seriesId],
    );
    if (!series) throw new NotFoundError(`Series ${seriesId} was not found`);

    const calendar = await loadCalendar(this.db, seriesId);
    const start = seriesStart(calendar.schedules);
    const endsOn = calendar.schedules[calendar.schedules.length - 1]?.endsOn ?? null;
    const today = todayIn(series.timezone);
    const rangeEnd = endsOn ?? today;

    const occurrences =
      start && start <= rangeEnd ? resolveCalendarOccurrences(calendar, start, rangeEnd) : [];

    const ids = rows.map((row) => row.id);
    const attended = await this.db.query<{ member_id: string; session_date: string | Date }>(
      `select a.member_id, a.session_date
         from attendance a
         join event_instances e on e.id = a.event_instance_id
        where e.series_id = $1 and a.member_id = any($2::uuid[])`,
      [seriesId, ids],
    );

    const byMember = new Map<string, string[]>();
    for (const entry of attended) {
      const dates = byMember.get(entry.member_id) ?? [];
      dates.push(isoDate(entry.session_date)!);
      byMember.set(entry.member_id, dates);
    }

    const summaries = new Map<string, MemberAttendanceSummary>();
    for (const row of rows) {
      const joinedOn = isoDate(row.joined_on) ?? isoDate(row.created_at);
      const windowStart = start ? (joinedOn && joinedOn > start ? joinedOn : start) : today;
      const windowEnd = endsOn && endsOn < today ? endsOn : today;
      const inWindow =
        start && windowStart <= windowEnd
          ? occurrences.filter((date) => date >= windowStart && date <= windowEnd)
          : [];
      const attendedDates = start
        ? (byMember.get(row.id) ?? []).filter((date) => date >= windowStart && date <= windowEnd)
        : [];

      const counts = summariseAttendance({
        occurrences: inWindow,
        attendedDates,
        endsOn,
        today,
      });

      summaries.set(row.id, {
        seriesId,
        seriesName: series.name,
        ...counts,
        lastAttendedOn: attendedDates.length
          ? attendedDates.reduce((latest, date) => (date > latest ? date : latest))
          : null,
      });
    }

    return summaries;
  }

  /** One query for policyholder rows and one for active coverage rows, merged per member. */
  private async subscriptionSummaries(
    memberIds: string[],
  ): Promise<Map<string, MemberSubscriptionSummary[]>> {
    const held = await this.db.query<{
      member_id: string;
      id: string;
      kind: SubscriptionKind | null;
      scope: 'individual' | 'household';
      status: 'active' | 'ended';
      policyholder_member_no: string;
      covered_count: number;
    }>(
      `select s.policyholder_member_id as member_id, s.id, s.kind, s.scope, s.status,
              holder.member_no as policyholder_member_no,
              (select count(*)::int from subscription_coverage sc
                where sc.subscription_id = s.id and sc.removed_on is null) as covered_count
         from subscriptions s
         join members holder on holder.id = s.policyholder_member_id
        where s.policyholder_member_id = any($1::uuid[])`,
      [memberIds],
    );

    const covering = await this.db.query<{
      member_id: string;
      id: string;
      kind: SubscriptionKind | null;
      scope: 'individual' | 'household';
      status: 'active' | 'ended';
      policyholder_member_no: string;
      covered_count: number;
    }>(
      `select sc.member_id, s.id, s.kind, s.scope, s.status,
              holder.member_no as policyholder_member_no,
              (select count(*)::int from subscription_coverage all_sc
                where all_sc.subscription_id = s.id and all_sc.removed_on is null) as covered_count
         from subscription_coverage sc
         join subscriptions s on s.id = sc.subscription_id
         join members holder on holder.id = s.policyholder_member_id
        where sc.member_id = any($1::uuid[]) and sc.removed_on is null`,
      [memberIds],
    );

    const summaries = new Map<string, Map<string, MemberSubscriptionSummary>>();
    const add = (row: (typeof held)[number], role: MemberSubscriptionSummary['role']): void => {
      const bySubscription = summaries.get(row.member_id) ?? new Map();
      // A member can be both policyholder and covered; the policyholder view wins.
      if (bySubscription.has(row.id)) return;
      bySubscription.set(row.id, {
        id: row.id,
        kind: row.kind,
        scope: row.scope,
        status: row.status,
        role,
        policyholderMemberNo: row.policyholder_member_no,
        coveredCount: row.covered_count,
      });
      summaries.set(row.member_id, bySubscription);
    };

    for (const row of held) add(row, 'policyholder');
    for (const row of covering) add(row, 'covered');

    const result = new Map<string, MemberSubscriptionSummary[]>();
    for (const [memberId, bySubscription] of summaries) {
      result.set(
        memberId,
        [...bySubscription.values()].sort((a, b) => {
          if (a.role !== b.role) return a.role === 'policyholder' ? -1 : 1;
          const aKind = a.kind ?? '';
          const bKind = b.kind ?? '';
          if (aKind !== bKind) return aKind < bKind ? -1 : 1;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        }),
      );
    }
    return result;
  }

  private async contactsForMany(memberIds: string[]): Promise<Map<string, ContactDto[]>> {
    return loadContacts(this.db, memberIds);
  }

  private async ministriesFor(memberId: string): Promise<MinistryDto[]> {
    return (await this.ministriesForMany([memberId])).get(memberId) ?? [];
  }

  private async ministriesForMany(memberIds: string[]): Promise<Map<string, MinistryDto[]>> {
    const rows = await this.db.query<{
      member_id: string;
      code: string;
      name: string;
    }>(
      `select mm.member_id, mi.code, mi.name
       from member_ministries mm
       join ministries mi on mi.id = mm.ministry_id
       where mm.member_id = any($1::uuid[])
       order by mi.code`,
      [memberIds],
    );

    const map = new Map<string, MinistryDto[]>();
    for (const row of rows) {
      const list = map.get(row.member_id) ?? [];
      list.push({ code: row.code, name: row.name });
      map.set(row.member_id, list);
    }
    return map;
  }

  private async subscriptionsFor(memberId: string): Promise<SubscriptionDto[]> {
    return new SubscriptionRepository(this.db).detailSubscriptions(memberId);
  }

  private async relationshipsFor(memberId: string): Promise<RelationshipDto[]> {
    const rows = await this.db.query<{
      id: string;
      type: RelationshipType;
      is_dependent: boolean;
      other_member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
      archived_at: Date | string | null;
    }>(
      `select r.id, r.type, r.is_dependent, other.member_no as other_member_no,
              other.first_name, other.last_name, other.gender, other.dob, other.archived_at
       from member_relationships r
       join members other
         on other.id = case when r.member_id = $1 then r.related_member_id else r.member_id end
       where r.member_id = $1 or r.related_member_id = $1
       order by r.created_at`,
      [memberId],
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      isDependent: row.is_dependent,
      memberNo: row.other_member_no,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      gender: row.gender,
      age: ageInYears(isoDate(row.dob)),
      archived: row.archived_at !== null,
    }));
  }

  private async attendanceFor(row: MemberRow): Promise<AttendanceSeriesDto[]> {
    const series = await this.db.query<{
      id: string;
      name: string;
      timezone: string;
      ministry: string | null;
    }>(
      `select distinct s.id, s.name, s.timezone, mi.name as ministry
       from event_series s
       left join ministries mi on mi.id = s.ministry_id
       where s.archived_at is null
         and (
           exists (
              select 1 from attendance a
              join event_instances e on e.id = a.event_instance_id
              where e.series_id = s.id and a.member_id = $1
            )
           or exists (
             select 1 from member_ministries mm
             where mm.member_id = $1 and mm.ministry_id = s.ministry_id
           )
         )
       order by s.name`,
      [row.id],
    );

    const attended = await this.db.query<{
      id: string;
      series_id: string;
      session_date: string;
      source: 'import' | 'manual';
    }>(
      `select a.id, e.series_id, a.session_date, a.source
         from attendance a join event_instances e on e.id = a.event_instance_id
        where a.member_id = $1`,
      [row.id],
    );

    const bySeries = new Map<string, AttendanceEntryDto[]>();
    for (const entry of attended) {
      const list = bySeries.get(entry.series_id) ?? [];
      list.push({ id: entry.id, date: isoDate(entry.session_date)!, source: entry.source });
      bySeries.set(entry.series_id, list);
    }

    const result: AttendanceSeriesDto[] = [];
    for (const item of series) {
      const calendar = await loadCalendar(this.db, item.id);
      const start = seriesStart(calendar.schedules);
      if (!start) continue;

      const endsOn = calendar.schedules[calendar.schedules.length - 1]?.endsOn ?? null;
      const today = todayIn(item.timezone);
      const joinedOn = isoDate(row.joined_on) ?? isoDate(row.created_at);
      const windowStart = joinedOn && joinedOn > start ? joinedOn : start;
      const windowEnd = endsOn && endsOn < today ? endsOn : today;
      if (windowStart > windowEnd) continue;

      const occurrences = await resolveSeriesOccurrences(this.db, item.id, windowStart, windowEnd);
      const entries = (bySeries.get(item.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const counts = summariseAttendance({
        occurrences,
        attendedDates: entries
          .map((entry) => entry.date)
          .filter((date) => date >= windowStart && date <= windowEnd),
        endsOn,
        today,
      });

      result.push({
        seriesId: item.id,
        seriesName: item.name,
        ministry: item.ministry,
        ...counts,
        entries,
      });
    }

    return result;
  }

  private async insertContact(
    tx: DbClient,
    memberId: string,
    input: ContactInput,
    fallbackOrder?: number,
  ): Promise<{ id: string }> {
    const normalized = normalizeContactValue(input.kind, input.value);
    const order =
      input.displayOrder ??
      fallbackOrder ??
      (
        await tx.query<{ next: number }>(
          'select coalesce(max(display_order), 0) + 1 as next from member_contacts where member_id = $1',
          [memberId],
        )
      )[0]!.next;

    try {
      const [row] = await tx.orm
        .insert(memberContacts)
        .values({
          memberId,
          kind: input.kind,
          value: input.value.trim(),
          normalizedValue: normalized,
          displayOrder: order,
        })
        .returning({ id: memberContacts.id });
      return row!;
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Contact value "${input.value}" already belongs to a member`);
      }
      throw error;
    }
  }

  private async assignMinistryTx(tx: DbClient, memberId: string, code: string): Promise<void> {
    const [ministry] = await tx.query<{ id: string }>(
      'select id from ministries where lower(code) = lower($1) and active',
      [code],
    );
    if (!ministry) throw new NotFoundError(`Ministry ${code} was not found or is inactive`);

    try {
      await tx.query(
        'insert into member_ministries (member_id, ministry_id, assigned_on) values ($1,$2,$3)',
        [memberId, ministry.id, todayIn('UTC')],
      );
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Member already serves in ${code}`);
      }
      throw error;
    }
  }

  private async insertCoverage(
    tx: DbClient,
    subscriptionId: string,
    memberId: string,
    addedOn: string,
  ): Promise<void> {
    await tx.orm.insert(subscriptionCoverage).values({ subscriptionId, memberId, addedOn });
  }
}
