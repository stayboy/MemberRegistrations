import type { EventPeriodDetail, EventPeriodProvenance, PeriodDay } from '../api/events';

/**
 * The period day vocabulary (FR-42f, owner 2026-11-25). The API's period `day`
 * is `MON`-`SUN` - three letters, upper case - and it is **deliberately not**
 * the schedule builder's rrule `MO`-`SU`. The two vocabularies are kept apart on
 * purpose: a stored period day can never be read as a fragment of an rrule, so
 * this module owns the period's own seven labels and `format/rrule.ts` keeps
 * `WeekdayCode`/`WEEKDAY_LABELS` untouched.
 *
 * Nothing converts one vocabulary to the other. The form never needs to: the
 * period control reads and writes `PeriodDay`, the rule control reads and writes
 * `WeekdayCode`, and no value crosses between them - which is stronger than a
 * mapping that merely exists somewhere. `period.test.ts` pins the disjointness.
 */

/** The seven period days in week order, Monday first, as the control lists them. */
export const PERIOD_DAYS: readonly PeriodDay[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** The period control's own seven labels; the rrule's `WEEKDAY_LABELS` is not reused. */
export const PERIOD_DAY_LABELS: Readonly<Record<PeriodDay, string>> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

/** Narrows an option value from the day picker to the period vocabulary. */
export function isPeriodDay(value: string | undefined): value is PeriodDay {
  return value !== undefined && (PERIOD_DAYS as readonly string[]).includes(value);
}

/** The fields the period line reads; a provenance row or the form's own values. */
export type PeriodLineSource = Pick<EventPeriodProvenance, 'name' | 'frequency' | 'day'>;

/**
 * The one period line, shared by the event form and the event detail (round
 * `detail-grammar`, Q6; spec: named periods - "the event detail shows one line
 * directly under its identity"). It has four shapes:
 *
 * - a **one-off** period, resolved once: `Communion Week · 29 Nov – 5 Dec 2026`,
 *   the range the event holds;
 * - a **monthly** period with a day inside it: `Communion Week · Sundays · monthly`;
 * - a **monthly** whole-week period: `Communion Week · whole week · monthly`;
 * - a **monthly** single-date period: `Home Cells · monthly` - it cannot take a
 *   day, so the name and the frequency are the whole truth.
 *
 * `span` is the caller's **formatted** span, never a date list: the detail names
 * the event's held range, and the form names its own input (the preview's range
 * on the create, the held range on the edit). A one-off with no span yet is the
 * bare name, so a caller never has to invent dates.
 *
 * `shape` is the resolver's `dates`, and it is needed because `day: null` means
 * **both** a whole week and a single date. The detail now reads it from the same
 * event read (`period.dates`, owner 2026-11-27); the form takes it from the
 * catalogue row it is already holding. With no shape - `null`, an id the
 * catalogue no longer holds - the line makes **no span claim**: the name and the
 * frequency only, rather than guessing between the two.
 */
export function periodProvenanceLine(
  period: PeriodLineSource,
  span: string,
  shape: EventPeriodDetail['dates'],
): string {
  if (period.frequency !== 'monthly') {
    return span.length > 0 ? `${period.name} · ${span}` : period.name;
  }
  if (period.day) return `${period.name} · ${PERIOD_DAY_LABELS[period.day]}s · monthly`;
  if (shape === 'week') return `${period.name} · whole week · monthly`;
  return `${period.name} · monthly`;
}
