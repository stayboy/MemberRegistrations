import { todayIn } from './series.js';

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** Parses `YYYY-MM-DD` into a real UTC calendar date; null when it is not one. */
function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Completed years at `today` (UTC by default). A 29 February birthday is
 * reached on 1 March in a non-leap year, which falls out of comparing the
 * month/day pair. Null when the date of birth is missing, invalid or in the
 * future; the value is derived and never stored.
 */
export function ageInYears(dob: string | null, today = todayIn('UTC')): number | null {
  if (!dob) return null;

  const birth = parseCalendarDate(dob);
  const now = parseCalendarDate(today);
  if (!birth || !now) return null;

  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) {
    age -= 1;
  }
  return age < 0 ? null : age;
}
