import { randomBytes } from 'node:crypto';
import { t, type GlossaryKey } from './glossary.js';
import { money, parseAmount, parseUssdDate, shortDate, truncate } from './format.js';

/** Every state the shipped menu tree can occupy, in registry order. */
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
  'welfare.list',
  'welfare.product',
  'welfare.dependents',
  'welfare.confirm',
  'welfare.done',
  'welfare.services',
  'activities',
  'activities.week',
  'activities.date',
  'activities.event',
  'attendance',
  'attendance.day',
  'attendance.period',
  'attendance.status',
  'attendance.event',
  'attendance.code',
  'attendance.clocking',
  'attendance.clock',
  'attendance.expected',
  'attendance.delegate',
  'attendance.delegate_reason',
  'attendance.done',
  'profile',
  'register.code',
  'register.first',
  'register.last',
  'register.done',
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

export type UssdGender = 'male' | 'female' | 'other' | 'undisclosed';

/** One held event session in Activities. */
export interface UssdActivity {
  id: string;
  name: string;
  sessionDate: string;
  tracksMembers: boolean;
  /** The operator's expected headcount; present only for a headcount-only event. */
  headcountOnlyExpected?: number;
}

export interface UssdActivities {
  /** At most five for the requested date. */
  items: UssdActivity[];
  /** There are more sessions in the seven-day window. */
  moreThisWeek: boolean;
}

export interface UssdAttendance {
  from: string;
  to: string;
  attended: number;
  expected: number;
  events: Array<{ eventId: string; name: string; sessionDate: string }>;
}

export interface UssdProfile {
  memberNo: string;
  name: string;
  gender: UssdGender;
  age: number | null;
  ministries: string[];
  shepherd: {
    memberNo: string;
    name: string;
    gender: UssdGender;
    age: number | null;
  } | null;
  attendance: {
    status: 'regular' | 'non_regular' | 'not_enough_data';
    attended: number;
    expected: number;
    window: 5;
    lastAttendedOn: string | null;
  };
}

/** One eligible member-payable welfare product in the Subscribe list. */
export interface UssdWelfareProduct {
  code: string;
  name: string;
  premiumMinor: number;
  currency: string;
  periodMonths: number;
  covers: 'individual' | 'household';
  maxDependents: number;
  allowedRelationships: string[];
}

/** A dependent the policyholder may add, already filtered by the product rules. */
export interface UssdWelfareDependent {
  memberNo: string;
  name: string;
  relationship: string;
}

/** One owned or inherited row in "My services". */
export interface UssdWelfareService {
  id: string;
  name: string;
  status: 'active' | 'expired' | 'ended';
  source: 'owned' | 'inherited';
  paidBy: 'member' | 'church' | null;
  periodEnd: string | null;
  claimedTotalMinor: number;
  currency: string | null;
  policyholder: {
    memberNo: string;
    name: string;
    gender: UssdGender;
    age: number | null;
  } | null;
  relationship: string | null;
}

export interface UssdWelfareSubscription {
  id: string;
  paidBy: 'member' | 'church';
}

export interface UssdMemberContext {
  isPresbyter: boolean;
  presbyterRank: number | null;
}

export interface UssdExpected {
  male: number;
  female: number;
  children: number;
  total: number;
}

