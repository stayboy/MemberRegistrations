import { describe, expect, it, vi } from 'vitest';
import { DeliveryUnavailableError, RateLimitedError } from '../../src/errors/domain-errors.js';
import {
  advance,
  render,
  type UssdContext,
  type UssdServices,
  type UssdSessionInfo,
} from '../../src/ussd/machine.js';

/**
 * MR-54/MR-55: the member-initiated `My Profile > Verify contact` action. The
 * machine tests the visibility, the notice and the refusals; the API suite drives
 * the real service and the fake sender through the pipeline.
 */

const PROFILE: UssdContext = {
  profile: {
    memberNo: 'M-1001',
    name: 'Ama Mensah',
    gender: 'female',
    age: 34,
    ministries: ['Choir'],
    shepherd: null,
    attendance: {
      status: 'regular',
      attended: 3,
      expected: 4,
      window: 5,
      lastAttendedOn: '2026-11-08',
    },
  },
};

function memberSession(overrides: Partial<UssdSessionInfo['member']> = {}): UssdSessionInfo {
  return {
    phone: '8012345678',
    phoneHash: 'a'.repeat(64),
    member: {
      id: 'm1',
      memberNo: 'M-1001',
      firstName: 'Ama',
      lastName: 'Mensah',
      hasUnprovenContact: true,
      confirmed: false,
      ...overrides,
    },
    anonymous: false,
  };
}

const anonymousSession: UssdSessionInfo = {
  phone: '8099999999',
  phoneHash: 'b'.repeat(64),
  member: null,
  anonymous: true,
};

function services(startVerification: UssdServices['startVerification']): UssdServices {
  return { startVerification } as unknown as UssdServices;
}

describe('My Profile > Verify contact (MR-54)', () => {
  it('shows option 1 for an identified member with no proof', () => {
    const rendered = render('profile', PROFILE, memberSession(), services(vi.fn()));
    expect(rendered.text).toContain('1 Verify contact');
    expect(rendered.options.map((option) => option.key)).toEqual(['1', '9', '00']);
  });

  it('hides the action once every owned contact is proven, or the member is confirmed', () => {
    const allProven = render(
      'profile',
      PROFILE,
      memberSession({ hasUnprovenContact: false }),
      services(vi.fn()),
    );
    expect(allProven.text).not.toContain('Verify contact');
    expect(allProven.options.map((option) => option.key)).toEqual(['9', '00']);

    const confirmed = render(
      'profile',
      PROFILE,
      memberSession({ hasUnprovenContact: true, confirmed: true }),
      services(vi.fn()),
    );
    expect(confirmed.text).not.toContain('Verify contact');
  });

  it('keeps the action while another owned contact is unproven (AC-MR46)', () => {
    const rendered = render('profile', PROFILE, memberSession(), services(vi.fn()));
    expect(rendered.text).toContain('1 Verify contact');
  });

  it('hides the action for an anonymous session', () => {
    const anonymous = render('profile', PROFILE, anonymousSession, services(vi.fn()));
    expect(anonymous.text).not.toContain('Verify contact');
  });

  it('sends, then renders the mask and the link instruction with no code prompt', async () => {
    const startVerification = vi.fn(async () => ({
      channel: 'email' as const,
      masked: 'a***@example.com',
    }));
    const sent = await advance(
      'profile',
      PROFILE,
      '1',
      memberSession(),
      services(startVerification),
    );

    expect(startVerification).toHaveBeenCalledWith('M-1001');
    expect(sent.state).toBe('verify.sent');
    const rendered = render(sent.state, sent.context, memberSession(), services(startVerification));
    expect(rendered.text).toContain('A code was sent to a***@example.com. Open the link we sent.');
    expect(rendered.text).not.toContain('<mask>');
    expect(rendered.text).not.toContain('Enter code');
    expect(rendered.options.map((option) => option.key)).toEqual(['9', '00']);
  });

  it('names the wait for the minute window and the limit for the hour (MR-27, AC-MR45)', async () => {
    const throttled = await advance(
      'profile',
      PROFILE,
      '1',
      memberSession(),
      services(async () => {
        throw new RateLimitedError(undefined, 'minute');
      }),
    );
    expect(throttled.state).toBe('verify.sent');
    expect(throttled.context.notice).toBe('error.verify_too_soon');
    const rendered = render(throttled.state, throttled.context, memberSession(), services(vi.fn()));
    expect(rendered.text).toContain('Too soon');

    const capped = await advance(
      'profile',
      PROFILE,
      '1',
      memberSession(),
      services(async () => {
        throw new RateLimitedError(undefined, 'hour');
      }),
    );
    expect(capped.state).toBe('verify.sent');
    expect(capped.context.notice).toBe('error.verify_limit');
    const limit = render(capped.state, capped.context, memberSession(), services(vi.fn()));
    expect(limit.text).toContain('Hour limit');
    expect(limit.text).not.toContain('Too soon');
  });

  it('names the failure when no sender is configured', async () => {
    const failed = await advance(
      'profile',
      PROFILE,
      '1',
      memberSession(),
      services(async () => {
        throw new DeliveryUnavailableError();
      }),
    );
    expect(failed.state).toBe('verify.sent');
    const rendered = render(failed.state, failed.context, memberSession(), services(vi.fn()));
    expect(rendered.text).toContain('Not sent');
  });

  it('refuses the hidden action for a proven or confirmed member', async () => {
    const startVerification = vi.fn();
    const refused = await advance(
      'profile',
      PROFILE,
      '1',
      memberSession({ hasUnprovenContact: false }),
      services(startVerification),
    );
    expect(refused.state).toBe('profile');
    expect(refused.context.notice).toBe('error.invalid_choice');
    expect(startVerification).not.toHaveBeenCalled();

    const confirmedRefused = await advance(
      'profile',
      PROFILE,
      '1',
      memberSession({ confirmed: true }),
      services(startVerification),
    );
    expect(confirmedRefused.context.notice).toBe('error.invalid_choice');
    expect(startVerification).not.toHaveBeenCalled();
  });

  it('refuses the action for an anonymous session', async () => {
    const startVerification = vi.fn();
    const refused = await advance(
      'profile',
      PROFILE,
      '1',
      anonymousSession,
      services(startVerification),
    );
    expect(refused.state).toBe('error');
    expect(startVerification).not.toHaveBeenCalled();
  });

  it('returns to My Profile on 9 and accepts no digits on the notice', async () => {
    const back = await advance(
      'verify.sent',
      { ...PROFILE, verification: { channel: 'email', masked: 'a***@example.com' } },
      '9',
      memberSession(),
      services(vi.fn()),
    );
    expect(back.state).toBe('profile');
    const profile = render(back.state, back.context, memberSession(), services(vi.fn()));
    expect(profile.text).toContain('1 Verify contact');

    const digits = await advance(
      'verify.sent',
      { ...PROFILE, verification: { channel: 'email', masked: 'a***@example.com' } },
      '123456',
      memberSession(),
      services(vi.fn()),
    );
    expect(digits.state).toBe('verify.sent');
    expect(digits.context.notice).toBe('error.invalid_choice');
  });
});
