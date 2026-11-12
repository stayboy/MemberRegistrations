import { expect, test as base, type Page, type Request } from 'playwright/test';
import type {
  EventAttendance,
  EventItem,
  EventOfferingItem,
  EventOfferingStatsItem,
  OfferingTermsItem,
} from '../src/api/events';
import type { ChurchOfferingSummary, PledgeItem } from '../src/api/offerings';
import type { OfferingCount } from '../src/api/offering-counts';
import type { ContributionItem } from '../src/api/giving';
import type { Headcount } from '../src/api/ussd';
import type {
  Gender,
  MemberAttendanceSeries,
  MemberContact,
  MemberDetail,
  MemberRelationship,
  MemberShepherding,
  MemberSubscription,
  MemberSummary,
  Ministry,
  MinistryRef,
} from '../src/api/members';
import type { ChurchReport, OfficerSummary, Roster } from '../src/api/shepherding';
import type { OccurrenceListDto, SeriesDto, SeriesSummaryDto } from '../src/api/series';
import type { AccentId, Scheme } from '../src/theme/brand';

export const SESSION_STORAGE_KEY = 'mr.session.v1';
export const THEME_STORAGE_KEY = 'mr.theme.v1';

/** The `vite preview` origin the harness serves the production build from. */
const PREVIEW_ORIGIN = 'http://localhost:4173';

/** 48 characters, well past the 10-character floor `parseSession` enforces. */
export const SESSION_TOKEN = 'e2e-session-credential-0123456789abcdef012345';
/** Fixed far-future expiry: no test reads the real clock to decide "usable". */
const SESSION_EXPIRES_AT = '2099-01-01T00:00:00.000Z';

const FIXED_INSTANT = '2026-01-05T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Seeded browser state
// ---------------------------------------------------------------------------

/**
 * `RequireSession` needs a stored credential. The gateway origin is baked into
 * the build, so the stubs intercept that origin directly (see `GatewayStub`);
 * nothing seeds a gateway URL any more.
 */
export async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    ([sessionKey, token, expiresAt]) => {
      sessionStorage.setItem(sessionKey, JSON.stringify({ token, expiresAt }));
    },
    [SESSION_STORAGE_KEY, SESSION_TOKEN, SESSION_EXPIRES_AT] as const,
  );
}

/** Writes the exact `{ accent, scheme }` shape `readThemePreference` parses. */
export async function seedTheme(page: Page, accent: AccentId, scheme: Scheme): Promise<void> {
  await page.addInitScript(
    ([themeKey, value]) => {
      localStorage.setItem(themeKey, value);
    },
    [THEME_STORAGE_KEY, JSON.stringify({ accent, scheme })] as const,
  );
}

/** Opens a hash route under the preview base (`./` keeps `/MemberRegistrations/`). */
export async function open(page: Page, route: `/${string}`): Promise<void> {
  await page.goto(`./#${route}`);
}

// ---------------------------------------------------------------------------
// Fixture payloads — shapes are checked against the UI wire types
// ---------------------------------------------------------------------------

const MINISTRIES: readonly Ministry[] = [
  { code: 'CHR', name: 'Choir', description: 'Sunday worship choir', active: true },
  {
    code: 'USH',
    name: 'Ushering',
    description: 'Welcome and seating',
    active: true,
  },
];

const CHOIR: MinistryRef = { code: 'CHR', name: 'Choir' };

const CONTACTS_1001: readonly MemberContact[] = [
  {
    id: 'contact-1001-phone',
    kind: 'phone',
    value: '+233 20 000 0001',
    displayOrder: 0,
    ownerMemberNo: 'M-1001',
    linked: false,
  },
  {
    id: 'contact-1001-email',
    kind: 'email',
    value: 'kwame.asante@example.test',
    displayOrder: 0,
    ownerMemberNo: 'M-1001',
    linked: false,
  },
  {
    id: 'contact-1001-whatsapp',
    kind: 'whatsapp',
    value: '+233 20 000 0009',
    displayOrder: 0,
    ownerMemberNo: 'M-1002',
    linked: true,
  },
];

const CONTACTS_1002: readonly MemberContact[] = [
  {
    id: 'contact-1002-phone',
    kind: 'phone',
    value: '+233 20 000 0002',
    displayOrder: 0,
    ownerMemberNo: 'M-1002',
    linked: false,
  },
  {
    id: 'contact-1002-email',
    kind: 'email',
    value: 'ama.mensah@example.test',
    displayOrder: 0,
    ownerMemberNo: 'M-1002',
    linked: false,
  },
];

const SUBSCRIPTIONS_1001: readonly MemberSubscription[] = [
  {
    id: 'subscription-1',
    kind: 'life_insurance',
    scope: 'individual',
    status: 'active',
    reference: 'POL-0001',
    startedOn: '2021-02-01',
    endedOn: null,
    role: 'policyholder',
    policyholderMemberNo: 'M-1001',
    coveredMemberNos: [],
  },
];

const RELATIONSHIPS_1001: readonly MemberRelationship[] = [
  {
    id: 'relationship-1',
    type: 'spouse',
    isDependent: false,
    memberNo: 'M-1002',
    name: 'Ama Mensah',
    gender: 'female',
    age: null,
    archived: false,
  },
];

const ATTENDANCE_1001: readonly MemberAttendanceSeries[] = [
  {
    seriesId: 'series-1',
    seriesName: 'Sunday Service',
    ministry: 'Choir',
    attended: 3,
    expected: 5,
    remaining: 2,
    status: 'ongoing',
    entries: [
      { id: 'attendance-1', date: '2025-12-07', source: 'import' },
      { id: 'attendance-2', date: '2025-12-14', source: 'import' },
      { id: 'attendance-3', date: '2025-12-21', source: 'manual' },
    ],
  },
];

