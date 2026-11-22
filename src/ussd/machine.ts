import { randomBytes } from 'node:crypto';
import { DeliveryUnavailableError, RateLimitedError } from '../errors/domain-errors.js';
import { full, t, type GlossaryKey } from './glossary.js';
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
  'attendance.headcount',
  'attendance.headcount.mode',
  'attendance.headcount.entry',
  'attendance.headcount.confirm',
  'attendance.headcount.done',
  'attendance.delegate',
  'attendance.delegate_reason',
  'attendance.done',
  'profile',
  'verify.sent',
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
  /** The current non-superseded count; present only for a headcount-only event. */
  headcount?: number;
}

/** The optional member identity that scopes Activities eligibility. */
export interface UssdActivityViewer {
  memberNo: string | null;
  isPresbyter: boolean;
  pageSize: number;
}

export interface UssdActivities {
  /** Every applicable session on the requested date, already ordered. */
  items: UssdActivity[];
  /** There are more sessions in the seven-day window. */
  moreThisWeek: boolean;
  /** The next applicable day inside the 14-day horizon, when the day is empty. */
  next: { date: string; count: number } | null;
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

/** The live lanes the phone offers and reads. `mixed` is retired (HC-9). */
export type UssdHeadcountMode = 'adults' | 'children' | 'visitors' | 'presbyters';

/** One non-zero bucket of a headcount, in the mode's declared order. */
export interface UssdHeadcountLine {
  code: string;
  label: string;
  count: number;
}

export interface UssdHeadcount {
  id: string;
  mode: UssdHeadcountMode;
  asOf: string;
  total: number;
  /** The mode's non-zero buckets; an all-zero observation carries none. */
  lines: UssdHeadcountLine[];
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
    /** At least one owned contact has no proof yet (MR-54). */
    hasUnprovenContact: boolean;
    /** An active officer confirmation; the action is hidden (MR-55). */
    confirmed: boolean;
  } | null;
  anonymous: boolean;
  /** The channel's declared paged-list sizes; the reference is 3 events and 5 offerings. */
  pageSize?: { events: number; offerings: number };
  /**
   * The provider's per-message cap for this frame. It travels beside `pageSize`
   * on the session info the adapter rebuilds on every call; it is never stored
   * on the session context or in the session row, so a session that began on
   * one provider cannot carry a stale budget into another.
   */
  budget?: number;
}

