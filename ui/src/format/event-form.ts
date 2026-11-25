import type {
  CreateEventOccurrenceInput,
  CreateEventParentInput,
  CreateEventPeriodInput,
  EventParentItem,
  EventPreviewInput,
  EventRecurrenceSchedule,
  EventVenueType,
  UpdateEventParentInput,
} from '../api/events';
import { VENUE_LABELS } from './events';
import { utcToday } from './member-form';
import {
  dayOfMonthOf,
  parseSchedule,
  toRrule,
  weekdayOf,
  type MonthPosition,
  type MonthlyMode,
  type RecurrenceCadence,
  type WeekdayCode,
} from './rrule';

/**
 * Pure form helpers for the event form (FR-42a, FR-42b, FR-42f). The constraints
 * mirror `createEventParentSchema`, `updateEventParentSchema` and
 * `dateStringSchema`, so the browser rejects the same input the API would reject
 * before a request is made.
 *
 * The event number is not part of the create contract at all (AC 8): the server
 * mints it, so the form holds `eventNo` only as the read-only seed the edit view
 * displays and never puts it in a create body.
 */

/** The venue choices in the order the API's enum names them. */
export const EVENT_VENUE_OPTIONS: readonly {
  readonly value: EventVenueType;
  readonly label: string;
}[] = (['auditorium', 'virtual', 'hybrid'] as const).map((value) => ({
  value,
  label: VENUE_LABELS[value],
}));

/** One date row: a UTC date and two optional wall-clock times (FR-42b). */
export interface OccurrenceFormValues {
  readonly date: string;
  /** Blank inherits the event's start time; the payload omits it. */
  readonly startTime: string;
  /** Blank inherits the event's end time (or leaves it open-ended). */
  readonly endTime: string;
}

/** The period modes the create offers: one cycle resolved once, or a recurrence. */
export type PeriodFrequency = 'one-cycle' | 'monthly';

/**
 * The schedule builder's values, shared by the form and the detail dialog. One
 * flat object because the controls overlap: a rule uses cadence/weekdays/interval,
 * the period mode uses the period fields, and `mode` says which arm is live.
 */
export interface EventScheduleForm {
  /** `rule` authors an RFC 5545 schedule; `period` authors a named period. */
  readonly mode: 'rule' | 'period';
  readonly cadence: RecurrenceCadence;
  /** Weekly/fortnightly: the chosen weekday set. */
  readonly weekdays: readonly WeekdayCode[];
  /** Daily 1-7; weekly and fortnightly 1-4. Held as text while it is typed. */
  readonly interval: string;
  readonly monthlyMode: MonthlyMode;
  readonly dayOfMonth: string;
  readonly position: MonthPosition;
  readonly positionWeekday: WeekdayCode;
  readonly periodId: string;
  /**
   * The catalogue's resolver shape, when it tells us: a `date` period takes no
   * day inside it. Null when the contract does not say.
   */
  readonly periodKind: 'week' | 'date' | null;
  readonly periodFrequency: PeriodFrequency;
  /** `YYYY-MM` for a one-cycle period. */
  readonly cycleMonth: string;
  /** A weekday inside each cycle's period; empty schedules the whole period. */
  readonly periodDay: '' | WeekdayCode;
}

export interface EventFormValues {
  /** Read-only seed for the edit view; never rendered or sent on the create. */
  readonly eventNo: string;
  readonly name: string;
  /** The ordered audience set; the first is the primary. */
  readonly audienceIds: string[];
  readonly description: string;
  readonly venueType: EventVenueType;
  readonly venueName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly tracksMembers: boolean;
  /** Repeats off = a standalone event whose date rows are its occurrences. */
  readonly repeats: boolean;
  readonly schedule: EventScheduleForm;
  /** The rule's first date, or a period recurrence's anchor. */
  readonly effectiveFrom: string;
  readonly endsOn: string;
  occurrences: OccurrenceFormValues[];
}

/**
 * Every addressable error. The list-level key is `occurrences`; a row's keys are
 * `occurrence-<index>-date`, `-start` and `-end`, so the page renders each message
 * under the control that owns it. The builder's keys name its own controls.
 */
export type EventFormField =
  | 'name'
  | 'audienceIds'
  | 'description'
  | 'venueType'
  | 'venueName'
  | 'startTime'
  | 'endTime'
  | 'occurrences'
  | 'effectiveFrom'
  | 'endsOn'
  | 'weekdays'
  | 'interval'
  | 'dayOfMonth'
  | 'position'
  | 'period'
  | 'cycleMonth'
  | 'periodDay'
  | `occurrence-${number}-date`
  | `occurrence-${number}-start`
  | `occurrence-${number}-end`;

