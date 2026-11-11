import { todayIn } from './series.js';

/**
 * Attendance is a capture model: a capture records the moment it observed a
 * session, and "live" is computed, never stored. A session is live when its date
 * is today in the event timezone and the clock falls inside its wall-clock
 * start/end window; a session with no end time is live for its whole date.
 */
export interface SessionWindow {
  /** `YYYY-MM-DD`, the session date. */
  date: string;
  /** `HH:MM`, the session's start in the event timezone. */
  startTime: string;
  /** `HH:MM`, or null for a session that lasts its whole date. */
  endTime: string | null;
  /** The event's IANA timezone. */
  timezone: string;
}

/** A wall-clock `HH:MM` in the given timezone, never zone-shifted. */
export function timeInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

/** True while the session's date is today and the clock is inside its window. */
export function isSessionLive(session: SessionWindow, now = new Date()): boolean {
  if (todayIn(session.timezone) !== session.date) return false;

  const clock = timeInZone(now, session.timezone);
  if (clock < session.startTime) return false;
  if (session.endTime === null) return true;
  return clock <= session.endTime;
}
