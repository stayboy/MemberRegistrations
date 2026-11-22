import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { UssdRepository, UssdSessionRow } from '../../src/repos/ussd.js';
import type { UssdAdapter, UssdAdapterRequest } from '../../src/ussd/adapters.js';
import {
  STATES,
  render,
  type UssdContext,
  type UssdServices,
  type UssdSessionInfo,
} from '../../src/ussd/machine.js';
import { type UssdFrame } from '../../src/ussd/pipeline.js';
import { money, parseAmount } from '../../src/ussd/format.js';
import { t } from '../../src/ussd/glossary.js';
import { executeUssdAdapter } from '../../src/routes/ussd.js';

/**
 * The budget guard: every state the menu tree can reach is rendered at both
 * declared budgets (182, the reference, and 120, Nalo). Two things are
 * asserted: the text fits the budget, and every action the state accepts —
 * every key in the rendered `options`, navigation included — is named on a
 * line. A state with no options passes the action half vacuously. The test
 * that pinned the 2026-11-22 defect (a Nalo frame cutting `1 Verify contact`
 * off the profile) is the profile case below.
 */

const services = {} as UssdServices;

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

/** One context per state, shaped so the screen renders the data it normally holds. */
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
    activities: [1, 2, 3, 4, 5, 6].map((index) => ({
      id: `a${index}`,
      name: `Activity ${index}`,
      sessionDate: '2026-12-12',
      tracksMembers: true,
    })),
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
      lines: [
        { code: 'adult-male', label: 'Adult men', count: 20 },
        { code: 'adult-female', label: 'Adult women', count: 30 },
        { code: 'child-unspecified', label: 'Children', count: 40 },
      ],
    },
    headcountMode: 'adults',
    headcountCorrecting: false,
    headcountPending: {
      mode: 'adults',
      counts: [20, 30, 40],
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
  if (state === 'verify.sent') {
    base.verification = { channel: 'email', masked: 'a***@example.com' };
  }
  return base;
}

/** The member the profile fixtures describe; the action is due until confirmed. */
function member() {
  return {
    id: 'm1',
    memberNo: 'M-1001',
    firstName: 'Ama',
    lastName: 'Mensah',
    hasUnprovenContact: true,
    confirmed: false,
  };
}

/** A frame the adapter supplied: its budget and its declared page size travel together. */
function sessionFor(budget: number): UssdSessionInfo {
  return {
    phone: '8012345678',
    phoneHash: 'a'.repeat(64),
    member: member(),
    anonymous: false,
    budget,
    pageSize: budget >= 182 ? { events: 3, offerings: 5 } : { events: 2, offerings: 3 },
  };
}

function acceptedKeys(text: string, options: ReadonlyArray<{ key: string }>): string[] {
  const lines = text.split('\n');
  return options
    .map((option) => option.key)
    .filter((key) => !lines.some((line) => line === key || line.startsWith(`${key} `)));
}

