import type { Db, Row } from '../db/sql.js';
import { ValidationError } from '../errors/domain-errors.js';
import { todayIn } from '../domain/series.js';
import type { AttendanceCodeRepository } from '../repos/attendance-codes.js';
import type { ClockingRepository } from '../repos/clocking.js';
import type { EventRepository } from '../repos/events.js';
import type { HeadcountRepository } from '../repos/headcounts.js';
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
  UssdMemberContext,
  UssdOffering,
  UssdPledge,
  UssdProfile,
  UssdServices,
  UssdWelfareDependent,
  UssdWelfareProduct,
  UssdWelfareSubscription,
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
}

interface EventRow extends Row {
  id: string;
  name: string;
  timezone: string;
  sessions: unknown;
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

function dateOf(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function sessionDates(sessions: unknown): Array<{ date: string; status: string }> {
  return parseJsonArray(sessions)
    .map((entry) => {
      const value = entry as { date?: unknown; status?: unknown };
      const date = dateOf(value.date);
      if (date === null) return null;
      return { date, status: typeof value.status === 'string' ? value.status : 'scheduled' };
    })
    .filter((entry): entry is { date: string; status: string } => entry !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
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
  const rows = await db.query<EventRow>(
    `select e.id, e.name, e.timezone, e.sessions
       from event_instances e
      where e.status not in ('cancelled', 'archived')
        and exists (
          select 1
            from jsonb_array_elements(e.sessions) s
           where (s->>'date')::date >= (now() at time zone e.timezone)::date
             and coalesce(s->>'status', 'scheduled') <> 'cancelled'
        )
      order by
        (exists (
          select 1
            from jsonb_array_elements(e.sessions) s
           where (s->>'date')::date = (now() at time zone e.timezone)::date
             and coalesce(s->>'status', 'scheduled') <> 'cancelled'
        )) desc,
        e.start_date, e.id
      limit 1`,
  );
  const row = rows[0];
  if (!row) return null;

  const today = todayIn(row.timezone);
  const dates = sessionDates(row.sessions)
    .filter((session) => session.status !== 'cancelled')
    .map((session) => session.date);
  const sessionDate = dates.includes(today) ? today : (dates.find((date) => date >= today) ?? null);
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
}

/**
 * The applicable sessions in [from, to], ordered date -> priority tier ->
 * start time -> event number. A general event is tier 2, a presbyter-only
 * event tier 1, and an event tied to one of the caller's active ministries
 * tier 0. Anonymous callers see general events only.
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
  const rows = await db.query<ActivityRow>(
    `select e.id, e.name, e.event_no,
            (session->>'date')::date as session_date,
            coalesce(session->>'startTime', e.start_time, '') as session_start,
            e.tracks_members,
            case
              when se.ministry_id is not null and exists (
                select 1
                  from member_ministries mm
                  join ministries mi on mi.id = mm.ministry_id
                 where mm.member_id = $1::uuid
                   and mm.ministry_id = se.ministry_id
                   and mm.assigned_on <= (session->>'date')::date
                   and mi.active
              ) then 0
              when e.presbyter_only then 1
              else 2
            end as priority_tier
       from event_instances e
       left join event_series se on se.id = e.series_id
       cross join lateral jsonb_array_elements(e.sessions) session
      where e.status not in ('cancelled', 'archived')
        and coalesce(session->>'status', 'scheduled') <> 'cancelled'
        and (session->>'date')::date between $2::date and $3::date
        and (not e.presbyter_only or $4::boolean)
        and (
          se.id is null
          or se.ministry_id is null
          or (
            $1::uuid is not null
            and exists (
              select 1
                from member_ministries mm
                join ministries mi on mi.id = mm.ministry_id
               where mm.member_id = $1::uuid
                 and mm.ministry_id = se.ministry_id
                 and mm.assigned_on <= (session->>'date')::date
                 and mi.active
            )
          )
        )
      order by (session->>'date')::date,
               priority_tier,
               coalesce(session->>'startTime', e.start_time, ''),
               e.event_no nulls last,
               e.id`,
    [memberId, from, to, viewer.isPresbyter],
  );

  const items: UssdActivity[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    sessionDate: dateOf(row.session_date)!,
    tracksMembers: row.tracks_members,
  }));

  if (enrichHeadcount) {
    // At most one page of headcount reads, matching the screen's row count.
    for (const item of items.slice(0, Math.max(1, viewer.pageSize))) {
      if (item.tracksMembers) continue;
      const current = await headcounts.current(item.id, item.sessionDate);
      item.headcount = current?.total ?? 0;
    }
  }
  return items;
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
  verified_at: unknown;
  gender: EligibilityMember['gender'];
  dob: unknown;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function isoDateTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function requireWelfareMember(db: Db, memberNo: string): Promise<WelfareMemberRow> {
  const [row] = await db.query<WelfareMemberRow>(
    `select id, member_no, joined_on, membership_card_no, verified_at, gender, dob
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
    verifiedAt: isoDateTime(row.verified_at),
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
    }): Promise<{ reference: string }> {
      const result = await deps.attendanceCodes.redeem({
        code: input.code.trim(),
        purpose: 'registration',
        phoneHash: input.phoneHash,
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
      mode: 'adults' | 'children';
      adultMale: number;
      adultFemale: number;
      adultUnspecified: number;
      childMale: number;
      childFemale: number;
      childUnspecified: number;
      supersedesId?: string;
      phoneHash: string;
    }): Promise<UssdHeadcount> {
      const headcount = await deps.headcounts.record(
        input.eventId,
        {
          sessionDate: input.sessionDate,
          mode: input.mode,
          adultMale: input.adultMale,
          adultFemale: input.adultFemale,
          adultUnspecified: input.adultUnspecified,
          childMale: input.childMale,
          childFemale: input.childFemale,
          childUnspecified: input.childUnspecified,
          supersedesId: input.supersedesId,
        },
        `ussd:${input.phoneHash}`,
      );
      return {
        id: headcount.id,
        mode: headcount.mode,
        asOf: headcount.asOf,
        total: headcount.total,
        adultMale: headcount.adultMale,
        adultFemale: headcount.adultFemale,
        adultUnspecified: headcount.adultUnspecified,
        childMale: headcount.childMale,
        childFemale: headcount.childFemale,
        childUnspecified: headcount.childUnspecified,
      };
    },

    async currentHeadcount(eventId: string, sessionDate: string): Promise<UssdHeadcount | null> {
      const headcount = await deps.headcounts.current(eventId, sessionDate);
      if (!headcount) return null;
      return {
        id: headcount.id,
        mode: headcount.mode,
        asOf: headcount.asOf,
        total: headcount.total,
        adultMale: headcount.adultMale,
        adultFemale: headcount.adultFemale,
        adultUnspecified: headcount.adultUnspecified,
        childMale: headcount.childMale,
        childFemale: headcount.childFemale,
        childUnspecified: headcount.childUnspecified,
      };
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
