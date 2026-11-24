import type { Db, Row } from '../db/sql.js';
import { ValidationError } from '../errors/domain-errors.js';
import type { PhoneCipher } from '../domain/phone-cipher.js';
import { legacyProjection } from '../domain/audiences.js';
import { memberMatchesAudience } from '../domain/audience-evaluator.js';
import { audienceMember } from '../repos/audience-members.js';
import type { AudienceRule } from '../schemas/audiences.js';
import { parseAudienceRule } from '../repos/row-values.js';
import type { AttendanceCodeRepository } from '../repos/attendance-codes.js';
import type { ClockingRepository } from '../repos/clocking.js';
import type { EventRepository } from '../repos/events.js';
import type { Headcount, HeadcountRepository } from '../repos/headcounts.js';
import type { MemberRepository } from '../repos/members.js';
import { eventOfferingsFor, type EventOfferingItem } from '../repos/offerings.js';
import type { OfferingRepository } from '../repos/offerings.js';
import type { PaymentGroupRepository } from '../repos/payment-groups.js';
import type { PledgeRepository } from '../repos/pledges.js';
import {
  isEligible,
  type EligibilityMember,
  type SubscriptionProductRepository,
} from '../repos/subscription-products.js';
import type { SubscriptionRepository } from '../repos/subscriptions.js';
import type { VerificationService } from '../verification/service.js';
import type {
  CreateGroupInput,
  CreatePledgeInput,
  MemberPayments,
  UssdActivities,
  UssdActivity,
  UssdActivityViewer,
  UssdAttendance,
  UssdEvent,
  UssdHeadcount,
  UssdHeadcountMode,
  UssdMemberContext,
  UssdOffering,
  UssdPledge,
  UssdProfile,
  UssdServices,
  UssdWelfareDependent,
  UssdWelfareProduct,
  UssdWelfareSubscription,
  UssdVerificationSent,
} from './machine.js';

export interface UssdServiceDeps {
  db: Db;
  members: MemberRepository;
  offerings: OfferingRepository;
  pledges: PledgeRepository;
  paymentGroups: PaymentGroupRepository;
  events: EventRepository;
  headcounts: HeadcountRepository;
  attendanceCodes: AttendanceCodeRepository;
  clocking: ClockingRepository;
  subscriptionProducts: SubscriptionProductRepository;
  subscriptions: SubscriptionRepository;
  /** Encrypts a registration's caller number for the officer's decision (MR-53). */
  phoneCipher: PhoneCipher;
  /** MR-54: the same in-process issue the officer route calls. */
  verification: VerificationService;
}

type CurrentEventRow = {
  id: string;
  name: string;
  timezone: string;
  session_date: string | Date | null;
};

function dateOf(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function displayName(
  first: string | null | undefined,
  last: string | null | undefined,
  other: string | null | undefined,
): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ') || (other?.trim() ?? '');
}

function offeringName(item: EventOfferingItem): string {
  return item.name.trim();
}

async function findCurrentEvent(db: Db): Promise<UssdEvent | null> {
  const rows = await db.query<CurrentEventRow>(
    `select e.id, e.name, e.timezone,
            (select min(o.date)
               from event_occurrences o
              where o.event_id = e.id
                and o.status <> 'cancelled'
                and o.date >= (now() at time zone e.timezone)::date) as session_date,
            exists (
              select 1 from event_occurrences o
               where o.event_id = e.id
                 and o.status <> 'cancelled'
                 and o.date = (now() at time zone e.timezone)::date
            ) as has_today
       from events e
      where e.status = 'active'
        and exists (
          select 1 from event_occurrences o
           where o.event_id = e.id
             and o.status <> 'cancelled'
             and o.date >= (now() at time zone e.timezone)::date
        )
      order by has_today desc, session_date, e.id
      limit 1`,
  );
  const row = rows[0];
  if (!row) return null;
  const sessionDate = dateOf(row.session_date);
  if (!sessionDate) return null;
  return { id: row.id, name: row.name, sessionDate };
}