export type EventFormErrors = Partial<Record<EventFormField, string>>;

export type OccurrenceTimeField = 'startTime' | 'endTime';

/** The one place the row key shape is built, shared by the validator and the page. */
export function occurrenceErrorKey(
  index: number,
  field: 'date' | OccurrenceTimeField,
): EventFormField {
  const suffix = field === 'date' ? 'date' : field === 'startTime' ? 'start' : 'end';
  return `occurrence-${index}-${suffix}`;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CYCLE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_NAME_LENGTH = 200;
const MAX_VENUE_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export function isRealCalendarDate(value: string): boolean {
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

function validateOccurrence(
  row: OccurrenceFormValues,
  index: number,
  errors: EventFormErrors,
  seenDates: Set<string>,
): void {
  const date = row.date.trim();
  if (date.length === 0) {
    errors[occurrenceErrorKey(index, 'date')] = 'Choose the date.';
  } else if (!isRealCalendarDate(date)) {
    errors[occurrenceErrorKey(index, 'date')] = 'The date must be a real date in YYYY-MM-DD form.';
  } else if (seenDates.has(date)) {
    errors[occurrenceErrorKey(index, 'date')] = 'Each date must be unique.';
  } else {
    seenDates.add(date);
  }

  const start = row.startTime.trim();
  if (start.length > 0 && !TIME_PATTERN.test(start)) {
    errors[occurrenceErrorKey(index, 'startTime')] =
      'The start time must be a 24-hour time (HH:MM).';
  }

  const end = row.endTime.trim();
  if (end.length > 0 && !TIME_PATTERN.test(end)) {
    errors[occurrenceErrorKey(index, 'endTime')] = 'The end time must be a 24-hour time (HH:MM).';
  }

  // A blank time inherits the event's; when the row names both, its end must be
  // after its start (the same rule the API applies to a written occurrence).
  if (
    start.length > 0 &&
    end.length > 0 &&
    TIME_PATTERN.test(start) &&
    TIME_PATTERN.test(end) &&
    end <= start
  ) {
    errors[occurrenceErrorKey(index, 'endTime')] = 'The end time must be after the start time.';
  }
}

/** A whole number held in a text field, within bounds; `null` when it is not. */
function integerInRange(value: string, min: number, max: number): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const number = Number(trimmed);
  return Number.isInteger(number) && number >= min && number <= max;
}

/** The schedule's own validation, shared by both arms of Repeats. */
function validateSchedule(values: EventFormValues, errors: EventFormErrors): void {
  const schedule = values.schedule;

  if (schedule.mode === 'period') {
    if (schedule.periodId.trim().length === 0) {
      errors.period = 'Choose a period.';
      return;
    }

    if (schedule.periodFrequency === 'one-cycle') {
      if (!CYCLE_MONTH_PATTERN.test(schedule.cycleMonth.trim())) {
        errors.cycleMonth = 'Choose the cycle month.';
      }
      return;
    }

    const anchor = values.effectiveFrom.trim();
    if (anchor.length === 0) {
      errors.effectiveFrom = 'Choose the date the period starts.';
    } else if (!isRealCalendarDate(anchor)) {
      errors.effectiveFrom = 'The start date must be a real date in YYYY-MM-DD form.';
    }

    if (schedule.periodKind === 'date' && schedule.periodDay !== '') {
      errors.periodDay = 'This period is a single date, so it takes no day inside it.';
    }
    return;
  }

  const effectiveFrom = values.effectiveFrom.trim();
  if (effectiveFrom.length === 0) {
    errors.effectiveFrom = 'Choose the date the recurrence starts.';
  } else if (!isRealCalendarDate(effectiveFrom)) {
    errors.effectiveFrom = 'The start date must be a real date in YYYY-MM-DD form.';
  }

  const endsOn = values.endsOn.trim();
  if (endsOn.length > 0 && !isRealCalendarDate(endsOn)) {
    errors.endsOn = 'The end date must be a real date in YYYY-MM-DD form.';
  } else if (!errors.effectiveFrom && endsOn.length > 0 && endsOn < effectiveFrom) {
    errors.endsOn = 'The end date must not be before the start date.';
  }

  if (schedule.cadence === 'daily') {
    if (!integerInRange(schedule.interval, 1, 7)) {
      errors.interval = 'The interval must be between 1 and 7 days.';
    }
    return;
  }

  if (schedule.cadence === 'weekly' || schedule.cadence === 'fortnightly') {
    if (schedule.weekdays.length === 0) {
      errors.weekdays = 'Choose at least one day.';
    }
    if (!integerInRange(schedule.interval, 1, 4)) {
      errors.interval = 'The interval must be between 1 and 4 weeks.';
    }
    return;
  }

  if (schedule.monthlyMode === 'day') {
    if (schedule.dayOfMonth.trim().length > 0 && !integerInRange(schedule.dayOfMonth, 1, 31)) {
      errors.dayOfMonth = 'The day of the month must be between 1 and 31.';
    }
    return;
  }

  if (schedule.positionWeekday.trim().length === 0) {
    errors.position = 'Choose the weekday.';
  }
}

/**
 * The client-side mirror of the API's parent constraints. Dates are UTC calendar
 * dates; a row's blank time is legal because it inherits the event's time
 * (FR-42b). With Repeats on the date rows are replaced by the builder, so only
 * its fields are validated (FR-42f).
 */
export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  const name = values.name.trim();
  if (name.length === 0) errors.name = 'Name is required.';
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (values.audienceIds.filter((id) => id.trim().length > 0).length === 0) {
    errors.audienceIds = 'Choose at least one audience.';
  }

  const startTime = values.startTime.trim();
  if (startTime.length === 0) errors.startTime = 'Start time is required.';
  else if (!TIME_PATTERN.test(startTime)) {
    errors.startTime = 'Start time must be a 24-hour time (HH:MM).';
  }

  const endTime = values.endTime.trim();
  if (endTime.length > 0 && !TIME_PATTERN.test(endTime)) {
    errors.endTime = 'End time must be a 24-hour time (HH:MM).';
  } else if (
    endTime.length > 0 &&
    startTime.length > 0 &&
    TIME_PATTERN.test(startTime) &&
    TIME_PATTERN.test(endTime) &&
    endTime <= startTime
  ) {
    errors.endTime = 'The end time must be after the start time.';
  }

  if (trimmedLength(values.venueName) > MAX_VENUE_NAME_LENGTH) {
    errors.venueName = `Venue name must be ${MAX_VENUE_NAME_LENGTH} characters or fewer.`;
  }

  if (trimmedLength(values.description) > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (values.repeats) {
    validateSchedule(values, errors);
    return errors;
  }

  if (values.occurrences.length === 0) {
    errors.occurrences = 'Add at least one date.';
    return errors;
  }

  const seenDates = new Set<string>();
  values.occurrences.forEach((row, index) => validateOccurrence(row, index, errors, seenDates));

  return errors;
}

/**
 * The period's default cycle is the **next one, never a past one** (owner,
 * 2026-11-24): the start date's month is preferred only when it is still ahead,
 * otherwise the month after today. Opening the form on 24 November therefore
 * offers December rather than November's already-run cycle.
 */
export function defaultCycleMonth(startDate: string, today: string = utcToday()): string {
  const startMonth = /^\d{4}-\d{2}/.test(startDate.trim()) ? startDate.trim().slice(0, 7) : '';
  const todayMonth = /^\d{4}-\d{2}/.test(today.trim()) ? today.trim().slice(0, 7) : '';

  if (startMonth && startMonth > todayMonth) return startMonth;
  if (!todayMonth) return startMonth;

  const [year, month] = todayMonth.split('-').map(Number) as [number, number];
  const nextIndex = year * 12 + month; // month is 1-based, so +1 month is this index
  const nextYear = Math.floor(nextIndex / 12);
  const nextMonth = (nextIndex % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/** The builder's initial state: weekly on the start date's weekday, cycle ahead. */
export function createEmptySchedule(today: string = utcToday()): EventScheduleForm {
  return {
    mode: 'rule',
    cadence: 'weekly',
    weekdays: weekdayOf(today) ? [weekdayOf(today) as WeekdayCode] : [],
    interval: '1',
    monthlyMode: 'day',
    dayOfMonth: dayOfMonthOf(today) ?? '',
    position: 'first',
    positionWeekday: 'SA',
    periodId: '',
    periodKind: null,
    periodFrequency: 'one-cycle',
    cycleMonth: defaultCycleMonth(today, today),
    periodDay: '',
  };
}

/** A fresh create-mode form: today in UTC, one open date, members tracked (FR-42a). */
export function createEmptyEventForm(
  today: string = utcToday(),
  audienceIds: string[] = [],
): EventFormValues {
  return {
    eventNo: '',
    name: '',
    audienceIds,
    description: '',
    venueType: 'auditorium',
    venueName: '',
    startTime: '09:00',
    endTime: '',
    tracksMembers: true,
    repeats: false,
    schedule: createEmptySchedule(today),
    effectiveFrom: today,
    endsOn: '',
    occurrences: [{ date: today, startTime: '', endTime: '' }],
  };
}

/** The latest schedule version, the one whose rule labels the event (FR-6). */
export function latestSchedule(
  parent: Pick<EventParentItem, 'recurrence'>,
): EventRecurrenceSchedule | null {
  const schedules = parent.recurrence?.schedules ?? [];
  return (
    [...schedules].sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom),
    )[0] ?? null
  );
}

/** The ordered audience set, honouring the one-round `audienceId` alias on read. */
export function audienceIdsOf(parent: {
  readonly audienceIds?: readonly string[];
  readonly audienceId?: string;
}): string[] {
  if (Array.isArray(parent.audienceIds) && parent.audienceIds.length > 0) {
    return [...parent.audienceIds];
  }
  return parent.audienceId ? [parent.audienceId] : [];
}

/**
 * Seeds the edit form from the parent read. `repeats` is true for a recurring
 * parent **or** a period event; a schedule outside the vocabulary leaves the
 * builder at its default, and the page renders the stored string read-only
 * instead of pretending to edit it (AC-63).
 */
export function fromEventParent(
  parent: EventParentItem,
  today: string = utcToday(),
): EventFormValues {
  const schedule = latestSchedule(parent);
  const parsed = schedule ? parseSchedule(schedule.rrule) : null;
  const base = createEmptySchedule(today);
  const period = parent.period;

  const scheduleValues: EventScheduleForm = period
    ? {
        ...base,
        mode: 'period',
        periodId: period.id,
        periodFrequency: period.frequency === 'monthly' ? 'monthly' : 'one-cycle',
        cycleMonth: period.cycle ?? base.cycleMonth,
        periodDay: (period.day as WeekdayCode | null) ?? '',
      }
    : parsed
      ? {
          ...base,
          mode: 'rule',
          cadence: parsed.cadence,
          weekdays: [...parsed.weekdays],
          interval: String(parsed.interval),
          monthlyMode: parsed.monthlyMode,
          dayOfMonth: parsed.dayOfMonth,
          position: parsed.position,
          positionWeekday: parsed.positionWeekday ?? base.positionWeekday,
        }
      : base;

  return {
    eventNo: parent.eventNo,
    name: parent.name,
    audienceIds: audienceIdsOf(parent),
    description: parent.description ?? '',
    venueType: parent.venueType,
    venueName: parent.venueName ?? '',
    startTime: parent.startTime,
    endTime: parent.endTime ?? '',
    tracksMembers: parent.tracksMembers,
    repeats: parent.recurrence !== null || parent.period !== null,
    schedule: scheduleValues,
    effectiveFrom: schedule?.effectiveFrom ?? today,
    endsOn: schedule?.endsOn ?? '',
    occurrences:
      parent.occurrences.length > 0
        ? parent.occurrences.map((occurrence) => ({
            date: occurrence.date,
            startTime: '',
            endTime: '',
          }))
        : [{ date: today, startTime: '', endTime: '' }],
  };
}

/** The rrule the builder's rule arm produces, or null when it is not yet buildable. */
export function toScheduleRrule(schedule: EventScheduleForm, effectiveFrom: string): string | null {
  const interval = Number(schedule.interval);
  return toRrule({
    cadence: schedule.cadence,
    effectiveFrom,
    weekdays: schedule.weekdays,
    interval: Number.isInteger(interval) ? interval : Number.NaN,
    monthlyMode: schedule.monthlyMode,
    dayOfMonth: schedule.dayOfMonth,
    position: schedule.position,
    positionWeekday: schedule.positionWeekday,
  });
}

/** The period arm's wire body: one cycle, or a monthly period recurrence. */
export function toPeriodInput(
  schedule: EventScheduleForm,
  effectiveFrom: string,
): CreateEventPeriodInput {
  const id = schedule.periodId.trim();
  if (schedule.periodFrequency === 'one-cycle') {
    return { id, cycleMonth: schedule.cycleMonth.trim() };
  }

  const anchor = effectiveFrom.trim();
  return {
    id,
    frequency: 'monthly',
    ...(schedule.periodDay ? { day: schedule.periodDay } : {}),
    ...(anchor.length > 0 ? { effectiveFrom: anchor } : {}),
  };
}

/**
 * The create body's preview shape (FR-42b/AC-63a): the same rule or period the
 * create will send, with the audience set. Null when there is nothing to resolve
 * (a standalone event, or an incomplete rule).
 */
export function toPreviewInput(values: EventFormValues): EventPreviewInput | null {
  if (!values.repeats) return null;

  const audienceIds = values.audienceIds.filter((id) => id.trim().length > 0);
  const base: EventPreviewInput = audienceIds.length > 0 ? { audienceIds } : {};

  if (values.schedule.mode === 'period') {
    if (values.schedule.periodId.trim().length === 0) return null;
    return { ...base, period: toPeriodInput(values.schedule, values.effectiveFrom) };
  }

  const rrule = toScheduleRrule(values.schedule, values.effectiveFrom);
  if (!rrule) return null;

  const endsOn = values.endsOn.trim();
  return {
    ...base,
    recurrence: {
      schedules: [
        {
          effectiveFrom: values.effectiveFrom.trim(),
          rrule,
          ...(endsOn.length > 0 ? { endsOn } : {}),
        },
      ],
    },
  };
}

/**
 * The create body (FR-42a): text is trimmed, blank optional fields are omitted,
 * and the event is exactly one of its date rows, its first recurrence version, or
 * a named period. `eventNo` is never sent — the server mints it and refuses a
 * client value by name (AC 8) — and a blank time is omitted so the API inherits
 * the event's. `timezone`, `status`, `source`, `ministry`, `presbyterOnly` and
 * the derived range are never sent.
 */
export function toCreateEventPayload(values: EventFormValues): CreateEventParentInput {
  const name = values.name.trim();
  const description = values.description.trim();
  const venueName = values.venueName.trim();
  const startTime = values.startTime.trim();
  const endTime = values.endTime.trim();
  const audienceIds = values.audienceIds.map((id) => id.trim()).filter((id) => id.length > 0);

  const base = {
    name,
    audienceIds,
    ...(description.length > 0 ? { description } : {}),
    venueType: values.venueType,
    ...(venueName.length > 0 ? { venueName } : {}),
    startTime,
    ...(endTime.length > 0 ? { endTime } : {}),
    tracksMembers: values.tracksMembers,
  };

  if (values.repeats) {
    if (values.schedule.mode === 'period') {
      return { ...base, period: toPeriodInput(values.schedule, values.effectiveFrom) };
    }

    const effectiveFrom = values.effectiveFrom.trim();
    const rrule = toScheduleRrule(values.schedule, effectiveFrom);
    if (!rrule) throw new Error('The recurrence could not be built from these choices.');

    const endsOn = values.endsOn.trim();
    return {
      ...base,
      recurrence: {
        schedules: [{ effectiveFrom, rrule, ...(endsOn.length > 0 ? { endsOn } : {}) }],
      },
    };
  }

  return {
    ...base,
    occurrences: values.occurrences.map((row): CreateEventOccurrenceInput => {
      const rowStart = row.startTime.trim();
      const rowEnd = row.endTime.trim();
      return {
        date: row.date.trim(),
        ...(rowStart.length > 0 ? { startTime: rowStart } : {}),
        ...(rowEnd.length > 0 ? { endTime: rowEnd } : {}),
      };
    }),
  };
}

/**
 * The update body (FR-42b): the identity and when/where fields only. The event
 * number is immutable, Members tracking is read-only by decision, and the
 * recurrence, period and dates are written through their own routes — so none of
 * them is carried here. A blank optional value is sent as `null` so the operator
 * can clear it.
 */
export function toUpdateEventPayload(values: EventFormValues): UpdateEventParentInput {
  const endTime = values.endTime.trim();
  const venueName = values.venueName.trim();
  const description = values.description.trim();

  return {
    name: values.name.trim(),
    audienceIds: values.audienceIds.map((id) => id.trim()).filter((id) => id.length > 0),
    venueType: values.venueType,
    startTime: values.startTime.trim(),
    endTime: endTime.length > 0 ? endTime : null,
    venueName: venueName.length > 0 ? venueName : null,
    description: description.length > 0 ? description : null,
  };
}
