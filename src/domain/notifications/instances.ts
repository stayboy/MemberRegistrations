import { ConflictError, ValidationError } from '../../errors/domain-errors.js';
import type { PlanSlotInput, ResolvedSlotInstant } from './plan.js';

/**
 * Materialisation and the publish refusals
 * (member-registrations-event-notifications.md N-2, FR-4, FR-5, FR-42).
 *
 * A published plan resolves one instance per slot and occurrence over the 90
 * day horizon. The past-slot and coarse-trigger refusals are pure so publish
 * and the tests agree on the same rules before any row is written.
 */

export const NOTIFICATION_HORIZON_DAYS = 90;

/** A `starts` slot promises an alert at the session time; a coarser poll cannot. */
export const MIN_STARTS_TRIGGER_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export function horizonEnd(now: Date, days = NOTIFICATION_HORIZON_DAYS): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/**
 * FR-4: a slot resolved into the past at publish is refused. `announce` at
 * offset 0 is "now" by construction; a change notice never takes this path.
 *
 * A recurring event has past occurrences, so only a slot with **no future
 * instant left** is refused; the past instants are dropped from materialisation
 * rather than making a live series unpublishable.
 */
export function futureInstances(
  resolved: readonly ResolvedSlotInstant[],
  now: Date,
): ResolvedSlotInstant[] {
  const bySlot = new Map<number, ResolvedSlotInstant[]>();
  for (const entry of resolved) {
    const group = bySlot.get(entry.sortOrder) ?? [];
    group.push(entry);
    bySlot.set(entry.sortOrder, group);
  }

  const future: ResolvedSlotInstant[] = [];
  for (const entries of bySlot.values()) {
    const remaining = entries.filter((entry) => entry.instant.getTime() >= now.getTime());
    if (remaining.length === 0) {
      const first = entries[0]!;
      if (first.kind === 'announce' && first.offsetMinutes === 0) continue;
      throw new ValidationError(
        `slots: slot ${first.sortOrder} (${first.kind}) resolves to ${first.instant.toISOString()}, ` +
          'which is in the past',
        'slot_in_past',
      );
    }
    future.push(...remaining);
  }
  return future.sort((left, right) => left.instant.getTime() - right.instant.getTime());
}

/** The 90-day horizon, applied to the resolved set (N-2, FR-5). */
export function withinHorizon(
  resolved: readonly ResolvedSlotInstant[],
  now: Date,
  days = NOTIFICATION_HORIZON_DAYS,
): ResolvedSlotInstant[] {
  const limit = horizonEnd(now, days).getTime();
  return resolved.filter(
    (entry) => entry.instant.getTime() >= now.getTime() && entry.instant.getTime() <= limit,
  );
}

export function hasStartsSlot(slots: readonly PlanSlotInput[]): boolean {
  return slots.some((slot) => slot.kind === 'starts');
}

/**
 * FR-42/AC-36: publishing a plan with a `starts` slot is refused when the
 * deployed trigger is an interval coarser than 15 minutes. `0` is continuous.
 */
export function assertTriggerCanHonourStarts(
  slots: readonly PlanSlotInput[],
  triggerMinutes: number,
): void {
  if (triggerMinutes > MIN_STARTS_TRIGGER_MINUTES && hasStartsSlot(slots)) {
    throw new ConflictError(
      `The deployed notification trigger runs every ${triggerMinutes} minutes; a starts slot ` +
        `needs ${MIN_STARTS_TRIGGER_MINUTES} minutes or finer`,
      'cadence_too_coarse',
    );
  }
}