describe('USSD screen budget (182 and 120)', () => {
  for (const budget of [182, 120]) {
    it(`fits every state and names every accepted action at ${budget}`, () => {
      const failures: string[] = [];
      for (const state of STATES) {
        const rendered = render(state, contextFor(state), sessionFor(budget), services);
        if (rendered.state !== state) failures.push(`${state}: rendered ${rendered.state}`);
        if (rendered.text.length > budget) {
          failures.push(`${state}: ${rendered.text.length} > ${budget} (${rendered.text})`);
        }
        const missing = acceptedKeys(rendered.text, rendered.options);
        if (missing.length > 0) {
          failures.push(`${state}: missing actions ${missing.join(', ')} (${rendered.text})`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('keeps the profile action and fits Nalo 120 for a fully populated member', () => {
    const rendered = render('profile', contextFor('profile'), sessionFor(120), services);
    expect(rendered.text.length).toBeLessThanOrEqual(120);
    expect(rendered.text).toContain('1 Verify contact');
    expect(rendered.text.endsWith('…')).toBe(false);
    // The identity and the action survive; the data lines drop whole from the end.
    expect(rendered.text.split('\n')[0]).toBe('Ama Mensah (Female, 32y)');
    expect(rendered.text.split('\n')[1]).toBe('1 Verify contact');
    expect(rendered.text).toContain('Member no. M-1001');
    expect(rendered.text.split('\n').some((line) => line.includes('Shepherd'))).toBe(false);
  });

  it('lays the same profile frame out differently at 182 and 120', () => {
    const wide = render('profile', contextFor('profile'), sessionFor(182), services);
    const narrow = render('profile', contextFor('profile'), sessionFor(120), services);
    expect(wide.text).not.toBe(narrow.text);
    expect(wide.text).toContain('Shepherd Grace Okafor (Female, 40y)');
    expect(narrow.text.length).toBeLessThanOrEqual(120);
  });
});

/**
 * §24d's fourth protected section: a confirm screen never shows its actions
 * without its subject. The two money confirmations keep every amount and the
 * total even when the full sentence does not fit; the welfare and headcount
 * confirmations keep their full subject.
 */
describe('confirm screens keep their subject at 120', () => {
  it('keeps every selected amount and the total on a gift confirm', () => {
    const context = contextFor('offerings.confirm');
    const amounts = context.split ?? [];
    const currency = context.currency ?? 'GHS';
    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    const rendered = render('offerings.confirm', context, sessionFor(120), services);

    expect(rendered.text.length).toBeLessThanOrEqual(120);
    for (const amount of amounts) {
      expect(rendered.text, `amount ${amount}`).toContain(money(amount, currency));
    }
    expect(rendered.text).toContain(`${t('label.total')} ${money(total, currency)}`);
    expect(rendered.text).toContain(`1 ${t('action.accept')}`);
  });

  it('keeps the pledge amount and its total', () => {
    const context = contextFor('offerings.pledge_confirm');
    const amount = context.amountMinor ?? 0;
    const currency = context.currency ?? 'GHS';

    const rendered = render('offerings.pledge_confirm', context, sessionFor(120), services);

    expect(rendered.text.length).toBeLessThanOrEqual(120);
    // One amount is its own total; both the compact and the full form carry it.
    expect(rendered.text).toContain(money(amount, currency));
    expect(rendered.text).toContain(`1 ${t('action.accept')}`);
  });

  it('keeps the welfare product and its premium', () => {
    const context = contextFor('welfare.confirm');
    const product = context.welfareProduct!;

    const rendered = render('welfare.confirm', context, sessionFor(120), services);

    expect(rendered.text.length).toBeLessThanOrEqual(120);
    expect(rendered.text).toContain(product.name);
    expect(rendered.text).toContain(money(product.premiumMinor, product.currency));
    expect(rendered.text).toContain(`1 ${t('action.accept')}`);
  });

  it('keeps the headcount bucket total', () => {
    const context = contextFor('attendance.headcount.confirm');
    const pending = context.headcountPending!;
    const total = pending.counts.reduce((sum, count) => sum + count, 0);

    const rendered = render('attendance.headcount.confirm', context, sessionFor(120), services);

    expect(rendered.text.length).toBeLessThanOrEqual(120);
    expect(rendered.text).toContain(`${t('label.total')} ${total}`);
    expect(rendered.text).toContain(`1 ${t('action.save')}`);
  });
});

/**
 * The three-offering confirm exercises the subject at 120 with one more amount
 * than the guard's two-offering fixture. At three offerings the full form fits
 * 120, so only the presence-and-fit assertion is meaningful here: the screen
 * does not overflow, so it cannot exercise the drop-to-`data` proof. That proof
 * stays on the two-offering case above, where the screen genuinely overflows.
 */
describe('three-offering confirm subject at 120', () => {
  function giftConfirm(amounts: number[]): {
    context: UssdContext;
    currency: string;
    total: number;
  } {
    const context: UssdContext = {
      ...contextFor('offerings.confirm'),
      selected: ['o1', 'o2', 'o3'],
      split: amounts,
      amountMinor: amounts.reduce((sum, amount) => sum + amount, 0),
    };
    return {
      context,
      currency: context.currency ?? 'GHS',
      total: amounts.reduce((sum, amount) => sum + amount, 0),
    };
  }

  it('keeps all three amounts and the total at 120', () => {
    const amounts = [2000, 3000, 4000];
    const { context, currency, total } = giftConfirm(amounts);

    const rendered = render('offerings.confirm', context, sessionFor(120), services);

    expect(rendered.text.length).toBeLessThanOrEqual(120);
    for (const amount of amounts) {
      expect(rendered.text, `amount ${amount}`).toContain(money(amount, currency));
    }
    expect(rendered.text).toContain(`${t('label.total')} ${money(total, currency)}`);
    expect(rendered.text).toContain(`1 ${t('action.accept')}`);
    expect(rendered.text).toContain(`2 ${t('action.change')}`);
  });

  it('keeps three of the widest amounts money() can render at 120', () => {
    const widest = parseAmount('1000000');
    expect(widest).not.toBeNull();
    const amounts = [widest!, widest!, widest!];
    const { context, currency, total } = giftConfirm(amounts);

    const rendered = render('offerings.confirm', context, sessionFor(120), services);

    expect(rendered.text.length).toBeLessThanOrEqual(120);
    for (const amount of amounts) {
      expect(rendered.text, `amount ${money(amount, currency)}`).toContain(money(amount, currency));
    }
    expect(rendered.text).toContain(`${t('label.total')} ${money(total, currency)}`);
    expect(rendered.text).toContain(`1 ${t('action.accept')}`);
  });
});

describe('the adapter budget and page size reach the machine', () => {
  function sessionRow(
    state: UssdSessionRow['state'] = 'profile',
    context: UssdContext = contextFor('profile'),
  ): UssdSessionRow {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      phoneHash: createHmac('sha256', 'test-phone-pepper-16').update('8012345678').digest('hex'),
      memberId: 'm1',
      anonymous: false,
      state,
      context,
      lastInputSeq: 0,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  function stubRepo(row: UssdSessionRow): UssdRepository {
    return {
      consumeRateLimit: async () => true,
      findOwnedMember: async () => member(),
      loadSession: async () => row,
      createSession: async () => row.id,
      touchSession: async () => {},
      resetSession: async () => {},
    } as unknown as UssdRepository;
  }

  function stubAdapter(maxMsgChars: number): UssdAdapter {
    return {
      id: `stub-${maxMsgChars}`,
      route: `/ussd/stub-${maxMsgChars}`,
      authenticator() {},
      toFrame(): UssdFrame {
        return {
          phone: '8012345678',
          sessionId: '00000000-0000-0000-0000-000000000001',
          input: '',
          seq: 0,
        };
      },
      toWire(render) {
        return { text: render.text };
      },
      maxMsgChars,
      pageSize: maxMsgChars >= 182 ? { events: 3, offerings: 5 } : { events: 2, offerings: 3 },
    };
  }

  async function renderThroughSeam(
    maxMsgChars: number,
    state: UssdSessionRow['state'] = 'profile',
  ): Promise<string> {
    const result = await executeUssdAdapter(
      stubAdapter(maxMsgChars),
      { raw: Buffer.from('{}'), headers: {} } satisfies UssdAdapterRequest,
      {
        repo: stubRepo(sessionRow(state, contextFor(state as (typeof STATES)[number]))),
        services,
        phonePepper: 'test-phone-pepper-16',
      },
    );
    return result.render.text;
  }

  it('renders the frame to the adapter maxMsgChars rather than a fixed 182', async () => {
    const wide = await renderThroughSeam(182);
    const narrow = await renderThroughSeam(120);
    expect(narrow.length).toBeLessThanOrEqual(120);
    expect(narrow).not.toBe(wide);
    expect(narrow).toContain('1 Verify contact');
    expect(wide).toContain('Shepherd Grace Okafor (Female, 40y)');
  });

  it('carries the adapter page size beside the budget, unread as a cap', async () => {
    const wide = await renderThroughSeam(182, 'activities');
    const narrow = await renderThroughSeam(120, 'activities');
    expect(wide.split('\n').filter((line) => /^[1-7] \S/.test(line))).toHaveLength(3);
    expect(narrow.split('\n').filter((line) => /^[1-7] \S/.test(line))).toHaveLength(2);
    expect(narrow.length).toBeLessThanOrEqual(120);
  });

  it('defaults a frame that declares no budget to 182', () => {
    const rendered = render(
      'profile',
      contextFor('profile'),
      { ...sessionFor(182), budget: undefined },
      services,
    );
    expect(rendered.text).toContain('Shepherd Grace Okafor (Female, 40y)');
  });
});
