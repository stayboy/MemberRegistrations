import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSSARY_KEYS, full, t, type GlossaryKey } from '../../src/ussd/glossary.js';
import { money, parseAmount, parseUssdDate, shortDate, truncate } from '../../src/ussd/format.js';
import {
  STATES,
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

const anonymousSession: UssdSessionInfo = {
  phone: '8099999999',
  phoneHash: 'b'.repeat(64),
  member: null,
  anonymous: true,
};

function offerings(): NonNullable<UssdContext['offerings']> {
  return [
    { id: 'o1', name: 'Welfare Fund Appeal 1', currency: 'GHS' },
    { id: 'o2', name: 'Building Fund Appeal', currency: 'GHS' },
    { id: 'o3', name: 'Missions Fund Appeal', currency: 'GHS' },
    { id: 'o4', name: 'Youth Fund Appeal One', currency: 'GHS' },
    { id: 'o5', name: 'Music Fund Appeal One', currency: 'GHS' },
    { id: 'o6', name: 'Harvest Fund Appeal 1', currency: 'GHS' },
  ];
}

function contextFor(state: (typeof STATES)[number]): UssdContext {
  const list = offerings();
  const base: UssdContext = {
    event: { id: 'e1', name: 'Sunday Celebration Service', sessionDate: '2026-12-12' },
    offerings: list,
    offeringPage: 0,
    flow: 'give',
    amountMinor: 5000,
    currency: 'GHS',
    selected: ['o1'],
    selectedPledge: {
      id: 'p1',
      offeringId: 'o1',
      offeringName: 'Welfare Fund Appeal 1',
      eventId: 'e1',
      sessionDate: '2026-12-12',
      amountMinor: 7000,
      currency: 'GHS',
      expectedOn: '2026-12-31',
    },
    pledges: [1, 2, 3].map((index) => ({
      id: `p${index}`,
      offeringId: 'o1',
      offeringName: 'Welfare Fund Appeal 1',
      eventId: 'e1',
      sessionDate: '2026-12-12',
      amountMinor: 7000,
      currency: 'GHS',
      expectedOn: '2026-12-31',
    })),
    pledgePage: 0,
    expectedOn: '2026-12-31',
    idempotencyKey: 'USSD-ABCDEF1234',
    groupReference: 'MR-ABCDEFGHIJ',
    summary: {
      currency: 'GHS',
      week: { from: '2026-12-07', to: '2026-12-12', paidMinor: 5000 },
      quarter: { from: '2026-10-01', to: '2026-12-12', paidMinor: 5000 },
      year: { from: '2026-01-01', to: '2026-12-12', paidMinor: 5000 },
      topEvents: [
        { eventId: 'e1', name: 'Sunday Celebration Service', paidMinor: 5000 },
        { eventId: 'e2', name: 'Midweek Bible Teaching', paidMinor: 3000 },
        { eventId: 'e3', name: 'Youth Convention Gathering', paidMinor: 2000 },
      ],
    },
    returnState: 'offerings',
    messageKey: 'error.no_event',
    activities: [
      {
        id: 'e1',
        name: 'Sunday Celebration Service',
        sessionDate: '2026-12-12',
        tracksMembers: true,
      },
      {
        id: 'e2',
        name: 'Midweek Bible Teaching',
        sessionDate: '2026-12-12',
        tracksMembers: true,
      },
    ],
    activitiesDate: '2026-12-12',
    activitiesMore: true,
    weekActivities: [1, 2, 3, 4, 5, 6].map((index) => ({
      id: `e${index}`,
      name: `Week Event ${index}`,
      sessionDate: '2026-12-13',
      tracksMembers: true,
    })),
    weekPage: 0,
    activity: {
      id: 'e1',
      name: 'Sunday Celebration Service',
      sessionDate: '2026-12-12',
      tracksMembers: true,
    },
    attendanceSession: {
      id: 'e1',
      name: 'Sunday Celebration Service',
      sessionDate: '2026-12-12',
    },
    attendanceEvent: { present: 2, expected: 10, memberPresent: false },
    attendanceSummary: {
      from: '2026-12-12',
      to: '2026-12-12',
      attended: 2,
      expected: 3,
      events: [
        { eventId: 'e1', name: 'Sunday Celebration Service', sessionDate: '2026-12-12' },
        { eventId: 'e2', name: 'Midweek Bible Teaching', sessionDate: '2026-12-10' },
      ],
    },
    attendanceDate: '2026-12-12',
    attendanceFrom: '2026-12-12',
    attendanceTo: '2026-12-12',
    memberContext: { isPresbyter: true, presbyterRank: 1 },
    profile: {
      memberNo: 'M-1001',
      name: 'Ama Mensah',
      gender: 'female',
      age: 32,
      ministries: ['Welfare', 'Music'],
      shepherd: {
        memberNo: 'M-2001',
        name: 'Grace Okafor',
        gender: 'female',
        age: 40,
      },
      attendance: {
        status: 'regular',
        attended: 4,
        expected: 5,
        window: 5,
        lastAttendedOn: '2026-12-10',
      },
    },
    code: '123456',
    firstName: 'Ama',
    lastName: 'Mensah',
    delegateMemberNo: 'M-1002',
    delegateName: 'Kofi Boateng',
    doneLabel: 'Kofi Boateng',
    expected: { male: 20, female: 30, children: 40, total: 90 },
    requestReference: 'REG-ABCDEF',
  };

  if (state === 'offerings.pledge_date' || state === 'offerings.pledge_confirm') {
    base.flow = 'pledge';
  }
  if (state === 'offerings.split') {
    base.selected = ['o1', 'o2', 'o3', 'o4', 'o5'];
    base.split = [1000, 1000, 1000, 1000, 1000];
  }
  if (state === 'offerings.confirm') {
    base.selected = ['o1', 'o2'];
    base.split = [2000, 3000];
  }
  if (state === 'error') {
    base.terminal = false;
  }
  return base;
}

describe('USSD display glossary', () => {
  it('has a full and a short form for every key', () => {
    for (const key of GLOSSARY_KEYS) {
      expect(GLOSSARY[key].full.length, key).toBeGreaterThan(0);
      expect(GLOSSARY[key].short.length, key).toBeGreaterThan(0);
      expect(t(key)).toBe(GLOSSARY[key].short);
      expect(full(key)).toBe(GLOSSARY[key].full);
    }
  });

  it('keeps static menu labels at 16 characters and prompt lines at 60', () => {
    for (const key of GLOSSARY_KEYS) {
      const entry = GLOSSARY[key];
      if (key.startsWith('menu.') || key.startsWith('nav.') || key.startsWith('action.')) {
        expect(entry.short.length, `${key} short`).toBeLessThanOrEqual(16);
      }
      if (key.startsWith('prompt.')) {
        expect(entry.full.length, `${key} full`).toBeLessThanOrEqual(60);
        expect(entry.short.length, `${key} short`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('renders every registered state inside the 182-character budget', () => {
    for (const state of STATES) {
      const rendered = render(state, contextFor(state), memberSession, services);
      expect(rendered.state, state).toBe(state);
      expect(rendered.text.length, `${state}: ${rendered.text}`).toBeLessThanOrEqual(182);
      expect(rendered.text.trim().length, state).toBeGreaterThan(0);
    }
  });

  it('renders a three-item and a five-item split confirmation inside the budget', () => {
    for (const count of [3, 5]) {
      const context = contextFor('offerings.confirm');
      context.selected = offerings()
        .slice(0, count)
        .map((offering) => offering.id);
      context.split = Array.from({ length: count }, () => 1000);
      const rendered = render('offerings.confirm', context, memberSession, services);
      expect(rendered.text.length, rendered.text).toBeLessThanOrEqual(182);
      expect(rendered.text).toContain('Split');
      expect(rendered.text).toContain(`Total GHS ${(count * 10).toFixed(2)}`);
    }
  });

  it('shows the fixed footer keys where a parent or a page exists', () => {
    const main = render('main', contextFor('main'), memberSession, services);
    expect(main.options.map((option) => option.key)).toEqual(['1', '2', '3', '4', '5']);
    expect(main.text).toContain('2 Activities');
    expect(main.text).toContain('3 Attendance');
    expect(main.text).toContain('4 Profile');
    expect(main.text).toContain('5 Exit');
    expect(main.text).not.toContain('00 Main');

    const anonymous = render('main', contextFor('main'), anonymousSession, services);
    expect(anonymous.text).toContain('1 Register');
    expect(anonymous.text).toContain('5 Exit');

    const select = render(
      'offerings.select',
      contextFor('offerings.select'),
      memberSession,
      services,
    );
    const keys = select.options.map((option) => option.key);
    expect(keys).toContain('0');
    expect(keys).toContain('9');
    expect(keys).toContain('00');

    const name = render('offerings.name', contextFor('offerings.name'), memberSession, services);
    expect(name.options.map((option) => option.key)).toContain('9');
    expect(name.options.map((option) => option.key)).toContain('00');
  });

  it('renders a five-event headcount day inside the budget', () => {
    const context = contextFor('activities');
    context.activities = Array.from({ length: 5 }, (_, index) => ({
      id: `h${index}`,
      name: 'Headcount Rally Service',
      sessionDate: '2026-12-12',
      tracksMembers: false,
      headcountOnlyExpected: 30000,
    }));
    context.activitiesMore = true;
    const rendered = render('activities', context, memberSession, services);
    expect(rendered.text.length, rendered.text).toBeLessThanOrEqual(182);
    expect(rendered.text).toContain('(30000)');
  });

  it('renders both attendance.done variants inside the budget', () => {
    const clocked = render(
      'attendance.done',
      { ...contextFor('attendance.done'), expected: undefined },
      memberSession,
      services,
    );
    expect(clocked.text).toContain('Recorded');
    expect(clocked.text).toContain('Kofi Boateng');
    expect(clocked.text.length).toBeLessThanOrEqual(182);

    const expected = render(
      'attendance.done',
      contextFor('attendance.done'),
      memberSession,
      services,
    );
    expect(expected.text).toContain('20 Male, 30 Female, 40 Children');
    expect(expected.text).toContain('90 Expected');
    expect(expected.text.length).toBeLessThanOrEqual(182);
  });

  it('uses the short glossary form and dynamic truncation only by kind', () => {
    const rendered = render(
      'offerings.select',
      contextFor('offerings.select'),
      memberSession,
      services,
    );
    expect(rendered.text).toContain('Offering(s)');
    for (const offering of offerings().slice(0, 5)) {
      expect(rendered.text).toContain(truncate('offering', offering.name));
    }
  });

  it('never renders an unknown key', () => {
    for (const state of STATES) {
      const rendered = render(state, contextFor(state), memberSession, services);
      expect(rendered.text).not.toContain('undefined');
      expect(rendered.text).not.toContain('[object Object]');
    }
    const keys = new Set<string>(GLOSSARY_KEYS);
    for (const key of [
      'error.session_expired',
      'error.officer_required',
      'status.payment_pending',
    ]) {
      expect(keys.has(key as GlossaryKey)).toBe(true);
    }
  });
});

describe('USSD format helpers', () => {
  it('truncates only when the value is wider than the kind', () => {
    expect(truncate('offering', 'Welfare Fund Appeal')).toBe('Welfare Fund Appeal');
    expect(truncate('offering', 'ABCDEFGHIJKLMNOPQRSTUV')).toBe('ABCDEFGHIJKLMNOPQRS…');
    expect(truncate('reference', 'MR-ABCDEFGHIJ')).toBe('MR-ABCDEFGHIJ');
  });

  it('formats money and dates', () => {
    expect(money(2000)).toBe('GHS 20.00');
    expect(money(100_000_000)).toBe('GHS 1000000.00');
    expect(shortDate('2026-12-12')).toBe('12 Dec 2026');
  });

  it('parses amounts with a positive ceiling and two decimals', () => {
    expect(parseAmount('20')).toBe(2000);
    expect(parseAmount('20.5')).toBe(2050);
    expect(parseAmount('20.50')).toBe(2050);
    expect(parseAmount('1000000.00')).toBe(100_000_000);
    expect(parseAmount('1000000.01')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('20.555')).toBeNull();
    expect(parseAmount('1,000')).toBeNull();
  });

  it('parses DDMMYYYY as a real, non-past date', () => {
    expect(parseUssdDate('12122026', '2026-11-05')).toBe('2026-12-12');
    expect(parseUssdDate('29122026', '2026-11-05')).toBe('2026-12-29');
    expect(parseUssdDate('31112026', '2026-11-05')).toBeNull();
    expect(parseUssdDate('01112026', '2026-11-05')).toBeNull();
    expect(parseUssdDate('1212202', '2026-11-05')).toBeNull();
  });
});
