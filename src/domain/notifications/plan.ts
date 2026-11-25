import { PreconditionFailedError, ValidationError } from '../../errors/domain-errors.js';
import {
  NOTIFICATION_MAX_SLOTS,
  type NotificationSlotAnchor,
  type NotificationSlotKind,
} from '../../schemas/notifications.js';

/**
 * The slot rules and the revision machinery
 * (member-registrations-event-notifications.md N-2, N-3; FR-3, FR-4).
 *
 * Resolution is pure: event facts and occurrences go in, instants come out. The
 * repository reads the event and passes them, and the same code runs on the write
 * (refusing a duplicate instant) and on the preview, so the two can never
 * disagree about what a slot means.
 */

/** Which anchors a kind may use (N-2). A fifth kind is not in the contract. */
export const SLOT_ANCHORS_BY_KIND: Readonly<Record<NotificationSlotKind, readonly string[]>> = {
  announce: ['publish', 'event_start'],
  reminder: ['event_start', 'occurrence_start', 'event_end'],
  starts: ['occurrence_start'],
  last: ['occurrence_end', 'event_end'],
};

export interface PlanSlotInput {
  kind: NotificationSlotKind;
  anchor: NotificationSlotAnchor;
  offsetMinutes: number;
}

export interface PlanOccurrenceFact {
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

export interface PlanEventFacts {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  occurrences: PlanOccurrenceFact[];
}

export interface ResolvedSlotInstant {
  /** The slot's position in the authored set, its identity on the wire. */
  sortOrder: number;
  kind: NotificationSlotKind;
  anchor: NotificationSlotAnchor;
  offsetMinutes: number;
  /** The occurrence date the instant belongs to; null for event-anchored slots. */
  occurrenceDate: string | null;
  instant: Date;
}

const MINUTE_MS = 60_000;

function wallClock(date: string, time: string): { date: string; time: string } {
  const clock = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '00:00';
  return { date, time: clock };
}

function zoneParts(at: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = zoneParts(at, timeZone);
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * A wall-clock date and time in the event's timezone, as a UTC instant (FR-4).
 * The offset is read from the zone at the guessed instant and re-applied twice,
 * which is enough for every DST transition.
 */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naive = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  let instant = naive;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = naive - zoneOffsetMs(new Date(instant), timeZone);
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}

function shift(instant: Date, offsetMinutes: number): Date {
  return new Date(instant.getTime() + offsetMinutes * MINUTE_MS);
}

/** The event's own start and end instants, used by the event-anchored slots. */
function eventAnchor(
  anchor: 'event_start' | 'event_end',
  facts: PlanEventFacts,
): { occurrenceDate: null; instant: Date } {
  if (anchor === 'event_start') {
    const clock = wallClock(facts.startDate, facts.startTime ?? '00:00');
    return {
      occurrenceDate: null,
      instant: zonedWallClockToUtc(clock.date, clock.time, facts.timezone),
    };
  }
  const clock = wallClock(facts.endDate, facts.endTime ?? facts.startTime ?? '00:00');
  return {
    occurrenceDate: null,
    instant: zonedWallClockToUtc(clock.date, clock.time, facts.timezone),
  };
}

/**
 * Every instant a slot resolves to. A cancelled occurrence produces none (N-2),
 * and a slot repeated per occurrence is repeated because its anchor says so -
 * there is no repeat flag to store.
 */
export function resolveSlot(
  slot: PlanSlotInput & { sortOrder: number },
  facts: PlanEventFacts,
  now: Date,
): ResolvedSlotInstant[] {
  if (slot.anchor === 'publish') {
    return [
      {
        ...slot,
        occurrenceDate: null,
        instant: shift(now, slot.offsetMinutes),
      },
    ];
  }
  if (slot.anchor === 'event_start' || slot.anchor === 'event_end') {
    const anchor = eventAnchor(slot.anchor, facts);
    return [{ ...slot, ...anchor, instant: shift(anchor.instant, slot.offsetMinutes) }];
  }

  const starts = slot.anchor === 'occurrence_start';
  return facts.occurrences
    .filter((occurrence) => occurrence.status !== 'cancelled')
    .map((occurrence) => {
      const clock = starts
        ? wallClock(occurrence.date, occurrence.startTime ?? facts.startTime ?? '00:00')
        : wallClock(
            occurrence.date,
            occurrence.endTime ?? facts.endTime ?? facts.startTime ?? '00:00',
          );
      const instant = zonedWallClockToUtc(clock.date, clock.time, facts.timezone);
      return {
        ...slot,
        occurrenceDate: occurrence.date,
        instant: shift(instant, slot.offsetMinutes),
      };
    });
}

/** The pair FR-3 refuses: one plan, one occurrence, one instant, twice. */
export function assertNoDuplicateInstants(resolved: readonly ResolvedSlotInstant[]): void {
  const seen = new Map<string, ResolvedSlotInstant>();
  for (const entry of resolved) {
    const key = `${entry.occurrenceDate ?? ''}|${entry.instant.toISOString()}`;
    const previous = seen.get(key);
    if (previous) {
      throw new ValidationError(
        `slots: slot ${previous.sortOrder} and slot ${entry.sortOrder} both resolve to ` +
          `${entry.instant.toISOString()}${entry.occurrenceDate ? ` on ${entry.occurrenceDate}` : ''}`,
        'duplicate_slot_time',
      );
    }
    seen.set(key, entry);
  }
}

/**
 * The kind/anchor pairing (FR-3), separate from the event-dependent checks so a
 * caller with no event (the defaults template) can still refuse an impossible
 * pair.
 */
export function assertSlotAnchors(slots: readonly PlanSlotInput[]): void {
  slots.forEach((slot, index) => {
    const allowed = SLOT_ANCHORS_BY_KIND[slot.kind];
    if (!allowed.includes(slot.anchor)) {
      throw new ValidationError(
        `slots.${index}.anchor: ${slot.kind} may be anchored to ${allowed.join(', ')}`,
        'invalid_slot_anchor',
      );
    }
  });
}

/**
 * Validates the authored set against the event. The count and the offset range
 * are the schema's; the kind/anchor pairing and the duplicate instant need the
 * event's own facts, so they live here.
 */
export function assertSlots(
  slots: readonly (PlanSlotInput & { sortOrder?: number })[],
  facts: PlanEventFacts,
  now: Date,
): ResolvedSlotInstant[] {
  if (slots.length < 1 || slots.length > NOTIFICATION_MAX_SLOTS) {
    throw new ValidationError(
      `slots: a plan has between 1 and ${NOTIFICATION_MAX_SLOTS} slots`,
      'invalid_slot_count',
    );
  }
  assertSlotAnchors(slots);
  const resolved = slots.flatMap((slot, sortOrder) =>
    resolveSlot({ ...slot, sortOrder }, facts, now),
  );
  assertNoDuplicateInstants(resolved);
  return resolved;
}

export type PlanRevisionStatus = 'draft' | 'published' | 'superseded' | 'cancelled';

export interface PlanRevisionFact {
  revision: number;
  status: PlanRevisionStatus;
}

/**
 * Which revision an edit writes (N-3). A draft edits in place; anything else
 * (published, superseded, cancelled) is frozen, so the edit lands on the next
 * number and the old revision keeps its own slots and templates.
 */
export function revisionToWrite(revisions: readonly PlanRevisionFact[]): {
  revision: number;
  createsRevision: boolean;
} {
  if (revisions.length === 0) return { revision: 1, createsRevision: true };
  const highest = Math.max(...revisions.map((entry) => entry.revision));
  const current = revisions.find((entry) => entry.revision === highest);
  if (current?.status === 'draft') return { revision: highest, createsRevision: false };
  return { revision: highest + 1, createsRevision: true };
}

/**
 * `If-Match` names the revision the client read. `*` and an absent header skip
 * the check, matching the event write's convention; anything else must equal the
 * revision this write would edit.
 */
export function assertIfMatch(header: string | undefined, revision: number): void {
  const value = header?.trim();
  if (!value || value === '*') return;
  const expected = `"r${revision}"`;
  if (value !== expected && value !== `r${revision}`) {
    throw new PreconditionFailedError(
      `If-Match: the plan has moved on; read it again before editing (expected ${expected})`,
      'plan_revision_stale',
    );
  }
}

export function planEtag(revision: number): string {
  return `"r${revision}"`;
}
