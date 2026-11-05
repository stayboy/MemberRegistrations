import { randomBytes } from 'node:crypto';
import { t, type GlossaryKey } from './glossary.js';
import { money, parseAmount, parseUssdDate, shortDate, truncate } from './format.js';

/** Every state the shipped 24a menu tree can occupy, in registry order. */
export const STATES = [
  'main',
  'offerings',
  'offerings.name',
  'offerings.amount',
  'offerings.select',
  'offerings.split',
  'offerings.confirm',
  'offerings.done',
  'offerings.pledge_date',
  'offerings.pledge_confirm',
  'pledges.list',
  'pledges.confirm',
  'pledges.done',
  'payments.summary',
  'error',
] as const;

export type UssdState = (typeof STATES)[number];

export interface UssdEvent {
  id: string;
  name: string;
  /** The session date the gift or pledge is recorded against. */
  sessionDate: string;
}

export interface UssdOffering {
  id: string;
  name: string;
  currency: string;
}

export interface UssdPledge {
  id: string;
  offeringId: string;
  offeringName: string;
  eventId: string;
  sessionDate: string | null;
  amountMinor: number;
  currency: string;
  expectedOn: string;
}

export interface PaidWindow {
  from: string;
  to: string;
  paidMinor: number;
}

export interface MemberPayments {
  currency: string;
  week: PaidWindow;
  quarter: PaidWindow;
  year: PaidWindow;
  topEvents: Array<{ eventId: string; name: string; paidMinor: number }>;
}