async function memberIdOf(db: Db, memberNo: string | null): Promise<string | null> {
  if (!memberNo) return null;
  const [row] = await db.query<{ id: string }>(
    `select id from members
      where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
    [memberNo],
  );
  return row?.id ?? null;
}

interface ActivityRow extends Row {
  id: string;
  name: string;
  event_no: string | null;
  session_date: string | Date;
  session_start: string | null;
  tracks_members: boolean;
  audience_rule: unknown;
  everyone_audience: boolean;
}

/** The priority tier a session sorts by, derived from the legacy projection (A-7). */
function activityTier(rule: AudienceRule, memberCodes: ReadonlySet<string>): number {
  const projection = legacyProjection(rule);
  if (projection.ministryCode && memberCodes.has(projection.ministryCode.toLowerCase())) {
    return 0;
  }
  return projection.presbyterOnly ? 1 : 2;
}

/**
 * The applicable sessions in [from, to], ordered date -> priority tier ->
 * start time -> event number. Visibility is the one audience predicate: a
 * member sees a session when they match the event's audience at that
 * occurrence's date (A-3, A-4). The tier is not a visibility question - it
 * orders a ministry event first, then a presbyter event, then a general one, and
 * is read from the rule's legacy projection so both surfaces agree.
 *
 * An unauthenticated caller sees the seeded `Everyone` audience and nothing
 * else, without evaluating any rule (A-4).
 */
async function activitiesBetween(
  db: Db,
  headcounts: HeadcountRepository,
  viewer: UssdActivityViewer,
  from: string,
  to: string,
  enrichHeadcount = true,
): Promise<UssdActivity[]> {
  const memberId = await memberIdOf(db, viewer.memberNo);
  const member = memberId ? await audienceMember(db, memberId, to) : null;
  const memberCodes = new Set((member?.ministryCodes ?? []).map((code) => code.toLowerCase()));
  const rows = await db.query<ActivityRow>(
    `select e.id, e.name, e.event_no,
            o.date as session_date,
            coalesce(o.start_time, e.start_time, '') as session_start,
            e.tracks_members,
            a.rule as audience_rule,
            (a.system_key = 'everyone') as everyone_audience
       from events e
       join audiences a on a.id = e.audience_id
       join event_occurrences o on o.event_id = e.id
      where e.status = 'active'
        and o.status <> 'cancelled'
        and o.date between $2::date and $3::date
        and ($1::uuid is not null or a.system_key = 'everyone')`,
    [memberId, from, to],
  );

  const anonymous = memberId === null;
  const visible = rows
    .filter((row) => {
      // An unauthenticated caller sees the seeded `Everyone` audience and
      // nothing else, without evaluating any rule (A-4). A caller whose record
      // exists but is outside the register at these dates sees nothing.
      if (anonymous) return row.everyone_audience === true;
      if (!member) return false;
      return memberMatchesAudience(
        parseAudienceRule(row.audience_rule),
        member,
        dateOf(row.session_date)!,
      );
    })
    .map((row) => ({
      row,
      tier: activityTier(parseAudienceRule(row.audience_rule), memberCodes),
      date: dateOf(row.session_date)!,
    }));

  // The SQL cannot rank by the tier because the tier is derived from the rule,
  // so the ordering the screen reads is applied here, once.
  visible.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.tier - b.tier ||
      (a.row.session_start ?? '').localeCompare(b.row.session_start ?? '') ||
      compareEventNo(a.row.event_no, b.row.event_no) ||
      a.row.id.localeCompare(b.row.id),
  );

  const items: UssdActivity[] = visible.map(({ row }) => ({
    id: row.id,
    name: row.name,
    sessionDate: dateOf(row.session_date)!,
    tracksMembers: row.tracks_members,
  }));

  if (enrichHeadcount) {
    // At most one page of headcount reads, matching the screen's row count. The
    // list names the adults lane: a single figure must name a mode (HC-22), and
    // the four-entry lane navigation is the next round.
    for (const item of items.slice(0, Math.max(1, viewer.pageSize))) {
      if (item.tracksMembers) continue;
      const current = await headcounts.current(item.id, item.sessionDate, 'adults');
      item.headcount = current?.total ?? 0;
    }
  }
  return items;
}

/** Event numbers sort as text, with the unminted ones last. */
function compareEventNo(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

async function requireMemberId(db: Db, memberNo: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `select id from members
      where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
    [memberNo],
  );
  if (!row) throw new ValidationError(`Member ${memberNo} was not found`);
  return row.id;
}

