import type {
  CreateEventOccurrenceInput,
  CreateEventParentInput,
  EventParentItem,
  EventRecurrenceSchedule,
  EventVenueType,
  UpdateEventParentInput,
} from '../api/events';
import { VENUE_LABELS } from './events';
import { utcToday } from './member-form';
import { fromRrule, toRrule, type RecurrenceCadence } from './rrule';

/**
 * Pure form helpers for the event form (FR-42a, FR-42b, FR-42f). The constraints
 * mirror `createEventParentSchema`, `updateEventParentSchema` and
 * `dateStringSchema`, so the browser rejects the same input the API would reject
 * before a request is made.
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

export interface EventFormValues {
  readonly eventNo: string;
  readonly name: string;
  readonly audienceId: string;
  readonly description: string;
  readonly venueType: EventVenueType;
  readonly venueName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly tracksMembers: boolean;
  /** Repeats off = a standalone event whose date rows are its occurrences. */
  readonly repeats: boolean;
  readonly cadence: RecurrenceCadence;
  /** The first schedule version's start; its weekday/day becomes the rule. */
  readonly effectiveFrom: string;
  readonly endsOn: string;
  occurrences: OccurrenceFormValues[];
}

/**
 * Every addressable error. The list-level key is `occurrences`; a row's keys are
 * `occurrence-<index>-date`, `-start` and `-end`, so the page renders each message
 * under the control that owns it.
 */
export type EventFormField =
  | 'eventNo'
  | 'name'
  | 'audienceId'
  | 'description'
  | 'venueType'
  | 'venueName'
  | 'startTime'
  | 'endTime'
  | 'occurrences'
  | 'effectiveFrom'
  | 'endsOn'
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
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_EVENT_NO_LENGTH = 64;
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

/**
 * The client-side mirror of the API's parent constraints. Dates are UTC calendar
 * dates; a row's blank time is legal because it inherits the event's time
 * (FR-42b). With Repeats on the date rows are replaced by the vocabulary, so
 * only the recurrence fields are validated (FR-42f).
 */
export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  const eventNo = values.eventNo.trim();
  if (eventNo.length > MAX_EVENT_NO_LENGTH) {
    errors.eventNo = `Event number must be ${MAX_EVENT_NO_LENGTH} characters or fewer.`;
  }

  const name = values.name.trim();
  if (name.length === 0) errors.name = 'Name is required.';
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (values.audienceId.trim().length === 0) {
    errors.audienceId = 'Choose the audience.';
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

/** A fresh create-mode form: today in UTC, one open date, members tracked (FR-42a). */
export function createEmptyEventForm(today: string = utcToday(), audienceId = ''): EventFormValues {
  return {
    eventNo: '',
    name: '',
    audienceId,
    description: '',
    venueType: 'auditorium',
    venueName: '',
    startTime: '09:00',
    endTime: '',
    tracksMembers: true,
    repeats: false,
    cadence: 'weekly',
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

/**
 * Seeds the edit form from the parent read. `repeats` is true for a recurring
 * parent; a schedule outside the vocabulary leaves `cadence` at weekly, and the
 * page renders the stored string read-only instead of pretending to edit it
 * (AC-63).
 */
export function fromEventParent(
  parent: EventParentItem,
  today: string = utcToday(),
): EventFormValues {
  const schedule = latestSchedule(parent);
  const recurring = parent.recurrence !== null;

  return {
    eventNo: parent.eventNo,
    name: parent.name,
    audienceId: parent.audienceId,
    description: parent.description ?? '',
    venueType: parent.venueType,
    venueName: parent.venueName ?? '',
    startTime: parent.startTime,
    endTime: parent.endTime ?? '',
    tracksMembers: parent.tracksMembers,
    repeats: recurring,
    cadence: (schedule ? fromRrule(schedule.rrule) : null) ?? 'weekly',
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

/**
 * The create body (FR-42a): text is trimmed, blank optional fields are omitted,
 * and the event is either its date rows or its first recurrence version. A blank
 * time is omitted so the API inherits the event's. `timezone`, `status`, `source`,
 * `ministry`, `presbyterOnly` and the derived range are never sent.
 */
export function toCreateEventPayload(values: EventFormValues): CreateEventParentInput {
  const eventNo = values.eventNo.trim();
  const name = values.name.trim();
  const description = values.description.trim();
  const venueName = values.venueName.trim();
  const startTime = values.startTime.trim();
  const endTime = values.endTime.trim();

  const base = {
    ...(eventNo.length > 0 ? { eventNo } : {}),
    name,
    audienceId: values.audienceId.trim(),
    ...(description.length > 0 ? { description } : {}),
    venueType: values.venueType,
    ...(venueName.length > 0 ? { venueName } : {}),
    startTime,
    ...(endTime.length > 0 ? { endTime } : {}),
    tracksMembers: values.tracksMembers,
  };

  if (values.repeats) {
    const effectiveFrom = values.effectiveFrom.trim();
    const rrule = toRrule({ cadence: values.cadence, effectiveFrom });
    if (!rrule) throw new Error('The recurrence start date is invalid.');

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
 * recurrence and dates are written through their own routes — so none of them is
 * carried here. A blank optional value is sent as `null` so the operator can
 * clear it.
 */
export function toUpdateEventPayload(values: EventFormValues): UpdateEventParentInput {
  const endTime = values.endTime.trim();
  const venueName = values.venueName.trim();
  const description = values.description.trim();

  return {
    name: values.name.trim(),
    audienceId: values.audienceId.trim(),
    venueType: values.venueType,
    startTime: values.startTime.trim(),
    endTime: endTime.length > 0 ? endTime : null,
    venueName: venueName.length > 0 ? venueName : null,
    description: description.length > 0 ? description : null,
  };
}
