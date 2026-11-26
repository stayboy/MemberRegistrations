import { describe, expect, it } from 'vitest';
import {
  cadenceAllows,
  evaluateSkip,
  type OccurrenceCadence,
} from '../../src/domain/notifications/skip.js';

/**
 * FR-9/FR-10: one precedence — `channel_blocked` → `event_muted` →
 * `period_muted` → `cadence_filtered` → `no_contact` — and cadence per
 * occurrence.
 */
const occurrence: OccurrenceCadence = {
  hasStarts: true,
  hasLast: true,
  isFirst: true,
  isLast: false,
};

const neutral = {
  channelBlocked: false,
  eventMuted: false,
  periodMuted: false,
  cadenceAllowed: true,
  hasDestination: true,
};

describe('evaluateSkip', () => {
  it('returns null when nothing applies', () => {
    expect(evaluateSkip(neutral)).toBeNull();
  });

  it('puts channel_blocked first, even with every other reason present', () => {
    expect(
      evaluateSkip({
        channelBlocked: true,
        eventMuted: true,
        periodMuted: true,
        cadenceAllowed: false,
        hasDestination: false,
      }),
    ).toBe('channel_blocked');
  });

  it('puts event_muted before period, cadence and contact', () => {
    expect(
      evaluateSkip({
        channelBlocked: false,
        eventMuted: true,
        periodMuted: true,
        cadenceAllowed: false,
        hasDestination: false,
      }),
    ).toBe('event_muted');
  });

  it('puts period_muted before cadence and contact', () => {
    expect(
      evaluateSkip({
        channelBlocked: false,
        eventMuted: false,
        periodMuted: true,
        cadenceAllowed: false,
        hasDestination: false,
      }),
    ).toBe('period_muted');
  });

  it('puts cadence_filtered before no_contact', () => {
    expect(
      evaluateSkip({
        channelBlocked: false,
        eventMuted: false,
        periodMuted: false,
        cadenceAllowed: false,
        hasDestination: false,
      }),
    ).toBe('cadence_filtered');
  });

  it('reports no_contact last', () => {
    expect(evaluateSkip({ ...neutral, hasDestination: false })).toBe('no_contact');
  });
});

describe('cadenceAllows', () => {
  it('all delivers every kind', () => {
    for (const kind of ['announce', 'reminder', 'starts', 'last', 'change'] as const) {
      expect(cadenceAllows('all', kind, occurrence)).toBe(true);
    }
  });

  it('essential drops every reminder and keeps the rest', () => {
    expect(cadenceAllows('essential', 'reminder', occurrence)).toBe(false);
    for (const kind of ['announce', 'starts', 'last', 'change'] as const) {
      expect(cadenceAllows('essential', kind, occurrence)).toBe(true);
    }
  });

  it('minimal delivers only the occurrence’s starts and last', () => {
    expect(cadenceAllows('minimal', 'starts', occurrence)).toBe(true);
    expect(cadenceAllows('minimal', 'last', occurrence)).toBe(true);
    expect(cadenceAllows('minimal', 'announce', occurrence)).toBe(false);
    expect(cadenceAllows('minimal', 'reminder', occurrence)).toBe(false);
    expect(cadenceAllows('minimal', 'change', occurrence)).toBe(false);
  });

  it('minimal falls back to the first or last instance when the plan has none', () => {
    const noStartsNoLast: OccurrenceCadence = {
      hasStarts: false,
      hasLast: false,
      isFirst: true,
      isLast: true,
    };
    expect(cadenceAllows('minimal', 'announce', noStartsNoLast)).toBe(true);
    expect(cadenceAllows('minimal', 'reminder', noStartsNoLast)).toBe(true);
    const middle: OccurrenceCadence = {
      hasStarts: false,
      hasLast: false,
      isFirst: false,
      isLast: false,
    };
    expect(cadenceAllows('minimal', 'reminder', middle)).toBe(false);
  });
});