interface WelfareMemberRow extends Row {
  id: string;
  member_no: string;
  joined_on: unknown;
  membership_card_no: string | null;
  verified_eligible: boolean;
  gender: EligibilityMember['gender'];
  dob: unknown;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

async function requireWelfareMember(db: Db, memberNo: string): Promise<WelfareMemberRow> {
  const [row] = await db.query<WelfareMemberRow>(
    `select id, member_no, joined_on, membership_card_no,
            (exists (select 1 from member_contacts c
                      where c.member_id = members.id and c.verified_at is not null
                        and c.kind in ('email', 'whatsapp'))
             or exists (select 1 from member_confirmations mc
                         where mc.member_id = members.id and mc.withdrawn_at is null))
              as verified_eligible,
            gender, dob
       from members
      where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
    [memberNo],
  );
  if (!row) throw new ValidationError(`Member ${memberNo} was not found`);
  return row;
}

function eligibilityOf(row: WelfareMemberRow): EligibilityMember {
  return {
    joinedOn: isoDate(row.joined_on),
    membershipCardNo: row.membership_card_no,
    verified: row.verified_eligible,
    gender: row.gender,
    dob: isoDate(row.dob),
  };
}

function legacyKindName(kind: string | null): string {
  if (!kind) return 'Welfare';
  const text = kind.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The relationship from the covered member to the policyholder. */
function coveredRelationship(storedType: string, declaredByHolder: boolean): string {
  if (!declaredByHolder) return storedType;
  if (storedType === 'parent') return 'child';
  if (storedType === 'child') return 'parent';
  return storedType;
}

/** The relationship from the policyholder to the covered member; the product rule. */
function holderRelationship(storedType: string, declaredByHolder: boolean): string {
  if (declaredByHolder) return storedType;
  if (storedType === 'parent') return 'child';
  if (storedType === 'child') return 'parent';
  return storedType;
}

/** The mode's three entry buckets, in the declared prompt order. */
const HEADCOUNT_BUCKET_CODES: Record<UssdHeadcountMode, readonly [string, string, string]> = {
  adults: ['adult-male', 'adult-female', 'child-unspecified'],
  children: ['child-male', 'child-female', 'adult-unspecified'],
  visitors: ['visitor-male', 'visitor-female', 'visitor-children'],
  presbyters: ['elder', 'deaconess', 'deacon'],
};

/** The phone carries the observation and its own lines; no fixed bucket fields. */
function toUssdHeadcount(headcount: Headcount): UssdHeadcount {
  return {
    id: headcount.id,
    // The phone reads the four live lanes only; a legacy mixed observation is
    // never requested here, and the retired lane stays readable over HTTP.
    mode: headcount.mode === 'mixed' ? 'adults' : headcount.mode,
    asOf: headcount.asOf,
    total: headcount.total,
    lines: headcount.lines.map((line) => ({
      code: line.code,
      label: line.label,
      count: line.count,
    })),
  };
}

/** The three buckets the chosen lane writes, in its entry order. */
function ussdLines(
  mode: UssdHeadcountMode,
  counts: readonly [number, number, number],
): Array<{ code: string; count: number }> {
  return HEADCOUNT_BUCKET_CODES[mode].map((code, index) => ({
    code,
    count: counts[index]!,
  }));
}

/**
 * The USSD services are wired once in `createApp`; the per-request phone lives
 * in the session info and never enters the persisted context.
 */
export function createUssdServices(deps: UssdServiceDeps): UssdServices {
  return {
    async currentEvent(): Promise<UssdEvent | null> {
      return findCurrentEvent(deps.db);
    },

    async offeringsFor(eventId: string, date: string): Promise<UssdOffering[]> {
      const byEvent = await eventOfferingsFor(deps.db, [eventId], date);
      const items = byEvent.get(eventId) ?? [];
      const candidates = items.filter((item) => {
        if (item.availableUntil !== null && date > item.availableUntil) return false;
        const exception = item.exceptions.find((entry) => entry.date === date);
        return exception?.kind !== 'skip';
      });
      if (candidates.length === 0) return [];

      const ids = candidates.map((item) => item.offeringId);
      const activeRows = await deps.db.query<{ id: string }>(
        `select id from offerings where id = any($1::uuid[]) and active`,
        [ids],
      );
      const active = new Set(activeRows.map((row) => row.id));

      return candidates
        .filter((item) => active.has(item.offeringId))
        .map((item) => ({
          id: item.offeringId,
          name: offeringName(item),
          currency: item.terms.currency,
        }));
    },

    async createGroup(input: CreateGroupInput): Promise<{ reference: string }> {
      const result = await deps.paymentGroups.create(input, 'ussd');
      return { reference: result.group.reference };
    },

    async createPledge(input: CreatePledgeInput): Promise<{ id: string; idempotencyKey: string }> {
      const result = await deps.pledges.create(input, 'ussd');
      return { id: result.pledge.id, idempotencyKey: result.pledge.idempotencyKey };
    },

    async listPledges(memberNo: string): Promise<UssdPledge[]> {
      const page = await deps.pledges.list({ memberNo, status: 'pending', limit: 50 });
      if (page.items.length === 0) return [];

      const eventIds = [...new Set(page.items.map((pledge) => pledge.eventId))];
      const offeringsByEvent = await eventOfferingsFor(deps.db, eventIds, todayUtc());
      const fallbackIds = [...new Set(page.items.map((pledge) => pledge.offeringId))];
      const fallbackRows =
        fallbackIds.length === 0
          ? []
          : await deps.db.query<{ id: string; name: string | null; purpose: string }>(
              `select o.id, t.name, t.purpose
                 from offerings o
                 left join lateral (
                   select name, purpose
                     from offering_terms t
                    where t.offering_id = o.id
                    order by t.version desc
                    limit 1
                 ) t on true
                where o.id = any($1::uuid[])`,
              [fallbackIds],
            );
      const fallback = new Map(
        fallbackRows.map((row) => [row.id, row.name?.trim() ? row.name.trim() : row.purpose]),
      );

      return page.items.map((pledge) => {
        const attached = offeringsByEvent
          .get(pledge.eventId)
          ?.find((item) => item.offeringId === pledge.offeringId);
        return {
          id: pledge.id,
          offeringId: pledge.offeringId,
          offeringName: attached ? offeringName(attached) : (fallback.get(pledge.offeringId) ?? ''),
          eventId: pledge.eventId,
          sessionDate: pledge.sessionDate,
          amountMinor: pledge.amountMinor,
          currency: pledge.currency,
          expectedOn: pledge.expectedOn,
        };
      });
    },

    async paymentsSummary(memberNo: string): Promise<MemberPayments> {
      return deps.members.contributionsSummary(memberNo);
    },

    async offeringById(id: string): Promise<UssdOffering | null> {
      try {
        const offering = await deps.offerings.get(id);
        const name = offering.terms.name?.trim()
          ? offering.terms.name.trim()
          : offering.terms.purpose;
        return { id: offering.id, name, currency: offering.terms.currency };
      } catch {
        return null;
      }
    },

    async memberContext(memberNo: string): Promise<UssdMemberContext> {
      const [row] = await deps.db.query<{
        is_presbyter: boolean;
        presbyter_rank: number | null;
      }>(
        `select is_presbyter, presbyter_rank
           from members
          where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
        [memberNo],
      );
      return row
        ? { isPresbyter: row.is_presbyter, presbyterRank: row.presbyter_rank }
        : { isPresbyter: false, presbyterRank: null };
    },

