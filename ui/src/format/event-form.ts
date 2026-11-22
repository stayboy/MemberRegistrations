import type { CreateEventPayload, CreateEventSessionInput, EventVenueType } from '../api/events';
import { VENUE_LABELS } from './events';
import { utcToday } from './member-form';

/**
 * Pure form helpers for the standalone event create screen. The constraints
 * mirror `createEventSchema`, `dateStringSchema` and the repository's
 * `validateEventShape` so the browser rejects the same input the API would
 * reject before a request is made (FR-42a, FR-42b).
 */

/** The venue choices in the order the API's enum names them. */
export const EVENT_VENUE_OPTIONS: readonly {
  readonly value: EventVenueType;
  readonly label: string;
}[] = (['auditorium', 'virtual', 'hybrid'] as const).map((value) => ({
  value,
  label: VENUE_LABELS[value],
}));

/** One session row: a date and two optional wall-clock times (FR-42b). */
export interface SessionFormValues {
  readonly date: string;
  /** Blank inherits the event's start time; the payload omits it. */
  readonly startTime: string;
  /** Blank inherits the event's end time (or leaves it open-ended). */
  readonly endTime: string;
}

export interface EventFormValues {
  readonly eventNo: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly venueType: EventVenueType;
  readonly venueName: string;
  readonly description: string;
  readonly tracksMembers: boolean;
  readonly presbyterOnly: boolean;
  sessions: SessionFormValues[];
}

/**
 * Every addressable error. The list-level key is `sessions`; a row's keys are
 * `session-<index>-date`, `-start` and `-end`, so a page renders each message
 * under the control that owns it.
 */
export type EventFormField =
  | 'eventNo'
  | 'name'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'venueType'
  | 'venueName'
  | 'description'
  | 'sessions'
  | `session-${number}-date`
  | `session-${number}-start`
  | `session-${number}-end`;

export type EventFormErrors = Partial<Record<EventFormField, string>>;

export type EventSessionTimeField = 'startTime' | 'endTime';

