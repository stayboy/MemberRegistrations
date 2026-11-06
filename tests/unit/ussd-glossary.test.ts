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
    headcount: {
      id: 'hc1',
      mode: 'adults',
      asOf: '2026-12-12T09:15:00.000Z',
      total: 90,
      adultMale: 20,
      adultFemale: 30,
      adultUnspecified: 0,
      childMale: 0,
      childFemale: 0,
      childUnspecified: 40,
    },
    headcountMode: 'adults',
    headcountCorrecting: false,
    headcountPending: {
      mode: 'adults',
      adultMale: 20,
      adultFemale: 30,
      adultUnspecified: 0,
      childMale: 0,
      childFemale: 0,
      childUnspecified: 40,
    },
    headcountTotal: 90,
    requestReference: 'REG-ABCDEF',
    welfareProducts: [1, 2, 3, 4].map((index) => ({
      code: `W-${index}`,
      name: `Welfare Product ${index}`,
      premiumMinor: 3000,
      currency: 'GHS',
      periodMonths: 12,
      covers: index === 2 ? 'household' : 'individual',
      maxDependents: index === 2 ? 2 : 0,
      allowedRelationships: index === 2 ? ['spouse', 'child'] : [],
    })),
    welfarePage: 0,
    welfareProduct: {
      code: 'W-1',
      name: 'Welfare Product 1',
      premiumMinor: 3000,
      currency: 'GHS',
      periodMonths: 12,
      covers: 'individual',
      maxDependents: 0,
      allowedRelationships: [],
    },
    welfareDependents: [
      { memberNo: 'M-3001', name: 'Grace Mensah', relationship: 'spouse' },
      { memberNo: 'M-3002', name: 'Kofi Mensah', relationship: 'child' },
      { memberNo: 'M-3003', name: 'Yaa Mensah', relationship: 'child' },
    ],
    welfareDependentsPhase: 'list',
    welfareSelectedDependents: ['M-3001', 'M-3002'],
    welfareServices: [
      {
        id: 's1',
        name: 'Welfare Product 1',
        status: 'active',
        source: 'owned',
        paidBy: 'member',
        periodEnd: '2027-12-12',
        claimedTotalMinor: 12000,
        currency: 'GHS',
        policyholder: null,
        relationship: null,
      },
      {
        id: 's2',
        name: 'Welfare Product 2',
        status: 'expired',
        source: 'owned',
        paidBy: 'church',
        periodEnd: '2026-01-12',
        claimedTotalMinor: 0,
        currency: 'GHS',
        policyholder: null,
        relationship: null,
      },
    ],
    welfareServicesPage: 0,
    welfareSubscription: { id: 's-00000000-0000-0000-0000-000000000000', paidBy: 'member' },
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
      if (
        key.startsWith('menu.') ||
        key.startsWith('nav.') ||
        key.startsWith('action.') ||
        key.startsWith('headcount.') ||
        key === 'status.no_headcount'
      ) {
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

  it('renders welfare list, product, dependents, confirm and services inside the budget', () => {
    for (const state of [
      'welfare.list',
      'welfare.product',
      'welfare.dependents',
      'welfare.confirm',
      'welfare.done',
      'welfare.services',
    ] as const) {
      const rendered = render(state, contextFor(state), memberSession, services);
      expect(rendered.text.length, `${state}: ${rendered.text}`).toBeLessThanOrEqual(182);
    }

    const list = render('welfare.list', contextFor('welfare.list'), memberSession, services);
    expect(list.text).toContain('1 Welfare Product 1');
    expect(list.text).toContain('0 More');
    expect(list.text).toContain('8 My plans');

    const product = render(
      'welfare.product',
      contextFor('welfare.product'),
      memberSession,
      services,
    );
    expect(product.text).toContain('Premium GHS 30.00');
    expect(product.text).toContain('1 Join');
  });

  it('uses the dedicated no_services key for an empty My services list', () => {
    const context = contextFor('welfare.services');
    context.welfareServices = [];
    const rendered = render('welfare.services', context, memberSession, services);
    expect(rendered.text).toContain(t('welfare.no_services'));
    expect(GLOSSARY['welfare.no_services'].full).toBe('No services');
  });

  it('renders inherited services with the relationship and identity inside the budget', () => {
    const context = contextFor('welfare.services');
    context.welfareServices = [
      {
        id: 's3',
        name: 'Church Family Cover',
        status: 'active',
        source: 'inherited',
        paidBy: 'church',
        periodEnd: '2027-01-12',
        claimedTotalMinor: 250000,
        currency: 'GHS',
        policyholder: {
          memberNo: 'M-2001',
          name: 'Solomon Mensah',
          gender: 'male',
          age: 32,
        },
        relationship: 'spouse',
      },
      {
        id: 's4',
        name: 'Church Family Cover',
        status: 'expired',
        source: 'inherited',
        paidBy: 'church',
        periodEnd: '2026-01-12',
        claimedTotalMinor: 0,
        currency: 'GHS',
        policyholder: {
          memberNo: 'M-2001',
          name: 'Solomon Mensah',
          gender: 'male',
          age: 32,
        },
        relationship: 'spouse',
      },
    ];
    const rendered = render('welfare.services', context, memberSession, services);
    expect(rendered.text.length, rendered.text).toBeLessThanOrEqual(182);
    expect(rendered.text).toContain('Church Family Cover (Husband)');
    expect(rendered.text).toContain('Solomon Mensah (Male, 32y)');
    expect(rendered.text).toContain('Claimed GHS 2500.00');
    expect(rendered.text).toContain('0 More');
  });

  it('shows the fixed footer keys where a parent or a page exists', () => {
    const main = render('main', contextFor('main'), memberSession, services);
    expect(main.options.map((option) => option.key)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(main.text).toContain('2 Activities');
    expect(main.text).toContain('3 Attendance');
    expect(main.text).toContain('4 Welfare');
    expect(main.text).toContain('5 Profile');
    expect(main.text).toContain('6 Exit');
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
      headcount: 30000,
    }));
    context.activitiesMore = true;
    const rendered = render('activities', context, memberSession, services);
    expect(rendered.text.length, rendered.text).toBeLessThanOrEqual(182);
    expect(rendered.text).toContain('(30000)');
  });

  it('renders the attendance.done clock-in variant inside the budget', () => {
    const clocked = render(
      'attendance.done',
      contextFor('attendance.done'),
      memberSession,
      services,
    );
    expect(clocked.text).toContain('Recorded');
    expect(clocked.text).toContain('Kofi Boateng');
    expect(clocked.text.length).toBeLessThanOrEqual(182);
  });

  it('renders the headcount screens inside the budget', () => {
    for (const state of [
      'attendance.headcount',
      'attendance.headcount.mode',
      'attendance.headcount.entry',
      'attendance.headcount.confirm',
      'attendance.headcount.done',
    ] as const) {
      const rendered = render(state, contextFor(state), memberSession, services);
      expect(rendered.text.length, `${state}: ${rendered.text}`).toBeLessThanOrEqual(182);
    }
    const current = render(
      'attendance.headcount',
      contextFor('attendance.headcount'),
      memberSession,
      services,
    );
    expect(current.text).toContain('Adult service');
    expect(current.text).toContain('Total 90');
    expect(current.text).toContain('1 New count');
    expect(current.text).toContain('2 Correct');

    const mixed = render(
      'attendance.headcount',
      {
        ...contextFor('attendance.headcount'),
        headcount: {
          id: 'hc2',
          mode: 'mixed',
          asOf: '2026-12-12T23:59:00.000Z',
          total: 30_000,
          adultMale: 7_500,
          adultFemale: 7_500,
          adultUnspecified: 0,
          childMale: 7_500,
          childFemale: 7_500,
          childUnspecified: 0,
        },
      },
      memberSession,
      services,
    );
    expect(mixed.text).toContain('Mixed service');
    expect(mixed.text.length).toBeLessThanOrEqual(182);
  });

  it('pages activities at the channel-declared event size, not a hard-coded three', () => {
    const context = contextFor('activities');
    context.activities = Array.from({ length: 5 }, (_, index) => ({
      id: `p${index}`,
      name: `Paged Event ${index + 1}`,
      sessionDate: '2026-12-12',
      tracksMembers: true,
    }));
    context.activitiesMore = false;
    const narrow: UssdSessionInfo = { ...memberSession, pageSize: { events: 2, offerings: 5 } };

    const rendered = render('activities', context, narrow, services);
    expect(rendered.text).toContain('1 Paged Event 1');
    expect(rendered.text).toContain('2 Paged Event 2');
    expect(rendered.text).not.toContain('3 Paged Event 3');
    expect(rendered.text).toContain('0 More');
    expect(rendered.text.length).toBeLessThanOrEqual(182);

    const wide = render('activities', context, memberSession, services);
    expect(wide.text).toContain('3 Paged Event 3');
  });

  it('renders the zero-today horizon and the empty week inside the budget', () => {
    const today = new Date().toISOString().slice(0, 10);
    const shift = (days: number) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const zero = (next: { date: string; count: number } | null) =>
      render(
        'activities',
        {
          ...contextFor('activities'),
          activities: [],
          activitiesDate: today,
          activitiesNext: next,
        },
        memberSession,
        services,
      );

    const tomorrow = zero({ date: shift(1), count: 2 });
    expect(tomorrow.text).toContain('0 events today');
    expect(tomorrow.text).toContain('2 events tomorrow');
    expect(tomorrow.text).toContain('1 View');
    expect(tomorrow.text).toContain('2 This week');
    expect(tomorrow.text.length).toBeLessThanOrEqual(182);

    const dayTwo = zero({ date: shift(2), count: 2 });
    expect(dayTwo.text).toContain('2 events in 2 days');

    const dayFourteen = zero({ date: shift(14), count: 1 });
    expect(dayFourteen.text).toContain('1 event in 14 days');
    expect(dayFourteen.text.length).toBeLessThanOrEqual(182);

    const dayFifteen = zero(null);
    expect(dayFifteen.text).toContain('No upcoming events');
    expect(dayFifteen.text).not.toContain('1 View');
    expect(dayFifteen.text.length).toBeLessThanOrEqual(182);

    const emptyWeek = render(
      'activities.week',
      { ...contextFor('activities.week'), weekActivities: [] },
      memberSession,
      services,
    );
    expect(emptyWeek.text).toContain('0 events this week');
    expect(emptyWeek.text).toContain('1 Date');
    expect(emptyWeek.text).toContain('9 Back');
    expect(emptyWeek.text.length).toBeLessThanOrEqual(182);
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