export const MEMBERS: readonly MemberSummary[] = [
  {
    memberNo: 'M-1001',
    firstName: 'Kwame',
    lastName: 'Asante',
    otherNames: null,
    gender: 'male',
    age: 41,
    placeOfResidence: 'Tema',
    joinedOn: '2019-03-03',
    isPresbyter: true,
    archivedAt: null,
    contactCount: 2,
    ministries: [CHOIR],
    subscriptions: [
      {
        id: 'subscription-1',
        kind: 'life_insurance',
        scope: 'individual',
        status: 'active',
        role: 'policyholder',
        policyholderMemberNo: 'M-1001',
        coveredCount: 0,
      },
    ],
  },
  {
    memberNo: 'M-1002',
    firstName: 'Ama',
    lastName: 'Mensah',
    otherNames: null,
    gender: 'female',
    age: null,
    placeOfResidence: 'Accra',
    joinedOn: '2020-07-19',
    isPresbyter: false,
    archivedAt: null,
    contactCount: 2,
    ministries: [],
  },
];

const DETAILS = new Map<string, MemberDetail>([
  [
    'M-1001',
    {
      id: 'member-1001',
      memberNo: 'M-1001',
      firstName: 'Kwame',
      lastName: 'Asante',
      otherNames: null,
      gender: 'male',
      age: 41,
      placeOfResidence: 'Tema',
      joinedOn: '2019-03-03',
      isPresbyter: true,
      archivedAt: null,
      contactCount: 2,
      ministries: [CHOIR],
      maidenName: null,
      alias: null,
      dob: '1985-04-12',
      addressLine: '12 Harbour Road',
      purgedAt: null,
      version: 3,
      createdAt: '2024-01-07T09:30:00.000Z',
      updatedAt: '2024-05-02T11:00:00.000Z',
      contacts: CONTACTS_1001,
      subscriptions: SUBSCRIPTIONS_1001,
      relationships: RELATIONSHIPS_1001,
      attendance: ATTENDANCE_1001,
    },
  ],
  [
    'M-1002',
    {
      id: 'member-1002',
      memberNo: 'M-1002',
      firstName: 'Ama',
      lastName: 'Mensah',
      otherNames: null,
      gender: 'female',
      age: null,
      placeOfResidence: 'Accra',
      joinedOn: '2020-07-19',
      isPresbyter: false,
      archivedAt: null,
      contactCount: 2,
      ministries: [],
      maidenName: null,
      alias: null,
      dob: null,
      addressLine: null,
      purgedAt: null,
      version: 1,
      createdAt: '2024-02-01T08:00:00.000Z',
      updatedAt: '2024-02-01T08:00:00.000Z',
      contacts: CONTACTS_1002,
      subscriptions: [],
      relationships: [],
      attendance: [],
    },
  ],
]);

const EMPTY_OFFERING_STATS: EventOfferingStatsItem = {
  attachedEvents: 0,
  pledgedMinor: 0,
  paidMinor: 0,
  pendingMinor: 0,
  honorRate: 0,
  contributionCount: 0,
};

function offeringTerms(
  version: number,
  name: string,
  overrides: Partial<OfferingTermsItem> = {},
): OfferingTermsItem {
  return {
    version,
    name,
    purpose: `${name} support`,
    kind: 'freewill',
    currency: 'GHS',
    targetMinor: 500_000,
    defaultAmountMinor: 5_000,
    startsOn: '2026-01-01',
    endsOn: null,
    availableUntil: null,
    scripture: 'Malachi 3:10',
    gatewayAccount: 'MR-GATEWAY-001',
    gatewayMetadata: { merchant: 'MR-001', channel: 'ussd' },
    createdAt: '2026-01-01T09:00:00.000Z',
    createdBy: 'officer-1',
    reason: version > 1 ? 'Updated the appeal' : null,
    ...overrides,
  };
}

function eventOffering(
  offeringId: string,
  name: string,
  overrides: Partial<EventOfferingItem> = {},
): EventOfferingItem {
  return {
    offeringId,
    name,
    availableUntil: null,
    expired: false,
    terms: offeringTerms(1, name),
    exceptions: [],
    stats: EMPTY_OFFERING_STATS,
    ...overrides,
  };
}

/** Six offerings so the USSD preview proves the five-row page plus `0 More`. */
const PREVIEW_OFFERINGS: readonly EventOfferingItem[] = [
  eventOffering('offering-1', 'Tithe'),
  eventOffering('offering-2', 'Missions'),
  eventOffering('offering-3', 'Building fund'),
  eventOffering('offering-4', 'Freewill'),
  eventOffering('offering-5', 'Youth appeal'),
  eventOffering('offering-6', 'Welfare appeal'),
];