    async activities(date: string, viewer: UssdActivityViewer): Promise<UssdActivities> {
      const items = await activitiesBetween(deps.db, deps.headcounts, viewer, date, date);
      const week = await activitiesBetween(
        deps.db,
        deps.headcounts,
        viewer,
        date,
        addDays(date, 6),
      );
      let next: { date: string; count: number } | null = null;
      if (items.length === 0) {
        const horizon = await activitiesBetween(
          deps.db,
          deps.headcounts,
          viewer,
          addDays(date, 1),
          addDays(date, 14),
          false,
        );
        const first = horizon[0];
        if (first) {
          const count = horizon.filter((item) => item.sessionDate === first.sessionDate).length;
          next = { date: first.sessionDate, count };
        }
      }
      return { items, moreThisWeek: week.length > items.length, next };
    },

    async activitiesWeek(date: string, viewer: UssdActivityViewer): Promise<UssdActivity[]> {
      return activitiesBetween(deps.db, deps.headcounts, viewer, date, addDays(date, 6));
    },

    async attendance(memberNo: string, from: string, to: string): Promise<UssdAttendance> {
      return deps.members.attendanceSummary(memberNo, from, to);
    },

    async profile(memberNo: string): Promise<UssdProfile> {
      return deps.members.profile(memberNo);
    },