/** The destination a member-initiated code went to; the notice's only member data. */
export interface UssdVerificationSent {
  channel: 'email' | 'whatsapp' | 'phone';
  masked: string;
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
  activities(date: string, viewer: UssdActivityViewer): Promise<UssdActivities>;
  /** Every applicable session in the seven days from `date`, already ordered. */
  activitiesWeek(date: string, viewer: UssdActivityViewer): Promise<UssdActivity[]>;
  currentHeadcount(
    eventId: string,
    sessionDate: string,
    mode: UssdHeadcountMode,
  ): Promise<UssdHeadcount | null>;
  recordHeadcount(input: {
    eventId: string;
    sessionDate: string;
    mode: UssdHeadcountMode;
    /** The mode's three numbered buckets, in its declared entry order. */
    counts: readonly [number, number, number];
    supersedesId?: string;
    phoneHash: string;
  }): Promise<UssdHeadcount>;
  attendance(memberNo: string, from: string, to: string): Promise<UssdAttendance>;
  profile(memberNo: string): Promise<UssdProfile>;
  /** MR-54: start a code from My Profile; the acceptance page completes it. */
  startVerification(memberNo: string): Promise<UssdVerificationSent>;
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
    phone: string;
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
  /** MR-54: the mask the verify.sent notice names; never the code or token. */
  verification?: UssdVerificationSent;
  invalid?: number;
  returnState?: UssdState;
  messageKey?: GlossaryKey;
  terminal?: boolean;
  activities?: UssdActivity[];
  activitiesPage?: number;
  activitiesDate?: string;
  activitiesMore?: boolean;
  activitiesBack?: UssdState;
  activitiesNext?: { date: string; count: number } | null;
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
  headcount?: UssdHeadcount | null;
  headcountMode?: UssdHeadcountMode;
  /** The last ordinary lane chosen; specialised lanes never enter this memory. */
  headcountLastMode?: 'adults' | 'children';
  headcountCorrecting?: boolean;
  headcountPending?: {
    mode: UssdHeadcountMode;
    counts: [number, number, number];
  };
  headcountTotal?: number;
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
const PLEDGE_PAGE_SIZE = 3;
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

/** The channel declares the row count; the reference is three, Nalo two. */
function activityPageSize(session: UssdSessionInfo): number {
  return Math.max(1, session.pageSize?.events ?? 3);
}

/** The channel declares the offering rows; the reference is five, Nalo three. */
function offeringPageSize(session: UssdSessionInfo): number {
  return Math.max(1, session.pageSize?.offerings ?? OFFERING_PAGE_SIZE);
}

/** `HH:MM` from an ISO instant; the headcount screen shows the as-of time. */
function clockTime(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
}

interface HeadcountEntry {
  mode: UssdHeadcountMode;
  label: GlossaryKey;
  prompt: GlossaryKey;
  buckets: readonly [GlossaryKey, GlossaryKey, GlossaryKey];
}

/**
 * The four headcount menu entries, in menu order. Adult service and Children
 * service keep the remembered-mode preselect; Visitors and Presbyters are their
 * own lanes with their own bucket vocabulary and never enter that memory
 * (HC-8, HC-26).
 */
const HEADCOUNT_ENTRIES: readonly HeadcountEntry[] = [
  {
    mode: 'adults',
    label: 'headcount.adult_service',
    prompt: 'prompt.headcount_adults',
    buckets: ['label.male', 'label.female', 'label.children'],
  },
  {
    mode: 'children',
    label: 'headcount.children_service',
    prompt: 'prompt.headcount_children',
    buckets: ['label.male', 'label.female', 'label.adults'],
  },
  {
    mode: 'visitors',
    label: 'headcount.visitors_service',
    prompt: 'prompt.headcount_visitors',
    buckets: ['label.male', 'label.female', 'label.children'],
  },
  {
    mode: 'presbyters',
    label: 'headcount.presbyters_service',
    prompt: 'prompt.headcount_presbyters',
    buckets: ['label.elders', 'label.deaconess', 'label.deacons'],
  },
];

function headcountEntry(mode: UssdHeadcountMode): HeadcountEntry {
  return HEADCOUNT_ENTRIES.find((entry) => entry.mode === mode) ?? HEADCOUNT_ENTRIES[0]!;
}

function headcountModeLabel(mode: UssdHeadcountMode): string {
  return t(headcountEntry(mode).label);
}

/** The three-number restatement of an observation's own lines. */
function headcountBucketLine(headcount: {
  lines: readonly { label: string; count: number }[];
}): string {
  return headcount.lines.map((line) => `${line.count} ${line.label}`).join(', ');
}

/** The three-number restatement before save; every bucket is named. */
function headcountPendingLine(pending: {
  mode: UssdHeadcountMode;
  counts: [number, number, number];
}): string {
  return headcountEntry(pending.mode)
    .buckets.map((key, index) => `${pending.counts[index]} ${t(key)}`)
    .join(', ');
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
function codeErrorKey(
  error: unknown,
  usedKey: GlossaryKey = 'error.code_invalid',
  attendancePunch = false,
): GlossaryKey {
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
    case 'session_closed':
      return attendancePunch ? 'error.session_closed' : 'error.code_invalid';
    case 'validation_error':
      // Only the punch flow can reach a validation refusal here (its own
      // event/session/member are always supplied), and that refusal is the
      // today rule; registration keeps the opaque code error.
      return attendancePunch ? 'error.session_not_today' : 'error.code_invalid';
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

function headcountErrorKey(error: unknown): GlossaryKey {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'not_presbyter':
    case 'not_senior_presbyter':
      return 'error.not_senior';
    case 'validation_error':
      return 'error.invalid_headcount';
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
  'attendance.headcount': 'attendance.clocking',
  'attendance.headcount.mode': 'attendance.headcount',
  'attendance.headcount.entry': 'attendance.headcount',
  'attendance.headcount.confirm': 'attendance.headcount.entry',
  'attendance.headcount.done': 'attendance.clocking',
  'attendance.delegate': 'attendance.clocking',
  'attendance.delegate_reason': 'attendance.delegate',
  'attendance.done': 'main',
  profile: 'main',
  'verify.sent': 'profile',
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

/** The member identity the channel carries; never a raw phone. */
async function activityViewer(
  session: UssdSessionInfo,
  services: UssdServices,
): Promise<{ viewer: UssdActivityViewer; memberContext: UssdMemberContext | null }> {
  const memberNo = session.member?.memberNo ?? null;
  const memberContext = memberNo ? await services.memberContext(memberNo) : null;
  return {
    viewer: {
      memberNo,
      isPresbyter: memberContext?.isPresbyter ?? false,
      pageSize: activityPageSize(session),
    },
    memberContext,
  };
}

function noticeLines(context: UssdContext): string[] {
  return context.notice ? [t(context.notice)] : [];
}

/** MR-55: the service's refusals map to the USSD notices. */
function verificationNotice(error: unknown): GlossaryKey {
  if (error instanceof RateLimitedError) {
    return error.window === 'hour' ? 'error.verify_limit' : 'error.verify_too_soon';
  }
  if (error instanceof DeliveryUnavailableError) return 'error.not_sent';
  return 'error.try_again';
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

/** The reference channel's budget when a frame declares none. */
const DEFAULT_SCREEN_BUDGET = 182;

function screenBudget(session: UssdSessionInfo): number {
  return session.budget ?? DEFAULT_SCREEN_BUDGET;
}

interface ScreenSegments {
  /** Always rendered: notices, headings and the identity the screen opens with. */
  head: string[];
  /** Always rendered: the lines an accepted key names. */
  actions: string[];
  /** Dropped whole from the end when the budget is tight; never cut mid-line. */
  data: string[];
  /** The options that name the `actions`; the footer options are added here. */
  options?: UssdOption[];
  /** Whether the footer offers `0 More`. */
  more?: boolean;
}

/**
 * Lay a screen out to the frame's budget. The head, the action lines and the
 * navigation footer (`9 Back`, `00 Main menu`, `0 More`) are protected; whole
 * data lines are dropped from the end until the joined text fits. A screen
 * whose protected sections alone exceed the budget is returned unchanged, so
 * the guard reports it as a defect in that screen's design rather than the code
 * hiding it. A `done` screen never comes through here: its confirmation is
 * protected and is never trimmed.
 */
function fittedScreen(
  state: UssdState,
  context: UssdContext,
  session: UssdSessionInfo,
  segments: ScreenSegments,
): Rendered {
  const nav = navLines(state, context, segments.more ?? false);
  const data = [...segments.data];
  const assemble = (lines: string[]): string =>
    [...segments.head, ...segments.actions, ...lines, ...nav.lines].join('\n');
  while (data.length > 0 && assemble(data).length > screenBudget(session)) data.pop();
  return screen(
    state,
    context,
    [...segments.head, ...segments.actions, ...data, ...nav.lines],
    [...(segments.options ?? []), ...nav.options],
  );
}

function offeringById(context: UssdContext, id: string): UssdOffering | undefined {
  return context.offerings?.find((offering) => offering.id === id);
}

function renderedOfferings(context: UssdContext, session: UssdSessionInfo): Rendered {
  const event = context.event;
  const head = [...noticeLines(context), truncate('event', event?.name ?? '')];
  const actions: string[] = [`1 ${t('action.give')}`];
  const options: UssdOption[] = [{ key: '1', label: t('action.give') }];
  if (!session.anonymous) {
    actions.push(
      `2 ${t('action.pledge')}`,
      `3 ${t('action.my_pledges')}`,
      `4 ${t('action.my_payments')}`,
    );
    options.push(
      { key: '2', label: t('action.pledge') },
      { key: '3', label: t('action.my_pledges') },
      { key: '4', label: t('action.my_payments') },
    );
  }
  return fittedScreen('offerings', context, session, { head, actions, data: [], options });
}

function renderedAmount(context: UssdContext, session: UssdSessionInfo): Rendered {
  const heading = context.flow === 'pledge' ? t('action.pledge') : t('action.give');
  const head = [
    ...noticeLines(context),
    heading,
    truncate('event', context.event?.name ?? ''),
    t('prompt.amount'),
  ];
  return fittedScreen('offerings.amount', context, session, { head, actions: [], data: [] });
}

function renderedSelect(context: UssdContext, session: UssdSessionInfo): Rendered {
  const page = context.offeringPage ?? 0;
  const all = context.offerings ?? [];
  const size = offeringPageSize(session);
  const visible = all.slice(page * size, (page + 1) * size);
  const more = all.length > (page + 1) * size;
  const head = [...noticeLines(context), t('prompt.offerings')];
  const actions: string[] = [];
  const options: UssdOption[] = [];
  visible.forEach((offering, index) => {
    const key = String(index + 1);
    const name = truncate('offering', offering.name);
    actions.push(`${key} ${name}`);
    options.push({ key, label: name });
  });
  return fittedScreen('offerings.select', context, session, {
    head,
    actions,
    data: [],
    options,
    more,
  });
}

function renderedSplit(context: UssdContext, session: UssdSessionInfo): Rendered {
  const head = [...noticeLines(context), t('prompt.split')];
  const data: string[] = [];
  (context.selected ?? []).forEach((id, index) => {
    data.push(`${index + 1} ${truncate('offering', offeringById(context, id)?.name ?? '')}`);
  });
  data.push(`${t('label.total')} ${money(context.amountMinor ?? 0, context.currency)}`);
  return fittedScreen('offerings.split', context, session, { head, actions: [], data });
}

function giftConfirmLines(context: UssdContext): string[] {
  const { amounts, total, currency } = confirmedAmounts(context);
  const selected = context.selected ?? [];
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

/** The amounts a gift or pledge is confirming, in selection order, and their total. */
function confirmedAmounts(context: UssdContext): {
  amounts: number[];
  total: number;
  currency: string;
} {
  const selected = context.selected ?? [];
  const amounts = selected.map((_id, index) => context.split?.[index] ?? context.amountMinor ?? 0);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return { amounts, total, currency: context.currency ?? 'GHS' };
}

/**
 * §24d: the compact confirm subject keeps every amount and the total on one
 * line and may omit the offering names the selection screen already named.
 */
function compactConfirmSubject(amounts: number[], total: number, currency: string): string[] {
  return [
    `${amounts.map((amount) => money(amount, currency)).join(', ')} · ${t('label.total')} ${money(total, currency)}`,
  ];
}

/** Whether the protected head, subject and actions still fit this frame's budget. */
function fitsBudget(
  state: UssdState,
  context: UssdContext,
  session: UssdSessionInfo,
  head: string[],
  subject: string[],
  actions: string[],
): boolean {
  const nav = navLines(state, context, false);
  return [...head, ...subject, ...actions, ...nav.lines].join('\n').length <= screenBudget(session);
}

function renderedConfirm(context: UssdContext, session: UssdSessionInfo): Rendered {
  const head = [...noticeLines(context)];
  const actions = [`1 ${t('action.accept')}`, `2 ${t('action.change')}`];
  const options: UssdOption[] = [
    { key: '1', label: t('action.accept') },
    { key: '2', label: t('action.change') },
  ];
  // §24d: a confirm screen's subject — the amounts it is confirming and their
  // total — is protected. The full sentence keeps the names; when it does not
  // fit, the compact subject keeps every amount and the total and drops only
  // the names, so the screen never shows its actions without its subject.
  const { amounts, total, currency } = confirmedAmounts(context);
  const compact = compactConfirmSubject(amounts, total, currency);
  let subject: string[];
  if (context.flow === 'pledge') {
    const offering = offeringById(context, context.selected?.[0] ?? '');
    const full = [
      t('action.pledge'),
      truncate('offering', offering?.name ?? ''),
      money(context.amountMinor ?? 0, context.currency),
      `${t('prompt.expected_date')} ${shortDate(context.expectedOn ?? '')}`,
    ];
    subject = fitsBudget('offerings.confirm', context, session, head, full, actions)
      ? full
      : compact;
  } else {
    const full = giftConfirmLines(context);
    subject = fitsBudget('offerings.confirm', context, session, head, full, actions)
      ? full
      : compact;
  }
  return fittedScreen('offerings.confirm', context, session, {
    head: [...head, ...subject],
    actions,
    data: [],
    options,
  });
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

function renderedPledgeDate(context: UssdContext, session: UssdSessionInfo): Rendered {
  const offering = offeringById(context, context.selected?.[0] ?? '');
  const head = [
    ...noticeLines(context),
    t('action.pledge'),
    truncate('offering', offering?.name ?? ''),
    money(context.amountMinor ?? 0, context.currency),
    t('prompt.date'),
  ];
  return fittedScreen('offerings.pledge_date', context, session, { head, actions: [], data: [] });
}

function renderedPledgeConfirm(context: UssdContext, session: UssdSessionInfo): Rendered {
  const head = [...noticeLines(context)];
  const actions = [`1 ${t('action.accept')}`, `2 ${t('action.change')}`];
  const options: UssdOption[] = [
    { key: '1', label: t('action.accept') },
    { key: '2', label: t('action.change') },
  ];
  const offering = offeringById(context, context.selected?.[0] ?? '');
  const full = [
    t('action.pledge'),
    truncate('offering', offering?.name ?? ''),
    money(context.amountMinor ?? 0, context.currency),
    `${t('prompt.expected_date')} ${shortDate(context.expectedOn ?? '')}`,
  ];
  // §24d: the amount and its total are the confirm screen's subject and are
  // never dropped; the compact form gives up the name and the due date first.
  const { amounts, total, currency } = confirmedAmounts(context);
  const compact = compactConfirmSubject(amounts, total, currency);
  const subject = fitsBudget('offerings.pledge_confirm', context, session, head, full, actions)
    ? full
    : compact;
  return fittedScreen('offerings.pledge_confirm', context, session, {
    head: [...head, ...subject],
    actions,
    data: [],
    options,
  });
}

function renderedPledges(context: UssdContext, session: UssdSessionInfo): Rendered {
  const page = context.pledgePage ?? 0;
  const all = context.pledges ?? [];
  const visible = all.slice(page * PLEDGE_PAGE_SIZE, (page + 1) * PLEDGE_PAGE_SIZE);
  const more = all.length > (page + 1) * PLEDGE_PAGE_SIZE;
  const head = [...noticeLines(context), t('action.my_pledges')];
  const actions: string[] = [];
  const data: string[] = [];
  const options: UssdOption[] = [];
  visible.forEach((pledge, index) => {
    const key = String(index + 1);
    const name = truncate('offering', pledge.offeringName);
    actions.push(`${key} ${name}`);
    data.push(`${money(pledge.amountMinor, pledge.currency)} ${shortDate(pledge.expectedOn)}`);
    options.push({ key, label: name });
  });
  return fittedScreen('pledges.list', context, session, {
    head,
    actions,
    data,
    options,
    more,
  });
}

function renderedPledgeConfirmOne(context: UssdContext, session: UssdSessionInfo): Rendered {
  const pledge = context.selectedPledge;
  const head = [
    ...noticeLines(context),
    t('action.pay'),
    truncate('offering', pledge?.offeringName ?? ''),
    money(pledge?.amountMinor ?? 0, pledge?.currency),
    `${t('prompt.expected_date')} ${shortDate(pledge?.expectedOn ?? '')}`,
  ];
  return fittedScreen('pledges.confirm', context, session, {
    head,
    actions: [`1 ${t('action.pay')}`],
    data: [],
    options: [{ key: '1', label: t('action.pay') }],
  });
}

function renderedPayments(context: UssdContext, session: UssdSessionInfo): Rendered {
  const summary = context.summary;
  const currency = summary?.currency ?? 'GHS';
  const head = [...noticeLines(context)];
  const data: string[] = [];
  if (summary) {
    data.push(
      `${t('label.week')} ${money(summary.week.paidMinor, currency)}`,
      `${t('label.quarter')} ${money(summary.quarter.paidMinor, currency)}`,
      `${t('label.year')} ${money(summary.year.paidMinor, currency)}`,
    );
    for (const event of summary.topEvents) {
      data.push(`${truncate('event', event.name)} ${money(event.paidMinor, currency)}`);
    }
  }
  return fittedScreen('payments.summary', context, session, { head, actions: [], data });
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

function renderedWelfareList(context: UssdContext, session: UssdSessionInfo): Rendered {
  const page = context.welfarePage ?? 0;
  const all = context.welfareProducts ?? [];
  const visible = all.slice(
    page * WELFARE_PRODUCT_PAGE_SIZE,
    (page + 1) * WELFARE_PRODUCT_PAGE_SIZE,
  );
  const more = all.length > (page + 1) * WELFARE_PRODUCT_PAGE_SIZE;
  const head = [...noticeLines(context), t('menu.welfare')];
  const actions: string[] = [];
  const data: string[] = [];
  const options: UssdOption[] = [];
  if (all.length === 0) {
    data.push(t('welfare.not_eligible'));
  } else {
    visible.forEach((product, index) => {
      const key = String(index + 1);
      const name = truncate('offering', product.name);
      actions.push(`${key} ${name}`);
      options.push({ key, label: name });
    });
  }
  if (more) {
    actions.push(`0 ${t('nav.more')}`);
    options.push({ key: '0', label: t('nav.more') });
  }
  actions.push(`8 ${t('welfare.my_services')}`);
  options.push({ key: '8', label: t('welfare.my_services') });
  return fittedScreen('welfare.list', context, session, {
    head,
    actions,
    data,
    options,
  });
}

function renderedWelfareProduct(context: UssdContext, session: UssdSessionInfo): Rendered {
  const product = context.welfareProduct;
  const head = [
    ...noticeLines(context),
    truncate('event', product?.name ?? ''),
    `${t('welfare.premium')} ${money(product?.premiumMinor ?? 0, product?.currency)}`,
    `${t('welfare.cover')} ${welfareCoverLabel(product?.covers ?? 'individual')} · ${
      product?.periodMonths ?? 1
    } ${t('label.month')}`,
  ];
  return fittedScreen('welfare.product', context, session, {
    head,
    actions: [`1 ${t('welfare.subscribe')}`],
    data: [],
    options: [{ key: '1', label: t('welfare.subscribe') }],
  });
}

function renderedWelfareDependents(context: UssdContext, session: UssdSessionInfo): Rendered {
  const phase = context.welfareDependentsPhase ?? 'none';
  const head = [...noticeLines(context), t('welfare.cover_dependents')];
  const data: string[] = [];
  const actions: string[] = [];
  const options: UssdOption[] = [];
  if (phase === 'none') {
    head.push(t('welfare.no_dependents'));
    actions.push(`1 ${t('welfare.subscribe')}`);
    options.push({ key: '1', label: t('welfare.subscribe') });
  } else if (phase === 'ask') {
    actions.push(`1 ${t('action.yes')}`, `2 ${t('action.no')}`);
    options.push({ key: '1', label: t('action.yes') }, { key: '2', label: t('action.no') });
  } else {
    (context.welfareDependents ?? []).forEach((dependent, index) => {
      const key = String(index + 1);
      const name = truncate('member', dependent.name);
      actions.push(`${key} ${name}`);
      options.push({ key, label: name });
    });
  }
  return fittedScreen('welfare.dependents', context, session, {
    head,
    actions,
    data,
    options,
  });
}

function renderedWelfareConfirm(context: UssdContext, session: UssdSessionInfo): Rendered {
  const product = context.welfareProduct;
  const selected = context.welfareSelectedDependents ?? [];
  // §24d: the product and its premium are the confirm screen's protected
  // subject, so they travel in `head` and are never trimmed. This full subject
  // fits 120; one that did not would be the design defect the guard reports,
  // not a second compact form.
  const head = [
    ...noticeLines(context),
    t('welfare.subscribe'),
    truncate('offering', product?.name ?? ''),
    `${t('welfare.premium')} ${money(product?.premiumMinor ?? 0, product?.currency)}`,
    `${t('welfare.cover')} ${welfareCoverLabel(product?.covers ?? 'individual')}${
      selected.length > 0 ? ` (${selected.length})` : ''
    }`,
  ];
  return fittedScreen('welfare.confirm', context, session, {
    head,
    actions: [`1 ${t('action.accept')}`, `2 ${t('action.change')}`],
    data: [],
    options: [
      { key: '1', label: t('action.accept') },
      { key: '2', label: t('action.change') },
    ],
  });
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
  const head = [...noticeLines(context), t('welfare.my_services')];
  const data: string[] = [];
  if (all.length === 0) {
    data.push(t('welfare.no_services'));
  }
  for (const [index, service] of visible.entries()) {
    const relationship =
      service.source === 'inherited'
        ? welfareRelationshipLabel(service.relationship, service.policyholder)
        : null;
    const status = service.status === 'expired' ? ` ${t('welfare.expired')}` : '';
    data.push(
      `${index + 1} ${truncate('offering', service.name)}${
        relationship ? ` (${relationship})` : ''
      }${status}`,
    );
    if (service.source === 'inherited' && service.policyholder) {
      data.push(
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
    data.push(`${payer ? `${payer} · ` : ''}${t('welfare.until')} ${until}`);
    data.push(
      `${t('welfare.claimed')} ${money(service.claimedTotalMinor, service.currency ?? 'GHS')}`,
    );
  }
  return fittedScreen('welfare.services', context, session, {
    head,
    actions: [],
    data,
    more,
  });
}

function renderedError(context: UssdContext, session: UssdSessionInfo): Rendered {
  const done = context.terminal ?? false;
  const head = [t(context.messageKey ?? 'error.try_again')];
  // A terminal error is a done screen: its message is protected, not trimmed.
  if (done) return screen('error', context, head, [], true);
  return fittedScreen('error', context, session, { head, actions: [], data: [] });
}

function activityLine(index: number, activity: UssdActivity): string {
  const suffix = activity.headcount === undefined ? '' : ` (${activity.headcount})`;
  return `${index} ${truncate('event', activity.name)}${suffix}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function nextEventLine(next: { date: string; count: number }, base: string): string {
  const noun = next.count === 1 ? t('label.event') : t('label.events');
  const days = daysBetween(base, next.date);
  const when = days === 1 ? t('label.tomorrow') : t('label.in_days').replace('{n}', String(days));
  return `${next.count} ${noun} ${when}`;
}

function listActivities(
  state: 'activities' | 'activities.week',
  context: UssdContext,
  session: UssdSessionInfo,
  all: UssdActivity[],
  page: number,
  size: number,
  more: boolean,
): Rendered {
  const zero = all.length === 0;
  const heading = zero
    ? state === 'activities.week'
      ? t('activities.zero_week')
      : t('activities.zero_today')
    : state === 'activities.week'
      ? t('activities.this_week')
      : (context.activitiesDate ?? todayIso()) === todayIso()
        ? t('activities.today')
        : shortDate(context.activitiesDate ?? todayIso());
  const head = [...noticeLines(context), heading];
  const actions: string[] = [];
  const options: UssdOption[] = [];

  if (zero) {
    if (state === 'activities.week') {
      actions.push(`1 ${t('activities.a_date')}`);
      options.push({ key: '1', label: t('activities.a_date') });
    } else {
      if (context.activitiesNext) {
        head.push(nextEventLine(context.activitiesNext, context.activitiesDate ?? todayIso()));
        actions.push(`1 ${t('action.view')}`);
        options.push({ key: '1', label: t('action.view') });
      } else {
        head.push(t('label.no_upcoming'));
      }
      actions.push(`2 ${t('activities.this_week')}`);
      options.push({ key: '2', label: t('activities.this_week') });
    }
    return fittedScreen(state, context, session, { head, actions, data: [], options });
  }

  all.slice(page * size, (page + 1) * size).forEach((activity, index) => {
    const key = String(index + 1);
    actions.push(activityLine(index + 1, activity));
    options.push({ key, label: truncate('event', activity.name) });
  });
  if (all.length > (page + 1) * size || more) {
    actions.push(`0 ${t('nav.more')}`);
    options.push({ key: '0', label: t('nav.more') });
  }
  if (state === 'activities') {
    actions.push(`8 ${t('activities.a_date')}`);
    options.push({ key: '8', label: t('activities.a_date') });
  }
  return fittedScreen(state, context, session, { head, actions, data: [], options });
}

function attendanceCountLines(summary: UssdAttendance | undefined): string[] {
  const lines = [
    `${t('label.attended')} ${summary?.attended ?? 0} ${t('label.roster')} ${summary?.expected ?? 0}`,
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

function renderedAttendance(
  context: UssdContext,
  session: UssdSessionInfo,
  withActions: boolean,
): Rendered {
  const summary = withActions
    ? (context.attendanceToday ?? context.attendanceSummary)
    : context.attendanceSummary;
  const head = [...noticeLines(context), t('menu.attendance')];
  const data: string[] = [];
  if (noAttendance(summary)) {
    data.push(t('attendance.no_data'));
  } else {
    data.push(...attendanceCountLines(summary));
  }
  const actions: string[] = [];
  const options: UssdOption[] = [];
  if (withActions) {
    actions.push(
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
      actions.push(`4 ${t('attendance.clocking')}`);
      options.push({ key: '4', label: t('attendance.clocking') });
    }
    return fittedScreen('attendance', context, session, { head, actions, data, options });
  }
  return fittedScreen('attendance.status', context, session, { head, actions: [], data });
}

function renderedAttendancePeriod(context: UssdContext, session: UssdSessionInfo): Rendered {
  const head = [...noticeLines(context), t('attendance.period')];
  return fittedScreen('attendance.period', context, session, {
    head,
    actions: [`1 ${t('label.month')}`, `2 ${t('label.quarter')}`, `3 ${t('label.year')}`],
    data: [],
    options: [
      { key: '1', label: t('label.month') },
      { key: '2', label: t('label.quarter') },
      { key: '3', label: t('label.year') },
    ],
  });
}

function renderedAttendanceEvent(context: UssdContext, session: UssdSessionInfo): Rendered {
  const event = context.attendanceSession;
  const report = context.attendanceEvent;
  const head = [
    ...noticeLines(context),
    t('menu.attendance'),
    truncate('event', event?.name ?? ''),
    shortDate(event?.sessionDate ?? ''),
    `${t('label.attended')} ${report?.present ?? 0} ${t('label.roster')} ${report?.expected ?? 0}`,
  ];
  const member = session.member;
  if (member) {
    const label = memberName(member.firstName, member.lastName);
    head.push(
      `${truncate('member', label)}${report?.memberPresent ? ` ${t('label.attended')}` : ''}`,
    );
  }
  const actions: string[] = [];
  const options: UssdOption[] = [];
  if (!report?.memberPresent) {
    actions.push(`1 ${t('attendance.present')}`);
    options.push({ key: '1', label: t('attendance.present') });
  }
  return fittedScreen('attendance.event', context, session, {
    head,
    actions,
    data: [],
    options,
  });
}

function renderedProfile(context: UssdContext, session: UssdSessionInfo): Rendered {
  const profile = context.profile;
  const head = [...noticeLines(context)];
  const data: string[] = [];
  if (profile) {
    // Identity opens the screen; the action follows it, then the data section.
    head.push(identityLabel(truncate('member', profile.name), profile.gender, profile.age));
    data.push(`${t('profile.member_no')} ${profile.memberNo}`);
    if (profile.ministries.length > 0) {
      data.push(`${t('profile.ministries')} ${truncate('member', profile.ministries.join(', '))}`);
    }
    const attendance = profile.attendance;
    if (attendance.expected === 0 && attendance.attended === 0 && !attendance.lastAttendedOn) {
      data.push(t('attendance.no_data'));
    } else {
      const status =
        attendance.status === 'regular'
          ? t('status.regular')
          : attendance.status === 'non_regular'
            ? t('status.non_regular')
            : t('status.not_enough_data');
      const date = attendance.lastAttendedOn ? ` · ${shortDate(attendance.lastAttendedOn)}` : '';
      data.push(`${status} · ${attendance.attended} of ${attendance.expected}${date}`);
    }
    data.push(
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
  const actions: string[] = [];
  const options: UssdOption[] = [];
  // MR-54/MR-55: the action is offered only while an owned contact is still
  // unproven and no officer confirmation is active.
  if (session.member && session.member.hasUnprovenContact && !session.member.confirmed) {
    actions.push(`1 ${full('action.verify_contact')}`);
    options.push({ key: '1', label: full('action.verify_contact') });
  }
  return fittedScreen('profile', context, session, { head, actions, data, options });
}

/** MR-54: the notice after a member-initiated send; it accepts no digits. */
function renderedVerifySent(context: UssdContext, session: UssdSessionInfo): Rendered {
  const head = [...noticeLines(context)];
  if (context.verification) {
    head.push(full('status.verification_sent').replace('<mask>', context.verification.masked));
  }
  return fittedScreen('verify.sent', context, session, { head, actions: [], data: [] });
}

function renderedAttendanceDone(context: UssdContext): Rendered {
  const lines = [...noticeLines(context), t('status.attendance_recorded')];
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
  return screen('attendance.done', context, lines, [], true);
}

function renderedClocking(context: UssdContext, session: UssdSessionInfo): Rendered {
  return fittedScreen('attendance.clocking', context, session, {
    head: [...noticeLines(context), t('attendance.clocking')],
    actions: [
      `1 ${t('attendance.clock_in')}`,
      `2 ${t('attendance.headcount')}`,
      `3 ${t('attendance.delegate')}`,
    ],
    data: [],
    options: [
      { key: '1', label: t('attendance.clock_in') },
      { key: '2', label: t('attendance.headcount') },
      { key: '3', label: t('attendance.delegate') },
    ],
  });
}

function renderedHeadcount(context: UssdContext, session: UssdSessionInfo): Rendered {
  const headcount = context.headcount ?? null;
  const head = [...noticeLines(context), t('attendance.headcount')];
  const data: string[] = [];
  const actions: string[] = [];
  const options: UssdOption[] = [];
  if (headcount) {
    const buckets = headcountBucketLine(headcount);
    data.push(`${headcountModeLabel(headcount.mode)} · ${clockTime(headcount.asOf)}`);
    if (buckets) data.push(buckets);
    data.push(`${t('label.total')} ${headcount.total}`);
  } else {
    data.push(t('status.no_headcount'));
  }
  actions.push(`1 ${t('action.new_count')}`);
  options.push({ key: '1', label: t('action.new_count') });
  if (headcount) {
    actions.push(`2 ${t('action.correct')}`);
    options.push({ key: '2', label: t('action.correct') });
  }
  return fittedScreen('attendance.headcount', context, session, {
    head,
    actions,
    data,
    options,
  });
}

function headcountLastMode(context: UssdContext): 'adults' | 'children' {
  if (context.headcountLastMode) return context.headcountLastMode;
  return context.headcount?.mode === 'children' ? 'children' : 'adults';
}

function renderedHeadcountMode(context: UssdContext, session: UssdSessionInfo): Rendered {
  const last = headcountLastMode(context);
  const head = [
    ...noticeLines(context),
    t('attendance.headcount'),
    `${t('label.last_mode')} ${headcountModeLabel(last)}`,
  ];
  const actions: string[] = [];
  const options: UssdOption[] = [];
  HEADCOUNT_ENTRIES.forEach((entry, index) => {
    const key = String(index + 1);
    const label = t(entry.label);
    actions.push(`${key} ${label}`);
    options.push({ key, label });
  });
  return fittedScreen('attendance.headcount.mode', context, session, {
    head,
    actions,
    data: [],
    options,
  });
}

function renderedHeadcountEntry(context: UssdContext, session: UssdSessionInfo): Rendered {
  const mode = context.headcountMode ?? 'adults';
  return renderedPrompt(
    'attendance.headcount.entry',
    context,
    session,
    headcountModeLabel(mode),
    t(headcountEntry(mode).prompt),
  );
}

function renderedHeadcountConfirm(context: UssdContext, session: UssdSessionInfo): Rendered {
  const pending = context.headcountPending;
  const head = [
    ...noticeLines(context),
    t('attendance.headcount'),
    headcountModeLabel(pending?.mode ?? context.headcountMode ?? 'adults'),
  ];
  // §24d: the bucket restatement and its total are the confirm screen's
  // protected subject, so they travel in `head` and are never trimmed.
  if (pending) {
    head.push(headcountPendingLine(pending));
    const total = pending.counts.reduce((sum, count) => sum + count, 0);
    head.push(`${t('label.total')} ${total}`);
  }
  return fittedScreen('attendance.headcount.confirm', context, session, {
    head,
    actions: [`1 ${t('action.save')}`, `2 ${t('action.change')}`],
    data: [],
    options: [
      { key: '1', label: t('action.save') },
      { key: '2', label: t('action.change') },
    ],
  });
}

function renderedHeadcountDone(context: UssdContext, session: UssdSessionInfo): Rendered {
  const head = [
    ...noticeLines(context),
    t('status.headcount_recorded'),
    `${t('label.total')} ${context.headcountTotal ?? 0}`,
  ];
  return fittedScreen('attendance.headcount.done', context, session, {
    head,
    actions: [],
    data: [],
  });
}

function renderedPrompt(
  state: UssdState,
  context: UssdContext,
  session: UssdSessionInfo,
  heading: string,
  prompt: string,
): Rendered {
  const head = [...noticeLines(context), heading, prompt];
  return fittedScreen(state, context, session, { head, actions: [], data: [] });
}

function renderedRegister(
  state: 'register.code' | 'register.first' | 'register.last' | 'register.done',
  context: UssdContext,
  session: UssdSessionInfo,
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
    session,
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
      const head = [...noticeLines(context), t('nav.main')];
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
      const actions = entries.map((entry) => `${entry.key} ${entry.label}`);
      return fittedScreen('main', context, session, { head, actions, data: [], options: entries });
    }
    case 'offerings':
      return renderedOfferings(context, session);
    case 'offerings.name': {
      const head = [
        ...noticeLines(context),
        truncate('event', context.event?.name ?? ''),
        t('prompt.name'),
      ];
      return fittedScreen('offerings.name', context, session, { head, actions: [], data: [] });
    }
    case 'offerings.amount':
      return renderedAmount(context, session);
    case 'offerings.select':
      return renderedSelect(context, session);
    case 'offerings.split':
      return renderedSplit(context, session);
    case 'offerings.confirm':
      return renderedConfirm(context, session);
    case 'offerings.done':
      return renderedDone('offerings.done', context);
    case 'offerings.pledge_date':
      return renderedPledgeDate(context, session);
    case 'offerings.pledge_confirm':
      return renderedPledgeConfirm(context, session);
    case 'pledges.list':
      return renderedPledges(context, session);
    case 'pledges.confirm':
      return renderedPledgeConfirmOne(context, session);
    case 'pledges.done':
      return renderedDone('pledges.done', context);
    case 'payments.summary':
      return renderedPayments(context, session);
    case 'welfare.list':
      return renderedWelfareList(context, session);
    case 'welfare.product':
      return renderedWelfareProduct(context, session);
    case 'welfare.dependents':
      return renderedWelfareDependents(context, session);
    case 'welfare.confirm':
      return renderedWelfareConfirm(context, session);
    case 'welfare.done':
      return renderedWelfareDone(context);
    case 'welfare.services':
      return renderedWelfareServices(context, session);
    case 'activities':
      return listActivities(
        'activities',
        context,
        session,
        context.activities ?? [],
        context.activitiesPage ?? 0,
        activityPageSize(session),
        context.activitiesMore ?? false,
      );
    case 'activities.week':
      return listActivities(
        'activities.week',
        context,
        session,
        context.weekActivities ?? [],
        context.weekPage ?? 0,
        activityPageSize(session),
        (context.weekActivities ?? []).length >
          ((context.weekPage ?? 0) + 1) * activityPageSize(session),
      );
    case 'activities.date':
      return renderedPrompt(
        'activities.date',
        context,
        session,
        t('activities.a_date'),
        t('prompt.date'),
      );
    case 'activities.event':
      return fittedScreen('activities.event', context, session, {
        head: [
          ...noticeLines(context),
          truncate('event', context.activity?.name ?? ''),
          shortDate(context.activity?.sessionDate ?? ''),
        ],
        actions: [`1 ${t('action.give')}`, `2 ${t('menu.attendance')}`],
        data: [],
        options: [
          { key: '1', label: t('action.give') },
          { key: '2', label: t('menu.attendance') },
        ],
      });
    case 'attendance':
      return renderedAttendance(context, session, true);
    case 'attendance.day':
      return renderedPrompt(
        'attendance.day',
        context,
        session,
        t('attendance.day'),
        t('prompt.date'),
      );
    case 'attendance.period':
      return renderedAttendancePeriod(context, session);
    case 'attendance.status':
      return renderedAttendance(context, session, false);
    case 'attendance.event':
      return renderedAttendanceEvent(context, session);
    case 'attendance.code':
      return renderedPrompt(
        'attendance.code',
        context,
        session,
        t('attendance.present'),
        t('prompt.code'),
      );
    case 'attendance.clocking':
      return renderedClocking(context, session);
    case 'attendance.clock':
      return renderedPrompt(
        'attendance.clock',
        context,
        session,
        t('attendance.clock_in'),
        t('profile.member_no'),
      );
    case 'attendance.headcount':
      return renderedHeadcount(context, session);
    case 'attendance.headcount.mode':
      return renderedHeadcountMode(context, session);
    case 'attendance.headcount.entry':
      return renderedHeadcountEntry(context, session);
    case 'attendance.headcount.confirm':
      return renderedHeadcountConfirm(context, session);
    case 'attendance.headcount.done':
      return renderedHeadcountDone(context, session);
    case 'attendance.delegate':
      return renderedPrompt(
        'attendance.delegate',
        context,
        session,
        t('attendance.delegate'),
        t('profile.member_no'),
      );
    case 'attendance.delegate_reason':
      return renderedPrompt(
        'attendance.delegate_reason',
        context,
        session,
        t('attendance.delegate'),
        t('prompt.reason'),
      );
    case 'attendance.done':
      return renderedAttendanceDone(context);
    case 'profile':
      return renderedProfile(context, session);
    case 'verify.sent':
      return renderedVerifySent(context, session);
    case 'register.code':
    case 'register.first':
    case 'register.last':
    case 'register.done':
      return renderedRegister(state, context, session);
    case 'error':
      return renderedError(context, session);
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
  session: UssdSessionInfo,
  date: string,
): Promise<AdvanceResult> {
  const { viewer, memberContext } = await activityViewer(session, services);
  const activities = await services.activities(date, viewer);
  return {
    state: 'activities',
    context: {
      ...baseContext(context),
      memberContext: memberContext ?? { isPresbyter: false, presbyterRank: null },
      activities: activities.items,
      activitiesPage: 0,
      activitiesDate: date,
      activitiesMore: activities.moreThisWeek,
      activitiesNext: activities.next,
      activity: undefined,
      notice: undefined,
    },
    done: false,
  };
}

async function openWeek(
  context: UssdContext,
  services: UssdServices,
  session: UssdSessionInfo,
  date: string,
): Promise<AdvanceResult> {
  const { viewer, memberContext } = await activityViewer(session, services);
  const week = await services.activitiesWeek(date, viewer);
  return {
    state: 'activities.week',
    context: {
      ...context,
      memberContext: memberContext ?? { isPresbyter: false, presbyterRank: null },
      weekActivities: week,
      weekPage: 0,
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

async function openHeadcount(context: UssdContext, services: UssdServices): Promise<AdvanceResult> {
  const event = context.event;
  if (!event) return noEvent(context, 'attendance.clocking');
  // The screen names one lane: the last lane viewed, or the remembered ordinary
  // mode when the session has none yet. The menu offers one entry per lane.
  const lane = context.headcountMode ?? headcountLastMode(context);
  const headcount = await services.currentHeadcount(event.id, event.sessionDate, lane);
  return {
    state: 'attendance.headcount',
    context: { ...context, headcount, notice: undefined },
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
      if (value === '3') return openActivities(context, services, session, todayIso());
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
    if (value === '2') return openActivities(context, services, session, todayIso());
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
    const size = offeringPageSize(session);
    const visible = all.slice(page * size, (page + 1) * size);
    if (value === '0') {
      if (!(all.length > (page + 1) * size)) {
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
    const all = context.activities ?? [];
    const size = activityPageSize(session);
    const page = context.activitiesPage ?? 0;
    const visible = all.slice(page * size, (page + 1) * size);
    const more = all.length > (page + 1) * size || (context.activitiesMore ?? false);

    if (all.length === 0) {
      if (value === '1' && context.activitiesNext) {
        return openActivities(context, services, session, context.activitiesNext.date);
      }
      if (value === '2') {
        return openWeek(context, services, session, context.activitiesDate ?? todayIso());
      }
      return invalid(state, context, 'error.invalid_choice');
    }

    if (value === '0') {
      if (!more) return invalid(state, context, 'error.invalid_choice');
      const week = await services.activitiesWeek(
        context.activitiesDate ?? todayIso(),
        (await activityViewer(session, services)).viewer,
      );
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
    const index = parseIndex(value, visible.length);
    const activity = index === null ? undefined : visible[index - 1];
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
    const size = activityPageSize(session);
    const page = context.weekPage ?? 0;
    const more = week.length > (page + 1) * size;
    if (week.length === 0) {
      if (value === '1') {
        return {
          state: 'activities.date',
          context: { ...context, notice: undefined },
          done: false,
        };
      }
      return invalid(state, context, 'error.invalid_choice');
    }
    if (value === '0') {
      if (!more) return invalid(state, context, 'error.invalid_choice');
      return {
        state,
        context: { ...context, weekPage: page + 1, notice: undefined },
        done: false,
      };
    }
    const visible = week.slice(page * size, (page + 1) * size);
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
    return openActivities(context, services, session, date);
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
      const key = codeErrorKey(error, 'error.code_invalid', true);
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
      return openHeadcount(context, services);
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

  if (state === 'attendance.headcount') {
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
      return {
        state: 'attendance.headcount.mode',
        context: {
          ...context,
          headcountCorrecting: false,
          headcountPending: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    if (value === '2') {
      if (!context.headcount) return invalid(state, context, 'error.invalid_choice');
      return {
        state: 'attendance.headcount.mode',
        context: {
          ...context,
          headcountCorrecting: true,
          headcountPending: undefined,
          notice: undefined,
        },
        done: false,
      };
    }
    return invalid(state, context, 'error.invalid_choice');
  }

  if (state === 'attendance.headcount.mode') {
    const index = /^\d+$/.test(value) ? Number(value) : 0;
    const entry = HEADCOUNT_ENTRIES[index - 1];
    if (!entry) return invalid(state, context, 'error.invalid_choice');
    const next: UssdContext = {
      ...context,
      headcountMode: entry.mode,
      headcountPending: undefined,
      notice: undefined,
    };
    // The two ordinary lanes share a remembered mode; a specialised lane is its
    // own entry and must not overwrite that memory (HC-26).
    if (entry.mode === 'adults' || entry.mode === 'children') {
      next.headcountLastMode = entry.mode;
    }
    return { state: 'attendance.headcount.entry', context: next, done: false };
  }

  if (state === 'attendance.headcount.entry') {
    const parts = value.split(/[\s,/]+/).filter(Boolean);
    if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
      return invalid(state, context, 'error.invalid_headcount');
    }
    const [first, second, third] = parts.map(Number) as [number, number, number];
    if ([first, second, third].some((count) => count > 10_000)) {
      return invalid(state, context, 'error.invalid_headcount');
    }
    if (first + second + third > 30_000) {
      return invalid(state, context, 'error.invalid_headcount');
    }
    return {
      state: 'attendance.headcount.confirm',
      context: {
        ...context,
        headcountPending: {
          mode: context.headcountMode ?? 'adults',
          counts: [first, second, third],
        },
        notice: undefined,
      },
      done: false,
    };
  }

  if (state === 'attendance.headcount.confirm') {
    if (value === '2') {
      return {
        state: 'attendance.headcount.entry',
        context: { ...context, headcountPending: undefined, notice: undefined },
        done: false,
      };
    }
    if (value !== '1') return invalid(state, context, 'error.invalid_choice');
    const event = context.event;
    const pending = context.headcountPending;
    if (!event || !pending) return invalid(state, context, 'error.invalid_choice');
    try {
      const headcount = await services.recordHeadcount({
        eventId: event.id,
        sessionDate: event.sessionDate,
        mode: pending.mode,
        counts: pending.counts,
        supersedesId: context.headcountCorrecting ? context.headcount?.id : undefined,
        phoneHash: session.phoneHash,
      });
      return {
        state: 'attendance.headcount.done',
        context: {
          ...context,
          headcount,
          headcountTotal: headcount.total,
          headcountPending: undefined,
          headcountCorrecting: false,
          headcountLastMode:
            pending.mode === 'adults' || pending.mode === 'children'
              ? pending.mode
              : context.headcountLastMode,
          notice: undefined,
        },
        done: false,
      };
    } catch (error) {
      return invalid(state, context, headcountErrorKey(error));
    }
  }

  if (state === 'attendance.headcount.done') {
    return invalid(state, context, 'error.invalid_choice');
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
    // MR-54/MR-55: only the offered action is accepted; a hidden action (already
    // proven or confirmed) is an invalid choice.
    if (
      value !== '1' ||
      !session.member ||
      !session.member.hasUnprovenContact ||
      session.member.confirmed
    ) {
      return invalid(state, context, 'error.invalid_choice');
    }
    try {
      const sent = await services.startVerification(session.member.memberNo);
      return {
        state: 'verify.sent',
        context: { ...context, verification: sent, notice: undefined },
        done: false,
      };
    } catch (error) {
      // The service's refusals are the officer action's: contactless, throttled
      // or no sender. The notice names the one that applies and keeps 9 Back.
      return {
        state: 'verify.sent',
        context: { ...context, verification: undefined, notice: verificationNotice(error) },
        done: false,
      };
    }
  }

  if (state === 'verify.sent') {
    // The notice accepts no digits; 9 and 00 were handled by the back block.
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
        phone: session.phone,
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
