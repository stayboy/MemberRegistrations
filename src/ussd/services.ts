import type { Db, Row } from '../db/sql.js';
import { ValidationError } from '../errors/domain-errors.js';
import { todayIn } from '../domain/series.js';
import type { AttendanceCodeRepository } from '../repos/attendance-codes.js';
import type { ClockingRepository } from '../repos/clocking.js';
import type { EventRepository } from '../repos/events.js';
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
  UssdAttendance,
  UssdEvent,
  UssdExpected,
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

async function activitiesBetween(
  events: EventRepository,
  clocking: ClockingRepository,
  from: string,
  to: string,
): Promise<UssdActivity[]> {
  const list = await events.list({ from, to, limit: 100, offset: 0 });
  const items: Array<{ activity: UssdActivity; startTime: string }> = [];
  for (const event of list) {
    for (const session of event.sessions) {
      if (session.status === 'cancelled') continue;
      if (session.date < from || session.date > to) continue;
      const activity: UssdActivity = {
        id: event.id,
        name: event.name,
        sessionDate: session.date,
        tracksMembers: event.tracksMembers,
      };
      if (!event.tracksMembers) {
        const expected = await clocking.getExpected(event.id, session.date);
        activity.headcountOnlyExpected = expected.total;
      }
      items.push({ activity, startTime: session.startTime ?? event.startTime });
    }
  }
  return items
    .sort(
      (a, b) =>
        a.activity.sessionDate.localeCompare(b.activity.sessionDate) ||
        a.startTime.localeCompare(b.startTime) ||
        a.activity.id.localeCompare(b.activity.id),
    )
    .map((entry) => entry.activity);
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

    async activities(date: string): Promise<UssdActivities> {
      const items = (await activitiesBetween(deps.events, deps.clocking, date, date)).slice(0, 4);
      const week = await activitiesBetween(deps.events, deps.clocking, date, addDays(date, 6));
      return { items, moreThisWeek: week.length > items.length };
    },

    async activitiesWeek(date: string): Promise<UssdActivity[]> {
      return activitiesBetween(deps.events, deps.clocking, date, addDays(date, 6));
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

    async recordExpected(input: {
      eventId: string;
      sessionDate: string;
      male: number;
      female: number;
      children: number;
      phoneHash: string;
    }): Promise<UssdExpected> {
      const expected = await deps.clocking.recordExpected(
        input.eventId,
        input.sessionDate,
        { male: input.male, female: input.female, children: input.children },
        `ussd:${input.phoneHash}`,
      );
      return {
        male: expected.male,
        female: expected.female,
        children: expected.children,
        total: expected.total,
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
