import type { PeriodDay } from '../api/events';

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
