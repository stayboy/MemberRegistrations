import { expect, test as base, type Page, type Request } from 'playwright/test';
import type { AudienceClauseInput, AudienceItem, AudienceOperator } from '../src/api/audiences';
import type {
  EventAttendance,
  EventAudienceItem,
  EventItem,
  EventOccurrenceItem,
  EventOfferingItem,
  EventOfferingStatsItem,
  EventParentItem,
  EventParentStatus,
  EventRecurrence,
  EventSessionStatus,
  EventVenueType,
  OfferingTermsItem,
  PeriodDay,
  SessionSource,
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
import { dateInZone } from '../src/format/capture';
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

/** Every stored value as one string per entry; no key name is assumed. */
export async function storedValues(page: Page): Promise<{ session: string; local: string }> {
  return page.evaluate(() => {
    const dump = (storage: Storage): string => {
      const values: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? '';
        values.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
      return values.join('\n');
    };
    return { session: dump(sessionStorage), local: dump(localStorage) };
  });
}

/** Opens a hash route under the preview base (`./` keeps `/MemberRegistrations/`). */
export async function open(page: Page, route: `/${string}`): Promise<void> {
  await page.goto(`./#${route}`);
}

/**
 * FR-9a: a page with two or more action-row verbs renders them inside one `Actions` menu at
 * the breadcrumb row's right edge; a page with exactly one renders that verb as a visible
 * button and no menu. Opens the menu; the caller reads the verb it clicks from the page
 * (`page.getByRole('menuitem', { name: … })`), so this returns nothing.
 */
export async function openActions(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Actions' }).click();
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

const CHOIR: MinistryRef = { code: 'CHR', name: 'Choir', position: null };

/** The reference list the title picker reads (MR-12). */
const PRESBYTER_TITLES = [
  { code: 'pastor', label: 'Pastor', genderRestriction: null, active: true },
  { code: 'elder', label: 'Elder', genderRestriction: 'male', active: true },
  { code: 'deaconess', label: 'Deaconess', genderRestriction: 'female', active: true },
];

/** The adults the guardian picker offers (MR-40); each resolves to a masked contact. */
const GUARDIAN_CANDIDATES = [
  { memberNo: 'M-1002', name: 'Efua Boateng', contactMasked: '***02', via: [] },
];

/** One active product for the create form's optional subscription selector. */
const SUBSCRIPTION_PRODUCT = {
  id: 'product-1',
  code: 'FAMILY',
  name: 'Family cover',
  description: null,
  premiumMinor: 5000,
  currency: 'GHS',
  active: true,
  paymentMode: 'member',
  periodMonths: 12,
  covers: 'individual',
  maxDependents: 0,
  allowedRelationships: [],
  minMembershipDays: 0,
  requiresCard: false,
  requiresVerified: false,
  gender: null,
  minAge: null,
  maxAge: null,
  createdBy: 'officer-1',
  updatedBy: null,
  updatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as const;

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
      {
        id: 'attendance-1',
        date: '2025-12-07',
        source: 'import',
        eventId: 'event-1',
        eventName: 'Sunday Service',
      },
      {
        id: 'attendance-2',
        date: '2025-12-14',
        source: 'import',
        eventId: 'event-1',
        eventName: 'Sunday Service',
      },
      {
        id: 'attendance-3',
        date: '2025-12-21',
        source: 'manual',
        eventId: 'event-1',
        eventName: 'Sunday Service',
      },
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
    ageMonths: 492,
    placeOfResidence: 'Tema',
    joinedOn: '2019-03-03',
    isPresbyter: true,
    photoUpdatedAt: null,
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
    ageMonths: null,
    placeOfResidence: 'Accra',
    joinedOn: '2020-07-19',
    isPresbyter: false,
    photoUpdatedAt: null,
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
      ageMonths: 492,
      placeOfResidence: 'Tema',
      joinedOn: '2019-03-03',
      title: { code: 'ELD', label: 'Elder', titledOn: '2021-02-01' },
      membershipCardNo: 'MC-1001',
      photoUpdatedAt: null,
      verifiedContacts: [
        {
          id: 'contact-1001-phone',
          channel: 'phone',
          masked: '+233 *** 01',
          verifiedAt: '2024-05-02T11:00:00.000Z',
        },
      ],
      confirmedAt: null,
      assemblyJoinedOn: '2019-03-03',
      cameFrom: 'Accra Central',
      movedOutOn: null,
      movedToAssembly: null,
      shepherd: {
        memberNo: 'M-1002',
        name: 'Ama Mensah',
        gender: 'female',
        age: null,
        assignedOn: '2025-01-02',
      },
      guardian: null,
      calls: {
        attempts: 6,
        conversations: 4,
        lastCalledOn: '2025-11-14',
        lastReachedOn: '2025-11-14',
      },
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
      ageMonths: null,
      placeOfResidence: 'Accra',
      joinedOn: '2020-07-19',
      title: null,
      membershipCardNo: null,
      photoUpdatedAt: null,
      verifiedContacts: [],
      confirmedAt: null,
      assemblyJoinedOn: null,
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
      shepherd: null,
      guardian: null,
      calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
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
  [
    // MR-34/AC-MR46: the verified record the badge capture reads - a proven
    // email and phone plus an officer confirmation, so the badge names the
    // newest proof and its title lists all three.
    'M-1010',
    {
      id: 'member-1010',
      memberNo: 'M-1010',
      firstName: 'Akosua',
      lastName: 'Boateng',
      otherNames: null,
      gender: 'female',
      age: 37,
      ageMonths: 444,
      placeOfResidence: 'Tema',
      joinedOn: '2021-06-06',
      title: null,
      membershipCardNo: 'MC-1010',
      photoUpdatedAt: null,
      verifiedContacts: [
        {
          id: 'contact-1010-email',
          channel: 'email',
          masked: 'a***@example.test',
          verifiedAt: '2026-01-03T09:00:00.000Z',
        },
        {
          id: 'contact-1010-phone',
          channel: 'phone',
          masked: '+233 *** 10',
          verifiedAt: '2026-01-02T09:00:00.000Z',
        },
      ],
      confirmedAt: '2026-01-04T09:00:00.000Z',
      assemblyJoinedOn: '2021-06-06',
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
      shepherd: null,
      guardian: null,
      calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
      isPresbyter: false,
      archivedAt: null,
      contactCount: 2,
      ministries: [],
      maidenName: null,
      alias: null,
      dob: '1988-09-21',
      addressLine: '4 Community Road',
      purgedAt: null,
      version: 2,
      createdAt: '2024-03-01T08:00:00.000Z',
      updatedAt: '2024-03-02T08:00:00.000Z',
      contacts: [
        {
          id: 'contact-1010-phone',
          kind: 'phone',
          value: '+233 20 000 0010',
          displayOrder: 0,
          ownerMemberNo: 'M-1010',
          linked: false,
        },
        {
          id: 'contact-1010-email',
          kind: 'email',
          value: 'akosua@example.test',
          displayOrder: 1,
          ownerMemberNo: 'M-1010',
          linked: false,
        },
      ],
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
 * The live/ended pair the End-of-session assertions drive (AC-7a). "Live" is never stored: it is the
 * session date being today in the event timezone with the clock inside the window, so the date is
 * computed when the routes are built rather than pinned in the fixture. `event-ended` carries a
 * capture with `ended: true`, which wins over the window and renders the action disabled.
 */
const ACTION_STATE_EVENT_IDS: readonly string[] = ['event-live', 'event-ended'];

/** The calendar date the action-state pair is dated on: today in UTC, the zone both fixtures pin. */
function actionStateDate(): string {
  return dateInZone(new Date(), 'UTC');
}

function actionStateEvents(): readonly EventItem[] {
  const today = actionStateDate();
  return [
    {
      id: 'event-live',
      eventNo: 'EVT-E2E-LIVE',
      name: 'Live service',
      seriesId: null,
      ministry: null,
      timezone: 'UTC',
      startDate: today,
      endDate: today,
      startTime: '00:00',
      endTime: '23:59',
      venueType: 'auditorium',
      venueName: 'Main auditorium',
      description: null,
      status: 'scheduled',
      source: 'manual',
      tracksMembers: true,
      presbyterOnly: false,
      sessions: [
        {
          date: today,
          startTime: '00:00',
          endTime: '23:59',
          status: 'scheduled',
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
      id: 'event-ended',
      eventNo: 'EVT-E2E-ENDED',
      name: 'Ended service',
      seriesId: null,
      ministry: null,
      timezone: 'UTC',
      startDate: today,
      endDate: today,
      startTime: '09:00',
      endTime: '11:00',
      venueType: 'auditorium',
      venueName: 'Main auditorium',
      description: null,
      status: 'held',
      source: 'manual',
      tracksMembers: true,
      presbyterOnly: false,
      sessions: [
        {
          date: today,
          startTime: '09:00',
          endTime: '11:00',
          status: 'held',
          note: null,
          present: 0,
          expected: 0,
          importedRows: 0,
          capture: { asOf: `${today}T10:00:00.000Z`, ended: true },
          source: 'manual',
        },
      ],
      offerings: [],
      stats: EMPTY_OFFERING_STATS,
    },
  ];
}

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

const BUCKET_LABELS: Readonly<Record<string, string>> = {
  'adult-male': 'Adult men',
  'adult-female': 'Adult women',
  'child-unspecified': 'Children',
  'child-male': 'Boys',
  'child-female': 'Girls',
  'adult-unspecified': 'Adults',
  'visitor-male': 'Visitor men',
  'visitor-female': 'Visitor women',
  'visitor-children': 'Visitor children',
  elder: 'Elders',
  deaconess: 'Deaconess',
  deacon: 'Deacons',
};

const HEADCOUNTS: readonly Headcount[] = [
  {
    id: 'headcount-1',
    eventId: 'event-offerings',
    sessionDate: '2999-01-10',
    asOf: '2999-01-10T09:02:00.000Z',
    mode: 'adults',
    total: 138,
    ended: false,
    recordedBy: 'officer-1',
    recordedAt: '2999-01-10T09:04:00.000Z',
    supersedesId: null,
    supersededBy: 'headcount-2',
    lines: [
      { code: 'adult-male', label: 'Adult men', count: 58 },
      { code: 'adult-female', label: 'Adult women', count: 71 },
      { code: 'child-unspecified', label: 'Children', count: 9 },
    ],
  },
  {
    id: 'headcount-2',
    eventId: 'event-offerings',
    sessionDate: '2999-01-10',
    asOf: '2999-01-10T09:08:00.000Z',
    mode: 'adults',
    total: 142,
    ended: false,
    recordedBy: 'officer-2',
    recordedAt: '2999-01-10T09:10:00.000Z',
    supersedesId: 'headcount-1',
    supersededBy: null,
    lines: [
      { code: 'adult-male', label: 'Adult men', count: 62 },
      { code: 'adult-female', label: 'Adult women', count: 71 },
      { code: 'child-unspecified', label: 'Children', count: 9 },
    ],
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
    presbyterOnly: false,
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
    presbyterOnly: false,
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

// ---------------------------------------------------------------------------
// The parent read (`view=parent`): one row per event parent (FR-1/FR-5)
// ---------------------------------------------------------------------------

/** The server's `renderAudienceSummary` for the seeded Everyone audience. */
const AUDIENCE_EVERYONE: EventAudienceItem = {
  id: 'aud-everyone',
  name: 'Everyone',
  system: true,
  summary: 'Everyone - all of membership status active',
};

/** The Choir audience the Sunday Service carries; summary is server-rendered, never composed. */
const AUDIENCE_CHOIR: EventAudienceItem = {
  id: 'aud-choir',
  name: 'Choir',
  system: true,
  summary: 'Choir - all of ministry CHR',
};

/**
 * `GET /v1/audiences`: the seeded groups plus one custom row, shaped from the
 * contract's examples. `summary` is the server's sentence; no fixture composes
 * one at read time.
 */
const PRESBYTERS_AUDIENCE: AudienceItem = {
  id: 'aud-presbyters',
  name: 'Presbyters',
  system: true,
  systemKey: 'presbyters',
  active: true,
  rule: { operator: 'allOf', clauses: [{ attribute: 'presbyter', value: true }] },
  summary: 'Presbyters - all of presbyter',
  createdAt: '2026-11-22T09:00:00.000Z',
  createdBy: 'migration',
  updatedAt: '2026-11-22T09:00:00.000Z',
  updatedBy: 'migration',
};

const EVERYONE_AUDIENCE: AudienceItem = {
  id: AUDIENCE_EVERYONE.id,
  name: AUDIENCE_EVERYONE.name,
  system: true,
  systemKey: 'everyone',
  active: true,
  rule: { operator: 'allOf', clauses: [{ attribute: 'membershipStatus', value: 'active' }] },
  summary: AUDIENCE_EVERYONE.summary,
  createdAt: '2026-11-22T09:00:00.000Z',
  createdBy: 'migration',
  updatedAt: '2026-11-22T09:00:00.000Z',
  updatedBy: 'migration',
};

const CHOIR_AUDIENCE: AudienceItem = {
  id: AUDIENCE_CHOIR.id,
  name: AUDIENCE_CHOIR.name,
  system: true,
  systemKey: 'ministry:CHR',
  active: true,
  rule: { operator: 'allOf', clauses: [{ attribute: 'ministry', ministryCode: 'CHR' }] },
  summary: AUDIENCE_CHOIR.summary,
  createdAt: '2026-11-22T09:00:00.000Z',
  createdBy: 'migration',
  updatedAt: '2026-11-22T09:00:00.000Z',
  updatedBy: 'migration',
};

/** The custom audience the contract's create example returns. */
const YOUNG_ADULTS_AUDIENCE: AudienceItem = {
  id: '2e6c8a4b-7d1f-4a3c-8b5e-9f0a1c2d3e4f',
  name: 'Young Adults',
  system: false,
  systemKey: null,
  active: true,
  rule: { operator: 'allOf', clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 35 }] },
  summary: 'Young Adults - all of age 18-35',
  createdAt: '2026-11-23T10:15:00.000Z',
  createdBy: 'officer_ada',
  updatedAt: '2026-11-23T10:15:00.000Z',
  updatedBy: 'officer_ada',
};

const AUDIENCES: readonly AudienceItem[] = [
  EVERYONE_AUDIENCE,
  PRESBYTERS_AUDIENCE,
  CHOIR_AUDIENCE,
  YOUNG_ADULTS_AUDIENCE,
];

/**
 * Each audience's own count at the picker's `countAt` (AC-7/AC-60). The API serves
 * the field only when the caller supplies the date, and never a union total.
 */
const AUDIENCE_MEMBER_COUNTS: Readonly<Record<string, number>> = {
  [AUDIENCE_EVERYONE.id]: 96,
  [PRESBYTERS_AUDIENCE.id]: 4,
  [CHOIR_AUDIENCE.id]: 12,
  [YOUNG_ADULTS_AUDIENCE.id]: 20,
};

const CLAUSE_LABELS: Readonly<Record<AudienceClauseInput['attribute'], string>> = {
  ministry: 'ministry',
  presbyter: 'presbyter',
  ageBand: 'age',
  gender: 'gender',
  membershipStatus: 'membership status',
};

const OPERATOR_LABELS: Readonly<Record<AudienceOperator, string>> = {
  allOf: 'all of',
  anyOf: 'any of',
  noneOf: 'none of',
};

function clausePhrase(clause: AudienceClauseInput): string {
  if (clause.attribute === 'ministry') return `ministry ${clause.ministryCode}`;
  if (clause.attribute === 'presbyter') return 'presbyter';
  if (clause.attribute === 'ageBand') {
    return clause.maxYears === null
      ? `age ${clause.minYears}+`
      : `age ${clause.minYears}-${clause.maxYears}`;
  }
  return `${CLAUSE_LABELS[clause.attribute]} ${clause.value}`;
}

/**
 * The fixture's stand-in for `renderAudienceSummary`, used only to answer
 * `POST /v1/audiences` with a sentence in the server's own format. Clients still
 * receive it and never compose one (FR-42c).
 */
function renderAudienceSummary(
  name: string,
  rule: { operator: AudienceOperator; clauses: readonly AudienceClauseInput[] },
): string {
  const phrases = rule.clauses.map(clausePhrase).join(' and ');
  return `${name} - ${OPERATOR_LABELS[rule.operator]} ${phrases}`;
}

function recurrenceOf(series: SeriesDto): NonNullable<EventParentItem['recurrence']> {
  return { schedules: series.schedules, exceptions: series.exceptions };
}

/** One dated occurrence of a parent, with every field the detail row reads. */ function occurrence(
  eventId: string,
  fields: {
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string | null;
    readonly status: EventSessionStatus;
    readonly present: number;
    readonly expected: number;
    readonly importedRows: number;
    readonly source: SessionSource;
    readonly note?: string | null;
    readonly capture?: EventOccurrenceItem['capture'];
    readonly legacyEventNo?: string | null;
  },
): EventOccurrenceItem {
  return {
    id: `${eventId}@${fields.date}`,
    date: fields.date,
    startTime: fields.startTime,
    endTime: fields.endTime,
    status: fields.status,
    capture: fields.capture ?? null,
    note: fields.note ?? null,
    present: fields.present,
    expected: fields.expected,
    importedRows: fields.importedRows,
    source: fields.source,
    legacyEventNo: fields.legacyEventNo ?? null,
  };
}

/**
 * The window figures the four tiles read. They are derived from the occurrence
 * rows in the same body, so the Occurrences/Attendance tiles and the table can
 * never disagree (FR-6b/FR-6e).
 */
function windowSummaryFor(
  occurrences: readonly EventOccurrenceItem[],
  options: {
    readonly from: string;
    readonly to: string;
    readonly nextOccurrence: string | null;
    readonly offerings: SeriesSummaryDto['offerings'];
  },
): SeriesSummaryDto {
  const held = occurrences.filter((candidate) => candidate.status === 'held');
  const present = held.reduce((sum, candidate) => sum + candidate.present, 0);
  const expected = held.reduce((sum, candidate) => sum + candidate.expected, 0);
  const lastHeld = held.at(-1);

  return {
    from: options.from,
    to: options.to,
    nextOccurrence: options.nextOccurrence,
    attendance: {
      memberSessions: {
        held: held.length,
        present,
        expected,
        rate: expected === 0 ? null : present / expected,
      },
      lastHeld: lastHeld
        ? { date: lastHeld.date, expected: lastHeld.expected, present: lastHeld.present }
        : null,
      headcountSessions: { held: 0 },
      cancelled: occurrences.filter((candidate) => candidate.status === 'cancelled').length,
      upcoming: occurrences.filter((candidate) => candidate.status === 'scheduled').length,
    },
    offerings: options.offerings,
  };
}

/** The series parent's three held Sundays; 3 of 4 on each, so the ratio is 75%. */
const SERIES_OCCURRENCES: readonly EventOccurrenceItem[] = [
  occurrence('series-1', {
    date: '2026-01-04',
    startTime: '09:00',
    endTime: '11:00',
    status: 'held',
    present: 3,
    expected: 4,
    importedRows: 3,
    source: 'import',
  }),
  occurrence('series-1', {
    date: '2026-01-18',
    startTime: '09:00',
    endTime: '11:00',
    status: 'held',
    present: 3,
    expected: 4,
    importedRows: 3,
    source: 'import',
  }),
  occurrence('series-1', {
    date: '2026-01-25',
    startTime: '09:00',
    endTime: '11:00',
    status: 'held',
    present: 3,
    expected: 4,
    importedRows: 3,
    source: 'import',
  }),
];

/**
 * The legacy instance the detail specs open by id. Its 4 January roster is the
 * attendance report's own 42, so the dialog and the parent row agree.
 */
const EVENT_1_OCCURRENCES: readonly EventOccurrenceItem[] = [
  occurrence('event-1', {
    date: '2026-01-04',
    startTime: '09:00',
    endTime: '11:00',
    status: 'held',
    present: 3,
    expected: 42,
    importedRows: 2,
    source: 'mixed',
  }),
  occurrence('event-1', {
    date: '2026-01-18',
    startTime: '09:00',
    endTime: '11:00',
    status: 'held',
    present: 3,
    expected: 4,
    importedRows: 3,
    source: 'import',
  }),
  occurrence('event-1', {
    date: '2026-01-25',
    startTime: '09:00',
    endTime: '11:00',
    status: 'held',
    present: 3,
    expected: 4,
    importedRows: 3,
    source: 'import',
  }),
];

/** A cancelled parent: both occurrences carry their own status and reason (FR-4a). */
const CANCELLED_OCCURRENCES: readonly EventOccurrenceItem[] = [
  occurrence('event-cancelled', {
    date: '2026-06-01',
    startTime: '09:00',
    endTime: '11:00',
    status: 'cancelled',
    present: 0,
    expected: 0,
    importedRows: 0,
    source: 'none',
    note: 'Venue flooded',
  }),
  occurrence('event-cancelled', {
    date: '2026-06-02',
    startTime: '09:00',
    endTime: '11:00',
    status: 'cancelled',
    present: 0,
    expected: 0,
    importedRows: 0,
    source: 'none',
  }),
];

const RETREAT_OCCURRENCES: readonly EventOccurrenceItem[] = [
  occurrence('event-2', {
    date: '2026-01-10',
    startTime: '08:30',
    endTime: null,
    status: 'scheduled',
    present: 0,
    expected: 12,
    importedRows: 0,
    source: 'none',
  }),
  occurrence('event-2', {
    date: '2026-01-11',
    startTime: '08:30',
    endTime: null,
    status: 'scheduled',
    present: 0,
    expected: 12,
    importedRows: 0,
    source: 'none',
  }),
];

const FOUNDATION_OCCURRENCES: readonly EventOccurrenceItem[] = [
  occurrence('event-offerings', {
    date: '2999-01-10',
    startTime: '09:00',
    endTime: '11:00',
    status: 'scheduled',
    present: 0,
    expected: 10,
    importedRows: 0,
    source: 'none',
  }),
];

interface ParentSeed {
  readonly id: string;
  /** The legacy read the identity fields come from; the parent adds its own shape. */
  readonly event: EventItem;
  readonly status: EventParentStatus;
  readonly audience: EventAudienceItem;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly recurrence: EventParentItem['recurrence'];
  readonly occurrences: readonly EventOccurrenceItem[];
  readonly offerings: readonly EventOfferingItem[];
  readonly summaryOfferings: SeriesSummaryDto['offerings'];
  readonly nextOccurrence: string | null;
}

const SUNDAY = EVENTS[0]!;

const PARENT_SEEDS: Readonly<Record<string, ParentSeed>> = {
  // The series is the event parent: one row, one id, the recurrence and its summary.
  'series-1': {
    id: 'series-1',
    event: SUNDAY,
    status: 'active',
    audience: AUDIENCE_CHOIR,
    startDate: '2025-01-05',
    endDate: null,
    recurrence: recurrenceOf(SERIES[0]!),
    occurrences: SERIES_OCCURRENCES,
    offerings: SUNDAY.offerings.slice(0, 2),
    summaryOfferings: SERIES_SUMMARIES['series-1']!.offerings,
    nextOccurrence: '2026-01-04',
  },
  // The legacy per-instance id the detail specs still open.
  'event-1': {
    id: 'event-1',
    event: SUNDAY,
    status: 'active',
    audience: AUDIENCE_CHOIR,
    startDate: '2025-01-05',
    endDate: null,
    recurrence: recurrenceOf(SERIES[0]!),
    occurrences: EVENT_1_OCCURRENCES,
    offerings: SUNDAY.offerings,
    summaryOfferings: {
      ...SERIES_SUMMARIES['series-1']!.offerings,
      attachedCount: 3,
      paidMinor: 1_045_000,
      countedMinor: 1_045_000,
    },
    nextOccurrence: '2026-01-04',
  },
  'event-cancelled': {
    id: 'event-cancelled',
    event: EVENTS[1]!,
    status: 'active',
    audience: AUDIENCE_EVERYONE,
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    recurrence: null,
    occurrences: CANCELLED_OCCURRENCES,
    offerings: [],
    summaryOfferings: EMPTY_SUMMARY.offerings,
    nextOccurrence: null,
  },
  'event-2': {
    id: 'event-2',
    event: EVENTS[2]!,
    status: 'active',
    audience: AUDIENCE_EVERYONE,
    startDate: '2026-01-10',
    endDate: '2026-01-11',
    recurrence: null,
    occurrences: RETREAT_OCCURRENCES,
    offerings: [],
    summaryOfferings: EMPTY_SUMMARY.offerings,
    nextOccurrence: null,
  },
  'event-offerings': {
    id: 'event-offerings',
    event: EVENTS[3]!,
    status: 'active',
    audience: AUDIENCE_EVERYONE,
    startDate: '2999-01-10',
    endDate: '2999-01-10',
    recurrence: null,
    occurrences: FOUNDATION_OCCURRENCES,
    offerings: PREVIEW_OFFERINGS,
    summaryOfferings: { ...EMPTY_SUMMARY.offerings, attachedCount: PREVIEW_OFFERINGS.length },
    nextOccurrence: '2999-01-10',
  },
};

/** The list is one row per parent; the legacy instance id is served on the detail only. */
const PARENT_LIST_IDS = ['series-1', 'event-cancelled', 'event-2', 'event-offerings'] as const;

function parentOf(seed: ParentSeed, from: string, to: string): EventParentItem {
  const { event } = seed;
  return {
    id: seed.id,
    eventNo: event.eventNo ?? '',
    name: event.name,
    audienceIds: [seed.audience.id],
    audiences: [seed.audience],
    audienceId: seed.audience.id,
    audience: seed.audience,
    period: null,
    ministry: event.ministry,
    presbyterOnly: event.presbyterOnly,
    timezone: event.timezone,
    description: event.description,
    venueType: event.venueType,
    venueName: event.venueName,
    startDate: seed.startDate,
    endDate: seed.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    tracksMembers: event.tracksMembers,
    status: seed.status,
    schedule: { locked: false, reasons: [] },
    recurrence: seed.recurrence,
    occurrences: seed.occurrences,
    offerings: seed.offerings,
    stats: event.stats,
    summary: windowSummaryFor(seed.occurrences, {
      from,
      to,
      nextOccurrence: seed.nextOccurrence,
      offerings: seed.summaryOfferings,
    }),
  };
}

/**
 * The live/ended pair's own parent read: one occurrence dated today, whose capture is the fixture's own
 * (`event-ended` is already closed) or the close a test's panel just recorded. It is built here rather
 * than seeded in `PARENT_SEEDS`, because the date is today's and the close is per test.
 */
function actionStateParent(
  eventId: string,
  closedAt: string | null,
  from: string,
  to: string,
): EventParentItem | null {
  const event = actionStateEvents().find((candidate) => candidate.id === eventId);
  const session = event?.sessions[0];
  if (!event || !session) return null;

  const seed: ParentSeed = {
    id: event.id,
    event,
    status: 'active',
    audience: EVERYONE_AUDIENCE,
    startDate: session.date,
    endDate: session.date,
    recurrence: null,
    occurrences: [
      occurrence(event.id, {
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        present: session.present,
        expected: session.expected,
        importedRows: session.importedRows,
        source: session.source,
        capture: closedAt ? { asOf: closedAt, ended: true } : session.capture,
      }),
    ],
    offerings: [],
    summaryOfferings: EMPTY_SUMMARY.offerings,
    nextOccurrence: null,
  };
  return parentOf(seed, from, to);
}

/** A created parent's occurrences, as the create body's date rows write them. */
function occurrencesFromBody(
  input: unknown,
  eventId: string,
  startTime: string,
  endTime: string | null,
): readonly EventOccurrenceItem[] {
  const record = asRecord(input);
  const rows = Array.isArray(record.occurrences) ? record.occurrences : [];

  return rows.map((entry) => {
    const row = asRecord(entry);
    return occurrence(eventId, {
      date: text(row.date),
      startTime: optionalText(row.startTime) ?? startTime,
      endTime: row.endTime === null ? null : (optionalText(row.endTime) ?? endTime),
      status: 'scheduled',
      present: 0,
      expected: 0,
      importedRows: 0,
      source: 'none',
    });
  });
}

const LEGACY_EVENT_KEYS = ['sessions', 'startDate', 'endDate', 'ministry', 'presbyterOnly'];

/** The parent read's own key on a create body; the retired shape is refused. */
function legacyCreateProblem(body: unknown): string | null {
  const record = asRecord(body);
  const legacy = LEGACY_EVENT_KEYS.filter((key) => key in record);
  if (legacy.length > 0)
    return `the retired fields are not part of the payload: ${legacy.join(', ')}`;

  const hasOccurrences = Array.isArray(record.occurrences) && record.occurrences.length > 0;
  const hasRecurrence = record.recurrence !== undefined;
  if (hasOccurrences && hasRecurrence) return 'supply either occurrences or a recurrence, not both';
  if (!hasOccurrences && !hasRecurrence) {
    return 'a standalone event requires at least one occurrence, or supply a recurrence';
  }
  if (!text(record.name).trim()) return 'name is required';
  if (!text(record.venueType)) return 'venueType is required';
  if (!text(record.startTime)) return 'startTime is required';
  return null;
}

/**
 * The `POST /v1/events` body as the contract's `EventParent` answer: a draft,
 * its audience resolved from the id, its occurrences or recurrence echoed, and
 * the number minted when the body omitted it (FR-42a, AC-56).
 */
function createdEventParent(body: unknown, eventNo: string): EventParentItem {
  const record = asRecord(body);
  const startTime = text(record.startTime);
  const endTime = optionalText(record.endTime);
  const requestedAudienceIds = Array.isArray(record.audienceIds)
    ? record.audienceIds.map((id) => text(id))
    : [];
  const audience =
    AUDIENCES.find(
      (candidate) => candidate.id === (requestedAudienceIds[0] ?? text(record.audienceId)),
    ) ?? EVERYONE_AUDIENCE;
  const occurrences = occurrencesFromBody(body, `created-${eventNo}`, startTime, endTime);
  const recurrenceInput = asRecord(record.recurrence);
  const schedules = Array.isArray(recurrenceInput.schedules)
    ? recurrenceInput.schedules.map((entry) => {
        const row = asRecord(entry);
        return {
          effectiveFrom: text(row.effectiveFrom),
          rrule: text(row.rrule),
          endsOn: optionalText(row.endsOn),
        };
      })
    : [];

  const startDates = occurrences.map((row) => row.date).sort();
  const startDate = startDates[0] ?? (schedules[0] ? text(schedules[0].effectiveFrom) : '');
  const endDate = startDates.at(-1) ?? null;

  return {
    id: `created-${eventNo}`,
    eventNo,
    name: text(record.name),
    audienceIds: [audience.id],
    audiences: [
      {
        id: audience.id,
        name: audience.name,
        system: audience.system,
        summary: audience.summary,
      },
    ],
    audienceId: audience.id,
    audience: {
      id: audience.id,
      name: audience.name,
      system: audience.system,
      summary: audience.summary,
    },
    period: null,
    ministry: null,
    presbyterOnly: false,
    timezone: text(record.timezone) || 'UTC',
    description: optionalText(record.description),
    venueType: venueTypeOf(record.venueType),
    venueName: optionalText(record.venueName),
    startDate,
    endDate,
    startTime,
    endTime,
    tracksMembers: record.tracksMembers !== false,
    status: 'draft',
    schedule: { locked: false, reasons: [] },
    recurrence: schedules.length > 0 ? { schedules, exceptions: [] } : null,
    occurrences,
    offerings: [],
    stats: EMPTY_OFFERING_STATS,
    summary: windowSummaryFor(occurrences, {
      from: startDate,
      to: endDate ?? startDate,
      nextOccurrence: startDate || null,
      offerings: EMPTY_SUMMARY.offerings,
    }),
  };
}

/**
 * One parent by id: a write's override wins over a created parent, which wins
 * over the seed. The window summary is recomputed from the occurrences on every
 * read, so an invalidation after a write shows the new state.
 */
function parentForId(
  id: string,
  from: string,
  to: string,
  createdEvents: ReadonlyMap<string, EventParentItem>,
  overrides: ReadonlyMap<string, EventParentItem>,
): EventParentItem | null {
  const stored = overrides.get(id) ?? createdEvents.get(id);
  const seed = stored ? null : PARENT_SEEDS[id];
  const source = stored ?? (seed ? parentOf(seed, '', '') : null);
  if (!source) return null;

  return {
    ...source,
    summary: windowSummaryFor(source.occurrences, {
      from,
      to,
      nextOccurrence: source.summary.nextOccurrence,
      offerings: source.summary.offerings,
    }),
  };
}

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
  photoUpdatedAt: null,
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
      photoUpdatedAt: null,
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
      photoUpdatedAt: null,
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
      photoUpdatedAt: null,
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
      photoUpdatedAt: null,
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

/** FR-42e: the event writes a test can assert, recorded by kind. */
export type EventWriteKind =
  'archive' | 'cancel' | 'version' | 'schedule' | 'exception' | 'exceptionDelete';

export interface EventWrite {
  readonly eventId: string;
  /** The path's date, for the routes that carry one. */
  readonly date?: string;
  /** The request body, verbatim; undefined where the route takes none. */
  readonly body?: unknown;
}

export type EventWriteRecorder = (kind: EventWriteKind, write: EventWrite) => void;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface GatewayReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** A confirmed import's body as the panel sends it (FR-36, FR-36a). */
export interface ImportCommit {
  readonly kind: 'members' | 'attendance';
  readonly body: Record<string, unknown>;
  readonly rows: readonly unknown[];
}

/** The reply a test wants the import commit to give: a `201` batch or an `import_failed` `422`. */
export type ImportStubReply = GatewayReply;

interface RouteEntry {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly pattern: RegExp;
  readonly handle: (call: GatewayCall, params: readonly string[]) => GatewayReply;
}

function reply(body: unknown, status = 200, headers: Record<string, string> = {}): GatewayReply {
  return { body, status, headers };
}

function problem(status: number, detail: string): GatewayReply {
  return reply({ type: 'about:blank', title: 'Request failed', status, detail }, status);
}

/**
 * A refusal the UI maps by its problem+json `code`, never by the message text
 * (FR-42g/AC-64). The event writes use this wherever the contract names a code.
 */
function codedProblem(status: number, code: string, detail: string): GatewayReply {
  return reply({ type: 'about:blank', title: 'Request failed', status, code, detail }, status);
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
  const contacts = createdContacts(body, memberNo);

  return {
    id: `created-${memberNo}`,
    memberNo,
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    otherNames: optionalText(body.otherNames),
    gender: gender(body.gender),
    age: null,
    ageMonths: null,
    placeOfResidence: optionalText(body.placeOfResidence),
    joinedOn: optionalText(body.joinedOn),
    title: null,
    membershipCardNo: null,
    verifiedContacts: [],
    confirmedAt: null,
    assemblyJoinedOn: optionalText(body.assemblyJoinedOn),
    cameFrom: optionalText(body.cameFrom),
    movedOutOn: optionalText(body.movedOutOn),
    movedToAssembly: optionalText(body.movedToAssembly),
    shepherd: null,
    guardian: null,
    calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
    isPresbyter: body.isPresbyter === true,
    photoUpdatedAt: null,
    archivedAt: null,
    contactCount: contacts.length,
    ministries: [],
    maidenName: optionalText(body.maidenName),
    alias: optionalText(body.alias),
    dob: optionalText(body.dob),
    addressLine: optionalText(body.addressLine),
    purgedAt: null,
    version: 1,
    createdAt: FIXED_INSTANT,
    updatedAt: FIXED_INSTANT,
    contacts,
    subscriptions: [],
    relationships: [],
    attendance: [],
  };
}

/** The `contacts[]` the create body carried, as the new member's own values (FR-29a). */
function createdContacts(
  body: Record<string, unknown>,
  memberNo: string,
): readonly MemberContact[] {
  const rows = Array.isArray(body.contacts) ? body.contacts : [];

  return rows.flatMap((entry, index) => {
    const row = asRecord(entry);
    const kind = text(row.kind);
    const value = text(row.value);
    if (kind !== 'phone' && kind !== 'email' && kind !== 'whatsapp') return [];
    return [
      {
        id: `created-contact-${index}`,
        kind,
        value,
        displayOrder: index,
        ownerMemberNo: memberNo,
        linked: false,
      },
    ];
  });
}

function venueTypeOf(value: unknown): EventVenueType {
  return value === 'virtual' || value === 'hybrid' ? value : 'auditorium';
}

/**
 * A created audience as `POST /v1/audiences` answers it: `201` with the row and
 * the server-format summary. The stub mirrors the API's name uniqueness
 * (`409 audience_name_in_use`) and its rule shape (`422 validation_error`).
 */
function createdAudience(
  body: unknown,
  id: string,
  existing: readonly AudienceItem[],
): AudienceItem | string {
  const record = asRecord(body);
  const name = text(record.name).trim();
  const rule = asRecord(record.rule);
  const operator = text(rule.operator);
  if (!name) return 'name is required';
  if (!['allOf', 'anyOf', 'noneOf'].includes(operator))
    return 'rule.operator must be allOf, anyOf or noneOf';
  const rawClauses = Array.isArray(rule.clauses) ? rule.clauses : [];
  if (rawClauses.length === 0) return 'rule.clauses needs at least one clause';

  const clauses: AudienceClauseInput[] = [];
  for (const entry of rawClauses) {
    const clause = asRecord(entry);
    const attribute = text(clause.attribute);
    if (attribute === 'ministry') {
      if (!text(clause.ministryCode)) return 'clauses.ministryCode is required';
      clauses.push({ attribute: 'ministry', ministryCode: text(clause.ministryCode) });
    } else if (attribute === 'presbyter') {
      clauses.push({ attribute: 'presbyter', value: true });
    } else if (attribute === 'ageBand') {
      const minYears = Number(clause.minYears);
      const maxYears = clause.maxYears === null ? null : Number(clause.maxYears);
      if (!Number.isInteger(minYears) || minYears < 0)
        return 'clauses.minYears must be a non-negative integer';
      if (maxYears !== null && (!Number.isInteger(maxYears) || maxYears < minYears)) {
        return 'clauses.maxYears must not be below minYears';
      }
      clauses.push({ attribute: 'ageBand', minYears, maxYears });
    } else if (attribute === 'gender') {
      if (clause.value !== 'male' && clause.value !== 'female')
        return 'clauses.value must be male or female';
      clauses.push({ attribute: 'gender', value: clause.value });
    } else if (attribute === 'membershipStatus') {
      if (clause.value !== 'visitor' && clause.value !== 'active') {
        return 'clauses.value must be visitor or active';
      }
      clauses.push({ attribute: 'membershipStatus', value: clause.value });
    } else {
      return 'clauses.attribute is not a known attribute';
    }
  }

  if (existing.some((candidate) => candidate.name.trim().toLowerCase() === name.toLowerCase())) {
    return 'name_in_use';
  }

  const typedOperator = operator as AudienceOperator;
  return {
    id,
    name,
    system: false,
    systemKey: null,
    active: true,
    rule: { operator: typedOperator, clauses },
    summary: renderAudienceSummary(name, { operator: typedOperator, clauses }),
    createdAt: FIXED_INSTANT,
    createdBy: 'officer-1',
    updatedAt: FIXED_INSTANT,
    updatedBy: 'officer-1',
  };
}

/**
 * The API's uniqueness rule, mirrored: a contact value belongs to exactly one
 * member, so an entered value another member already owns fails the whole create
 * with a 409 naming that value (FR-29a). Keys follow `normalizeContactValue`.
 */
function contactKey(kind: string, value: string): string {
  const trimmed = value.trim();
  if (kind === 'email') return trimmed.toLowerCase();
  return trimmed.replace(/\D/g, '').replace(/^0+/, '');
}

const OWNED_CONTACT_VALUES: ReadonlySet<string> = new Set(
  [...CONTACTS_1001, ...CONTACTS_1002].map((contact) => contactKey(contact.kind, contact.value)),
);

/**
 * Routes are matched by method + path, most specific first. The query string is
 * available to handlers but never part of the key: one fixture serves every
 * window the pages ask for, so no assertion depends on today's date.
 */
function buildRoutes(
  created: Map<string, MemberDetail>,
  createdEvents: Map<string, EventParentItem>,
  parentOverrides: Map<string, EventParentItem>,
  actionStatesEnabled: () => boolean,
  importReplyFor: (commit: ImportCommit) => ImportStubReply | null,
  simulateMintCollision: () => boolean,
  recordEventCreate: (body: unknown) => void,
  recordEventPatch: (body: unknown) => void,
  recordWrite: EventWriteRecorder,
): readonly RouteEntry[] {
  // The action-state events exist for the capture-state tests; they are opt-in so a
  // session dated today cannot win another surface's "next session" selection.
  const currentEvents = () =>
    actionStatesEnabled() ? [...EVENTS, ...actionStateEvents()] : EVENTS;

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

  /**
   * The close a test just recorded, per event id: the action-state pair's parent read has to show the
   * `ended` capture or the row and the panel would keep offering a capture the API now refuses.
   */
  const closedCaptures = new Map<string, string>();

  /**
   * FR-78's write actions mutate per-test state: a value added, edited, linked or
   * unlinked must show up in the next detail read, or the invalidate-and-refetch
   * the dialog relies on would prove nothing.
   */
  const contactState = new Map<string, MemberContact[]>(
    [...DETAILS].map(([memberNo, detail]) => [memberNo, [...detail.contacts]]),
  );

  /** FR-42c: a custom audience created through the dialog reads back in the picker. */
  const createdAudiences = new Map<string, AudienceItem>();

  /** The API's uniqueness key, mirrored: email compares lower-cased, phones by digits. */
  const matchesValue = (row: MemberContact, value: string) =>
    contactKey(row.kind, value) === contactKey(row.kind, row.value);

  /**
   * FR-42e: the detail's writes must be visible to the refetch the page makes,
   * or the invalidate-and-refetch would prove nothing. A write stores the whole
   * parent it produced; every read recomputes the window summary from it.
   */
  const currentParent = (eventId: string): EventParentItem | null => {
    const base = parentForId(eventId, '', '', createdEvents, parentOverrides);
    if (!base) return null;
    return parentForId(
      eventId,
      base.startDate,
      base.endDate ?? base.startDate,
      createdEvents,
      parentOverrides,
    );
  };

  const storeParent = (parent: EventParentItem): void => {
    parentOverrides.set(parent.id, parent);
  };

  /** The recurrence a recurrence write answers with, or the refusal it earns. */
  const recurrenceOfParent = (
    current: EventParentItem,
  ): { readonly recurrence: EventRecurrence } | { readonly refusal: GatewayReply } => {
    if (current.status === 'archived') {
      return { refusal: codedProblem(409, 'status', 'An archived event is read-only') };
    }
    if (!current.recurrence) {
      return {
        refusal: codedProblem(
          409,
          'recurrence',
          'This event records its dates by hand, so it has no recurrence to change',
        ),
      };
    }
    return { recurrence: current.recurrence };
  };

  return [
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/members$/,
      handle: (call) => {
        // MR-40: the guardian picker's own projection, not a member page.
        if (call.search.get('guardianEligible') === 'true') {
          return reply({ items: GUARDIAN_CANDIDATES });
        }
        // FR-79/FR-78: the explicit `contact` filter matches owners and linkers
        // alike; the `linked` flag is what tells them apart in the dialog.
        const contact = call.search.get('contact')?.trim();
        if (!contact) return reply({ items: MEMBERS });
        const items = MEMBERS.filter((member) =>
          (contactState.get(member.memberNo) ?? []).some((row) => matchesValue(row, contact)),
        );
        return reply({ items });
      },
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
        // The create is atomic: a value another member owns fails it before anything is written,
        // and the 409 names the value so the form can put it against that field (FR-29a).
        for (const contact of detail.contacts) {
          if (OWNED_CONTACT_VALUES.has(contactKey(contact.kind, contact.value))) {
            return problem(409, `Contact value "${contact.value}" already belongs to a member`);
          }
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
        // The shepherd is keyed on the member asked for, not served to every member: a dialog that
        // reads the wrong member number gets `shepherd: null` and its assertion fails. M-1002 is the
        // only member whose fixture entry names one.
        return reply({
          ...MEMBER_SHEPHERDING,
          memberNo: detail.memberNo,
          name: detail.firstName,
          shepherd: memberNo === MEMBER_SHEPHERDING.memberNo ? MEMBER_SHEPHERDING.shepherd : null,
        });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/members\/([^/]+)$/,
      handle: (_call, [memberNo]) => {
        const detail = DETAILS.get(memberNo!) ?? created.get(memberNo!);
        if (!detail) return problem(404, `Member ${memberNo} was not found`);
        const contacts = contactState.get(detail.memberNo) ?? [...detail.contacts];
        // Only the list changes: the DTO's `contactCount` is the fixture's own
        // number and the page's action label keys off it (FR-78).
        return reply({ ...detail, contacts }, 200, {
          ETag: `"v${detail.version}"`,
        });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/members\/([^/]+)\/contacts$/,
      handle: (call, [memberNo]) => {
        const body = asRecord(call.body);
        const kind = text(body.kind);
        const value = text(body.value);
        if (kind !== 'phone' && kind !== 'email' && kind !== 'whatsapp') {
          return problem(422, 'kind must be phone, email or whatsapp');
        }
        if (!value.trim()) return problem(422, 'value is required');
        // A value belongs to one member: a duplicate fails with the 409 that names
        // it, which is the dialog's link path (FR-78, AC-54).
        const duplicate = [...contactState.values()]
          .flat()
          .some((row) => row.kind === kind && matchesValue(row, value));
        if (duplicate) {
          return problem(409, `Contact value "${value}" already belongs to a member`);
        }
        const rows = contactState.get(memberNo!) ?? [];
        const contact: MemberContact = {
          id: `contact-${memberNo}-${rows.length + 1}`,
          kind,
          value: value.trim(),
          displayOrder: rows.filter((row) => row.kind === kind).length,
          ownerMemberNo: memberNo!,
          linked: false,
        };
        contactState.set(memberNo!, [...rows, contact]);
        return reply(contact, 201);
      },
    },
    {
      method: 'PUT',
      pattern: /^\/gateway\/v1\/members\/([^/]+)\/contacts\/([^/]+)$/,
      handle: (call, [memberNo, contactId]) => {
        const rows = contactState.get(memberNo!) ?? [];
        const index = rows.findIndex((row) => row.id === contactId);
        const current = rows[index];
        if (!current) return problem(404, `Contact ${contactId} was not found`);
        // Only the value is writable this cycle (FR-78).
        const value = text(asRecord(call.body).value).trim();
        if (!value) return problem(422, 'value is required');
        const duplicate = [...contactState.entries()].some(([no, list]) =>
          list.some(
            (row, rowIndex) =>
              !(no === memberNo && rowIndex === index) &&
              row.kind === current.kind &&
              matchesValue(row, value),
          ),
        );
        if (duplicate) {
          return problem(409, `Contact value "${value}" already belongs to a member`);
        }
        const updated: MemberContact = { ...current, value };
        contactState.set(
          memberNo!,
          rows.map((row, rowIndex) => (rowIndex === index ? updated : row)),
        );
        return reply(updated);
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/members\/([^/]+)\/contacts\/link$/,
      handle: (call, [memberNo]) => {
        const contactId = text(asRecord(call.body).contactId);
        const owner = [...contactState.entries()].flatMap(([no, rows]) =>
          rows.filter((row) => row.id === contactId && !row.linked).map((row) => ({ no, row })),
        )[0];
        if (!owner) return problem(404, `Contact ${contactId} was not found`);
        const rows = contactState.get(memberNo!) ?? [];
        if (rows.some((row) => row.id === contactId)) {
          return problem(409, 'This contact is already linked to the member');
        }
        const linked: MemberContact = {
          id: contactId,
          kind: owner.row.kind,
          value: owner.row.value,
          displayOrder: rows.length,
          ownerMemberNo: owner.no,
          linked: true,
        };
        contactState.set(memberNo!, [...rows, linked]);
        return reply(linked, 201);
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/gateway\/v1\/members\/([^/]+)\/contacts\/link\/([^/]+)$/,
      handle: (_call, [memberNo, contactId]) => {
        const rows = contactState.get(memberNo!) ?? [];
        if (!rows.some((row) => row.id === contactId && row.linked)) {
          return problem(404, `Linked contact ${contactId} was not found`);
        }
        contactState.set(
          memberNo!,
          rows.filter((row) => row.id !== contactId),
        );
        return reply(undefined, 204);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/ministries$/,
      handle: () => reply({ items: MINISTRIES }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/presbyter-titles$/,
      handle: () => reply({ items: PRESBYTER_TITLES }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/subscription-products$/,
      handle: () => reply({ items: [SUBSCRIPTION_PRODUCT] }),
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
      handle: (call) => {
        // The three event pages send `view=parent` (FR-6a); the USSD, picker and
        // offerings callers still read the legacy per-instance list.
        if (call.search.get('view') === 'parent') {
          const from = call.search.get('from') ?? '';
          const to = call.search.get('to') ?? '';
          const seriesFilter = call.search.get('seriesId');
          const ids = [
            ...new Set<string>([
              ...PARENT_LIST_IDS,
              ...createdEvents.keys(),
              ...parentOverrides.keys(),
            ]),
          ];
          const items: EventParentItem[] = ids
            .map((id) => parentForId(id, from, to, createdEvents, parentOverrides))
            .filter((item): item is EventParentItem => item !== null)
            .filter((item) => !seriesFilter || item.id === seriesFilter);
          return reply({ items });
        }
        // A parent created through the new route is not a legacy per-instance
        // row: the legacy list serves only the seeded instances.
        return reply({ items: [...currentEvents()] });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events$/,
      handle: (call) => {
        recordEventCreate(call.body);

        // The handler validates the parent body, so a legacy shape fails here the
        // way it fails on the real route rather than being quietly accepted.
        const invalid = legacyCreateProblem(call.body);
        if (invalid) return problem(422, invalid);

        const record = asRecord(call.body);
        const typedNumber = text(record.eventNo).trim();
        const minted =
          typedNumber || `EVT-2026-${String(900 + createdEvents.size + 1).padStart(3, '0')}`;
        // AC 8: a mint collision is the create's only 409 on this form, and the
        // form has no number control to bind it to, so it is a banner.
        if (simulateMintCollision()) {
          return problem(409, `Event number ${minted} is already in use`);
        }
        const duplicate = [...currentEvents(), ...createdEvents.values()].some(
          (candidate) => candidate.eventNo === minted,
        );
        if (duplicate) return problem(409, `Event number ${minted} is already in use`);

        const parent = createdEventParent(call.body, minted);
        createdEvents.set(parent.id, parent);
        return reply(parent, 201, { Location: `/v1/events/${parent.id}` });
      },
    },
    {
      // The create form's read-only catalogue, registered before `/:id`
      // (member-registrations-event-periods.md, "Two read-only contract entries").
      // `dates` is the contract's projection of the resolver's shape, and the form
      // uses it to hide the day control for a single-date period.
      method: 'GET',
      pattern: /^\/gateway\/v1\/events\/periods$/,
      handle: () =>
        reply({
          items: [
            {
              id: 'communion-week',
              name: 'Communion Week',
              definition:
                'The week of the monthly communion service: week 1 of the cycle month, the seven days ending on that month’s first Sunday.',
              dates: 'week',
            },
            {
              id: 'gospel-week',
              name: 'Gospel Week',
              definition:
                'The last week of the month before, when ministries hold their meetings: the week before Communion Week.',
              dates: 'week',
            },
            {
              id: 'home-cells',
              name: 'Home Cells',
              definition:
                'The Monday of week 1 of the cycle month — the Monday of Communion Week, one date.',
              dates: 'date',
            },
          ],
        }),
    },
    {
      // `POST /v1/events/preview` never persists. The fixture serves the counts
      // shape the form renders; the dates themselves are the API's to resolve,
      // and the e2e mock does not re-implement the resolver.
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/preview$/,
      handle: () =>
        reply({
          occurrences: [],
          audienceCounts: AUDIENCES.map((audience) => ({
            id: audience.id,
            count: audience.memberCount ?? 0,
          })),
        }),
    },
    {
      method: 'PATCH',
      pattern: /^\/gateway\/v1\/events\/([^/]+)$/,
      handle: (call, [eventId]) => {
        recordEventPatch(call.body);
        // A seeded parent can be patched too: the override is stored under its id
        // and wins over the seed on every later read.
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);

        const body = asRecord(call.body);
        if ('eventNo' in body) return problem(422, 'eventNo is immutable and is not a PATCH field');
        if ('occurrences' in body || 'recurrence' in body) {
          return problem(422, 'an update carries no occurrence set and no recurrence');
        }

        const status = optionalText(body.status);
        if (status === 'archived') {
          return codedProblem(409, 'status', 'a parent is archived through its archive route');
        }
        if (status !== null && status !== 'draft' && status !== 'active') {
          return problem(422, 'status must be draft or active');
        }

        const requestedAudienceIds = Array.isArray(body.audienceIds)
          ? body.audienceIds.map((id) => text(id))
          : [];
        const requested =
          requestedAudienceIds.length > 0 ? requestedAudienceIds : [current.audienceId];
        const resolvedAudiences = requested
          .map((id) => AUDIENCES.find((candidate) => candidate.id === id))
          .filter((candidate): candidate is AudienceItem => Boolean(candidate));
        const audience = resolvedAudiences[0] ?? EVERYONE_AUDIENCE;

        const updated: EventParentItem = {
          ...current,
          name: optionalText(body.name) ?? current.name,
          audienceIds:
            resolvedAudiences.length > 0 ? resolvedAudiences.map((row) => row.id) : [audience.id],
          audiences: resolvedAudiences.length > 0 ? resolvedAudiences : [audience],
          audienceId: audience.id,
          audience: {
            id: audience.id,
            name: audience.name,
            system: audience.system,
            summary: audience.summary,
          },
          description:
            body.description === null
              ? null
              : (optionalText(body.description) ?? current.description),
          venueType: body.venueType === undefined ? current.venueType : venueTypeOf(body.venueType),
          venueName:
            body.venueName === null ? null : (optionalText(body.venueName) ?? current.venueName),
          startTime: optionalText(body.startTime) ?? current.startTime,
          endTime: body.endTime === null ? null : (optionalText(body.endTime) ?? current.endTime),
          status: status === null ? current.status : (status as EventParentStatus),
        };

        storeParent(updated);
        return reply(updated, 200, { ETag: '"e2e-event-parent"' });
      },
    },
    {
      method: 'PUT',
      // FR-42h: the edit form's guarded rule save. One arm only; the arm that
      // does not match the event's type is a 422, and a closed guard is the
      // `409 recurrence_locked` body carrying the read's own reasons.
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/schedule$/,
      handle: (call, [eventId]) => {
        recordWrite('schedule', { eventId: eventId!, body: call.body });
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);
        if (current.status === 'archived') {
          return codedProblem(409, 'status', 'An archived event is read-only');
        }
        if (current.schedule.locked) {
          return reply(
            {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              code: 'recurrence_locked',
              detail: 'The event has history; its schedule cannot be rewritten',
              reasons: current.schedule.reasons,
            },
            409,
          );
        }

        const body = asRecord(call.body);
        const hasRecurrence = body.recurrence !== undefined;
        const hasPeriod = body.period !== undefined;
        if (hasRecurrence === hasPeriod) {
          return codedProblem(
            422,
            'validation_error',
            'supply exactly one of recurrence or period',
          );
        }

        if (hasRecurrence) {
          if (!current.recurrence) {
            return codedProblem(
              422,
              'validation_error',
              'recurrence: this event has no schedule version; only a recurring event’s rule can be rewritten',
            );
          }
          const arm = asRecord(body.recurrence);
          const rrule = text(arm.rrule).trim();
          const endsOn = optionalText(arm.endsOn);
          if (rrule.length < 6) {
            return codedProblem(422, 'validation_error', 'rrule must be an RFC 5545 body');
          }
          if (/(?:^|;)(COUNT|UNTIL)=/i.test(rrule)) {
            return codedProblem(422, 'validation_error', 'rrule must not carry COUNT or UNTIL');
          }

          const inForce = [...current.recurrence.schedules].sort((left, right) =>
            right.effectiveFrom.localeCompare(left.effectiveFrom),
          )[0];
          if (!inForce) {
            return codedProblem(409, 'recurrence', 'The event has no schedule version to replace');
          }
          if (endsOn && endsOn < inForce.effectiveFrom) {
            return codedProblem(422, 'validation_error', 'endsOn must not be before effectiveFrom');
          }

          const recurrence: EventRecurrence = {
            schedules: [
              ...current.recurrence.schedules.filter((row) => row !== inForce),
              { effectiveFrom: inForce.effectiveFrom, rrule, endsOn },
            ].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom)),
            exceptions: [...current.recurrence.exceptions],
          };
          storeParent({ ...current, recurrence });
          return reply({
            recurrence,
            period: null,
            occurrences: current.occurrences,
            generated: true,
          });
        }

        if (!current.period || current.period.frequency !== 'monthly') {
          return codedProblem(
            422,
            'validation_error',
            'period: this event has no stored period rule; only a recurring period event’s rule can be rewritten',
          );
        }

        const arm = asRecord(body.period);
        const requestedDay = optionalText(arm.day);
        const day: PeriodDay | null = requestedDay === null ? null : (requestedDay as PeriodDay);
        const period = { ...current.period, cycle: null, frequency: 'monthly' as const, day };
        storeParent({ ...current, period });
        return reply({
          recurrence: null,
          period: {
            id: period.id,
            name: period.name,
            frequency: period.frequency,
            day: period.day,
          },
          occurrences: current.occurrences,
          generated: true,
        });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/archive$/,
      handle: (_call, [eventId]) => {
        recordWrite('archive', { eventId: eventId! });
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);
        // The archive route is the only path to `archived` and the move is
        // forward-only, so a second archive is the `status` conflict.
        if (current.status === 'archived') {
          return codedProblem(409, 'status', 'The event is already archived');
        }

        const archived: EventParentItem = { ...current, status: 'archived' };
        storeParent(archived);
        return reply(archived, 200, { ETag: '"e2e-event-parent"' });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/occurrences\/([^/]+)\/cancel$/,
      handle: (call, [eventId, date]) => {
        recordWrite('cancel', { eventId: eventId!, date: date!, body: call.body });
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);
        // AC-62: a draft cannot cancel a date; the UI disables the row control
        // and the API refuses it as `event_draft`.
        if (current.status === 'draft') {
          return codedProblem(409, 'event_draft', 'Activate the event before cancelling a date');
        }
        if (current.status === 'archived') {
          return codedProblem(409, 'status', 'An archived event is read-only');
        }

        const note = text(asRecord(call.body).note).trim();
        if (!note) {
          return codedProblem(422, 'reason_required', 'A cancellation reason is required');
        }

        const occurrence = current.occurrences.find((row) => row.date === date);
        if (!occurrence) return problem(404, `Event ${eventId} has no occurrence on ${date}`);
        if (occurrence.status === 'cancelled') {
          return codedProblem(409, 'status', 'The occurrence is already cancelled');
        }

        const cancelled: EventOccurrenceItem = { ...occurrence, status: 'cancelled', note };
        storeParent({
          ...current,
          occurrences: current.occurrences.map((row) => (row.date === date ? cancelled : row)),
        });
        return reply(cancelled);
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/recurrence\/versions$/,
      handle: (call, [eventId]) => {
        recordWrite('version', { eventId: eventId!, body: call.body });
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);
        const existing = recurrenceOfParent(current);
        if ('refusal' in existing) return existing.refusal;

        const body = asRecord(call.body);
        const effectiveFrom = text(body.effectiveFrom);
        const rrule = text(body.rrule).trim();
        const endsOn = optionalText(body.endsOn);
        if (!ISO_DATE.test(effectiveFrom)) {
          return codedProblem(422, 'validation_error', 'effectiveFrom must be a date');
        }
        if (rrule.length < 6 || rrule.length > 200) {
          return codedProblem(422, 'validation_error', 'rrule must be an RFC 5545 body');
        }
        if (/(?:^|;)(COUNT|UNTIL)=/i.test(rrule)) {
          return codedProblem(422, 'validation_error', 'rrule must not carry COUNT or UNTIL');
        }
        if (endsOn && endsOn < effectiveFrom) {
          return codedProblem(422, 'validation_error', 'endsOn must not be before effectiveFrom');
        }

        const recurrence: EventRecurrence = {
          schedules: [...existing.recurrence.schedules, { effectiveFrom, rrule, endsOn }],
          exceptions: [...existing.recurrence.exceptions],
        };
        storeParent({ ...current, recurrence });
        return reply(recurrence, 201);
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/recurrence\/exceptions$/,
      handle: (call, [eventId]) => {
        recordWrite('exception', { eventId: eventId!, body: call.body });
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);
        const existing = recurrenceOfParent(current);
        if ('refusal' in existing) return existing.refusal;

        const body = asRecord(call.body);
        const date = text(body.date);
        const kind = text(body.kind);
        const note = optionalText(body.note);
        if (!ISO_DATE.test(date)) {
          return codedProblem(422, 'validation_error', 'date must be a date');
        }
        if (kind !== 'cancelled' && kind !== 'extra') {
          return codedProblem(422, 'validation_error', 'kind must be cancelled or extra');
        }
        if (kind === 'cancelled' && !note) {
          return codedProblem(422, 'reason_required', 'A cancelled exception needs a reason');
        }

        // The newest directive per date is the effective one.
        const recurrence: EventRecurrence = {
          schedules: [...existing.recurrence.schedules],
          exceptions: [
            ...existing.recurrence.exceptions.filter((row) => row.date !== date),
            { date, kind, note },
          ],
        };
        storeParent({ ...current, recurrence });
        return reply(recurrence, 201);
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/recurrence\/exceptions\/([^/]+)$/,
      handle: (_call, [eventId, date]) => {
        recordWrite('exceptionDelete', { eventId: eventId!, date: date! });
        const current = currentParent(eventId!);
        if (!current) return problem(404, `Event ${eventId} was not found`);
        const existing = recurrenceOfParent(current);
        if ('refusal' in existing) return existing.refusal;

        const recurrence: EventRecurrence = {
          schedules: [...existing.recurrence.schedules],
          exceptions: existing.recurrence.exceptions.filter((row) => row.date !== date),
        };
        storeParent({ ...current, recurrence });
        return reply(recurrence);
      },
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
        if (ACTION_STATE_EVENT_IDS.includes(eventId ?? '')) {
          // No register-derived roster on the action-state fixtures: the capture state is the point.
          return reply({
            eventId,
            sessionDate: date,
            present: 0,
            expected: 0,
            importedRows: 0,
            rows: [],
          });
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
      handle: (call, [eventId]) => {
        // FR-4/FR-6a: the detail reads the parent body; the USSD screens still
        // read the legacy `EventItem` without the flag.
        if (call.search.get('view') === 'parent') {
          // The capture-state pair is dated today and closes per test, so its parent is built from the
          // fixture rather than looked up in `PARENT_SEEDS`.
          if (actionStatesEnabled() && ACTION_STATE_EVENT_IDS.includes(eventId ?? '')) {
            const parent = actionStateParent(
              eventId!,
              closedCaptures.get(eventId!) ?? null,
              call.search.get('from') ?? '',
              call.search.get('to') ?? '',
            );
            if (!parent) return problem(404, `Event ${eventId} was not found`);
            return reply(parent, 200, { ETag: '"e2e-event-parent"' });
          }
          const parent = parentForId(
            eventId!,
            call.search.get('from') ?? '',
            call.search.get('to') ?? '',
            createdEvents,
            parentOverrides,
          );
          if (!parent) return problem(404, `Event ${eventId} was not found`);
          return reply(parent, 200, { ETag: '"e2e-event-parent"' });
        }
        // The legacy per-instance read serves only the seeded instances; a parent
        // created through the new route is read with `view=parent`.
        const event = currentEvents().find((candidate) => candidate.id === eventId);
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
        const current: Record<string, Headcount | null> = {
          adults: null,
          children: null,
          visitors: null,
          presbyters: null,
        };
        for (const row of observations) {
          if (row.supersededBy === null) current[row.mode] = row;
        }
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
        if (!['adults', 'children', 'visitors', 'presbyters'].includes(mode)) {
          return problem(422, 'mode must be adults, children, visitors or presbyters');
        }
        const rawLines = Array.isArray(body.lines) ? body.lines : [];
        const lines: Array<Headcount['lines'][number]> = [];
        for (const entry of rawLines) {
          const line = asRecord(entry);
          const code = text(line.code);
          if (!code) return problem(422, 'each line needs a bucket code');
          const count = Number(line.count ?? 0);
          lines.push({ code, label: BUCKET_LABELS[code] ?? code, count });
        }
        const total = lines.reduce((sum, line) => sum + line.count, 0);
        if (total > 30_000) return problem(422, 'The lines must not exceed 30,000.');

        const supersedesId = optionalText(body.supersedesId);
        const target = supersedesId ? headcountState.get(supersedesId) : undefined;
        if (supersedesId && (!target || target.supersededBy !== null)) {
          return problem(422, 'supersedesId must name the current observation');
        }
        // A plain new count also supersedes its own lane's tip.
        const laneTip =
          target ??
          [...headcountState.values()].find(
            (headcount) =>
              headcount.sessionDate === sessionDate &&
              headcount.mode === mode &&
              headcount.supersededBy === null,
          );
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
          mode: mode as Headcount['mode'],
          total,
          ended: body.ended === true,
          recordedBy: 'officer-1',
          recordedAt: `${sessionDate}T09:12:00.000Z`,
          supersedesId: laneTip?.id ?? null,
          supersededBy: null,
          lines,
        };

        if (laneTip) headcountState.set(laneTip.id, { ...laneTip, supersededBy: id });
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
      handle: (call, [seriesId]) => {
        // A series is the event parent: the alias serves the parent read, and the
        // UI keeps no series write (AC-65). Only the read routes are stubbed.
        if (call.search.get('view') === 'parent') {
          const parent = parentForId(
            seriesId!,
            call.search.get('from') ?? '',
            call.search.get('to') ?? '',
            createdEvents,
            parentOverrides,
          );
          if (!parent) return problem(404, `Series ${seriesId} was not found`);
          return reply(parent, 200, { ETag: '"e2e-series-parent"' });
        }
        const series = SERIES.find((candidate) => candidate.id === seriesId);
        if (!series) return problem(404, `Series ${seriesId} was not found`);
        return reply(series);
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/audiences$/,
      handle: (call) => {
        // The picker asks with `countAt`; each chip then shows its audience's own
        // count (AC-7/AC-60). Without the date the API omits the field.
        if (!call.search.get('countAt')) return reply({ items: AUDIENCES });
        return reply({
          items: AUDIENCES.map((audience) => ({
            ...audience,
            memberCount: AUDIENCE_MEMBER_COUNTS[audience.id] ?? 0,
          })),
        });
      },
    },
    {
      method: 'POST',
      pattern: /^\/gateway\/v1\/audiences$/,
      handle: (call) => {
        const audience = createdAudience(call.body, `aud-created-${createdAudiences.size + 1}`, [
          ...AUDIENCES,
          ...createdAudiences.values(),
        ]);
        if (typeof audience === 'string') {
          if (audience === 'name_in_use') {
            return problem(
              409,
              `An audience named ${text(asRecord(call.body).name)} already exists`,
            );
          }
          return problem(422, audience);
        }
        createdAudiences.set(audience.id, audience);
        return reply(audience, 201, { Location: `/v1/audiences/${audience.id}` });
      },
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/imports\/formats$/,
      handle: () => reply(IMPORT_FORMATS),
    },
    {
      // AC-19/AC-20: the panel's commit is the subject, so a test may state the reply it expects.
      // Unset, the stub accepts the rows it received and reports them as one batch.
      method: 'POST',
      pattern: /^\/gateway\/v1\/imports\/(members|attendance)$/,
      handle: (call, [kind]) => {
        const body = asRecord(call.body);
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const commit: ImportCommit = {
          kind: kind === 'attendance' ? 'attendance' : 'members',
          body,
          rows,
        };
        // FR-6b: an end-only capture closes the session, so the next parent read reports `ended` and the
        // row and the panel stop offering a capture. The reply's own instant is the capture's `asOf`.
        if (commit.kind === 'attendance' && body.ended === true) {
          const eventId = optionalText(body.eventId);
          if (eventId) closedCaptures.set(eventId, FIXED_INSTANT);
        }
        const override = importReplyFor(commit);
        if (override) return override;

        return reply(
          {
            id: `batch-e2e-${commit.kind}`,
            kind: commit.kind,
            actor: 'officer-1',
            rowCount: rows.length,
            checksum: `sha256:e2e-${commit.kind}`,
            createdAt: FIXED_INSTANT,
            ...(commit.kind === 'attendance'
              ? {
                  eventInstanceId: optionalText(body.eventId),
                  sessionDate: optionalText(body.sessionDate),
                }
              : {}),
          },
          201,
        );
      },
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
  /** Event parents the create route accepted; the detail read finds them here too. */
  private readonly createdEvents = new Map<string, EventParentItem>();
  /** FR-42e: the parent each detail write produced; a later read resolves it. */
  private readonly parentOverrides = new Map<string, EventParentItem>();
  /** Opt-in: the action-state events a capture-state test asks for. */
  includeActionStates = false;
  /**
   * The last create and patch bodies, so a test can assert the wire the browser
   * sent rather than the stub's own re-derivation (AC-56, AC-57).
   */
  lastEventCreate: unknown = null;
  lastEventPatch: unknown = null;
  /** The detail's write verbs, recorded per kind (FR-42e, AC-62/AC-63). */
  lastEventArchive: EventWrite | null = null;
  lastOccurrenceCancel: EventWrite | null = null;
  lastScheduleVersion: EventWrite | null = null;
  /** FR-42h: the edit form's rule save, recorded only when the form sent one. */
  lastScheduleWrite: EventWrite | null = null;
  lastException: EventWrite | null = null;
  lastExceptionDelete: EventWrite | null = null;
  /**
   * Opt-in: the event create answers the mint collision `409` (AC 8) instead of
   * accepting the body, so a test can assert the banner. Unset, the stub is
   * unchanged for every other test.
   */
  simulateMintCollision = false;
  /**
   * Opt-in: the reply the confirmed import POSTs give. Unset, the stub accepts the rows and reports
   * one batch. The behavioural ACs assert the summary and the `422 import_failed` body, so the test
   * that owns the surface states the wire itself (FR-36, FR-37).
   */
  importReply: ((commit: ImportCommit) => ImportStubReply) | null = null;
  private readonly routes: readonly RouteEntry[] = buildRoutes(
    this.created,
    this.createdEvents,
    this.parentOverrides,
    () => this.includeActionStates,
    (commit) => this.importReply?.(commit) ?? null,
    () => this.simulateMintCollision,
    (body) => {
      this.lastEventCreate = body;
    },
    (body) => {
      this.lastEventPatch = body;
    },
    (kind, write) => {
      if (kind === 'archive') this.lastEventArchive = write;
      else if (kind === 'cancel') this.lastOccurrenceCancel = write;
      else if (kind === 'version') this.lastScheduleVersion = write;
      else if (kind === 'schedule') this.lastScheduleWrite = write;
      else if (kind === 'exception') this.lastException = write;
      else this.lastExceptionDelete = write;
    },
  );
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

    // The sign-in gate probes the gateway before it asks for a link; an unstubbed `/health` looked
    // exactly like an unreachable church API, so the gate's own states could never be reached.
    await page.route('**/health', async (route) => {
      const cors = GatewayStub.cors(route.request());
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
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

      // The sign-in gate's own request: an addressed officer gets a link, and the page says so.
      // A 202 with no body is a parse error to `gatewayRequest`, which reads JSON for any non-204.
      if (request.method() === 'POST' && url.pathname === '/auth/magic-link') {
        await route.fulfill({
          status: 202,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'accepted' }),
        });
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