/** The selected event's register count and the caller's own presence. */
export interface UssdEventAttendance {
  present: number;
  expected: number;
  memberPresent: boolean;
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
  /** The channel's declared paged-list sizes; the reference is 3 events and 5 offerings. */
  pageSize?: { events: number; offerings: number };
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
  memberContext(memberNo: string): Promise<UssdMemberContext>;
  activities(date: string): Promise<UssdActivities>;
  /** Every session in the seven days from `date`, newest first is not required. */
  activitiesWeek(date: string): Promise<UssdActivity[]>;
  attendance(memberNo: string, from: string, to: string): Promise<UssdAttendance>;
  profile(memberNo: string): Promise<UssdProfile>;
  redeemCode(input: {
    code: string;
    memberNo: string;
    phoneHash: string;
    eventId?: string;
    sessionDate?: string;
  }): Promise<{ eventId: string; sessionDate: string }>;
  createRegistration(input: {
    code: string;
    firstName: string;
    lastName: string;
    phoneHash: string;
  }): Promise<{ reference: string }>;
  clockIn(input: {
    eventId: string;
    sessionDate: string;
    memberNo: string;
    actorMemberNo: string;
    phoneHash: string;
  }): Promise<{ memberNo: string; name: string }>;
  delegate(input: {
    eventId: string;
    sessionDate: string;
    fromMemberNo: string;
    toMemberNo: string;
    reason: string;
    phoneHash: string;
  }): Promise<{ toMemberNo: string; toName: string }>;
  recordExpected(input: {
    eventId: string;
    sessionDate: string;
    male: number;
    female: number;
    children: number;
    phoneHash: string;
  }): Promise<UssdExpected>;
  memberByNo(memberNo: string): Promise<{ memberNo: string; name: string }>;
  isSenior(memberNo: string): Promise<boolean>;
  /** Active, eligible products whose paymentMode is member, in code order. */
  welfareProducts(memberNo: string): Promise<UssdWelfareProduct[]>;
  welfareDependents(memberNo: string, productCode: string): Promise<UssdWelfareDependent[]>;
  subscribeWelfare(input: {
    memberNo: string;
    productCode: string;
    coveredMemberNos?: string[];
    phoneHash: string;
  }): Promise<UssdWelfareSubscription>;
  welfareServices(memberNo: string): Promise<UssdWelfareService[]>;
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
  activities?: UssdActivity[];
  activitiesPage?: number;
  activitiesDate?: string;
  activitiesMore?: boolean;
  activitiesBack?: UssdState;
  weekActivities?: UssdActivity[];
  weekPage?: number;
  activity?: UssdActivity;
  attendanceSession?: UssdEvent;
  attendanceEvent?: UssdEventAttendance;
  attendanceSummary?: UssdAttendance;
  attendanceToday?: UssdAttendance;
  attendanceBack?: UssdState;
  attendanceDate?: string;
  attendanceFrom?: string;
  attendanceTo?: string;
  memberContext?: UssdMemberContext;
  profile?: UssdProfile;
  code?: string;
  firstName?: string;
  lastName?: string;
  delegateMemberNo?: string;
  delegateName?: string;
  doneLabel?: string;
  doneKind?: 'clock' | 'delegate' | 'code';
  expected?: UssdExpected;
  requestReference?: string;
  welfareProducts?: UssdWelfareProduct[];
  welfarePage?: number;
  welfareProduct?: UssdWelfareProduct;
  welfareDependents?: UssdWelfareDependent[];
  welfareDependentsPhase?: 'ask' | 'list' | 'none';
  welfareSelectedDependents?: string[];
  welfareServices?: UssdWelfareService[];
  welfareServicesPage?: number;
  welfareSubscription?: UssdWelfareSubscription;
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
const ACTIVITY_PAGE_SIZE = 4;
/** Two full event rows fit the 182-character budget beside the actions. */
const ATTENDANCE_EVENT_LINES = 2;
/** The reference Subscribe list shows three eligible services plus More. */
const WELFARE_PRODUCT_PAGE_SIZE = 3;
/**
 * My services renders one row per screen: status, payer, period, claimed total
 * and an inherited policyholder identity cannot fit two rows at the maximum
 * dynamic widths inside 182 characters. One row is within the channel's
 * declared events page size (three reference, two Nalo) and still pages with
 * `0 More`.
 */
const WELFARE_SERVICE_PAGE_SIZE = 1;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function quarterStart(date: string): string {
  const month = Number(date.slice(5, 7));
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(first).padStart(2, '0')}-01`;
}

function yearStart(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

/** The shared identity label: `FullName (Gender, Ny)`; undisclosed and null age are omitted. */
function identityLabel(
  name: string,
  gender: UssdGender | undefined,
  age: number | null | undefined,
): string {
  const parts: string[] = [];
  if (gender && gender !== 'undisclosed') {
    parts.push(gender.charAt(0).toUpperCase() + gender.slice(1));
  }
  if (age !== null && age !== undefined) parts.push(`${age}y`);
  return parts.length > 0 ? `${name} (${parts.join(', ')})` : name;
}

function memberName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

/** A code error never reveals whether an unknown, expired, used or voided code exists. */
function codeErrorKey(error: unknown, usedKey: GlossaryKey = 'error.code_invalid'): GlossaryKey {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'too_many_tries':
      return 'error.too_many_tries';
    case 'already_clocked':
      return 'error.already_clocked';
    case 'code_used':
      return usedKey;
    case 'not_shepherd':
      return 'error.not_shepherd';
    case 'not_senior_presbyter':
      return 'error.not_senior';
    case 'delegate_required':
      return 'error.delegate_required';
    case 'delegation_exists':
      return 'error.delegate_required';
    default:
      return 'error.code_invalid';
  }
}

function clockingErrorKey(error: unknown): GlossaryKey {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'not_shepherd':
      return 'error.not_shepherd';
    case 'not_senior_presbyter':
      return 'error.not_senior';
    case 'delegate_required':
      return 'error.delegate_required';
    case 'already_clocked':
      return 'error.already_clocked';
    default:
      return 'error.try_again';
  }
}

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
  'welfare.list': 'main',
  'welfare.product': 'welfare.list',
  'welfare.dependents': 'welfare.product',
  'welfare.confirm': 'welfare.product',
  'welfare.done': 'main',
  'welfare.services': 'welfare.list',
  activities: 'main',
  'activities.week': 'activities',
  'activities.date': 'activities',
  'activities.event': 'activities',
  attendance: 'main',
  'attendance.day': 'attendance',
  'attendance.period': 'attendance',
  'attendance.status': 'attendance',
  'attendance.event': 'attendance',
  'attendance.code': 'attendance',
  'attendance.clocking': 'attendance',
  'attendance.clock': 'attendance.clocking',
  'attendance.expected': 'attendance.clocking',
  'attendance.delegate': 'attendance.clocking',
  'attendance.delegate_reason': 'attendance.delegate',
  'attendance.done': 'main',
  profile: 'main',
  'register.code': 'main',
  'register.first': 'register.code',
  'register.last': 'register.first',
  'register.done': 'main',
  error: null,
};

export function parentOf(state: UssdState, context: UssdContext = {}): UssdState | null {
  if (state === 'error') return context.returnState ?? 'main';
  if (state === 'activities.event' && context.activitiesBack) return context.activitiesBack;
  if ((state === 'attendance.event' || state === 'attendance.code') && context.attendanceBack) {
    return context.attendanceBack;
  }
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

/** Spouse renders Husband/Wife from the policyholder's gender; other types stay as named. */
function welfareRelationshipLabel(
  relationship: string | null,
  policyholder: UssdWelfareService['policyholder'],
): string | null {
  if (!relationship) return null;
  if (relationship === 'spouse') {
    if (policyholder?.gender === 'female') return t('label.spouse_wife');
    if (policyholder?.gender === 'male') return t('label.spouse_husband');
    return 'Spouse';
  }
  return relationship.charAt(0).toUpperCase() + relationship.slice(1);
}

function welfareCoverLabel(covers: 'individual' | 'household'): string {
  return covers === 'household' ? 'Household' : 'Individual';
}

function renderedWelfareList(context: UssdContext): Rendered {
  const page = context.welfarePage ?? 0;
  const all = context.welfareProducts ?? [];
  const visible = all.slice(
    page * WELFARE_PRODUCT_PAGE_SIZE,
    (page + 1) * WELFARE_PRODUCT_PAGE_SIZE,
  );
  const more = all.length > (page + 1) * WELFARE_PRODUCT_PAGE_SIZE;
  const lines = [...noticeLines(context), t('menu.welfare')];
  const options: UssdOption[] = [];
  if (all.length === 0) {
    lines.push(t('welfare.not_eligible'));
  } else {
    visible.forEach((product, index) => {
      const key = String(index + 1);
      const name = truncate('offering', product.name);
      lines.push(`${key} ${name}`);
      options.push({ key, label: name });
    });
  }
  if (more) {
    lines.push(`0 ${t('nav.more')}`);
    options.push({ key: '0', label: t('nav.more') });
  }
  lines.push(`8 ${t('welfare.my_services')}`);
  options.push({ key: '8', label: t('welfare.my_services') });
  const nav = navLines('welfare.list', context, false);
  return screen('welfare.list', context, [...lines, ...nav.lines], [...options, ...nav.options]);
}

function renderedWelfareProduct(context: UssdContext): Rendered {
  const product = context.welfareProduct;
  const lines = [
    ...noticeLines(context),
    truncate('event', product?.name ?? ''),
    `${t('welfare.premium')} ${money(product?.premiumMinor ?? 0, product?.currency)}`,
    `${t('welfare.cover')} ${welfareCoverLabel(product?.covers ?? 'individual')} · ${
      product?.periodMonths ?? 1
    } ${t('label.month')}`,
    `1 ${t('welfare.subscribe')}`,
  ];
  const nav = navLines('welfare.product', context, false);
  return screen(
    'welfare.product',
    context,
    [...lines, ...nav.lines],
    [{ key: '1', label: t('welfare.subscribe') }, ...nav.options],
  );
}

function renderedWelfareDependents(context: UssdContext): Rendered {
  const phase = context.welfareDependentsPhase ?? 'none';
  const lines = [...noticeLines(context), t('welfare.cover_dependents')];
  const options: UssdOption[] = [];
  if (phase === 'none') {
    lines.push(t('welfare.no_dependents'), `1 ${t('welfare.subscribe')}`);
    options.push({ key: '1', label: t('welfare.subscribe') });
  } else if (phase === 'ask') {
    lines.push(`1 ${t('action.yes')}`, `2 ${t('action.no')}`);
    options.push({ key: '1', label: t('action.yes') }, { key: '2', label: t('action.no') });
  } else {
    (context.welfareDependents ?? []).forEach((dependent, index) => {
      const key = String(index + 1);
      const name = truncate('member', dependent.name);
      lines.push(`${key} ${name}`);
      options.push({ key, label: name });
    });
  }
  const nav = navLines('welfare.dependents', context, false);
  return screen(
    'welfare.dependents',
    context,
    [...lines, ...nav.lines],
    [...options, ...nav.options],
  );
}

function renderedWelfareConfirm(context: UssdContext): Rendered {
  const product = context.welfareProduct;
  const selected = context.welfareSelectedDependents ?? [];
  const lines = [
    ...noticeLines(context),
    t('welfare.subscribe'),
    truncate('offering', product?.name ?? ''),
    `${t('welfare.premium')} ${money(product?.premiumMinor ?? 0, product?.currency)}`,
    `${t('welfare.cover')} ${welfareCoverLabel(product?.covers ?? 'individual')}${
      selected.length > 0 ? ` (${selected.length})` : ''
    }`,
    `1 ${t('action.accept')}`,
    `2 ${t('action.change')}`,
  ];
  const nav = navLines('welfare.confirm', context, false);
  return screen(
    'welfare.confirm',
    context,
    [...lines, ...nav.lines],
    [
      { key: '1', label: t('action.accept') },
      { key: '2', label: t('action.change') },
      ...nav.options,
    ],
  );
}

function renderedWelfareDone(context: UssdContext): Rendered {
  const subscription = context.welfareSubscription;
  const payer =
    subscription?.paidBy === 'church' ? t('welfare.paid_by_church') : t('welfare.payer_member');
  const lines = [
    ...noticeLines(context),
    t('welfare.subscribe'),
    `${t('label.reference')} ${truncate('reference', subscription?.id ?? '')}`,
    payer,
  ];
  return screen('welfare.done', context, lines, [], true);
}

function welfareServicePageSize(_services: UssdWelfareService[], session: UssdSessionInfo): number {
  const declared = Math.max(1, session.pageSize?.events ?? 3);
  return Math.min(WELFARE_SERVICE_PAGE_SIZE, declared);
}

function renderedWelfareServices(context: UssdContext, session: UssdSessionInfo): Rendered {
  const all = context.welfareServices ?? [];
  const size = welfareServicePageSize(all, session);
  const page = context.welfareServicesPage ?? 0;
  const visible = all.slice(page * size, (page + 1) * size);
  const more = all.length > (page + 1) * size;
  const lines = [...noticeLines(context), t('welfare.my_services')];
  if (all.length === 0) {
    lines.push(t('welfare.no_services'));
  }
  for (const [index, service] of visible.entries()) {
    const relationship =
      service.source === 'inherited'
        ? welfareRelationshipLabel(service.relationship, service.policyholder)
        : null;
    const status = service.status === 'expired' ? ` ${t('welfare.expired')}` : '';
    lines.push(
      `${index + 1} ${truncate('offering', service.name)}${
        relationship ? ` (${relationship})` : ''
      }${status}`,
    );
    if (service.source === 'inherited' && service.policyholder) {
      lines.push(
        identityLabel(
          truncate('member', service.policyholder.name),
          service.policyholder.gender,
          service.policyholder.age,
        ),
      );
    }
    const payer =
      service.paidBy === 'church'
        ? t('welfare.paid_by_church')
        : service.paidBy === 'member'
          ? t('welfare.payer_member')
          : '';
    const until = service.periodEnd ? shortDate(service.periodEnd) : '-';
    lines.push(`${payer ? `${payer} · ` : ''}${t('welfare.until')} ${until}`);
    lines.push(
      `${t('welfare.claimed')} ${money(service.claimedTotalMinor, service.currency ?? 'GHS')}`,
    );
  }
  const nav = navLines('welfare.services', context, more);
  return screen('welfare.services', context, [...lines, ...nav.lines], nav.options);
}

function renderedError(context: UssdContext): Rendered {
  const done = context.terminal ?? false;
  const lines = [t(context.messageKey ?? 'error.try_again')];
  if (done) return screen('error', context, lines, [], true);
  const nav = navLines('error', context, false);
  return screen('error', context, [...lines, ...nav.lines], nav.options);
}

function activityLine(index: number, activity: UssdActivity): string {
  const suffix =
    activity.headcountOnlyExpected === undefined ? '' : ` (${activity.headcountOnlyExpected})`;
  return `${index} ${truncate('event', activity.name)}${suffix}`;
}

function listActivities(
  state: 'activities' | 'activities.week',
  context: UssdContext,
  all: UssdActivity[],
  page: number,
  more: boolean,
): Rendered {
  const heading =
    state === 'activities.week'
      ? t('activities.this_week')
      : (context.activitiesDate ?? todayIso()) === todayIso()
        ? t('activities.today')
        : shortDate(context.activitiesDate ?? todayIso());
  const lines = [...noticeLines(context), heading];
  const options: UssdOption[] = [];
  all
    .slice(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE)
    .forEach((activity, index) => {
      const key = String(index + 1);
      lines.push(activityLine(index + 1, activity));
      options.push({ key, label: truncate('event', activity.name) });
    });
  if (more) {
    lines.push(`0 ${t('nav.more')}`);
    options.push({ key: '0', label: t('nav.more') });
  }
  if (state === 'activities') {
    lines.push(`8 ${t('activities.a_date')}`);
    options.push({ key: '8', label: t('activities.a_date') });
  }
  const nav = navLines(state, context, false);
  return screen(state, context, [...lines, ...nav.lines], [...options, ...nav.options]);
}

function attendanceCountLines(summary: UssdAttendance | undefined): string[] {
  const lines = [
    `${t('label.attended')} ${summary?.attended ?? 0} ${t('label.expected_count')} ${summary?.expected ?? 0}`,
  ];
  const events = summary?.events ?? [];
  for (const event of events.slice(0, ATTENDANCE_EVENT_LINES)) {
    lines.push(`${shortDate(event.sessionDate)} ${truncate('event', event.name)}`);
  }
  return lines;
}

function noAttendance(summary: UssdAttendance | undefined): boolean {
  return !summary || (summary.expected === 0 && summary.events.length === 0);
}

function renderedAttendance(context: UssdContext, withActions: boolean): Rendered {
  const summary = withActions
    ? (context.attendanceToday ?? context.attendanceSummary)
    : context.attendanceSummary;
  const lines = [...noticeLines(context), t('menu.attendance')];
  if (noAttendance(summary)) {
    lines.push(t('attendance.no_data'));
  } else {
    lines.push(...attendanceCountLines(summary));
  }
  const options: UssdOption[] = [];
  if (withActions) {
    lines.push(
      `1 ${t('attendance.day')}`,
      `2 ${t('attendance.period')}`,
      `3 ${t('attendance.present')}`,
    );
    options.push(
      { key: '1', label: t('attendance.day') },
      { key: '2', label: t('attendance.period') },
      { key: '3', label: t('attendance.present') },
    );
    if (context.memberContext?.isPresbyter) {
      lines.push(`4 ${t('attendance.clocking')}`);
      options.push({ key: '4', label: t('attendance.clocking') });
    }
    const nav = navLines('attendance', context, false);
    return screen('attendance', context, [...lines, ...nav.lines], [...options, ...nav.options]);
  }
  const nav = navLines('attendance.status', context, false);
  return screen('attendance.status', context, [...lines, ...nav.lines], nav.options);
}

function renderedAttendancePeriod(context: UssdContext): Rendered {
  const lines = [
    ...noticeLines(context),
    t('attendance.period'),
    `1 ${t('label.month')}`,
    `2 ${t('label.quarter')}`,
    `3 ${t('label.year')}`,
  ];
  const nav = navLines('attendance.period', context, false);
  return screen(
    'attendance.period',
    context,
    [...lines, ...nav.lines],
    [
      { key: '1', label: t('label.month') },
      { key: '2', label: t('label.quarter') },
      { key: '3', label: t('label.year') },
      ...nav.options,
    ],
  );
}

function renderedAttendanceEvent(context: UssdContext, session: UssdSessionInfo): Rendered {
  const event = context.attendanceSession;
  const report = context.attendanceEvent;
  const lines = [
    ...noticeLines(context),
    t('menu.attendance'),
    truncate('event', event?.name ?? ''),
    shortDate(event?.sessionDate ?? ''),
    `${t('label.attended')} ${report?.present ?? 0} ${t('label.expected_count')} ${report?.expected ?? 0}`,
  ];
  const member = session.member;
  if (member) {
    const label = memberName(member.firstName, member.lastName);
    lines.push(
      `${truncate('member', label)}${report?.memberPresent ? ` ${t('label.attended')}` : ''}`,
    );
  }
  const options: UssdOption[] = [];
  if (!report?.memberPresent) {
    lines.push(`1 ${t('attendance.present')}`);
    options.push({ key: '1', label: t('attendance.present') });
  }
  const nav = navLines('attendance.event', context, false);
  return screen(
    'attendance.event',
    context,
    [...lines, ...nav.lines],
    [...options, ...nav.options],
  );
}

function renderedProfile(context: UssdContext): Rendered {
  const profile = context.profile;
  const lines = [...noticeLines(context)];
  if (profile) {
    lines.push(
      identityLabel(truncate('member', profile.name), profile.gender, profile.age),
      `${t('profile.member_no')} ${profile.memberNo}`,
    );
    if (profile.ministries.length > 0) {
      lines.push(`${t('profile.ministries')} ${truncate('member', profile.ministries.join(', '))}`);
    }
    const attendance = profile.attendance;
    if (attendance.expected === 0 && attendance.attended === 0 && !attendance.lastAttendedOn) {
      lines.push(t('attendance.no_data'));
    } else {
      const status =
        attendance.status === 'regular'
          ? t('status.regular')
          : attendance.status === 'non_regular'
            ? t('status.non_regular')
            : t('status.not_enough_data');
      const date = attendance.lastAttendedOn ? ` · ${shortDate(attendance.lastAttendedOn)}` : '';
      lines.push(`${status} · ${attendance.attended} of ${attendance.expected}${date}`);
    }
    lines.push(
      `${t('profile.shepherd')} ${
        profile.shepherd
          ? identityLabel(
              truncate('member', profile.shepherd.name),
              profile.shepherd.gender,
              profile.shepherd.age,
            )
          : t('profile.not_assigned')
      }`,
    );
  }
  const nav = navLines('profile', context, false);
  return screen('profile', context, [...lines, ...nav.lines], nav.options);
}

function renderedAttendanceDone(context: UssdContext): Rendered {
  const lines = [...noticeLines(context), t('status.attendance_recorded')];
  if (context.expected) {
    const expected = context.expected;
    lines.push(
      `${expected.male} ${t('label.male')}, ${expected.female} ${t('label.female')}, ${expected.children} ${t('label.children')}`,
      `${expected.total} ${t('label.expected_count')}`,
    );
  } else {
    if (context.doneKind === 'delegate') {
      lines.push(`${t('attendance.delegate')} ${truncate('member', context.doneLabel ?? '')}`);
    } else if (context.doneLabel) {
      lines.push(truncate('member', context.doneLabel));
    }
    if (context.attendanceSession) {
      lines.push(
        `${truncate('event', context.attendanceSession.name)} ${shortDate(context.attendanceSession.sessionDate)}`,
      );
    }
  }
  return screen('attendance.done', context, lines, [], true);
}

function renderedClocking(context: UssdContext): Rendered {
  const lines = [
    ...noticeLines(context),
    t('attendance.clocking'),
    `1 ${t('attendance.clock_in')}`,
    `2 ${t('attendance.expected')}`,
    `3 ${t('attendance.delegate')}`,
  ];
  const nav = navLines('attendance.clocking', context, false);
  return screen(
    'attendance.clocking',
    context,
    [...lines, ...nav.lines],
    [
      { key: '1', label: t('attendance.clock_in') },
      { key: '2', label: t('attendance.expected') },
      { key: '3', label: t('attendance.delegate') },
      ...nav.options,
    ],
  );
}

function renderedPrompt(
  state: UssdState,
  context: UssdContext,
  heading: string,
  prompt: string,
): Rendered {
  const lines = [...noticeLines(context), heading, prompt];
  const nav = navLines(state, context, false);
  return screen(state, context, [...lines, ...nav.lines], nav.options);
}

function renderedRegister(
  state: 'register.code' | 'register.first' | 'register.last' | 'register.done',
  context: UssdContext,
): Rendered {
  if (state === 'register.done') {
    const lines = [
      ...noticeLines(context),
      t('status.registered'),
      `${t('label.reference')} ${truncate('reference', context.requestReference ?? '')}`,
    ];
    return screen(state, context, lines, [], true);
  }
  return renderedPrompt(
    state,
    context,
    t('menu.register'),
    state === 'register.code' ? t('prompt.code') : t('prompt.name'),
  );
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
      const lines = [...noticeLines(context), t('nav.main')];
      const options: UssdOption[] = [];
      const entries = session.anonymous
        ? [
            { key: '1', label: t('menu.register') },
            { key: '2', label: t('menu.offerings') },
            { key: '3', label: t('menu.activities') },
            { key: '4', label: t('menu.attendance') },
            { key: '5', label: t('menu.exit') },
          ]
        : [
            { key: '1', label: t('menu.offerings') },
            { key: '2', label: t('menu.activities') },
            { key: '3', label: t('menu.attendance') },
            { key: '4', label: t('menu.welfare') },
            { key: '5', label: t('menu.profile') },
            { key: '6', label: t('menu.exit') },
          ];
      for (const entry of entries) lines.push(`${entry.key} ${entry.label}`);
      options.push(...entries);
      return screen('main', context, lines, options);
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
    case 'welfare.list':
      return renderedWelfareList(context);
    case 'welfare.product':
      return renderedWelfareProduct(context);
    case 'welfare.dependents':
      return renderedWelfareDependents(context);
    case 'welfare.confirm':
      return renderedWelfareConfirm(context);
    case 'welfare.done':
      return renderedWelfareDone(context);
    case 'welfare.services':
      return renderedWelfareServices(context, session);
    case 'activities':
      return listActivities(
        'activities',
        context,
        context.activities ?? [],
        context.activitiesPage ?? 0,
        context.activitiesMore ?? false,
      );
    case 'activities.week':
      return listActivities(
        'activities.week',
        context,
        context.weekActivities ?? [],
        context.weekPage ?? 0,
        (context.weekActivities ?? []).length > ((context.weekPage ?? 0) + 1) * ACTIVITY_PAGE_SIZE,
      );
    case 'activities.date':
      return renderedPrompt('activities.date', context, t('activities.a_date'), t('prompt.date'));
    case 'activities.event':
      return screen(
        'activities.event',
        context,
        [
          ...noticeLines(context),
          truncate('event', context.activity?.name ?? ''),
          shortDate(context.activity?.sessionDate ?? ''),
          `1 ${t('action.give')}`,
          `2 ${t('menu.attendance')}`,
        ],
        [
          { key: '1', label: t('action.give') },
          { key: '2', label: t('menu.attendance') },
        ],
      );
    case 'attendance':
      return renderedAttendance(context, true);
    case 'attendance.day':
      return renderedPrompt('attendance.day', context, t('attendance.day'), t('prompt.date'));
    case 'attendance.period':
      return renderedAttendancePeriod(context);
    case 'attendance.status':
      return renderedAttendance(context, false);
    case 'attendance.event':
      return renderedAttendanceEvent(context, session);
    case 'attendance.code':
      return renderedPrompt('attendance.code', context, t('attendance.present'), t('prompt.code'));
    case 'attendance.clocking':
      return renderedClocking(context);
    case 'attendance.clock':
      return renderedPrompt(
        'attendance.clock',
        context,
        t('attendance.clock_in'),
        t('profile.member_no'),
      );
    case 'attendance.expected':
      return renderedPrompt(
        'attendance.expected',
        context,
        t('attendance.expected'),
        `${t('label.male')}, ${t('label.female')}, ${t('label.children')}`,
      );
    case 'attendance.delegate':
      return renderedPrompt(
        'attendance.delegate',
        context,
        t('attendance.delegate'),
        t('profile.member_no'),
      );
    case 'attendance.delegate_reason':
      return renderedPrompt(
        'attendance.delegate_reason',
        context,
        t('attendance.delegate'),
        t('prompt.reason'),
      );
    case 'attendance.done':
      return renderedAttendanceDone(context);
    case 'profile':
      return renderedProfile(context);
    case 'register.code':
    case 'register.first':
    case 'register.last':
    case 'register.done':
      return renderedRegister(state, context);
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

function noEvent(context: UssdContext, returnState: UssdState): AdvanceResult {
  return {
    state: 'error',
    context: {
      ...context,
      returnState,
      messageKey: 'error.no_event',
      notice: undefined,
    },
    done: false,
  };
}

async function openActivities(
  context: UssdContext,
  services: UssdServices,
  date: string,
): Promise<AdvanceResult> {
  const activities = await services.activities(date);
  if (activities.items.length === 0)
    return noEvent({ ...context, activitiesDate: date }, 'activities');
  return {
    state: 'activities',
    context: {
      ...baseContext(context),
      activities: activities.items,
      activitiesPage: 0,
      activitiesDate: date,
      activitiesMore: activities.moreThisWeek,
      activity: undefined,
      notice: undefined,
    },
    done: false,
  };
}

async function openAttendance(
  context: UssdContext,
  services: UssdServices,
  session: UssdSessionInfo,
): Promise<AdvanceResult> {
  const memberNo = session.member!.memberNo;
  const today = todayIso();
  const [memberContext, event, summary] = await Promise.all([
    services.memberContext(memberNo),
    services.currentEvent(),
    services.attendance(memberNo, today, today),
  ]);
  return {
    state: 'attendance',
    context: {
      ...baseContext(context),
      memberContext,
      event: event ?? undefined,
      attendanceSummary: summary,
      attendanceToday: summary,
      attendanceDate: today,
      attendanceFrom: today,
      attendanceTo: today,
      notice: undefined,
    },
    done: false,
  };
}

async function openProfile(
  context: UssdContext,
  services: UssdServices,
  session: UssdSessionInfo,
): Promise<AdvanceResult> {
  const profile = await services.profile(session.member!.memberNo);
  return {
    state: 'profile',
    context: { ...baseContext(context), profile, notice: undefined },
    done: false,
  };
}

async function openWelfare(
  context: UssdContext,
  services: UssdServices,
  session: UssdSessionInfo,
): Promise<AdvanceResult> {
  const products = await services.welfareProducts(session.member!.memberNo);
  return {
    state: 'welfare.list',
    context: {
      ...baseContext(context),
      welfareProducts: products,
      welfarePage: 0,
      welfareProduct: undefined,
      welfareDependents: undefined,
      welfareDependentsPhase: undefined,
      welfareSelectedDependents: undefined,
      notice: undefined,
    },
    done: false,
  };
}

async function openWelfareServices(
  context: UssdContext,
  services: UssdServices,
  session: UssdSessionInfo,
): Promise<AdvanceResult> {
  const servicesList = await services.welfareServices(session.member!.memberNo);
  return {
    state: 'welfare.services',
    context: {
      ...baseContext(context),
      welfareServices: servicesList,
      welfareServicesPage: 0,
      notice: undefined,
    },
    done: false,
  };
}

function parseSelection(input: string, count: number): number[] | null {
  const parts = input.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const indices = [...new Set(parts.map(Number))];
  if (indices.some((index) => index < 1 || index > count)) return null;
  return indices;
}

function parseIndex(input: string, count: number): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const index = Number(input);
  return index >= 1 && index <= count ? index : null;
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

  if (
    state === 'offerings.done' ||
    state === 'pledges.done' ||
    state === 'attendance.done' ||
    state === 'welfare.done' ||
    state === 'register.done'
  ) {
    return { state, context, done: true };
  }
  if (state === 'error' && context.terminal) {
    return { state, context, done: true };
  }

  if (
    session.anonymous &&
    (state === 'profile' ||
      state === 'attendance' ||
      state.startsWith('attendance.') ||
      state.startsWith('pledges.') ||
      state.startsWith('welfare.') ||
      state === 'payments.summary')
  ) {
    return {
      state: 'error',
      context: {
        ...baseContext(context),
        returnState: 'main',
        messageKey: 'error.invalid_choice',
      },
      done: false,
    };
  }

  if (!session.anonymous && state.startsWith('register.')) {
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'main') {
    if ((session.anonymous && value === '5') || (!session.anonymous && value === '6')) {
      return {
        state: 'main',
        context: baseContext(context),
        done: true,
        text: t('menu.exit'),
      };
    }

    if (session.anonymous) {
      if (value === '1') {
        return {
          state: 'register.code',
          context: { ...baseContext(context), notice: undefined },
          done: false,
        };
      }
      if (value === '2') {
        const event = await services.currentEvent();
        if (!event) return noEvent(context, 'main');
        return {
          state: 'offerings',
          context: { ...baseContext(context), event, notice: undefined },
          done: false,
        };
      }
      if (value === '3') return openActivities(context, services, todayIso());
      // Attendance needs a member; the anonymous entry answers Invalid choice.
      if (value === '4') {
        return {
          state: 'error',
          context: {
            ...baseContext(context),
            returnState: 'main',
            messageKey: 'error.invalid_choice',
          },
          done: false,
        };
      }
      return invalid(state, context, 'error.invalid_choice');
    }

    if (value === '1') {
      const event = await services.currentEvent();
      if (!event) return noEvent(context, 'main');
      return {
        state: 'offerings',
        context: { ...baseContext(context), event, notice: undefined },
        done: false,
      };
    }
    if (value === '2') return openActivities(context, services, todayIso());
    if (value === '3') return openAttendance(context, services, session);
    if (value === '4') return openWelfare(context, services, session);
    if (value === '5') return openProfile(context, services, session);
    return invalid(state, context, 'error.invalid_choice');
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

  if (state === 'activities') {
    if (value === '0') {
      if (!context.activitiesMore) return invalid(state, context, 'error.invalid_choice');
      const week = await services.activitiesWeek(context.activitiesDate ?? todayIso());
      return {
        state: 'activities.week',
        context: { ...context, weekActivities: week, weekPage: 0, notice: undefined },
        done: false,
      };
    }
    if (value === '8') {
      return {
        state: 'activities.date',
        context: { ...context, notice: undefined },
        done: false,
      };
    }
    const index = parseIndex(value, context.activities?.length ?? 0);
    const activity = index === null ? undefined : context.activities?.[index - 1];
    if (!activity) return invalid(state, context, 'error.invalid_choice');
    return {
      state: 'activities.event',
      context: {
        ...context,
        activity,
        activitiesDate: activity.sessionDate,
        activitiesBack: 'activities',
        attendanceSession: {
          id: activity.id,
          name: activity.name,
          sessionDate: activity.sessionDate,
        },
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'activities.week') {
    const week = context.weekActivities ?? [];
    const page = context.weekPage ?? 0;
    const more = week.length > (page + 1) * ACTIVITY_PAGE_SIZE;
    if (value === '0') {
      if (!more) return invalid(state, context, 'error.invalid_choice');
      return {
        state,
        context: { ...context, weekPage: page + 1, notice: undefined },
        done: false,
      };
    }
    const visible = week.slice(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE);
    const index = parseIndex(value, visible.length);
    const activity = index === null ? undefined : visible[index - 1];
    if (!activity) return invalid(state, context, 'error.invalid_choice');
    return {
      state: 'activities.event',
      context: {
        ...context,
        activity,
        activitiesDate: activity.sessionDate,
        activitiesBack: 'activities.week',
        attendanceSession: {
          id: activity.id,
          name: activity.name,
          sessionDate: activity.sessionDate,
        },
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'activities.date') {
    const date = parseUssdDate(value, '0000-01-01');
    if (!date) return invalid(state, context, 'error.invalid_date');
    return openActivities(context, services, date);
  }

  if (state === 'activities.event') {
    const activity = context.activity;
    if (!activity) return invalid(state, context, 'error.invalid_choice');
    if (value === '1') {
      return {
        state: session.anonymous ? 'offerings.name' : 'offerings.amount',
        context: {
          ...context,
          flow: 'give',
          event: {
            id: activity.id,
            name: activity.name,
            sessionDate: activity.sessionDate,
          },
          amountMinor: undefined,
          selected: undefined,
          split: undefined,
          idempotencyKey: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value === '2') {
      if (session.anonymous) return invalid(state, context, 'error.invalid_choice');
      const summary = await services.attendance(
        session.member!.memberNo,
        activity.sessionDate,
        activity.sessionDate,
      );
      return {
        state: 'attendance.event',
        context: {
          ...context,
          attendanceSession: {
            id: activity.id,
            name: activity.name,
            sessionDate: activity.sessionDate,
          },
          attendanceBack: 'activities.event',
          attendanceEvent: {
            present: summary.attended,
            expected: summary.expected,
            memberPresent: summary.events.some((event) => event.eventId === activity.id),
          },
          notice: undefined,
        },
        done: false,
      };
    }
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'attendance') {
    if (value === '1') {
      return { state: 'attendance.day', context: { ...context, notice: undefined }, done: false };
    }
    if (value === '2') {
      return {
        state: 'attendance.period',
        context: { ...context, notice: undefined },
        done: false,
      };
    }
    if (value === '3') {
      return {
        state: 'attendance.code',
        context: { ...context, notice: undefined },
        done: false,
      };
    }
    if (value === '4') {
      if (!context.memberContext?.isPresbyter) {
        return {
          state: 'error',
          context: {
            ...context,
            returnState: 'attendance',
            messageKey: 'error.not_senior',
            notice: undefined,
          },
          done: false,
        };
      }
      return {
        state: 'attendance.clocking',
        context: { ...context, notice: undefined },
        done: false,
      };
    }
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'attendance.day') {
    const date = parseUssdDate(value, '0000-01-01');
    if (!date) return invalid(state, context, 'error.invalid_date');
    const summary = await services.attendance(session.member!.memberNo, date, date);
    return {
      state: 'attendance.status',
      context: {
        ...context,
        attendanceSummary: summary,
        attendanceDate: date,
        attendanceFrom: date,
        attendanceTo: date,
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'attendance.period') {
    const today = todayIso();
    const from =
      value === '1'
        ? monthStart(today)
        : value === '2'
          ? quarterStart(today)
          : value === '3'
            ? yearStart(today)
            : null;
    if (!from) return invalid(state, context, 'error.invalid_choice');
    const summary = await services.attendance(session.member!.memberNo, from, today);
    return {
      state: 'attendance.status',
      context: {
        ...context,
        attendanceSummary: summary,
        attendanceFrom: from,
        attendanceTo: today,
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'attendance.status') {
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'attendance.event') {
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    if (context.attendanceEvent?.memberPresent) {
      return invalid(state, context, 'error.already_clocked');
    }
    return {
      state: 'attendance.code',
      context: { ...context, notice: undefined },
      done: false,
    };
  }

  if (state === 'attendance.code') {
    if (!/^\d{6}$/.test(value)) return invalid(state, context, 'error.code_invalid');
    const event = context.attendanceSession ?? context.event;
    if (!event) return noEvent(context, 'attendance');
    try {
      const result = await services.redeemCode({
        code: value,
        memberNo: session.member!.memberNo,
        phoneHash: session.phoneHash,
        eventId: event.id,
        sessionDate: event.sessionDate,
      });
      return {
        state: 'attendance.done',
        context: {
          ...context,
          attendanceSession: {
            id: event.id,
            name: event.name,
            sessionDate: result.sessionDate,
          },
          doneLabel: memberName(session.member!.firstName, session.member!.lastName),
          doneKind: 'code',
          notice: undefined,
        },
        done: true,
      };
    } catch (error) {
      const key = codeErrorKey(error);
      if (key === 'error.too_many_tries') {
        return {
          state: 'error',
          context: {
            ...context,
            returnState: 'attendance',
            messageKey: key,
            notice: undefined,
          },
          done: false,
        };
      }
      return invalid(state, context, key);
    }
  }

  if (state === 'attendance.clocking') {
    if (!context.memberContext?.isPresbyter) {
      return {
        state: 'error',
        context: {
          ...context,
          returnState: 'attendance',
          messageKey: 'error.not_senior',
          notice: undefined,
        },
        done: false,
      };
    }
    if (value === '1') {
      return { state: 'attendance.clock', context: { ...context, notice: undefined }, done: false };
    }
    if (value === '2') {
      return {
        state: 'attendance.expected',
        context: { ...context, notice: undefined },
        done: false,
      };
    }
    if (value === '3') {
      if (!(await services.isSenior(session.member!.memberNo))) {
        return {
          state: 'error',
          context: {
            ...context,
            returnState: 'attendance.clocking',
            messageKey: 'error.not_senior',
            notice: undefined,
          },
          done: false,
        };
      }
      return {
        state: 'attendance.delegate',
        context: { ...context, notice: undefined },
        done: false,
      };
    }
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'attendance.clock') {
    let target: { memberNo: string; name: string };
    try {
      target = await services.memberByNo(value);
    } catch {
      return invalid(state, context, 'error.invalid_choice');
    }
    const event = context.event;
    if (!event) return noEvent(context, 'attendance');
    try {
      const entry = await services.clockIn({
        eventId: event.id,
        sessionDate: event.sessionDate,
        memberNo: target.memberNo,
        actorMemberNo: session.member!.memberNo,
        phoneHash: session.phoneHash,
      });
      return {
        state: 'attendance.done',
        context: {
          ...context,
          attendanceSession: event,
          doneLabel: entry.name,
          doneKind: 'clock',
          notice: undefined,
        },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, clockingErrorKey(error));
    }
  }

  if (state === 'attendance.expected') {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
      return invalid(state, context, 'error.invalid_choice');
    }
    const [male, female, children] = parts.map(Number) as [number, number, number];
    if (male > 10000 || female > 10000 || children > 10000) {
      return invalid(state, context, 'error.invalid_choice');
    }
    const event = context.event;
    if (!event) return noEvent(context, 'attendance');
    try {
      const expected = await services.recordExpected({
        eventId: event.id,
        sessionDate: event.sessionDate,
        male,
        female,
        children,
        phoneHash: session.phoneHash,
      });
      return {
        state: 'attendance.done',
        context: {
          ...context,
          attendanceSession: event,
          expected,
          doneLabel: undefined,
          doneKind: undefined,
          notice: undefined,
        },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, clockingErrorKey(error));
    }
  }

  if (state === 'attendance.delegate') {
    let target: { memberNo: string; name: string };
    try {
      target = await services.memberByNo(value);
    } catch {
      return invalid(state, context, 'error.invalid_choice');
    }
    return {
      state: 'attendance.delegate_reason',
      context: {
        ...context,
        delegateMemberNo: target.memberNo,
        delegateName: target.name,
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'attendance.delegate_reason') {
    const reason = value.trim();
    if (reason.length < 3) return invalid(state, context, 'error.invalid_choice');
    const event = context.event;
    if (!event) return noEvent(context, 'attendance');
    try {
      const delegation = await services.delegate({
        eventId: event.id,
        sessionDate: event.sessionDate,
        fromMemberNo: session.member!.memberNo,
        toMemberNo: context.delegateMemberNo ?? '',
        reason,
        phoneHash: session.phoneHash,
      });
      return {
        state: 'attendance.done',
        context: {
          ...context,
          attendanceSession: event,
          doneLabel: delegation.toName,
          doneKind: 'delegate',
          notice: undefined,
        },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, clockingErrorKey(error));
    }
  }

  if (state === 'welfare.list') {
    const page = context.welfarePage ?? 0;
    const all = context.welfareProducts ?? [];
    const visible = all.slice(
      page * WELFARE_PRODUCT_PAGE_SIZE,
      (page + 1) * WELFARE_PRODUCT_PAGE_SIZE,
    );
    if (value === '0') {
      if (!(all.length > (page + 1) * WELFARE_PRODUCT_PAGE_SIZE)) {
        return invalid(state, context, 'error.invalid_choice');
      }
      return {
        state,
        context: { ...context, welfarePage: page + 1, notice: undefined },
        done: false,
      };
    }
    if (value === '8') return openWelfareServices(context, services, session);
    if (!/^\d+$/.test(value)) return invalid(state, context, 'error.invalid_choice');
    const index = Number(value);
    if (index < 1 || index > visible.length) {
      return invalid(state, context, 'error.invalid_choice');
    }
    return {
      state: 'welfare.product',
      context: {
        ...context,
        welfareProduct: visible[index - 1]!,
        welfareDependents: undefined,
        welfareDependentsPhase: undefined,
        welfareSelectedDependents: undefined,
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'welfare.product') {
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    const product = context.welfareProduct;
    if (!product) return invalid(state, context, 'error.invalid_choice');
    if (product.covers === 'household') {
      const dependents = await services.welfareDependents(session.member!.memberNo, product.code);
      return {
        state: 'welfare.dependents',
        context: {
          ...context,
          welfareDependents: dependents,
          welfareDependentsPhase: dependents.length === 0 ? 'none' : 'ask',
          welfareSelectedDependents: [],
          notice: undefined,
        },
        done: false,
      };
    }
    return {
      state: 'welfare.confirm',
      context: {
        ...context,
        welfareDependents: undefined,
        welfareDependentsPhase: undefined,
        welfareSelectedDependents: [],
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'welfare.dependents') {
    const phase = context.welfareDependentsPhase ?? 'none';
    const confirm = (selected: string[]): AdvanceResult => ({
      state: 'welfare.confirm',
      context: {
        ...context,
        welfareSelectedDependents: selected,
        notice: undefined,
      },
      done: false,
    });

    if (phase === 'none') {
      if (value !== '1') return invalid(state, context, 'error.invalid_choice');
      return confirm([]);
    }
    if (phase === 'ask') {
      if (value === '1') {
        return {
          state,
          context: { ...context, welfareDependentsPhase: 'list', notice: undefined },
          done: false,
        };
      }
      if (value === '2') return confirm([]);
      return invalid(state, context, 'error.invalid_choice');
    }

    const visible = context.welfareDependents ?? [];
    const indices = parseSelection(value, visible.length);
    if (!indices || indices.length === 0) {
      return invalid(state, context, 'error.invalid_choice');
    }
    return confirm(indices.map((selection) => visible[selection - 1]!.memberNo));
  }

  if (state === 'welfare.confirm') {
    if (value === '2') {
      return {
        state: 'welfare.product',
        context: {
          ...context,
          welfareDependentsPhase: undefined,
          welfareSelectedDependents: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    const product = context.welfareProduct;
    if (!product) return invalid(state, context, 'error.invalid_choice');
    try {
      const subscription = await services.subscribeWelfare({
        memberNo: session.member!.memberNo,
        productCode: product.code,
        coveredMemberNos: context.welfareSelectedDependents,
        phoneHash: session.phoneHash,
      });
      return {
        state: 'welfare.done',
        context: { ...context, welfareSubscription: subscription, notice: undefined },
        done: true,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'not_eligible') {
        return {
          state: 'error',
          context: {
            ...context,
            returnState: 'welfare.list',
            messageKey: 'error.not_eligible',
            notice: undefined,
          },
          done: false,
        };
      }
      return invalid(state, context, 'error.try_again');
    }
  }

  if (state === 'welfare.services') {
    if (value === '0') {
      const all = context.welfareServices ?? [];
      const size = welfareServicePageSize(all, session);
      const page = context.welfareServicesPage ?? 0;
      if (!(all.length > (page + 1) * size)) {
        return invalid(state, context, 'error.invalid_choice');
      }
      return {
        state,
        context: { ...context, welfareServicesPage: page + 1, notice: undefined },
        done: false,
      };
    }
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'profile') {
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'register.code') {
    if (!session.anonymous) return invalid(state, context, 'error.invalid_choice');
    if (!/^\d{6}$/.test(value)) return invalid(state, context, 'error.code_invalid');
    // The registration code owns its event and session; the menu does not.
    return {
      state: 'register.first',
      context: {
        ...baseContext(context),
        code: value,
        event: undefined,
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'register.first') {
    const firstName = value.slice(0, 64).trim();
    if (!firstName) return invalid(state, context, 'error.invalid_choice');
    return {
      state: 'register.last',
      context: { ...context, firstName, notice: undefined },
      done: false,
    };
  }

  if (state === 'register.last') {
    const lastName = value.slice(0, 64).trim();
    if (!lastName) return invalid(state, context, 'error.invalid_choice');
    try {
      const result = await services.createRegistration({
        code: context.code ?? '',
        firstName: context.firstName ?? '',
        lastName,
        phoneHash: session.phoneHash,
      });
      return {
        state: 'register.done',
        context: {
          ...context,
          requestReference: result.reference,
          notice: undefined,
        },
        done: true,
      };
    } catch (error) {
      return invalid(state, context, codeErrorKey(error, 'error.code_used'));
    }
  }

  if (state === 'payments.summary') {
    return invalid(state, context, 'error.invalid_choice');
  }

  return { state, context, done: false };
}
