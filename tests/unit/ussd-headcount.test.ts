import { describe, expect, it } from 'vitest';
import {
  advance,
  render,
  type UssdContext,
  type UssdServices,
  type UssdSessionInfo,
} from '../../src/ussd/machine.js';

const services = {} as UssdServices;

const memberSession: UssdSessionInfo = {
  phone: '8012345678',
  phoneHash: 'a'.repeat(64),
  member: { id: 'm1', memberNo: 'M-1001', firstName: 'Ama', lastName: 'Mensah' },
  anonymous: false,
};

function screen(state: Parameters<typeof render>[0], context: UssdContext): string {
  return render(state, context, memberSession, services).text;
}

const MODE_CONTEXT: UssdContext = {
  headcountLastMode: 'children',
  memberContext: { isPresbyter: true, presbyterRank: 1 },
};

describe('USSD headcount lanes', () => {
  it('lists the four lane entries and never offers the retired mixed mode', () => {
    const text = screen('attendance.headcount.mode', MODE_CONTEXT);

    expect(text).toContain('Last mode Children service');
    expect(text).toContain('1 Adult service');
    expect(text).toContain('2 Children service');
    expect(text).toContain('3 Visitors');
    expect(text).toContain('4 Presbyters');
    expect(text).not.toContain('Mixed');
  });

  it('opens each entry in its own lane with that lane’s three-number prompt', async () => {
    const entries: Array<[string, string, string, string]> = [
      ['1', 'adults', 'Adult service', 'Enter male,female,children'],
      ['2', 'children', 'Children service', 'Enter male,female,adults'],
      ['3', 'visitors', 'Visitors', 'Enter male,female,children'],
      ['4', 'presbyters', 'Presbyters', 'Enter elders,deaconess,deacons'],
    ];

    for (const [key, mode, label, prompt] of entries) {
      const result = await advance(
        'attendance.headcount.mode',
        MODE_CONTEXT,
        key,
        memberSession,
        services,
      );
      expect(result.state).toBe('attendance.headcount.entry');
      expect(result.context.headcountMode).toBe(mode);
      const text = screen(result.state, result.context);
      expect(text).toContain(label);
      expect(text).toContain(prompt);
    }
  });

  it('keeps the ordinary-mode memory and never records a specialised lane into it', async () => {
    const visitors = await advance(
      'attendance.headcount.mode',
      MODE_CONTEXT,
      '3',
      memberSession,
      services,
    );
    expect(visitors.context.headcountMode).toBe('visitors');
    expect(visitors.context.headcountLastMode).toBe('children');

    const presbyters = await advance(
      'attendance.headcount.mode',
      MODE_CONTEXT,
      '4',
      memberSession,
      services,
    );
    expect(presbyters.context.headcountMode).toBe('presbyters');
    expect(presbyters.context.headcountLastMode).toBe('children');

    const adults = await advance(
      'attendance.headcount.mode',
      MODE_CONTEXT,
      '1',
      memberSession,
      services,
    );
    expect(adults.context.headcountMode).toBe('adults');
    expect(adults.context.headcountLastMode).toBe('adults');
  });

  it('maps a lane’s three numbers to its own buckets before save', async () => {
    const visitors = await advance(
      'attendance.headcount.entry',
      { headcountMode: 'visitors' },
      '10 5 3',
      memberSession,
      services,
    );
    expect(visitors.state).toBe('attendance.headcount.confirm');
    expect(visitors.context.headcountPending).toEqual({
      mode: 'visitors',
      counts: [10, 5, 3],
    });
    const visitorText = screen('attendance.headcount.confirm', visitors.context);
    expect(visitorText).toContain('10 Male, 5 Female, 3 Children');
    expect(visitorText).toContain('Total 18');

    const presbyters = await advance(
      'attendance.headcount.entry',
      { headcountMode: 'presbyters' },
      '2/1/3',
      memberSession,
      services,
    );
    expect(presbyters.context.headcountPending).toEqual({
      mode: 'presbyters',
      counts: [2, 1, 3],
    });
    const presbyterText = screen('attendance.headcount.confirm', presbyters.context);
    expect(presbyterText).toContain('2 Elders, 1 Deaconess, 3 Deacons');
    expect(presbyterText).toContain('Total 6');
  });
});
