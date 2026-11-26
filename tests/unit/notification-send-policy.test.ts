import { describe, expect, it } from 'vitest';
import {
  applySendPolicy,
  type SendPolicyDefaults,
} from '../../src/domain/notifications/send-policy.js';

/**
 * FR-40/AC-33/AC-34: the policy is applied at enqueue, in `churchTimezone`,
 * and `starts`/`change` bypass a window.
 */
const defaults: SendPolicyDefaults = {
  sendFrom: '08:00',
  sendTo: '20:00',
  sendHour: '14:00',
  churchTimezone: 'Africa/Lagos',
};

describe('applySendPolicy', () => {
  it('always sends at the resolved instant, any hour', () => {
    const instant = new Date('2026-12-06T01:00:00.000Z');
    expect(applySendPolicy(instant, 'announce', 'always', defaults).toISOString()).toBe(
      '2026-12-06T01:00:00.000Z',
    );
  });

  it('window defers an early announce to 08:00 church time', () => {
    // 01:00Z is 02:00 in Africa/Lagos; 08:00 there is 07:00Z.
    const instant = new Date('2026-12-06T01:00:00.000Z');
    expect(applySendPolicy(instant, 'announce', 'window', defaults).toISOString()).toBe(
      '2026-12-06T07:00:00.000Z',
    );
  });

  it('window defers a late reminder to the next opening', () => {
    // 20:00Z is 21:00 Lagos, past the 20:00 close.
    const instant = new Date('2026-12-06T20:00:00.000Z');
    expect(applySendPolicy(instant, 'reminder', 'window', defaults).toISOString()).toBe(
      '2026-12-07T07:00:00.000Z',
    );
  });

  it('window leaves an instant inside the hours alone', () => {
    const instant = new Date('2026-12-06T10:00:00.000Z'); // 11:00 Lagos
    expect(applySendPolicy(instant, 'announce', 'window', defaults).toISOString()).toBe(
      '2026-12-06T10:00:00.000Z',
    );
  });

  it('window never defers starts or change', () => {
    const early = new Date('2026-12-06T05:00:00.000Z'); // 06:00 Lagos
    expect(applySendPolicy(early, 'starts', 'window', defaults).toISOString()).toBe(
      '2026-12-06T05:00:00.000Z',
    );
    expect(applySendPolicy(early, 'change', 'window', defaults).toISOString()).toBe(
      '2026-12-06T05:00:00.000Z',
    );
  });

  it('daily batches every kind, starts included, at send_hour', () => {
    const start = new Date('2026-12-06T05:00:00.000Z'); // 06:00 Lagos
    const change = new Date('2026-12-06T08:00:00.000Z'); // 09:00 Lagos
    expect(applySendPolicy(start, 'starts', 'daily', defaults).toISOString()).toBe(
      '2026-12-06T13:00:00.000Z',
    );
    expect(applySendPolicy(change, 'change', 'daily', defaults).toISOString()).toBe(
      '2026-12-06T13:00:00.000Z',
    );
  });

  it('daily keeps the church-zone calendar day across UTC midnight', () => {
    // 23:30Z on 6 December is 00:30 Lagos on 7 December.
    const instant = new Date('2026-12-06T23:30:00.000Z');
    expect(applySendPolicy(instant, 'announce', 'daily', defaults).toISOString()).toBe(
      '2026-12-07T13:00:00.000Z',
    );
  });
});