/** The one place the row key shape is built, shared by the validator and the page. */
export function sessionErrorKey(
  index: number,
  field: 'date' | EventSessionTimeField,
): EventFormField {
  const suffix = field === 'date' ? 'date' : field === 'startTime' ? 'start' : 'end';
  return `session-${index}-${suffix}`;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_EVENT_NO_LENGTH = 64;
const MAX_NAME_LENGTH = 200;
const MAX_VENUE_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

function isRealCalendarDate(value: string): boolean {
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

/**
 * The client-side mirror of the API's create constraints. Dates are UTC
 * calendar dates; a session's blank time is legal because it inherits the
 * event's time (FR-42b).
 */
export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  const eventNo = values.eventNo.trim();
  if (eventNo.length === 0) errors.eventNo = 'Event number is required.';
  else if (eventNo.length > MAX_EVENT_NO_LENGTH) {
    errors.eventNo = `Event number must be ${MAX_EVENT_NO_LENGTH} characters or fewer.`;
  }

  const name = values.name.trim();
  if (name.length === 0) errors.name = 'Name is required.';
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  const startDate = values.startDate.trim();
  if (startDate.length === 0) errors.startDate = 'Choose the start date.';
  else if (!isRealCalendarDate(startDate)) {
    errors.startDate = 'Start date must be a real date in YYYY-MM-DD form.';
  }

  const endDate = values.endDate.trim();
  if (endDate.length === 0) errors.endDate = 'Choose the end date.';
  else if (!isRealCalendarDate(endDate)) {
    errors.endDate = 'End date must be a real date in YYYY-MM-DD form.';
  } else if (!errors.startDate && endDate < startDate) {
    errors.endDate = 'The end date must not be before the start date.';
  }

  const startTime = values.startTime.trim();
  if (startTime.length === 0) errors.startTime = 'Start time is required.';
  else if (!TIME_PATTERN.test(startTime)) {
    errors.startTime = 'Start time must be a 24-hour time (HH:MM).';
  }

  const endTime = values.endTime.trim();
  if (endTime.length > 0 && !TIME_PATTERN.test(endTime)) {
    errors.endTime = 'End time must be a 24-hour time (HH:MM).';
  }

  if (trimmedLength(values.venueName) > MAX_VENUE_NAME_LENGTH) {
    errors.venueName = `Venue name must be ${MAX_VENUE_NAME_LENGTH} characters or fewer.`;
  }

  if (trimmedLength(values.description) > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (values.sessions.length === 0) {
    errors.sessions = 'Add at least one session.';
    return errors;
  }

  const sessionsInRange = !errors.startDate && !errors.endDate;
  const seenDates = new Set<string>();

  values.sessions.forEach((session, index) => {
    const date = session.date.trim();
    if (date.length === 0) {
      errors[sessionErrorKey(index, 'date')] = 'Choose the session date.';
    } else if (!isRealCalendarDate(date)) {
      errors[sessionErrorKey(index, 'date')] =
        'The session date must be a real date in YYYY-MM-DD form.';
    } else {
      if (sessionsInRange && (date < startDate || date > endDate)) {
        errors[sessionErrorKey(index, 'date')] =
          'The session date must fall inside the event range.';
      }
      if (seenDates.has(date)) {
        errors[sessionErrorKey(index, 'date')] = 'Each session date must be unique.';
      } else {
        seenDates.add(date);
      }
    }

    const sessionStart = session.startTime.trim();
    if (sessionStart.length > 0 && !TIME_PATTERN.test(sessionStart)) {
      errors[sessionErrorKey(index, 'startTime')] =
        'The session start time must be a 24-hour time (HH:MM).';
    }

    const sessionEnd = session.endTime.trim();
    if (sessionEnd.length > 0 && !TIME_PATTERN.test(sessionEnd)) {
      errors[sessionErrorKey(index, 'endTime')] =
        'The session end time must be a 24-hour time (HH:MM).';
    }

    // A blank time inherits the event's; when the row names both times, its end
    // must be after its start.
    if (
      sessionStart.length > 0 &&
      sessionEnd.length > 0 &&
      TIME_PATTERN.test(sessionStart) &&
      TIME_PATTERN.test(sessionEnd) &&
      sessionEnd <= sessionStart
    ) {
      errors[sessionErrorKey(index, 'endTime')] =
        'The session end time must be after the start time.';
    }
  });

  return errors;
}

/** A fresh create-mode form; the first session starts today in UTC (FR-42a, FR-42b). */
export function createEmptyEventForm(today: string = utcToday()): EventFormValues {
  return {
    eventNo: '',
    name: '',
    startDate: today,
    endDate: today,
    startTime: '09:00',
    endTime: '',
    venueType: 'auditorium',
    venueName: '',
    description: '',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [{ date: today, startTime: '', endTime: '' }],
  };
}

/**
 * The create body. Text is trimmed, blank optional fields are omitted, and a
 * blank session time is omitted so the API inherits the event's. `timezone` is
 * not collected any more; an omitted one defaults to UTC. `status` and `source`
 * are never sent (FR-42b).
 */
export function toCreateEventPayload(values: EventFormValues): CreateEventPayload {
  const eventNo = values.eventNo.trim();
  const name = values.name.trim();
  const startDate = values.startDate.trim();
  const endDate = values.endDate.trim();
  const startTime = values.startTime.trim();
  const endTime = values.endTime.trim();
  const venueName = values.venueName.trim();
  const description = values.description.trim();

  return {
    // The validator blocks an empty number; the payload still never carries one.
    ...(eventNo.length > 0 ? { eventNo } : {}),
    name,
    startDate,
    endDate,
    startTime,
    ...(endTime.length > 0 ? { endTime } : {}),
    venueType: values.venueType,
    ...(venueName.length > 0 ? { venueName } : {}),
    ...(description.length > 0 ? { description } : {}),
    tracksMembers: values.tracksMembers,
    presbyterOnly: values.presbyterOnly,
    sessions: values.sessions.map((session): CreateEventSessionInput => {
      const sessionStart = session.startTime.trim();
      const sessionEnd = session.endTime.trim();
      return {
        date: session.date.trim(),
        ...(sessionStart.length > 0 ? { startTime: sessionStart } : {}),
        ...(sessionEnd.length > 0 ? { endTime: sessionEnd } : {}),
      };
    }),
  };
}
