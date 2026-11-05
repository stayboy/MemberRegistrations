import type { Db, Row } from '../db/sql.js';
import { todayIn } from '../domain/series.js';
import type { MemberRepository } from '../repos/members.js';
import { eventOfferingsFor, type EventOfferingItem } from '../repos/offerings.js';
import type { OfferingRepository } from '../repos/offerings.js';
import type { PaymentGroupRepository } from '../repos/payment-groups.js';
import type { PledgeRepository } from '../repos/pledges.js';
import type {
  CreateGroupInput,
  CreatePledgeInput,
  MemberPayments,
  UssdEvent,
  UssdOffering,
  UssdPledge,
  UssdServices,
} from './machine.js';

export interface UssdServiceDeps {
  db: Db;
  members: MemberRepository;
  offerings: OfferingRepository;
  pledges: PledgeRepository;
  paymentGroups: PaymentGroupRepository;
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

function offeringName(item: EventOfferingItem): string {
  return item.name.trim();
}

/**
 * The USSD services are wired once in `createApp`; the per-request phone lives
 * in the session info and never enters the persisted context.
 */
export function createUssdServices(deps: UssdServiceDeps): UssdServices {
  return {
    async currentEvent(): Promise<UssdEvent | null> {
      const rows = await deps.db.query<EventRow>(
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
      const sessionDate = dates.includes(today)
        ? today
        : (dates.find((date) => date >= today) ?? null);
      if (!sessionDate) return null;

      return { id: row.id, name: row.name, sessionDate };
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
  };
}
