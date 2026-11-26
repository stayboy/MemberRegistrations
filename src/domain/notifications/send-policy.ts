import { zonedWallClockToUtc } from './plan.js';

/**
 * The send-time policy (member-registrations-event-notifications.md N-8,
 * FR-40, AC-33/AC-34).
 *
 * The policy is applied when a job is enqueued, never when it is claimed, so
 * the worker stays dumb and the behaviour is a pure function of the instant,
 * the kind, the mode and the church's own hours. Everything is wall-clock in
 * `churchTimezone`; a slot's instant was already resolved in the event's zone
 * by `plan.ts`, so the two zones meet here and nowhere else.
 */

export type SendMode = 'always' | 'window' | 'daily';

/** The kinds the policy defers; `change` is a notice, not a slot. */
export type SendKind = 'announce' | 'reminder' | 'starts' | 'last' | 'change';

export interface SendPolicyDefaults {
  sendFrom: string;
  sendTo: string;
  sendHour: string;
  churchTimezone: string;
}

const MINUTE_MS = 60_000;

function clockMinutes(value: string): number {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function clockOf(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The church-zone calendar date and wall-clock minute of an instant. */
function localParts(instant: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return next.toISOString().slice(0, 10);
}

/**
 * The instant a job should hold, given the slot's resolved instant (N-8).
 *
 * - `always` sends at the instant.
 * - `window` defers outside `sendFrom`-`sendTo` to the next opening, except
 *   `starts` and `change`, which are time-critical and bypass the window.
 * - `daily` batches every kind, including `starts`, at `sendHour` on the
 *   church-zone day the instant falls on.
 */
export function applySendPolicy(
  instant: Date,
  kind: SendKind,
  mode: SendMode,
  defaults: SendPolicyDefaults,
): Date {
  if (mode === 'always') return new Date(instant.getTime());

  const local = localParts(instant, defaults.churchTimezone);

  if (mode === 'daily') {
    return zonedWallClockToUtc(local.date, defaults.sendHour, defaults.churchTimezone);
  }

  // `window`
  if (kind === 'starts' || kind === 'change') return new Date(instant.getTime());

  const from = clockMinutes(defaults.sendFrom);
  const to = clockMinutes(defaults.sendTo);
  if (from === to) return new Date(instant.getTime());

  if (local.minutes >= from && local.minutes < to) return new Date(instant.getTime());
  if (local.minutes < from) {
    return zonedWallClockToUtc(local.date, clockOf(from), defaults.churchTimezone);
  }
  return zonedWallClockToUtc(addDays(local.date, 1), clockOf(from), defaults.churchTimezone);
}

/** Minutes from now until the job may run; the worker uses this for `startAfter`. */
export function delayMinutes(instant: Date, deliveryAt: Date): number {
  return Math.max(0, Math.ceil((deliveryAt.getTime() - instant.getTime()) / MINUTE_MS));
}