export const EVENTS: readonly EventItem[] = [
  {
    id: 'event-1',
    eventNo: 'EVT-2026-001',
    name: 'Sunday Service',
    seriesId: 'series-1',
    ministry: CHOIR,
    timezone: 'UTC',
    startDate: '2026-01-04',
    endDate: '2026-01-04',
    startTime: '09:00',
    endTime: '11:00',
    venueType: 'auditorium',
    venueName: 'Main auditorium',
    description: 'Weekly worship service.',
    status: 'held',
    source: 'series',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [
      {
        date: '2026-01-04',
        startTime: '09:00',
        endTime: '11:00',
        status: 'held',
        note: null,
        present: 3,
        expected: 42,
        importedRows: 2,
        capture: null,
        source: 'mixed',
      },
    ],
    offerings: [
      eventOffering('offering-1', 'Tithe', {
        availableUntil: '2026-12-31',
        terms: offeringTerms(1, 'Tithe', { kind: 'tithe' }),
      }),
      eventOffering('offering-2', 'Missions', {
        availableUntil: '2026-12-31',
        terms: offeringTerms(1, 'Missions', { kind: 'missions' }),
      }),
      eventOffering('offering-3', 'Building fund', {
        availableUntil: '2026-06-30',
        expired: true,
        terms: offeringTerms(1, 'Building fund', { kind: 'building' }),
      }),
    ],
    stats: EMPTY_OFFERING_STATS,
  },
  {
    id: 'event-cancelled',
    eventNo: 'EVT-2026-777',
    name: 'Cancelled conference',
    seriesId: null,
    ministry: null,
    timezone: 'UTC',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    startTime: '09:00',
    endTime: '11:00',
    venueType: 'auditorium',
    venueName: 'Main auditorium',
    description: null,
    status: 'cancelled',
    source: 'manual',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [
      {
        date: '2026-06-01',
        startTime: '09:00',
        endTime: '11:00',
        status: 'cancelled',
        note: 'Venue flooded',
        present: 0,
        expected: 0,
        importedRows: 0,
        capture: null,
        source: 'none',
      },
      {
        // A legacy cancellation written before the reason rule (FR-4a/AC-6a).
        date: '2026-06-02',
        startTime: '09:00',
        endTime: '11:00',
        status: 'cancelled',
        note: null,
        present: 0,
        expected: 0,
        importedRows: 0,
        capture: null,
        source: 'none',
      },
    ],
    offerings: [],
    stats: EMPTY_OFFERING_STATS,
  },
  {
    id: 'event-2',
    eventNo: 'EVT-2026-002',
    name: 'Leaders retreat',
    seriesId: null,
    ministry: null,
    timezone: 'UTC',
    startDate: '2026-01-10',
    endDate: '2026-01-11',
    startTime: '08:30',
    endTime: null,
    venueType: 'hybrid',
    venueName: 'Conference room',
    description: null,
    status: 'scheduled',
    source: 'manual',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [
      {
        date: '2026-01-10',
        startTime: '08:30',
        endTime: null,
        status: 'scheduled',
        note: null,
        present: 0,
        expected: 12,
        importedRows: 0,
        capture: null,
        source: 'none',
      },
      {
        date: '2026-01-11',
        startTime: '08:30',
        endTime: null,
        status: 'scheduled',
        note: null,
        present: 0,
        expected: 12,
        importedRows: 0,
        capture: null,
        source: 'none',
      },
    ],
    offerings: [],
    stats: EMPTY_OFFERING_STATS,
  },
  {
    id: 'event-offerings',
    eventNo: 'EVT-2999-777',
    name: 'Foundation service',
    seriesId: null,
    ministry: null,
    timezone: 'UTC',
    startDate: '2999-01-10',
    endDate: '2999-01-10',
    startTime: '09:00',
    endTime: '11:00',
    venueType: 'auditorium',
    venueName: 'Main auditorium',
    description: null,
    status: 'scheduled',
    source: 'manual',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [
      {
        date: '2999-01-10',
        startTime: '09:00',
        endTime: '11:00',
        status: 'scheduled',
        note: null,
        present: 0,
        expected: 10,
        importedRows: 0,
        capture: null,
        source: 'none',
      },
    ],
    offerings: PREVIEW_OFFERINGS,
    stats: EMPTY_OFFERING_STATS,
  },
];

/**
 * The landing aggregate. Amounts are integer minor units; the by-member rows are
 * the top 10 by paid and visitor money is separate. Pledge counts come as at the
 * report date.
 */
const OFFERINGS_SUMMARY: ChurchOfferingSummary = {
  from: '2026-01-01',
  to: '2026-12-31',
  currency: 'GHS',
  totalPaidMinor: 1_245_000,
  totalPledgedMinor: 480_000,
  totalOutstandingMinor: 180_000,
  countedMinor: 1_200_000,
  varianceMinor: -80_000,
  visitors: { count: 3, paidMinor: 35_000 },
  members: [
    {
      memberNo: 'M-1001',
      name: 'Kwame Asante',
      paidMinor: 720_000,
      pledgedMinor: 300_000,
      outstandingMinor: 100_000,
      lastGivenOn: '2026-01-04',
    },
    {
      memberNo: 'M-1002',
      name: 'Ama Mensah',
      paidMinor: 525_000,
      pledgedMinor: 180_000,
      outstandingMinor: 80_000,
      lastGivenOn: '2026-01-03',
    },
  ],
  offerings: [
    {
      offeringId: 'offering-1',
      name: 'Tithe',
      paidMinor: 900_000,
      pledgedMinor: 300_000,
      outstandingMinor: 100_000,
      countedMinor: 900_000,
    },
    {
      offeringId: 'offering-2',
      name: 'Missions',
      paidMinor: 345_000,
      pledgedMinor: 180_000,
      outstandingMinor: 80_000,
      countedMinor: 300_000,
    },
  ],
  events: [
    {
      eventId: 'event-1',
      name: 'Sunday Service',
      paidMinor: 1_045_000,
      pledgedMinor: 300_000,
      outstandingMinor: 100_000,
      countedMinor: 1_045_000,
    },
    {
      eventId: 'event-2',
      name: 'Leaders retreat',
      paidMinor: 200_000,
      pledgedMinor: 180_000,
      outstandingMinor: 80_000,
      countedMinor: 155_000,
    },
  ],
  pledges: { pending: 2, honored: 1, dishonored: 0, overdue: 1 },
};

const PLEDGES: readonly PledgeItem[] = [
  {
    id: 'pledge-1',
    memberNo: 'M-1001',
    memberName: 'Kwame Asante',
    offeringId: 'offering-1',
    offeringName: 'Tithe',
    eventId: 'event-1',
    sessionDate: '2026-01-04',
    amountMinor: 100_000,
    currency: 'GHS',
    expectedOn: '2026-02-01',
    followUpOfficerMemberNo: 'M-1002',
    officerName: 'Ama Mensah',
    status: 'pending',
    reason: null,
    nextReminder: '2026-01-25',
    settledContributionId: null,
    termsVersion: 1,
    idempotencyKey: 'pledge-key-1',
    createdAt: '2026-01-05T10:00:00.000Z',
  },
  {
    id: 'pledge-2',
    memberNo: 'M-1002',
    memberName: 'Ama Mensah',
    offeringId: 'offering-2',
    offeringName: 'Missions',
    eventId: 'event-2',
    sessionDate: null,
    amountMinor: 80_000,
    currency: 'GHS',
    expectedOn: '2026-01-01',
    followUpOfficerMemberNo: 'M-1001',
    officerName: 'Kwame Asante',
    status: 'overdue',
    reason: null,
    nextReminder: null,
    settledContributionId: null,
    termsVersion: 1,
    idempotencyKey: 'pledge-key-2',
    createdAt: '2025-12-20T10:00:00.000Z',
  },
  {
    id: 'pledge-3',
    memberNo: 'M-1001',
    memberName: 'Kwame Asante',
    offeringId: 'offering-1',
    offeringName: 'Tithe',
    eventId: 'event-1',
    sessionDate: '2026-01-04',
    amountMinor: 60_000,
    currency: 'GHS',
    expectedOn: '2026-01-10',
    followUpOfficerMemberNo: 'M-1002',
    officerName: 'Ama Mensah',
    status: 'honored',
    reason: null,
    nextReminder: null,
    settledContributionId: 'contribution-1',
    termsVersion: 1,
    idempotencyKey: 'pledge-key-3',
    createdAt: '2025-12-28T10:00:00.000Z',
  },
];

