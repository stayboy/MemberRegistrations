import { describe, expect, it } from 'vitest';
import {
  captureClock,
  captureState,
  captureStateLabel,
  endActionState,
  offersEndOfSession,
  type CaptureSession,
} from './capture';

/** 10:00 UTC on the session day: inside a 09:00-11:00 window. */
const NOW = new Date('2026-01-04T10:00:00.000Z');

function session(overrides: Partial<CaptureSession> = {}): CaptureSession {
  return {
    date: '2026-01-04',
    startTime: '09:00',
    endTime: '11:00',
    timezone: 'UTC',
    status: 'scheduled',
    capture: null,
    ...overrides,
  };
}

describe('captureState', () => {
  it('is live inside the session window on its day', () => {
    expect(captureState(session(), NOW).kind).toBe('live');
  });

  it('is not started before the window and past-open after it', () => {
    expect(captureState(session(), new Date('2026-01-04T08:00:00.000Z')).kind).toBe('not-started');
    expect(captureState(session(), new Date('2026-01-04T12:00:00.000Z')).kind).toBe('past-open');
  });

  it('is live for the whole date when the session has no end time', () => {
    expect(
      captureState(session({ endTime: null }), new Date('2026-01-04T23:59:00.000Z')).kind,
    ).toBe('live');
  });

  it('reads the shared close, not the winning capture', () => {
    const state = captureState(
      session({ capture: { asOf: '2026-01-04T10:30:00.000Z', ended: true } }),
      NOW,
    );
    expect(state).toEqual({ kind: 'ended', asOf: '2026-01-04T10:30:00.000Z', hasCapture: true });
  });

  it('never reads Live for a cancelled session, with or without a capture', () => {
    const bare = captureState(session({ status: 'cancelled' }), NOW);
    expect(bare.kind).toBe('cancelled');
    expect(bare.hasCapture).toBe(false);
    expect(captureStateLabel(bare, 'UTC')).toBe('Cancelled');

    const captured = captureState(
      session({ status: 'cancelled', capture: { asOf: '2026-01-04T09:30:00.000Z', ended: false } }),
      NOW,
    );
    expect(captureStateLabel(captured, 'UTC')).toBe('Cancelled · recorded 09:30');
  });

  it('keeps the computed kind with no capture and shows no clock', () => {
    const live = captureState(session(), NOW);
    expect(live.hasCapture).toBe(false);
    expect(captureStateLabel(live, 'UTC')).toBe('Live');
    expect(captureStateLabel(captureState(session(), new Date('2026-01-04T08:00:00.000Z')), 'UTC')).toBe(
      'Not started · this capture will end it',
    );
    expect(captureStateLabel(captureState(session(), new Date('2026-01-04T12:00:00.000Z')), 'UTC')).toBe(
      'Past session · this capture will end it',
    );
  });

  it('shows the ended state with the capture clock', () => {
    const state = captureState(
      session({ capture: { asOf: '2026-01-04T10:30:00.000Z', ended: true } }),
      NOW,
    );
    expect(captureStateLabel(state, 'UTC')).toBe('End of session · recorded 10:30');
  });
});

describe('the End of session control', () => {
  it('is offered only while live, and disabled once ended', () => {
    const live = captureState(session(), NOW);
    const ended = captureState(
      session({ capture: { asOf: '2026-01-04T10:30:00.000Z', ended: true } }),
      NOW,
    );
    const notStarted = captureState(session(), new Date('2026-01-04T08:00:00.000Z'));

    expect(offersEndOfSession(live)).toBe(true);
    expect(endActionState(live)).toBe('enabled');
    // FR-6f/AC-7a: once closed the action stays visible, disabled.
    expect(offersEndOfSession(ended)).toBe(false);
    expect(endActionState(ended)).toBe('disabled');
    // An open session that is not live yet offers no action, only its line.
    expect(endActionState(notStarted)).toBe('hidden');
    expect(endActionState(captureState(session({ status: 'cancelled' }), NOW))).toBe('hidden');
  });
});

describe('captureClock', () => {
  it('renders the instant in the event timezone, never the host zone', () => {
    expect(captureClock('2026-01-04T23:30:00.000Z', 'Pacific/Auckland')).toBe('12:30');
    expect(captureClock('2026-01-04T23:30:00.000Z', 'UTC')).toBe('23:30');
  });
});
