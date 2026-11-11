/**
 * The computed attendance capture state (FR-4b/FR-6f). Live is never stored and
 * never a user choice: it is the session date being today in the event timezone
 * with the wall clock inside the session's start/end window. A session with no
 * end time is live for its whole date. These helpers mirror the API's rule
 * (`src/domain/capture.ts`) and only read the API's own `capture` field for the
 * time and the shared close flag.
 */

export interface CaptureSession {
  /** `YYYY-MM-DD`, the session date. */
  readonly date: string;
  /** `HH:MM`, the session's start in the event timezone. */
  readonly startTime: string;
  /** `HH:MM`, or null for a session that lasts its whole date. */
  readonly endTime: string | null;
  /** The event's IANA timezone. */
  readonly timezone: string;
  readonly status: 'scheduled' | 'held' | 'cancelled';
  /** The latest capture of either channel; null when the session has none. */
  readonly capture: { readonly asOf: string; readonly ended: boolean } | null;
}

export type SessionPhase = 'live' | 'not-started' | 'past';

/** The computed state; `live | not-started | past-open` also describe a no-capture session. */
export type CaptureStateKind =
  | 'live'
  | 'not-started'
  | 'past-open'
  | 'ended'
  | 'cancelled';

export interface CaptureState {
  readonly kind: CaptureStateKind;
  /** The winning capture's instant, ISO-8601; null while there is no capture. */
  readonly asOf: string | null;
  /** False only while the session has no capture at all. */
  readonly hasCapture: boolean;
}

/** The calendar date of an instant in a zone, as `YYYY-MM-DD`. */
export function dateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((values, part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
      return values;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The wall-clock `HH:MM` of an instant in a zone, never zone-shifted. */
export function clockInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((values, part) => {
      if (part.type !== 'literal') values[part.type] = part.value;
      return values;
    }, {});
  return `${parts.hour}:${parts.minute}`;
}

/** The `HH:MM` a capture instant reads as in the event timezone. */
export function captureClock(asOf: string, timeZone: string): string {
  return clockInZone(new Date(asOf), timeZone);
}

/** Where the session's own window sits against the clock. */
export function sessionPhase(session: CaptureSession, now: Date): SessionPhase {
  const today = dateInZone(now, session.timezone);
  if (session.date > today) return 'not-started';
  if (session.date < today) return 'past';

  const clock = clockInZone(now, session.timezone);
  if (clock < session.startTime) return 'not-started';
  if (session.endTime !== null && clock > session.endTime) return 'past';
  return 'live';
}

/**
 * The state matrix in precedence order: an ended capture wins (the session is
 * closed even when it was also cancelled), then a cancelled session (it never
 * reads "Live"), then the computed window state. With no capture the state is
 * still Live, Not started or Past; only a capture carries a time.
 */
export function captureState(session: CaptureSession, now: Date): CaptureState {
  if (session.capture?.ended) {
    return { kind: 'ended', asOf: session.capture.asOf, hasCapture: true };
  }
  if (session.status === 'cancelled') {
    return {
      kind: 'cancelled',
      asOf: session.capture?.asOf ?? null,
      hasCapture: session.capture !== null,
    };
  }

  const phase = sessionPhase(session, now);
  const kind = phase === 'past' ? 'past-open' : phase;
  return {
    kind,
    asOf: session.capture?.asOf ?? null,
    hasCapture: session.capture !== null,
  };
}

/** End of session is offered only while the session is live and unclosed. */
export function offersEndOfSession(state: CaptureState): boolean {
  return state.kind === 'live';
}

/** The End of session control's three states (FR-6f/AC-7a). */
export type EndActionState = 'enabled' | 'disabled' | 'hidden';

export function endActionState(state: CaptureState): EndActionState {
  if (offersEndOfSession(state)) return 'enabled';
  // Once closed the action is shown disabled, not removed; an open session
  // that is not live yet offers no action, only its "will end it" line.
  return state.kind === 'ended' ? 'disabled' : 'hidden';
}

/**
 * The import and headcount page's state line. `recorded` carries the capture
 * clock only; the event detail line adds the full instant (`captureLine`).
 */
export function captureStateLabel(state: CaptureState, timeZone: string): string {
  const recorded = state.asOf ? ` · recorded ${captureClock(state.asOf, timeZone)}` : '';
  switch (state.kind) {
    case 'live':
      return `Live${recorded}`;
    case 'not-started':
      return 'Not started · this capture will end it';
    case 'past-open':
      return 'Past session · this capture will end it';
    case 'ended':
      return `End of session${recorded}`;
    case 'cancelled':
      return `Cancelled${recorded}`;
  }
}