const CONTRIBUTIONS: readonly ContributionItem[] = [
  {
    id: 'contribution-e2e-seed',
    memberNo: 'M-1001',
    visitorName: null,
    offeringId: 'offering-1',
    eventId: 'event-offerings',
    sessionDate: '2999-01-10',
    amountMinor: 50_000,
    currency: 'GHS',
    channel: 'manual',
    status: 'paid',
    reference: 'MR-E2E0000000',
    idempotencyKey: 'manual-gift:seed',
    termsVersion: 1,
    createdAt: FIXED_INSTANT,
  },
];

const OFFERING_COUNTS: readonly OfferingCount[] = [
  {
    id: 'offering-count-1',
    eventId: 'event-offerings',
    offeringId: 'offering-1',
    sessionDate: '2999-01-10',
    asOf: '2999-01-10T09:00:00.000Z',
    currency: 'GHS',
    termsVersion: 1,
    lines: [{ denominationMinor: 2000, pieces: 39 }],
    totalMinor: 78_000,
    recordedAt: '2999-01-10T09:05:00.000Z',
    recordedBy: 'officer-1',
    supersedesId: null,
    supersededBy: 'offering-count-2',
  },
  {
    id: 'offering-count-2',
    eventId: 'event-offerings',
    offeringId: 'offering-1',
    sessionDate: '2999-01-10',
    asOf: '2999-01-10T09:00:00.000Z',
    currency: 'GHS',
    termsVersion: 1,
    lines: [
      { denominationMinor: 2000, pieces: 40 },
      { denominationMinor: 1000, pieces: 40 },
    ],
    totalMinor: 120_000,
    recordedAt: '2999-01-10T09:10:00.000Z',
    recordedBy: 'officer-2',
    supersedesId: 'offering-count-1',
    supersededBy: null,
  },
];

const HEADCOUNTS: readonly Headcount[] = [
  {
    id: 'headcount-1',
    eventId: 'event-offerings',
    sessionDate: '2999-01-10',
    asOf: '2999-01-10T09:02:00.000Z',
    mode: 'adults',
    adultMale: 58,
    adultFemale: 71,
    adultUnspecified: 0,
    childMale: 0,
    childFemale: 0,
    childUnspecified: 9,
    total: 138,
    ended: false,
    recordedBy: 'officer-1',
    recordedAt: '2999-01-10T09:04:00.000Z',
    supersedesId: null,
    supersededBy: 'headcount-2',
  },
  {
    id: 'headcount-2',
    eventId: 'event-offerings',
    sessionDate: '2999-01-10',
    asOf: '2999-01-10T09:08:00.000Z',
    mode: 'adults',
    adultMale: 62,
    adultFemale: 71,
    adultUnspecified: 0,
    childMale: 0,
    childFemale: 0,
    childUnspecified: 9,
    total: 142,
    ended: false,
    recordedBy: 'officer-2',
    recordedAt: '2999-01-10T09:10:00.000Z',
    supersedesId: 'headcount-1',
    supersededBy: null,
  },
];

/** The register-derived roster shown beside the Foundation service headcount. */
const HEADCOUNT_ATTENDANCE: EventAttendance = {
  eventId: 'event-offerings',
  sessionDate: '2999-01-10',
  present: 0,
  expected: 160,
  importedRows: 0,
  rows: [],
};

