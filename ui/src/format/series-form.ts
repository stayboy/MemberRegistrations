import type { CreateSeriesInput, SeriesDto, UpdateSeriesInput } from '../api/series';
import { utcToday } from './member-form';

/**
 * Pure form helpers for the series create/edit screen. The constraints mirror
 * `createSeriesSchema`, `updateSeriesSchema` and `scheduleInputSchema` so the
 * browser rejects the same input the API would reject, before a request is
 * made (FR-42).
 */

export const SERIES_TIMEZONE_OTHER = 'other';

export const SERIES_TIMEZONE_OPTIONS: readonly {
  readonly value: string;
  readonly label: string;
}[] = [
  { value: 'Africa/Lagos', label: 'Africa/Lagos (West Africa Time)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'Europe/London (UK time)' },
  { value: 'America/New_York', label: 'America/New_York (US Eastern)' },
];

export type SeriesFormField =
  'name' | 'ministryCode' | 'timezone' | 'description' | 'effectiveFrom' | 'rrule' | 'endsOn';

export type SeriesFormErrors = Partial<Record<SeriesFormField, string>>;

export interface SeriesFormValues {
  readonly name: string;
  /** Empty means "no ministry"; the API receives `null`. */
  readonly ministryCode: string;
  /** The value the API receives, including a custom "Other" timezone. */
  readonly timezone: string;
  /** The dropdown selection (`other` when the free-text input is shown). */
  readonly timezoneSelection: string;
  readonly description: string;
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn: string;
}

export interface SeriesFormValidationMode {
  /** Create owns the first schedule version; edit never edits the schedule. */
  readonly requireSchedule: boolean;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_RRULE_LENGTH = 6;
const MAX_RRULE_LENGTH = 200;
const MAX_NAME_LENGTH = 120;
const MAX_TIMEZONE_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * The API's `validateRrule` rejects a body that does not start `FREQ=` and any
 * `COUNT=`/`UNTIL=` (its end date is `endsOn`). The frequency whitelist mirrors
 * the parser's accepted values so a short body such as `FREQ=D` is not sent.
 */
const RRULE_FREQUENCIES = new Set([
  'SECONDLY',
  'MINUTELY',
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
]);
const RRULE_FREQUENCY_PATTERN = /^FREQ=([A-Z]+)(?:;|$)/;

function parseCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function trimmedLength(value: string): number {
  return value.trim().length;
}

/** The client-side mirror of the API's create/update and schedule constraints. */
export function validateSeriesForm(
  values: SeriesFormValues,
  mode: SeriesFormValidationMode = { requireSchedule: true },
): SeriesFormErrors {
  const errors: SeriesFormErrors = {};

  const name = values.name.trim();
  if (name.length === 0) errors.name = 'Name is required.';
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  const timezone = values.timezone.trim();
  if (timezone.length === 0) errors.timezone = 'Timezone is required.';
  else if (timezone.length > MAX_TIMEZONE_LENGTH) {
    errors.timezone = `Timezone must be ${MAX_TIMEZONE_LENGTH} characters or fewer.`;
  }

  if (trimmedLength(values.description) > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (mode.requireSchedule) {
    const effectiveFrom = values.effectiveFrom.trim();
    if (effectiveFrom.length === 0) {
      errors.effectiveFrom = 'Choose the first date this series applies to.';
    } else if (!parseCalendarDate(effectiveFrom)) {
      errors.effectiveFrom = 'Effective from must be a real date in YYYY-MM-DD form.';
    }

    const rrule = values.rrule.trim();
    if (rrule.length === 0) {
      errors.rrule = 'Enter an RRULE body such as FREQ=WEEKLY;BYDAY=SU.';
    } else if (rrule.length < MIN_RRULE_LENGTH) {
      errors.rrule = `The recurrence rule must be at least ${MIN_RRULE_LENGTH} characters.`;
    } else if (rrule.length > MAX_RRULE_LENGTH) {
      errors.rrule = `The recurrence rule must be ${MAX_RRULE_LENGTH} characters or fewer.`;
    } else {
      const normalized = rrule.toUpperCase();
      const frequency = RRULE_FREQUENCY_PATTERN.exec(normalized)?.[1];
      if (!frequency || !RRULE_FREQUENCIES.has(frequency)) {
        errors.rrule =
          'The recurrence rule must start with FREQ= and a supported frequency, for example FREQ=WEEKLY;BYDAY=SU.';
      } else if (/\b(COUNT|UNTIL)=/.test(normalized)) {
        errors.rrule = 'The recurrence rule must not contain COUNT or UNTIL; use Ends on instead.';
      }
    }

    const endsOn = values.endsOn.trim();
    if (endsOn.length > 0) {
      if (!parseCalendarDate(endsOn)) {
        errors.endsOn = 'Ends on must be a real date in YYYY-MM-DD form.';
      } else if (parseCalendarDate(effectiveFrom) && endsOn < effectiveFrom.trim()) {
        errors.endsOn = 'The end date must not be before the effective date.';
      }
    }
  }

  return errors;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A fresh create-mode form; the first schedule starts today in UTC. */
export function createEmptySeriesForm(today: string = utcToday()): SeriesFormValues {
  return {
    name: '',
    ministryCode: '',
    timezone: 'Africa/Lagos',
    timezoneSelection: 'Africa/Lagos',
    description: '',
    effectiveFrom: today,
    rrule: '',
    endsOn: '',
  };
}

/** Prefills edit mode from the detail DTO; schedule fields stay untouched. */
export function fromSeriesDetail(series: SeriesDto): SeriesFormValues {
  const known = SERIES_TIMEZONE_OPTIONS.some((option) => option.value === series.timezone);

  return {
    name: series.name,
    ministryCode: series.ministry?.code ?? '',
    timezone: series.timezone,
    timezoneSelection: known ? series.timezone : SERIES_TIMEZONE_OTHER,
    description: series.description ?? '',
    // Schedule fields are create-only and never rendered or sent in edit mode;
    // the shared form shape still requires them.
    effectiveFrom: '',
    rrule: '',
    endsOn: '',
  };
}

/** The create body: identity plus the first schedule version (FR-42). */
export function toCreateSeriesPayload(values: SeriesFormValues): CreateSeriesInput {
  return {
    name: values.name.trim(),
    ministryCode: blankToNull(values.ministryCode),
    timezone: values.timezone.trim(),
    description: blankToNull(values.description),
    schedule: {
      effectiveFrom: values.effectiveFrom.trim(),
      rrule: values.rrule.trim(),
      endsOn: blankToNull(values.endsOn),
    },
  };
}

/**
 * The edit body carries identity fields only. Schedule versions are appended
 * from the detail screen, so this payload never includes `schedule`.
 */
export function toUpdateSeriesPayload(values: SeriesFormValues): UpdateSeriesInput {
  return {
    name: values.name.trim(),
    ministryCode: blankToNull(values.ministryCode),
    timezone: values.timezone.trim(),
    description: blankToNull(values.description),
  };
}