/** What the caller's phone identified; never persisted beyond the hash. */
export interface UssdSessionInfo {
  phone: string;
  phoneHash: string;
  member: {
    id: string;
    memberNo: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  anonymous: boolean;
}

export interface CreateGroupInput {
  memberNo?: string;
  visitorName?: string;
  visitorPhone?: string;
  eventId: string;
  sessionDate: string;
  currency?: string;
  channel: 'ussd';
  idempotencyKey: string;
  pledgeId?: string;
  items: Array<{ offeringId: string; amountMinor: number }>;
}

export interface CreatePledgeInput {
  memberNo: string;
  offeringId: string;
  eventId: string;
  sessionDate: string;
  amountMinor: number;
  currency?: string;
  expectedOn: string;
  idempotencyKey: string;
}

export interface UssdServices {
  currentEvent(): Promise<UssdEvent | null>;
  offeringsFor(eventId: string, date: string): Promise<UssdOffering[]>;
  createGroup(input: CreateGroupInput): Promise<{ reference: string }>;
  createPledge(input: CreatePledgeInput): Promise<{ id: string; idempotencyKey: string }>;
  listPledges(memberNo: string): Promise<UssdPledge[]>;
  paymentsSummary(memberNo: string): Promise<MemberPayments>;
  offeringById(id: string): Promise<UssdOffering | null>;
}

/** Everything a screen needs that survives the frame; the raw phone never does. */
export interface UssdContext {
  event?: UssdEvent;
  flow?: 'give' | 'pledge';
  visitorName?: string;
  amountMinor?: number;
  currency?: string;
  offerings?: UssdOffering[];
  offeringPage?: number;
  selected?: string[];
  split?: number[];
  idempotencyKey?: string;
  expectedOn?: string;
  pledges?: UssdPledge[];
  pledgePage?: number;
  selectedPledge?: UssdPledge;
  summary?: MemberPayments;
  groupReference?: string;
  notice?: GlossaryKey;
  invalid?: number;
  returnState?: UssdState;
  messageKey?: GlossaryKey;
  terminal?: boolean;
}

export interface UssdOption {
  key: string;
  label: string;
}

export interface Rendered {
  state: UssdState;
  text: string;
  done: boolean;
  options: UssdOption[];
  context: UssdContext;
}

export interface AdvanceResult {
  state: UssdState;
  context: UssdContext;
  done: boolean;
  /** Present only for a terminal screen the route should send as-is. */
  text?: string;
}

const OFFERING_PAGE_SIZE = 5;
/** Three rows fit the 182-character budget with all three fields. */
const PLEDGE_PAGE_SIZE = 3;

const PARENTS: Record<UssdState, UssdState | null> = {
  main: null,
  offerings: 'main',
  'offerings.name': 'offerings',
  'offerings.amount': 'offerings',
  'offerings.select': 'offerings.amount',
  'offerings.split': 'offerings.select',
  'offerings.confirm': 'offerings.select',
  'offerings.done': 'main',
  'offerings.pledge_date': 'offerings.select',
  'offerings.pledge_confirm': 'offerings.pledge_date',
  'pledges.list': 'offerings',
  'pledges.confirm': 'pledges.list',
  'pledges.done': 'main',
  'payments.summary': 'offerings',
  error: null,
};

export function parentOf(state: UssdState, context: UssdContext = {}): UssdState | null {
  if (state === 'error') return context.returnState ?? 'main';
  return PARENTS[state];
}

function newUssdKey(): string {
  return `USSD-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function baseContext(context: UssdContext): UssdContext {
  return { invalid: context.invalid ?? 0 };
}

function noticeLines(context: UssdContext): string[] {
  return context.notice ? [t(context.notice)] : [];
}

function navLines(
  state: UssdState,
  context: UssdContext,
  more: boolean,
): { lines: string[]; options: UssdOption[] } {
  const lines: string[] = [];
  const options: UssdOption[] = [];
  if (more) {
    lines.push(`0 ${t('nav.more')}`);
    options.push({ key: '0', label: t('nav.more') });
  }
  if (parentOf(state, context) !== null) {
    lines.push(`9 ${t('nav.back')}`);
    options.push({ key: '9', label: t('nav.back') });
  }
  if (state !== 'main') {
    lines.push(`00 ${t('nav.main')}`);
    options.push({ key: '00', label: t('nav.main') });
  }
  return { lines, options };
}

function screen(
  state: UssdState,
  context: UssdContext,
  lines: string[],
  options: UssdOption[],
  done = false,
): Rendered {
  return { state, context, text: lines.join('\n'), done, options };
}

function offeringById(context: UssdContext, id: string): UssdOffering | undefined {
  return context.offerings?.find((offering) => offering.id === id);
}

function renderedOfferings(context: UssdContext, anonymous: boolean): Rendered {
  const event = context.event;
  const lines = [...noticeLines(context), truncate('event', event?.name ?? '')];
  const options: UssdOption[] = [{ key: '1', label: t('action.give') }];
  lines.push(`1 ${t('action.give')}`);
  if (!anonymous) {
    lines.push(`2 ${t('action.pledge')}`);
    lines.push(`3 ${t('action.my_pledges')}`);
    lines.push(`4 ${t('action.my_payments')}`);
    options.push(
      { key: '2', label: t('action.pledge') },
      { key: '3', label: t('action.my_pledges') },
      { key: '4', label: t('action.my_payments') },
    );
  }
  const nav = navLines('offerings', context, false);
  return screen('offerings', context, [...lines, ...nav.lines], [...options, ...nav.options]);
}

function renderedAmount(context: UssdContext): Rendered {
  const heading = context.flow === 'pledge' ? t('action.pledge') : t('action.give');
  const lines = [
    ...noticeLines(context),
    heading,
    truncate('event', context.event?.name ?? ''),
    t('prompt.amount'),
  ];
  const nav = navLines('offerings.amount', context, false);
  return screen('offerings.amount', context, [...lines, ...nav.lines], nav.options);
}

function renderedSelect(context: UssdContext): Rendered {
  const page = context.offeringPage ?? 0;
  const all = context.offerings ?? [];
  const visible = all.slice(page * OFFERING_PAGE_SIZE, (page + 1) * OFFERING_PAGE_SIZE);
  const more = all.length > (page + 1) * OFFERING_PAGE_SIZE;
  const lines = [...noticeLines(context), t('prompt.offerings')];
  const options: UssdOption[] = [];
  visible.forEach((offering, index) => {
    const key = String(index + 1);
    const name = truncate('offering', offering.name);
    lines.push(`${key} ${name}`);
    options.push({ key, label: name });
  });
  const nav = navLines('offerings.select', context, more);
  return screen(
    'offerings.select',
    context,
    [...lines, ...nav.lines],
    [...options, ...nav.options],
  );
}

function renderedSplit(context: UssdContext): Rendered {
  const lines = [...noticeLines(context), t('prompt.split')];
  (context.selected ?? []).forEach((id, index) => {
    lines.push(`${index + 1} ${truncate('offering', offeringById(context, id)?.name ?? '')}`);
  });
  lines.push(`${t('label.total')} ${money(context.amountMinor ?? 0, context.currency)}`);
  const nav = navLines('offerings.split', context, false);
  return screen('offerings.split', context, [...lines, ...nav.lines], nav.options);
}

function giftConfirmLines(context: UssdContext): string[] {
  const selected = context.selected ?? [];
  const amounts = selected.map((_id, index) => context.split?.[index] ?? context.amountMinor ?? 0);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const currency = context.currency ?? 'GHS';
  if (selected.length === 1) {
    const name = truncate('offering', offeringById(context, selected[0]!)?.name ?? '');
    return [
      `You give ${money(amounts[0]!, currency)} to ${name}. ${t('label.total')} ${money(total, currency)}.`,
    ];
  }
  if (selected.length === 2) {
    const first = truncate('offering', offeringById(context, selected[0]!)?.name ?? '');
    const second = truncate('offering', offeringById(context, selected[1]!)?.name ?? '');
    return [
      `You split ${money(amounts[0]!, currency)} to ${first}, ${money(amounts[1]!, currency)} to ${second}. ${t('label.total')} ${money(total, currency)}.`,
    ];
  }
  return [
    t('prompt.split'),
    ...amounts.map((amount) => money(amount, currency)),
    `${t('label.total')} ${money(total, currency)}`,
  ];
}

function renderedConfirm(context: UssdContext): Rendered {
  const lines = [...noticeLines(context)];
  if (context.flow === 'pledge') {
    const offering = offeringById(context, context.selected?.[0] ?? '');
    lines.push(
      t('action.pledge'),
      truncate('offering', offering?.name ?? ''),
      money(context.amountMinor ?? 0, context.currency),
      `${t('prompt.expected_date')} ${shortDate(context.expectedOn ?? '')}`,
    );
  } else {
    lines.push(...giftConfirmLines(context));
  }
  lines.push(`1 ${t('action.accept')}`, `2 ${t('action.change')}`);
  const nav = navLines('offerings.confirm', context, false);
  return screen(
    'offerings.confirm',
    context,
    [...lines, ...nav.lines],
    [
      { key: '1', label: t('action.accept') },
      { key: '2', label: t('action.change') },
      ...nav.options,
    ],
  );
}

function renderedDone(state: 'offerings.done' | 'pledges.done', context: UssdContext): Rendered {
  const heading =
    state === 'offerings.done' && context.flow === 'pledge'
      ? t('action.pledge')
      : t('status.payment_pending');
  const lines = [
    heading,
    `${t('label.reference')} ${truncate('reference', context.groupReference ?? '')}`,
  ];
  return screen(state, context, lines, [], true);
}

function renderedPledgeDate(context: UssdContext): Rendered {
  const offering = offeringById(context, context.selected?.[0] ?? '');
  const lines = [
    ...noticeLines(context),
    t('action.pledge'),
    truncate('offering', offering?.name ?? ''),
    money(context.amountMinor ?? 0, context.currency),
    t('prompt.date'),
  ];
  const nav = navLines('offerings.pledge_date', context, false);
  return screen('offerings.pledge_date', context, [...lines, ...nav.lines], nav.options);
}

function renderedPledgeConfirm(context: UssdContext): Rendered {
  const offering = offeringById(context, context.selected?.[0] ?? '');
  const lines = [
    ...noticeLines(context),
    t('action.pledge'),
    truncate('offering', offering?.name ?? ''),
    money(context.amountMinor ?? 0, context.currency),
    `${t('prompt.expected_date')} ${shortDate(context.expectedOn ?? '')}`,
  ];
  const nav = navLines('offerings.pledge_confirm', context, false);
  return screen(
    'offerings.pledge_confirm',
    context,
    [...lines, `1 ${t('action.accept')}`, `2 ${t('action.change')}`, ...nav.lines],
    [
      { key: '1', label: t('action.accept') },
      { key: '2', label: t('action.change') },
      ...nav.options,
    ],
  );
}

function renderedPledges(context: UssdContext): Rendered {
  const page = context.pledgePage ?? 0;
  const all = context.pledges ?? [];
  const visible = all.slice(page * PLEDGE_PAGE_SIZE, (page + 1) * PLEDGE_PAGE_SIZE);
  const more = all.length > (page + 1) * PLEDGE_PAGE_SIZE;
  const lines = [...noticeLines(context), t('action.my_pledges')];
  const options: UssdOption[] = [];
  visible.forEach((pledge, index) => {
    const key = String(index + 1);
    const name = truncate('offering', pledge.offeringName);
    lines.push(
      `${key} ${name}`,
      `${money(pledge.amountMinor, pledge.currency)} ${shortDate(pledge.expectedOn)}`,
    );
    options.push({ key, label: name });
  });
  const nav = navLines('pledges.list', context, more);
  return screen('pledges.list', context, [...lines, ...nav.lines], [...options, ...nav.options]);
}

function renderedPledgeConfirmOne(context: UssdContext): Rendered {
  const pledge = context.selectedPledge;
  const lines = [
    ...noticeLines(context),
    t('action.pay'),
    truncate('offering', pledge?.offeringName ?? ''),
    money(pledge?.amountMinor ?? 0, pledge?.currency),
    `${t('prompt.expected_date')} ${shortDate(pledge?.expectedOn ?? '')}`,
    `1 ${t('action.pay')}`,
  ];
  const nav = navLines('pledges.confirm', context, false);
  return screen(
    'pledges.confirm',
    context,
    [...lines, ...nav.lines],
    [{ key: '1', label: t('action.pay') }, ...nav.options],
  );
}

function renderedPayments(context: UssdContext): Rendered {
  const summary = context.summary;
  const currency = summary?.currency ?? 'GHS';
  const lines = [...noticeLines(context)];
  if (summary) {
    lines.push(
      `${t('label.week')} ${money(summary.week.paidMinor, currency)}`,
      `${t('label.quarter')} ${money(summary.quarter.paidMinor, currency)}`,
      `${t('label.year')} ${money(summary.year.paidMinor, currency)}`,
    );
    for (const event of summary.topEvents) {
      lines.push(`${truncate('event', event.name)} ${money(event.paidMinor, currency)}`);
    }
  }
  const nav = navLines('payments.summary', context, false);
  return screen('payments.summary', context, [...lines, ...nav.lines], nav.options);
}

function renderedError(context: UssdContext): Rendered {
  const done = context.terminal ?? false;
  const lines = [t(context.messageKey ?? 'error.try_again')];
  if (done) return screen('error', context, lines, [], true);
  const nav = navLines('error', context, false);
  return screen('error', context, [...lines, ...nav.lines], nav.options);
}

/**
 * The pure screen renderer. Everything it needs is in the context; `services`
 * is part of the signature so a later state can read without widening it.
 */
export function render(
  state: UssdState,
  context: UssdContext,
  session: UssdSessionInfo,
  _services: UssdServices,
): Rendered {
  switch (state) {
    case 'main': {
      const lines = [
        ...noticeLines(context),
        t('nav.main'),
        `1 ${t('menu.offerings')}`,
        `2 ${t('menu.exit')}`,
      ];
      return screen('main', context, lines, [
        { key: '1', label: t('menu.offerings') },
        { key: '2', label: t('menu.exit') },
      ]);
    }
    case 'offerings':
      return renderedOfferings(context, session.anonymous);
    case 'offerings.name': {
      const lines = [
        ...noticeLines(context),
        truncate('event', context.event?.name ?? ''),
        t('prompt.name'),
      ];
      const nav = navLines('offerings.name', context, false);
      return screen('offerings.name', context, [...lines, ...nav.lines], nav.options);
    }
    case 'offerings.amount':
      return renderedAmount(context);
    case 'offerings.select':
      return renderedSelect(context);
    case 'offerings.split':
      return renderedSplit(context);
    case 'offerings.confirm':
      return renderedConfirm(context);
    case 'offerings.done':
      return renderedDone('offerings.done', context);
    case 'offerings.pledge_date':
      return renderedPledgeDate(context);
    case 'offerings.pledge_confirm':
      return renderedPledgeConfirm(context);
    case 'pledges.list':
      return renderedPledges(context);
    case 'pledges.confirm':
      return renderedPledgeConfirmOne(context);
    case 'pledges.done':
      return renderedDone('pledges.done', context);
    case 'payments.summary':
      return renderedPayments(context);
    case 'error':
      return renderedError(context);
  }
}

function invalid(state: UssdState, context: UssdContext, key: GlossaryKey): AdvanceResult {
  const invalidCount = (context.invalid ?? 0) + 1;
  if (invalidCount >= 5) {
    return {
      state: 'error',
      context: {
        ...baseContext(context),
        invalid: invalidCount,
        messageKey: 'error.too_many_tries',
        returnState: state,
        terminal: true,
      },
      done: true,
    };
  }
  return { state, context: { ...context, invalid: invalidCount, notice: key }, done: false };
}

function parseSelection(input: string, count: number): number[] | null {
  const parts = input.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const indices = [...new Set(parts.map(Number))];
  if (indices.some((index) => index < 1 || index > count)) return null;
  return indices;
}

function parseSplit(input: string, count: number): number[] | null {
  const parts = input.split(',').map((part) => part.trim());
  if (parts.length !== count) return null;
  const amounts = parts.map(parseAmount);
  if (amounts.some((amount) => amount === null)) return null;
  return amounts as number[];
}

function errorKey(error: unknown): GlossaryKey {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'officer_required':
      return 'error.officer_required';
    case 'invalid_expected_date':
      return 'error.invalid_date';
    case 'offering_expired':
    case 'offering_not_on_event':
      return 'error.no_offering';
    case 'session_not_in_event':
      return 'error.no_event';
    default:
      return 'error.try_again';
  }
}

/**
 * One accepted frame. Global navigation wins first; the state handler then
 * consumes the input. Any write happens only on an explicit accept.
 */
export async function advance(
  state: UssdState,
  context: UssdContext,
  input: string,
  session: UssdSessionInfo,
  services: UssdServices,
): Promise<AdvanceResult> {
  const value = input.trim();

  if (value === '00') {
    return { state: 'main', context: baseContext(context), done: false };
  }
  if (value === '9') {
    const parent = parentOf(state, context);
    if (parent === null) {
      return {
        state: 'main',
        context: baseContext(context),
        done: true,
        text: t('menu.exit'),
      };
    }
    return {
      state: parent,
      context: { ...context, notice: undefined },
      done: false,
    };
  }

  if (state === 'offerings.done' || state === 'pledges.done') {
    return { state, context, done: true };
  }
  if (state === 'error' && context.terminal) {
    return { state, context, done: true };
  }

  if (state === 'main') {
    if (value === '2') {
      return {
        state: 'main',
        context: baseContext(context),
        done: true,
        text: t('menu.exit'),
      };
    }
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    const event = await services.currentEvent();
    if (!event) {
      return {
        state: 'error',
        context: {
          ...baseContext(context),
          returnState: 'main',
          messageKey: 'error.no_event',
        },
        done: false,
      };
    }
    return {
      state: 'offerings',
      context: { ...baseContext(context), event, notice: undefined },
      done: false,
    };
  }

  if (state === 'offerings') {
    if (value === '1') {
      return {
        state: session.anonymous ? 'offerings.name' : 'offerings.amount',
        context: {
          ...context,
          flow: 'give',
          notice: undefined,
          amountMinor: undefined,
          selected: undefined,
          split: undefined,
          idempotencyKey: undefined,
        },
        done: false,
      };
    }
    if (session.anonymous) return invalid(state, context, 'error.invalid_choice');
    if (value === '2') {
      return {
        state: 'offerings.amount',
        context: {
          ...context,
          flow: 'pledge',
          notice: undefined,
          amountMinor: undefined,
          selected: undefined,
          split: undefined,
          idempotencyKey: undefined,
        },
        done: false,
      };
    }
    if (value === '3') {
      const pledges = await services.listPledges(session.member!.memberNo);
      if (pledges.length === 0) {
        return {
          state: 'error',
          context: {
            ...context,
            returnState: 'offerings',
            messageKey: 'error.no_pledges',
            notice: undefined,
          },
          done: false,
        };
      }
      return {
        state: 'pledges.list',
        context: {
          ...context,
          pledges,
          pledgePage: 0,
          selectedPledge: undefined,
          idempotencyKey: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value === '4') {
      const summary = await services.paymentsSummary(session.member!.memberNo);
      return {
        state: 'payments.summary',
        context: { ...context, summary, notice: undefined },
        done: false,
      };
    }
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'offerings.name') {
    const name = value.slice(0, 64);
    if (!name) return invalid(state, context, 'error.invalid_choice');
    return {
      state: 'offerings.amount',
      context: { ...context, visitorName: name, notice: undefined },
      done: false,
    };
  }

  if (state === 'offerings.amount') {
    const amountMinor = parseAmount(value);
    if (amountMinor === null) return invalid(state, context, 'error.invalid_amount');
    const event = context.event!;
    const offerings = await services.offeringsFor(event.id, event.sessionDate);
    if (offerings.length === 0) {
      return {
        state: 'error',
        context: {
          ...context,
          returnState: 'offerings',
          messageKey: 'error.no_offering',
          notice: undefined,
        },
        done: false,
      };
    }
    return {
      state: 'offerings.select',
      context: {
        ...context,
        amountMinor,
        offerings,
        offeringPage: 0,
        selected: undefined,
        split: undefined,
        idempotencyKey: undefined,
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'offerings.select') {
    const page = context.offeringPage ?? 0;
    const all = context.offerings ?? [];
    const visible = all.slice(page * OFFERING_PAGE_SIZE, (page + 1) * OFFERING_PAGE_SIZE);
    if (value === '0') {
      if (!(all.length > (page + 1) * OFFERING_PAGE_SIZE)) {
        return invalid(state, context, 'error.invalid_choice');
      }
      return {
        state,
        context: { ...context, offeringPage: page + 1, notice: undefined },
        done: false,
      };
    }
    const indices = parseSelection(value, visible.length);
    if (!indices || indices.length === 0) {
      return invalid(state, context, 'error.invalid_choice');
    }
    if (context.flow === 'pledge') {
      if (indices.length !== 1) return invalid(state, context, 'error.one_offering');
      const offering = visible[indices[0]! - 1]!;
      return {
        state: 'offerings.pledge_date',
        context: {
          ...context,
          selected: [offering.id],
          currency: offering.currency,
          expectedOn: undefined,
          idempotencyKey: undefined,
          notice: undefined,
        },
        done: false,
      };
    }

    const selected = indices.map((index) => visible[index - 1]!);
    const nextContext: UssdContext = {
      ...context,
      selected: selected.map((offering) => offering.id),
      currency: selected[0]!.currency,
      split: undefined,
      idempotencyKey: undefined,
      notice: undefined,
    };
    if (selected.length === 1) {
      nextContext.idempotencyKey = newUssdKey();
      return { state: 'offerings.confirm', context: nextContext, done: false };
    }
    return { state: 'offerings.split', context: nextContext, done: false };
  }

  if (state === 'offerings.split') {
    const selected = context.selected ?? [];
    const split = parseSplit(value, selected.length);
    if (!split || split.reduce((sum, amount) => sum + amount, 0) !== context.amountMinor) {
      return invalid(state, context, 'error.invalid_amount');
    }
    return {
      state: 'offerings.confirm',
      context: {
        ...context,
        split,
        idempotencyKey: context.idempotencyKey ?? newUssdKey(),
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'offerings.confirm') {
    if (value === '2') {
      if (context.flow === 'pledge') {
        return {
          state: 'offerings.pledge_date',
          context: {
            ...context,
            expectedOn: undefined,
            idempotencyKey: undefined,
            notice: undefined,
          },
          done: false,
        };
      }
      return {
        state: 'offerings.select',
        context: {
          ...context,
          selected: undefined,
          split: undefined,
          idempotencyKey: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');

    if (context.flow === 'pledge') {
      if (!session.member) return invalid(state, context, 'error.invalid_choice');
      try {
        const result = await services.createPledge({
          memberNo: session.member.memberNo,
          offeringId: context.selected?.[0] ?? '',
          eventId: context.event!.id,
          sessionDate: context.event!.sessionDate,
          amountMinor: context.amountMinor ?? 0,
          currency: context.currency,
          expectedOn: context.expectedOn ?? '',
          idempotencyKey: context.idempotencyKey ?? newUssdKey(),
        });
        return {
          state: 'offerings.done',
          context: {
            ...context,
            groupReference: result.idempotencyKey,
            notice: undefined,
          },
          done: true,
        };
      } catch (error) {
        return invalid(state, context, errorKey(error));
      }
    }

    const selected = context.selected ?? [];
    const items = selected.map((offeringId, index) => ({
      offeringId,
      amountMinor: context.split?.[index] ?? context.amountMinor ?? 0,
    }));
    try {
      const result = await services.createGroup({
        memberNo: session.member?.memberNo,
        visitorName: session.anonymous ? context.visitorName : undefined,
        visitorPhone: session.anonymous ? session.phone : undefined,
        eventId: context.event!.id,
        sessionDate: context.event!.sessionDate,
        currency: context.currency,
        channel: 'ussd',
        idempotencyKey: context.idempotencyKey ?? newUssdKey(),
        items,
      });
      return {
        state: 'offerings.done',
        context: { ...context, groupReference: result.reference, notice: undefined },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, errorKey(error));
    }
  }

  if (state === 'offerings.pledge_date') {
    const expectedOn = parseUssdDate(value);
    if (!expectedOn) return invalid(state, context, 'error.invalid_date');
    return {
      state: 'offerings.pledge_confirm',
      context: {
        ...context,
        expectedOn,
        idempotencyKey: newUssdKey(),
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'offerings.pledge_confirm') {
    if (value === '2') {
      return {
        state: 'offerings.pledge_date',
        context: {
          ...context,
          expectedOn: undefined,
          idempotencyKey: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    if (!session.member) return invalid(state, context, 'error.invalid_choice');
    try {
      const result = await services.createPledge({
        memberNo: session.member.memberNo,
        offeringId: context.selected?.[0] ?? '',
        eventId: context.event!.id,
        sessionDate: context.event!.sessionDate,
        amountMinor: context.amountMinor ?? 0,
        currency: context.currency,
        expectedOn: context.expectedOn ?? '',
        idempotencyKey: context.idempotencyKey ?? newUssdKey(),
      });
      return {
        state: 'offerings.done',
        context: { ...context, groupReference: result.idempotencyKey, notice: undefined },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, errorKey(error));
    }
  }

  if (state === 'pledges.list') {
    const page = context.pledgePage ?? 0;
    const all = context.pledges ?? [];
    const visible = all.slice(page * PLEDGE_PAGE_SIZE, (page + 1) * PLEDGE_PAGE_SIZE);
    if (value === '0') {
      if (!(all.length > (page + 1) * PLEDGE_PAGE_SIZE)) {
        return invalid(state, context, 'error.invalid_choice');
      }
      return {
        state,
        context: { ...context, pledgePage: page + 1, notice: undefined },
        done: false,
      };
    }
    if (!/^\d+$/.test(value)) return invalid(state, context, 'error.invalid_choice');
    const index = Number(value);
    if (index < 1 || index > visible.length) {
      return invalid(state, context, 'error.invalid_choice');
    }
    return {
      state: 'pledges.confirm',
      context: {
        ...context,
        selectedPledge: visible[index - 1]!,
        idempotencyKey: newUssdKey(),
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'pledges.confirm') {
    if (value === '2') {
      return {
        state: 'pledges.list',
        context: {
          ...context,
          selectedPledge: undefined,
          idempotencyKey: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    const pledge = context.selectedPledge;
    if (!pledge || !session.member) return invalid(state, context, 'error.invalid_choice');
    try {
      const result = await services.createGroup({
        memberNo: session.member.memberNo,
        eventId: pledge.eventId,
        sessionDate: pledge.sessionDate ?? context.event?.sessionDate ?? '',
        currency: pledge.currency,
        channel: 'ussd',
        idempotencyKey: context.idempotencyKey ?? newUssdKey(),
        pledgeId: pledge.id,
        items: [{ offeringId: pledge.offeringId, amountMinor: pledge.amountMinor }],
      });
      return {
        state: 'pledges.done',
        context: { ...context, groupReference: result.reference, notice: undefined },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, errorKey(error));
    }
  }

  if (state === 'payments.summary') {
    return invalid(state, context, 'error.invalid_choice');
  }

  return { state, context, done: false };
}