const SERIES: readonly SeriesDto[] = [
  {
    id: 'series-1',
    name: 'Sunday Service',
    ministry: CHOIR,
    timezone: 'UTC',
    description: 'Weekly worship service.',
    archivedAt: null,
    schedules: [
      { effectiveFrom: '2025-01-05', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
      {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-12-27',
      },
    ],
    exceptions: [
      { date: '2026-01-11', kind: 'cancelled', note: 'Public holiday' },
      // A legacy cancellation written before the reason rule (FR-7/AC-6a).
      { date: '2026-02-01', kind: 'cancelled', note: null },
    ],
  },
  {
    id: 'series-2',
    name: 'Bible Study',
    ministry: null,
    timezone: 'Africa/Accra',
    description: null,
    archivedAt: null,
    schedules: [{ effectiveFrom: '2025-02-19', rrule: 'FREQ=MONTHLY;BYMONTHDAY=15', endsOn: null }],
    exceptions: [],
  },
];

const OCCURRENCES: Readonly<Record<string, readonly string[]>> = {
  'series-1': ['2026-01-04', '2026-01-18', '2026-01-25'],
  'series-2': ['2026-01-15'],
};

const SERIES_SUMMARIES: Record<string, Omit<SeriesSummaryDto, 'from' | 'to'>> = {
  'series-1': {
    nextOccurrence: '2026-01-04',
    attendance: {
      memberSessions: { held: 3, expected: 12, present: 9, rate: 0.75 },
      lastHeld: { date: '2026-01-25', expected: 4, present: 3 },
      headcountSessions: { held: 0 },
      cancelled: 1,
      upcoming: 0,
    },
    offerings: {
      attachedCount: 2,
      currency: 'GHS',
      paidMinor: 560000,
      pledgedMinor: 3400000,
      outstandingMinor: 3400000,
      countedMinor: 0,
      visitors: { count: 0, paidMinor: 0 },
    },
  },
};

const EMPTY_SUMMARY: Omit<SeriesSummaryDto, 'from' | 'to'> = {
  nextOccurrence: null,
  attendance: {
    memberSessions: { held: 0, expected: 0, present: 0, rate: null },
    lastHeld: null,
    headcountSessions: { held: 0 },
    cancelled: 0,
    upcoming: 0,
  },
  offerings: {
    attachedCount: 0,
    currency: 'GHS',
    paidMinor: 0,
    pledgedMinor: 0,
    outstandingMinor: 0,
    countedMinor: 0,
    visitors: { count: 0, paidMinor: 0 },
  },
};

const ATTENDANCE_EVENT_1: EventAttendance = {
  eventId: 'event-1',
  sessionDate: '2026-01-04',
  present: 3,
  expected: 42,
  importedRows: 2,
  rows: [
    {
      id: 'attendance-row-1',
      memberNo: 'M-1001',
      name: 'Kwame Asante',
      gender: 'male',
      age: 41,
      status: 'present',
      source: 'import',
      sessionTime: '09:05',
    },
    {
      id: 'attendance-row-2',
      memberNo: 'M-1002',
      name: 'Ama Mensah',
      gender: 'female',
      age: null,
      status: 'present',
      source: 'import',
      sessionTime: '09:07',
    },
    {
      id: 'attendance-row-3',
      memberNo: 'M-1003',
      name: 'Yaw Owusu',
      gender: 'male',
      age: 35,
      status: 'present',
      source: 'manual',
      sessionTime: null,
    },
  ],
};

const OFFICER = {
  officerId: 'officer-1',
  name: 'Efua Boateng',
  email: 'efua.boateng@example.test',
  actorId: 'officer-1',
  expiresAt: SESSION_EXPIRES_AT,
};

const SHEPHERDING_ROSTER_SUMMARY: OfficerSummary = {
  memberNo: 'M-1001',
  name: 'Kwame Asante',
  gender: 'male',
  age: 41,
  assignedMembers: 4,
  attempts: 4,
  conversations: 3,
  lastCalledOn: '2026-01-04',
  membersNeverCalled: 1,
};

const CHURCH_REPORT: ChurchReport = {
  from: '2025-10-03',
  to: '2026-01-04',
  totals: {
    officers: 1,
    activeMembers: 4,
    assignedMembers: 4,
    unassignedMembers: 0,
    attempts: 4,
    conversations: 3,
    membersNeverCalled: 1,
    stillInChurch: { yes: 3, no: 0, unknown: 0, neverReported: 1 },
  },
  officers: [SHEPHERDING_ROSTER_SUMMARY],
};

const ROSTER: Roster = {
  officerMemberNo: 'M-1001',
  from: '2025-10-03',
  to: '2026-01-04',
  items: [
    {
      assignmentId: 'assignment-1',
      assignedOn: '2025-06-01',
      memberNo: 'M-1002',
      name: 'Ama Mensah',
      gender: 'female',
      age: null,
      placeOfResidence: 'Accra',
      contactCount: CONTACTS_1002.length,
      attempts: 2,
      conversations: 1,
      lastCalledOn: '2026-01-02',
      lastOutcome: 'reached',
      stillInChurch: 'yes',
      latestFeedback: 'Settling in well after the move.',
      latestIssue: null,
    },
    {
      assignmentId: 'assignment-2',
      assignedOn: '2025-08-17',
      memberNo: 'M-1003',
      name: 'Yaw Owusu',
      gender: 'male',
      age: 35,
      placeOfResidence: 'Tema',
      contactCount: 1,
      attempts: 1,
      conversations: 1,
      lastCalledOn: '2025-12-20',
      lastOutcome: 'reached',
      stillInChurch: 'yes',
      latestFeedback: 'Asked for a follow-up visit.',
      latestIssue: 'Missed two Sundays.',
    },
    {
      assignmentId: 'assignment-3',
      assignedOn: '2025-11-02',
      memberNo: 'M-1005',
      name: 'Adjoa Boateng',
      gender: 'female',
      age: 29,
      placeOfResidence: 'Takoradi',
      contactCount: 1,
      attempts: 1,
      conversations: 1,
      lastCalledOn: '2026-01-04',
      lastOutcome: 'reached',
      stillInChurch: 'yes',
      latestFeedback: 'Grateful for the prayer visit.',
      latestIssue: null,
    },
    {
      assignmentId: 'assignment-4',
      assignedOn: '2025-11-09',
      memberNo: 'M-1006',
      name: 'Kojo Antwi',
      gender: 'male',
      age: 52,
      placeOfResidence: 'Kumasi',
      contactCount: 0,
      attempts: 0,
      conversations: 0,
      lastCalledOn: null,
      lastOutcome: null,
      stillInChurch: null,
      latestFeedback: null,
      latestIssue: null,
    },
  ],
};

const MEMBER_SHEPHERDING: MemberShepherding = {
  memberNo: 'M-1002',
  name: 'Ama Mensah',
  gender: 'female',
  age: null,
  shepherd: {
    assignmentId: 'assignment-1',
    memberNo: 'M-1001',
    name: 'Kwame Asante',
    gender: 'male',
    age: 41,
    assignedOn: '2025-06-01',
  },
  history: [],
  calls: { attempts: 2, conversations: 1, lastCalledOn: '2026-01-02' },
  stillInChurch: 'yes',
  latestFeedback: null,
  latestIssue: null,
  recentCalls: [],
};

const IMPORT_FORMATS = {
  formats: [
    {
      kind: 'members',
      filename: 'members.xlsx',
      columns: [
        { name: 'memberNo', required: true, type: 'text', example: 'M-1001' },
        { name: 'firstName', required: true, type: 'text', example: 'Kwame' },
        { name: 'lastName', required: true, type: 'text', example: 'Asante' },
      ],
    },
    {
      kind: 'attendance',
      filename: 'attendance.xlsx',
      columns: [
        { name: 'memberNo', required: true, type: 'text', example: 'M-1001' },
        { name: 'datetime', required: false, type: 'date', example: '2026-01-04 09:05' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// The stubbed gateway
// ---------------------------------------------------------------------------

interface GatewayCall {
  readonly method: string;
  readonly path: string;
  readonly search: URLSearchParams;
  readonly body: unknown;
}

interface GatewayReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

interface RouteEntry {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly pattern: RegExp;
  readonly handle: (call: GatewayCall, params: readonly string[]) => GatewayReply;
}

function reply(body: unknown, status = 200, headers: Record<string, string> = {}): GatewayReply {
  return { body, status, headers };
}

function problem(status: number, detail: string): GatewayReply {
  return reply({ type: 'about:blank', title: 'Request failed', status, detail }, status);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function gender(value: unknown): Gender {
  return value === 'male' || value === 'female' || value === 'other' || value === 'undisclosed'
    ? value
    : 'undisclosed';
}

function parseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function createdDetail(input: unknown): MemberDetail {
  const body = asRecord(input);
  const memberNo = text(body.memberNo);

  return {
    id: `created-${memberNo}`,
    memberNo,
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    otherNames: optionalText(body.otherNames),
    gender: gender(body.gender),
    age: null,
    placeOfResidence: optionalText(body.placeOfResidence),
    joinedOn: optionalText(body.joinedOn),
    isPresbyter: body.isPresbyter === true,
    archivedAt: null,
    contactCount: 0,
    ministries: [],
    maidenName: optionalText(body.maidenName),
    alias: optionalText(body.alias),
    dob: optionalText(body.dob),
    addressLine: optionalText(body.addressLine),
    purgedAt: null,
    version: 1,
    createdAt: FIXED_INSTANT,
    updatedAt: FIXED_INSTANT,
    contacts: [],
    subscriptions: [],
    relationships: [],
    attendance: [],
  };
}

/**
 * Routes are matched by method + path, most specific first. The query string is
 * available to handlers but never part of the key: one fixture serves every
 * window the pages ask for, so no assertion depends on today's date.
 */
function buildRoutes(created: Map<string, MemberDetail>): readonly RouteEntry[] {
  const pledgeState = new Map<string, PledgeItem>(PLEDGES.map((pledge) => [pledge.id, pledge]));
  const contributionState = new Map<string, ContributionItem>(
    CONTRIBUTIONS.map((contribution) => [contribution.id, contribution]),
  );
  const offeringCountState = new Map<string, OfferingCount>(
    OFFERING_COUNTS.map((count) => [count.id, count]),
  );
  let offeringCountSeq = OFFERING_COUNTS.length;
  const headcountState = new Map<string, Headcount>(
    HEADCOUNTS.map((headcount) => [headcount.id, headcount]),
  );
  let headcountSeq = HEADCOUNTS.length;

  return [
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/members$/,
      handle: () => reply({ items: MEMBERS }),
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/members$/,
      handle: (call) => {
        const detail = createdDetail(call.body);
        if (!detail.memberNo) return problem(422, 'memberNo is required');
        if (created.has(detail.memberNo) || DETAILS.has(detail.memberNo)) {
          return problem(409, `A member with number ${detail.memberNo} already exists`);
        }
        created.set(detail.memberNo, detail);
        return reply(detail, 201, { Location: `/v1/members/${detail.memberNo}` });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/members\/([^/]+)\/shepherding$/,
      handle: (_call, [memberNo]) => {
        const detail = DETAILS.get(memberNo!);
        if (!detail) return problem(404, `Member ${memberNo} was not found`);
        return reply({ ...MEMBER_SHEPHERDING, memberNo: detail.memberNo, name: detail.firstName });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/members\/([^/]+)$/,
      handle: (_call, [memberNo]) => {
        const detail = DETAILS.get(memberNo!) ?? created.get(memberNo!);
        if (!detail) return problem(404, `Member ${memberNo} was not found`);
        return reply(detail, 200, { ETag: `"v${detail.version}"` });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/ministries$/,
      handle: () => reply({ items: MINISTRIES }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/offerings\/summary$/,
      handle: () => reply(OFFERINGS_SUMMARY),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/offerings\/([^/]+)\/terms$/,
      handle: (_call, [offeringId]) => {
        const name =
          OFFERINGS_SUMMARY.offerings.find((offering) => offering.offeringId === offeringId)
            ?.name ?? 'Offering';
        return reply({ items: [offeringTerms(2, name)] });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/pledges$/,
      handle: () => reply({ items: [...pledgeState.values()] }),
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/pledges\/([^/]+)\/reassign$/,
      handle: (call, [pledgeId]) => {
        const current = pledgeState.get(pledgeId!);
        if (!current) return problem(404, `Pledge ${pledgeId} was not found`);
        const body = asRecord(call.body);
        const officerMemberNo = text(body.officerMemberNo).trim();
        const reason = text(body.reason).trim();
        if (!officerMemberNo || reason.length < 3) {
          return problem(422, 'officerMemberNo and a reason are required');
        }
        const updated: PledgeItem = {
          ...current,
          followUpOfficerMemberNo: officerMemberNo,
          officerName: officerMemberNo,
        };
        pledgeState.set(current.id, updated);
        return reply(updated);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/events$/,
      handle: () => reply({ items: EVENTS }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/attendance$/,
      handle: (call, [eventId]) => {
        const date =
          call.search.get('date') ??
          (eventId === 'event-offerings'
            ? HEADCOUNT_ATTENDANCE.sessionDate
            : ATTENDANCE_EVENT_1.sessionDate);
        if (eventId === 'event-offerings') {
          return reply({ ...HEADCOUNT_ATTENDANCE, sessionDate: date });
        }
        if (eventId !== ATTENDANCE_EVENT_1.eventId) {
          return problem(404, `Event ${eventId} was not found`);
        }
        return reply({ ...ATTENDANCE_EVENT_1, sessionDate: date });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/events\/([^/]+)$/,
      handle: (_call, [eventId]) => {
        const event = EVENTS.find((candidate) => candidate.id === eventId);
        if (!event) return problem(404, `Event ${eventId} was not found`);
        return reply(event, 200, { ETag: '"e2e-event"' });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/headcounts$/,
      handle: (call) => {
        const sessionDate = call.search.get('sessionDate') ?? '';
        const observations = [...headcountState.values()]
          .filter((headcount) => headcount.sessionDate === sessionDate)
          .sort(
            (left, right) =>
              right.asOf.localeCompare(left.asOf) ||
              right.recordedAt.localeCompare(left.recordedAt) ||
              right.id.localeCompare(left.id),
          );
        const current = observations.find((headcount) => headcount.supersededBy === null) ?? null;
        return reply({ sessionDate, current, observations });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/headcounts$/,
      handle: (call, [eventId]) => {
        const body = asRecord(call.body);
        const sessionDate = text(body.sessionDate) || '2999-01-10';
        const mode = text(body.mode);
        if (mode !== 'adults' && mode !== 'children' && mode !== 'mixed') {
          return problem(422, 'mode must be adults, children or mixed');
        }
        const buckets = {
          adultMale: Number(body.adultMale ?? 0),
          adultFemale: Number(body.adultFemale ?? 0),
          adultUnspecified: Number(body.adultUnspecified ?? 0),
          childMale: Number(body.childMale ?? 0),
          childFemale: Number(body.childFemale ?? 0),
          childUnspecified: Number(body.childUnspecified ?? 0),
        };
        const total = Object.values(buckets).reduce((sum, value) => sum + value, 0);
        if (total > 30_000) return problem(422, 'The six buckets must not exceed 30,000.');

        const supersedesId = optionalText(body.supersedesId);
        const target = supersedesId ? headcountState.get(supersedesId) : undefined;
        if (supersedesId && (!target || target.supersededBy !== null)) {
          return problem(422, 'supersedesId must name the current observation');
        }
        const asOf = target?.asOf ?? (text(body.asOf) || `${sessionDate}T09:00:00.000Z`);
        if (!asOf.startsWith(sessionDate)) {
          return problem(422, 'asOf must fall within the session day');
        }

        headcountSeq += 1;
        const id = `headcount-${headcountSeq}`;
        const headcount: Headcount = {
          id,
          eventId: eventId!,
          sessionDate,
          asOf,
          mode,
          ...buckets,
          total,
          ended: false,
          recordedBy: 'officer-1',
          recordedAt: `${sessionDate}T09:12:00.000Z`,
          supersedesId: target?.id ?? null,
          supersededBy: null,
        };

        if (target) headcountState.set(target.id, { ...target, supersededBy: id });
        headcountState.set(id, headcount);
        return reply(headcount, 201);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/offering-counts$/,
      handle: (call) => {
        const sessionDate = call.search.get('sessionDate') ?? '';
        const offeringId = call.search.get('offeringId') ?? '';
        const observations = [...offeringCountState.values()]
          .filter((count) => count.sessionDate === sessionDate && count.offeringId === offeringId)
          .sort(
            (left, right) =>
              right.asOf.localeCompare(left.asOf) ||
              right.recordedAt.localeCompare(left.recordedAt) ||
              right.id.localeCompare(left.id),
          );
        const current = observations.find((count) => count.supersededBy === null) ?? null;
        return reply({ current, observations });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/offering-counts$/,
      handle: (call, [eventId]) => {
        const body = asRecord(call.body);
        const sessionDate = text(body.sessionDate) || '2999-01-10';
        const rawLines = Array.isArray(body.lines) ? body.lines : [];
        const lines = rawLines.map((line) => {
          const record = asRecord(line);
          return {
            denominationMinor: Number(record.denominationMinor ?? 0),
            pieces: Number(record.pieces ?? 0),
          };
        });
        if (lines.length === 0 || lines.length > 50) {
          return problem(422, 'A count needs 1 to 50 denomination lines');
        }
        if (lines.some((line) => line.denominationMinor <= 0 || line.pieces <= 0)) {
          return problem(422, 'A count needs positive denomination lines');
        }
        if (new Set(lines.map((line) => line.denominationMinor)).size !== lines.length) {
          return problem(422, 'Each denomination appears once per count');
        }
        const totalMinor = lines.reduce(
          (sum, line) => sum + line.denominationMinor * line.pieces,
          0,
        );
        if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
          return problem(422, 'The counted total must be positive and safe');
        }
        const supersedesId = optionalText(body.supersedesId);
        const target = supersedesId ? offeringCountState.get(supersedesId) : undefined;
        if (supersedesId && (!target || target.supersededBy !== null)) {
          return problem(422, 'supersedesId must name the current observation');
        }
        const asOf = target?.asOf ?? (text(body.asOf) || `${sessionDate}T09:00:00.000Z`);
        if (!asOf.startsWith(sessionDate)) {
          return problem(422, 'asOf must fall within the session day');
        }

        offeringCountSeq += 1;
        const id = `offering-count-${offeringCountSeq}`;
        const count: OfferingCount = {
          id,
          eventId: eventId!,
          offeringId: text(body.offeringId) || 'offering-1',
          sessionDate,
          asOf,
          currency: text(body.currency) || 'GHS',
          termsVersion: 1,
          lines,
          totalMinor,
          recordedAt: FIXED_INSTANT,
          recordedBy: 'officer-1',
          supersedesId: target?.id ?? null,
          supersededBy: null,
        };

        if (target) offeringCountState.set(target.id, { ...target, supersededBy: id });
        offeringCountState.set(id, count);
        return reply(count, 201);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/contributions$/,
      handle: (call) => {
        const eventId = call.search.get('eventId');
        const offeringId = call.search.get('offeringId');
        const from = call.search.get('from');
        const to = call.search.get('to');
        const items = [...contributionState.values()].filter(
          (contribution) =>
            (!eventId || contribution.eventId === eventId) &&
            (!offeringId || contribution.offeringId === offeringId) &&
            (!from || contribution.sessionDate >= from) &&
            (!to || contribution.sessionDate <= to),
        );
        return reply({ items });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/contributions$/,
      handle: (call) => {
        const body = asRecord(call.body);
        const contribution: ContributionItem = {
          id: 'contribution-e2e-1',
          memberNo: text(body.memberNo) || null,
          visitorName: null,
          offeringId: text(body.offeringId),
          eventId: text(body.eventId),
          sessionDate: text(body.sessionDate),
          amountMinor: Number(body.amountMinor ?? 0),
          currency: 'GHS',
          channel: 'manual',
          status: 'paid',
          reference: 'MR-E2E0000001',
          idempotencyKey: text(body.idempotencyKey),
          termsVersion: 1,
          createdAt: FIXED_INSTANT,
        };
        contributionState.set(contribution.id, contribution);
        return reply(contribution, 201);
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/pledges$/,
      handle: (call) => {
        const body = asRecord(call.body);
        const pledge: PledgeItem = {
          ...PLEDGES[0]!,
          id: 'pledge-e2e-new',
          memberNo: text(body.memberNo),
          memberName: text(body.memberNo),
          offeringId: text(body.offeringId),
          offeringName: 'Tithe',
          eventId: text(body.eventId),
          sessionDate: optionalText(body.sessionDate),
          amountMinor: Number(body.amountMinor ?? 0),
          currency: 'GHS',
          expectedOn: text(body.expectedOn),
          followUpOfficerMemberNo: text(body.followUpOfficerMemberNo) || 'M-1001',
          officerName: text(body.followUpOfficerMemberNo) || 'Kwame Asante',
          status: 'pending',
          reason: null,
          nextReminder: null,
          settledContributionId: null,
          idempotencyKey: text(body.idempotencyKey),
        };
        return reply(pledge, 201);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/series$/,
      handle: () => reply({ items: SERIES }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/series\/([^/]+)\/summary$/,
      handle: (call, [seriesId]) => {
        const summary = SERIES_SUMMARIES[seriesId!] ?? EMPTY_SUMMARY;
        return reply({
          from: call.search.get('from') ?? '',
          to: call.search.get('to') ?? '',
          ...summary,
        });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/series\/([^/]+)\/occurrences$/,
      handle: (call, [seriesId]) => {
        const from = call.search.get('from') ?? '';
        const to = call.search.get('to') ?? '';
        const occurrence: OccurrenceListDto = {
          seriesId: seriesId!,
          from,
          to,
          dates: OCCURRENCES[seriesId!] ?? [],
        };
        return reply(occurrence);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/series\/([^/]+)$/,
      handle: (_call, [seriesId]) => {
        const series = SERIES.find((candidate) => candidate.id === seriesId);
        if (!series) return problem(404, `Series ${seriesId} was not found`);
        return reply(series);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/imports\/formats$/,
      handle: () => reply(IMPORT_FORMATS),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/shepherding\/officers$/,
      handle: () => reply({ items: [SHEPHERDING_ROSTER_SUMMARY] }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/shepherding\/officers\/([^/]+)\/members$/,
      handle: () => reply(ROSTER),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/shepherding\/report$/,
      handle: () => reply(CHURCH_REPORT),
    },
  ];
}

class GatewayStub {
  private readonly created = new Map<string, MemberDetail>();
  private readonly routes: readonly RouteEntry[] = buildRoutes(this.created);
  private readonly unmatched: string[] = [];

  /**
   * The origin is baked into the build, so every gateway call from the preview
   * server is cross-origin, and the `Authorization` header makes it non-simple:
   * Chromium sends a preflight and discards a response without a matching
   * `Access-Control-Allow-Origin`. Answer both before the app sees anything.
   */
  private static cors(request: Request): Record<string, string> {
    return {
      'access-control-allow-origin': request.headers()['origin'] ?? PREVIEW_ORIGIN,
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, if-match',
      'access-control-max-age': '600',
      vary: 'origin',
    };
  }

  async install(page: Page): Promise<void> {
    // The connection badge probes the base URL directly, outside the gateway
    // prefix; answer it so every screen is in its connected state.
    await page.route('**/health', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: GatewayStub.cors(request) });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...GatewayStub.cors(request), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ok' }),
      });
    });

    // The session gateway's auth routes live at `/auth/*`, not under
    // `/gateway/v1/*`: `fetchMe` calls `${baseUrl}/auth/me`.
    await page.route('**/auth/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = GatewayStub.cors(request);

      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }

      if (request.method() === 'GET' && url.pathname === '/auth/me') {
        await route.fulfill({
          status: 200,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify(OFFICER),
        });
        return;
      }

      if (request.method() === 'POST' && url.pathname === '/auth/logout') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }

      const unmatched = `${request.method()} ${url.pathname}${url.search}`;
      this.unmatched.push(unmatched);
      await route.fulfill({
        status: 500,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Unstubbed gateway route',
          status: 500,
          detail: unmatched,
        }),
      });
    });

    await page.route('**/gateway/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const cors = GatewayStub.cors(request);

      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }

      const call: GatewayCall = {
        method: request.method(),
        path: url.pathname,
        search: url.searchParams,
        body: parseJson(request.postData()),
      };

      const entry = this.routes.find(
        (candidate) => candidate.method === call.method && candidate.pattern.test(call.path),
      );

      if (!entry) {
        const unmatched = `${call.method} ${url.pathname}${url.search}`;
        this.unmatched.push(unmatched);
        await route.fulfill({
          status: 500,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Unstubbed gateway route',
            status: 500,
            detail: unmatched,
          }),
        });
        return;
      }

      const params = entry.pattern.exec(call.path)?.slice(1).map(decodeURIComponent) ?? [];
      const result = entry.handle(call, params);
      await route.fulfill({
        status: result.status ?? 200,
        headers: {
          ...cors,
          'content-type': 'application/json',
          ...result.headers,
        },
        body: result.body === undefined ? undefined : JSON.stringify(result.body),
      });
    });
  }

  assertNoUnmatched(): void {
    if (this.unmatched.length === 0) return;
    throw new Error(`Unstubbed gateway request(s):\n${this.unmatched.join('\n')}`);
  }
}

/**
 * `auto: true` installs the stub for every test and, at teardown, fails the test
 * when any request fell outside the fixture router. The net covers
 * `/gateway/v1/**` and `/auth/**`, which together are the app's full API
 * surface; `/health` is answered separately.
 */
export const test = base.extend<{ gateway: GatewayStub }>({
  gateway: [
    async ({ page }, use) => {
      const gateway = new GatewayStub();
      await gateway.install(page);
      await use(gateway);
      gateway.assertNoUnmatched();
    },
    { auto: true },
  ],
});

export { expect };
