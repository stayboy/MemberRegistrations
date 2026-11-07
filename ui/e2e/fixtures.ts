import { expect, test as base, type Page } from 'playwright/test';
import type { EventAttendance, EventItem, EventOfferingStatsItem } from '../src/api/events';
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
import type { OccurrenceListDto, SeriesDto } from '../src/api/series';
import type { AccentId, Scheme } from '../src/theme/brand';

export const SESSION_STORAGE_KEY = 'mr.session.v1';
export const GATEWAY_STORAGE_KEY = 'mr.gateway.v1';
export const THEME_STORAGE_KEY = 'mr.theme.v1';

/** 48 characters, well past the 10-character floor `parseSession` enforces. */
export const SESSION_TOKEN = 'e2e-session-credential-0123456789abcdef012345';
/** Fixed far-future expiry: no test reads the real clock to decide "usable". */
const SESSION_EXPIRES_AT = '2099-01-01T00:00:00.000Z';

const FIXED_INSTANT = '2026-01-05T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Seeded browser state
// ---------------------------------------------------------------------------

/**
 * `RequireSession` needs a stored credential, and the gateway base must point at
 * this preview origin so every `fetch` lands on the stubbed route. Both land
 * before the first script runs, so the first render is already signed in.
 */
export async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    ([sessionKey, gatewayKey, token, expiresAt]) => {
      sessionStorage.setItem(sessionKey, JSON.stringify({ token, expiresAt }));
      localStorage.setItem(gatewayKey, window.location.origin);
    },
    [SESSION_STORAGE_KEY, GATEWAY_STORAGE_KEY, SESSION_TOKEN, SESSION_EXPIRES_AT] as const,
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
        present: 3,
        expected: 42,
        importedRows: 2,
        source: 'mixed',
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
        present: 0,
        expected: 12,
        importedRows: 0,
        source: 'none',
      },
      {
        date: '2026-01-11',
        startTime: '08:30',
        endTime: null,
        status: 'scheduled',
        present: 0,
        expected: 12,
        importedRows: 0,
        source: 'none',
      },
    ],
    offerings: [],
    stats: EMPTY_OFFERING_STATS,
  },
];

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
    exceptions: [{ date: '2026-01-11', kind: 'cancelled', note: 'Public holiday' }],
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
      contacts: CONTACTS_1002,
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
      contacts: [
        {
          id: 'contact-1003-phone',
          kind: 'phone',
          value: '+233 20 000 0003',
          displayOrder: 0,
          ownerMemberNo: 'M-1003',
          linked: false,
        },
      ],
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
      contacts: [
        {
          id: 'contact-1005-email',
          kind: 'email',
          value: 'adjoa.boateng@example.test',
          displayOrder: 0,
          ownerMemberNo: 'M-1005',
          linked: false,
        },
      ],
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
      contacts: [],
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
      pattern: /^\/gateway\/v1\/events$/,
      handle: () => reply({ items: EVENTS }),
    },
    {
      method: 'GET',
      pattern: /^\/gateway\/v1\/events\/([^/]+)\/attendance$/,
      handle: (call, [eventId]) => {
        if (eventId !== ATTENDANCE_EVENT_1.eventId) {
          return problem(404, `Event ${eventId} was not found`);
        }
        const date = call.search.get('date') ?? ATTENDANCE_EVENT_1.sessionDate;
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
      pattern: /^\/gateway\/v1\/series$/,
      handle: () => reply({ items: SERIES }),
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

  async install(page: Page): Promise<void> {
    // The connection badge probes the base URL directly, outside the gateway
    // prefix; answer it so every screen is in its connected state.
    await page.route('**/health', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ok' }),
      }),
    );

    // The session gateway's auth routes live at `/auth/*`, not under
    // `/gateway/v1/*`: `fetchMe` calls `${baseUrl}/auth/me`.
    await page.route('**/auth/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'GET' && url.pathname === '/auth/me') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(OFFICER),
        });
        return;
      }

      if (request.method() === 'POST' && url.pathname === '/auth/logout') {
        await route.fulfill({ status: 204 });
        return;
      }

      const unmatched = `${request.method()} ${url.pathname}${url.search}`;
      this.unmatched.push(unmatched);
      await route.fulfill({
        status: 500,
        headers: { 'content-type': 'application/json' },
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
          headers: { 'content-type': 'application/json' },
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
