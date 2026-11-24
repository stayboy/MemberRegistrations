import { EVENT_PERIOD_IDS, type EventPeriodId } from '../schemas/events.js';

/**
 * The three named periods (member-registrations-event-periods.md, "Named
 * periods"). They are declared in code because a fourth period - or a
 * definition that must change without a deploy - is the trigger to move this
 * into a catalogue table, not before.
 *
 * The catalogue is keyed by the wire ids the schema fixes, so a fourth id added
 * to `EVENT_PERIOD_IDS` fails the build here until its definition is written.
 *
 * The names are the parish's own vocabulary, not system jargon - a reader who
 * does not know the calendar cannot infer them, so each carries a `definition`
 * in the parish's words:
 * - Communion Week is the week preparing for the monthly communion service: the
 *   seven days ending on the Saturday before the month's first Sunday.
 * - Gospel Week is the week before it, when ministries hold their meetings.
 * - Home Cells is that cycle's Monday, when the small groups meet - one date.
 * The system never reinterprets a name; the rule is what the resolver evaluates.
 */
export interface NamedPeriod {
  id: EventPeriodId;
  name: string;
  /** The rule in words; the form shows it beside the choice. */
  definition: string;
}

const CATALOGUE: Record<EventPeriodId, NamedPeriod> = {
  'communion-week': {
    id: 'communion-week',
    name: 'Communion Week',
    definition:
      'The Sunday-to-Saturday week whose last day is the Saturday before the first Sunday of the cycle month.',
  },
  'gospel-week': {
    id: 'gospel-week',
    name: 'Gospel Week',
    definition:
      'Communion Week shifted back seven days: it ends on the Saturday eight days before the cycle month’s first Sunday.',
  },
  'home-cells': {
    id: 'home-cells',
    name: 'Home Cells',
    definition: 'The Monday of Communion Week.',
  },
};

/** The catalogue in wire order, served by `GET /v1/events/periods`. */
export const EVENT_PERIODS: readonly NamedPeriod[] = EVENT_PERIOD_IDS.map((id) => CATALOGUE[id]);

export function periodById(id: EventPeriodId): NamedPeriod {
  return CATALOGUE[id];
}

const DAY_MS = 86_400_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseCycle(cycle: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(cycle);
  if (!match) {
    throw new RangeError(`cycle must be a calendar month (YYYY-MM), received "${cycle}"`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The Sunday that opens the week ending on the Saturday before the cycle month's first Sunday. */
function communionWeekStart(cycle: string): string {
  const { year, month } = parseCycle(cycle);
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const firstWeekday = new Date(firstOfMonth).getUTCDay(); // 0 = Sunday
  const firstSunday = firstOfMonth + ((7 - firstWeekday) % 7) * DAY_MS;
  const saturdayBefore = firstSunday - DAY_MS;
  return iso(new Date(saturdayBefore - 6 * DAY_MS));
}

function week(start: string): string[] {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => iso(new Date(startMs + offset * DAY_MS)));
}

/**
 * Resolves one named period against a cycle month to UTC calendar dates, in
 * ascending order. There is no clock and no event timezone: the resolver is
 * pure, so a cycle always resolves to the same dates, and clients format (never
 * shift) them (AGENTS.md §4).
 *
 * The cycle is the month of the Communion Sunday the week precedes, written
 * `YYYY-MM`: cycle `2027-01` is 27 Dec 2026 - 2 Jan 2027.
 */
export function resolve(period: EventPeriodId, cycle: string): string[] {
  const start = communionWeekStart(cycle);
  switch (period) {
    case 'communion-week':
      return week(start);
    case 'gospel-week': {
      const startMs = Date.parse(`${start}T00:00:00Z`) - 7 * DAY_MS;
      return week(iso(new Date(startMs)));
    }
    case 'home-cells':
      return [iso(new Date(Date.parse(`${start}T00:00:00Z`) + DAY_MS))];
  }
}