    async startVerification(memberNo: string): Promise<UssdVerificationSent> {
      // MR-54: one service path with the officer action; the response is reduced
      // to the notice's only member data.
      const issued = await deps.verification.issue(memberNo);
      return { channel: issued.destination.channel, masked: issued.destination.masked };
    },

    async redeemCode(input: {
      code: string;
      memberNo: string;
      phoneHash: string;
      eventId?: string;
      sessionDate?: string;
    }): Promise<{ eventId: string; sessionDate: string }> {
      const memberId = await requireMemberId(deps.db, input.memberNo);
      const event =
        input.eventId && input.sessionDate
          ? { id: input.eventId, sessionDate: input.sessionDate }
          : await findCurrentEvent(deps.db);
      if (!event) throw new ValidationError('No event session is open for the code');

      const result = await deps.attendanceCodes.redeem({
        code: input.code.trim(),
        purpose: 'attendance_punch',
        phoneHash: input.phoneHash,
        memberId,
        eventId: event.id,
        sessionDate: event.sessionDate,
        actor: `ussd:${input.phoneHash}`,
      });
      if (result.kind !== 'attendance') {
        throw new ValidationError('The code is not an attendance code');
      }
      return { eventId: result.eventId, sessionDate: result.sessionDate };
    },

    async createRegistration(input: {
      code: string;
      firstName: string;
      lastName: string;
      phoneHash: string;
      /** The caller's normalized digits; encrypted at rest, never returned (MR-53). */
      phone: string;
    }): Promise<{ reference: string }> {
      const result = await deps.attendanceCodes.redeem({
        code: input.code.trim(),
        purpose: 'registration',
        phoneHash: input.phoneHash,
        phoneEncrypted: deps.phoneCipher.encrypt(input.phone),
        memberId: null,
        actor: `ussd:${input.phoneHash}`,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      if (result.kind !== 'registration') {
        throw new ValidationError('The code is not a registration code');
      }
      return { reference: result.reference };
    },

    async clockIn(input: {
      eventId: string;
      sessionDate: string;
      memberNo: string;
      actorMemberNo: string;
      phoneHash: string;
    }): Promise<{ memberNo: string; name: string }> {
      const entry = await deps.clocking.clockIn({
        eventId: input.eventId,
        sessionDate: input.sessionDate,
        memberNo: input.memberNo,
        actorMemberNo: input.actorMemberNo,
        actor: `ussd:${input.phoneHash}`,
      });
      return { memberNo: entry.memberNo, name: entry.name };
    },

    async delegate(input: {
      eventId: string;
      sessionDate: string;
      fromMemberNo: string;
      toMemberNo: string;
      reason: string;
      phoneHash: string;
    }): Promise<{ toMemberNo: string; toName: string }> {
      const delegation = await deps.clocking.delegate(
        {
          eventId: input.eventId,
          sessionDate: input.sessionDate,
          fromMemberNo: input.fromMemberNo,
          toMemberNo: input.toMemberNo,
          reason: input.reason,
        },
        `ussd:${input.phoneHash}`,
      );
      return { toMemberNo: delegation.toMemberNo, toName: delegation.toName };
    },

    async recordHeadcount(input: {
      eventId: string;
      sessionDate: string;
      mode: UssdHeadcountMode;
      counts: readonly [number, number, number];
      supersedesId?: string;
      phoneHash: string;
    }): Promise<UssdHeadcount> {
      const headcount = await deps.headcounts.record(
        input.eventId,
        {
          sessionDate: input.sessionDate,
          mode: input.mode,
          lines: ussdLines(input.mode, input.counts),
          supersedesId: input.supersedesId,
        },
        `ussd:${input.phoneHash}`,
      );
      return toUssdHeadcount(headcount);
    },

    async currentHeadcount(
      eventId: string,
      sessionDate: string,
      mode: UssdHeadcountMode,
    ): Promise<UssdHeadcount | null> {
      const headcount = await deps.headcounts.current(eventId, sessionDate, mode);
      return headcount ? toUssdHeadcount(headcount) : null;
    },

    async memberByNo(memberNo: string): Promise<{ memberNo: string; name: string }> {
      const [row] = await deps.db.query<{
        member_no: string;
        first_name: string | null;
        last_name: string | null;
        other_names: string | null;
      }>(
        `select member_no, first_name, last_name, other_names
           from members
          where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
        [memberNo.trim()],
      );
      if (!row) throw new ValidationError(`Member ${memberNo} was not found`);
      return {
        memberNo: row.member_no,
        name: displayName(row.first_name, row.last_name, row.other_names),
      };
    },

    async isSenior(memberNo: string): Promise<boolean> {
      const [row] = await deps.db.query<{ presbyter_rank: number | null }>(
        `select presbyter_rank
           from members
          where lower(member_no) = lower($1) and archived_at is null and purged_at is null`,
        [memberNo],
      );
      return (row?.presbyter_rank ?? null) !== null;
    },

    // -- welfare -----------------------------------------------------------

    async welfareProducts(memberNo: string): Promise<UssdWelfareProduct[]> {
      const member = await requireWelfareMember(deps.db, memberNo);
      const eligibility = eligibilityOf(member);
      const products = await deps.subscriptionProducts.list();
      return products
        .filter((product) => product.paymentMode === 'member' && isEligible(product, eligibility))
        .map((product) => ({
          code: product.code,
          name: product.name,
          premiumMinor: product.premiumMinor,
          currency: product.currency,
          periodMonths: product.periodMonths,
          covers: product.covers,
          maxDependents: product.maxDependents,
          allowedRelationships: product.allowedRelationships,
        }));
    },

    async welfareDependents(
      memberNo: string,
      productCode: string,
    ): Promise<UssdWelfareDependent[]> {
      const holder = await requireWelfareMember(deps.db, memberNo);
      const product = await deps.subscriptionProducts.get(productCode);
      if (!product || product.covers !== 'household') return [];

      const rows = await deps.db.query<{
        member_no: string;
        first_name: string | null;
        last_name: string | null;
        other_names: string | null;
        type: string;
        declared_by_holder: boolean;
      }>(
        `select other.member_no, other.first_name, other.last_name, other.other_names,
                r.type, (r.member_id = $1) as declared_by_holder
           from member_relationships r
           join members other
             on other.id = case
                when r.member_id = $1 then r.related_member_id
                else r.member_id
              end
          where (r.member_id = $1 or r.related_member_id = $1)
            and other.id <> $1
            and other.archived_at is null
            and other.purged_at is null
          order by other.member_no`,
        [holder.id],
      );

      const allowed = new Set<string>(product.allowedRelationships);
      const seen = new Set<string>();
      const dependents: UssdWelfareDependent[] = [];
      for (const row of rows) {
        const relationship = coveredRelationship(row.type, row.declared_by_holder);
        if (!allowed.has(holderRelationship(row.type, row.declared_by_holder))) continue;
        if (seen.has(row.member_no)) continue;
        seen.add(row.member_no);
        dependents.push({
          memberNo: row.member_no,
          name: displayName(row.first_name, row.last_name, row.other_names),
          relationship,
        });
        if (dependents.length >= product.maxDependents) break;
      }
      return dependents;
    },

    async subscribeWelfare(input: {
      memberNo: string;
      productCode: string;
      coveredMemberNos?: string[];
      phoneHash: string;
    }): Promise<UssdWelfareSubscription> {
      const subscription = await deps.subscriptions.subscribe(
        input.memberNo,
        {
          productCode: input.productCode,
          coveredMemberNos: input.coveredMemberNos,
        },
        `ussd:${input.phoneHash}`,
        'ussd',
      );
      return {
        id: subscription.id,
        paidBy: subscription.paidBy === 'church' ? 'church' : 'member',
      };
    },

    async welfareServices(memberNo: string) {
      const items = await deps.subscriptions.memberSubscriptions(memberNo);
      return items.map((item) => ({
        id: item.id,
        name: item.productName ?? legacyKindName(item.kind),
        status: item.status,
        source: item.source,
        paidBy: item.paidBy,
        periodEnd: item.periodEnd,
        claimedTotalMinor: item.claimedTotalMinor,
        currency: item.currency,
        policyholder: item.policyholder,
        relationship: item.relationship,
      }));
    },
  };
}
