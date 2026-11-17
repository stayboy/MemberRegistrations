import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchMemberDetail,
  listMinistries,
  type MemberDetail,
  type Ministry,
} from '../api/members';
import { DATE_TIME_STORAGE_KEY, DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MemberDetailPage } from './MemberDetailPage';

/**
 * FR-29 / AC-12: the overview is the signed 2026-11-17 drawing. The four cards,
 * the identity and membership grids, the verified check badge, the shepherd line,
 * the fixed ministries, subscriptions and relationships panels, the four tabs and
 * the tab-row Contacts button are the contract, so those are the cases here.
 * The detail's `contactCount` is 3 while its `contacts` array holds one row, which
 * is what proves the button takes the count and not the values it may not see.
 */
vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    fetchMemberDetail: vi.fn(),
    listMinistries: vi.fn(),
  };
});

vi.mock('../api/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gateway')>();
  return {
    ...actual,
    fetchMe: vi.fn(async () => ({
      id: 'officer-1',
      name: 'Efua Boateng',
      email: 'efua@example.test',
      actorId: 'efua',
    })),
    probeGateway: vi.fn(async () => true),
  };
});

const DETAIL: MemberDetail = {
  id: 'member-1001',
  memberNo: 'M-1001',
  firstName: 'Kwame',
  lastName: 'Asante',
  otherNames: null,
  maidenName: null,
  alias: null,
  dob: '1985-04-12',
  gender: 'male',
  age: 41,
  ageMonths: 492,
  placeOfResidence: 'Tema',
  addressLine: '12 Harbour Road',
  joinedOn: '2019-03-03',
  title: { code: 'ELD', label: 'Elder', titledOn: '2021-02-01' },
  membershipCardNo: 'MC-1001',
  verifiedAt: '2026-11-05T09:00:00.000Z',
  assemblyJoinedOn: '2019-03-03',
  cameFrom: 'Accra Central',
  movedOutOn: null,
  movedToAssembly: null,
  shepherd: {
    memberNo: 'M-1002',
    name: 'Efua Boateng',
    gender: 'female',
    age: 44,
    assignedOn: '2025-01-02',
  },
  calls: { attempts: 6, conversations: 4, lastCalledOn: '2026-11-14', lastReachedOn: '2026-11-14' },
  isPresbyter: true,
  archivedAt: null,
  contactCount: 3,
  ministries: [
    { code: 'CHOIR', name: 'Choir', position: { code: 'MEMBER', label: 'Member' } },
    { code: 'USH', name: 'Ushering', position: null },
  ],
  purgedAt: null,
  version: 3,
  createdAt: '2024-01-07T09:30:00.000Z',
  updatedAt: '2024-05-02T11:00:00.000Z',
  contacts: [
    {
      id: 'contact-1001-phone',
      kind: 'phone',
      value: '+233 20 000 0001',
      displayOrder: 0,
      ownerMemberNo: 'M-1001',
      linked: false,
    },
  ],
  subscriptions: [
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
    {
      id: 'subscription-3',
      kind: 'credit_union',
      scope: 'individual',
      status: 'expired',
      reference: 'POL-0003',
      startedOn: '2022-01-09',
      endedOn: '2025-09-30',
      role: 'policyholder',
      policyholderMemberNo: 'M-1001',
      coveredMemberNos: [],
    },
  ],
  relationships: [
    {
      id: 'relationship-1',
      type: 'spouse',
      isDependent: false,
      memberNo: 'M-1003',
      name: 'Ama Mensah',
      gender: 'female',
      age: null,
      archived: false,
    },
    {
      id: 'relationship-2',
      type: 'child',
      isDependent: true,
      memberNo: 'M-1004',
      name: 'Kofi Owusu',
      gender: 'male',
      age: null,
      archived: false,
    },
  ],
  attendance: [
    {
      seriesId: 'series-1',
      seriesName: 'Sunday Service',
      ministry: null,
      attended: 4,
      expected: 4,
      remaining: 0,
      status: 'ongoing',
      entries: [
        {
          id: 'attendance-1',
          date: '2026-10-04',
          source: 'import',
          eventId: 'event-1',
          eventName: 'Sunday Service',
        },
        {
          id: 'attendance-2',
          date: '2026-11-01',
          source: 'import',
          eventId: 'event-2',
          eventName: 'Sunday Service',
        },
        {
          id: 'attendance-3',
          date: '2026-11-08',
          source: 'manual',
          eventId: 'event-3',
          eventName: 'Sunday Service',
        },
        {
          id: 'attendance-4',
          date: '2026-11-22',
          source: 'import',
          eventId: 'event-4',
          eventName: 'Sunday Service',
        },
      ],
    },
    {
      seriesId: null,
      seriesName: null,
      ministry: null,
      attended: 1,
      expected: 1,
      remaining: 0,
      status: 'ongoing',
      entries: [
        {
          id: 'attendance-5',
          date: '2026-11-14',
          source: 'manual',
          eventId: 'event-5',
          eventName: 'Harvest',
        },
      ],
    },
  ],
};

/** A member with nothing on any surface: the drawing's empty state. */
const EMPTY: MemberDetail = {
  ...DETAIL,
  id: 'member-1002',
  memberNo: 'M-1002',
  firstName: 'Ama',
  lastName: 'Mensah',
  gender: 'female',
  age: null,
  ageMonths: null,
  placeOfResidence: null,
  addressLine: null,
  title: null,
  membershipCardNo: null,
  verifiedAt: null,
  assemblyJoinedOn: null,
  cameFrom: null,
  movedOutOn: null,
  movedToAssembly: null,
  shepherd: null,
  calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
  isPresbyter: false,
  contactCount: 0,
  ministries: [],
  contacts: [],
  subscriptions: [],
  relationships: [],
  attendance: [],
};

const MINISTRIES: Ministry[] = [
  { code: 'CHOIR', name: 'Choir', description: null, active: true },
  { code: 'USH', name: 'Ushering', description: null, active: true },
  { code: 'HOSP', name: 'Hospitality', description: null, active: true },
];

const fetchMemberDetailMock = vi.mocked(fetchMemberDetail);
const listMinistriesMock = vi.mocked(listMinistries);

beforeEach(() => {
  // Pin only the clock: the cards read the current UTC quarter and month, while
  // React Query and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'));

  window.localStorage.setItem(
    DATE_TIME_STORAGE_KEY,
    JSON.stringify({ dateStyle: 'dmy', timeCycle: 'h24' }),
  );

  fetchMemberDetailMock.mockReset();
  fetchMemberDetailMock.mockImplementation(async (_baseUrl, _token, memberNo) => ({
    member: memberNo === EMPTY.memberNo ? EMPTY : DETAIL,
    etag: '"v3"',
  }));

  listMinistriesMock.mockReset();
  listMinistriesMock.mockResolvedValue(MINISTRIES);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

function renderDetail(memberNo = DETAIL.memberNo): void {
  renderWithProviders(
    <MemoryRouter initialEntries={[`/members/${memberNo}`]}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/members/:memberNo" element={<MemberDetailPage />} />
            <Route path="/members" element={<div>Members</div>} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('MemberDetailPage overview (FR-29, AC-12)', () => {
  it('renders the four cards with their values, captions and the empty copies', async () => {
    renderDetail();

    const attended = await screen.findByTestId('overview-card-attended');
    expect(attended).toHaveTextContent('Q4 2026 · 5');
    expect(attended).toHaveTextContent('November · 4');
    expect(attended).toHaveTextContent('UTC calendar dates across 2 series rows');
    expect(attended).toHaveAccessibleName('Attended: Q4 2026 · 5 · November · 4');

    const last = screen.getByTestId('overview-card-last-attended');
    expect(last).toHaveTextContent('Sunday Service');
    expect(last).toHaveTextContent('22 November 2026');
    expect(last).toHaveTextContent('Latest entry; ties by event name');

    const calls = screen.getByTestId('overview-card-shepherd-calls');
    expect(calls).toHaveTextContent('6 · last reached 14 November 2026');
    expect(calls).toHaveTextContent('Current assignment, all-time');
    expect(calls).toHaveAccessibleName('Shepherd calls: 6 · last reached 14 November 2026');

    const most = screen.getByTestId('overview-card-most-attended');
    expect(most).toHaveTextContent('Sunday Service · 4 times');
    expect(most).toHaveTextContent('Grouped by series; standalone by event');
  });

  it('states the empty copies and zero counts for a member with no attendance or calls', async () => {
    renderDetail(EMPTY.memberNo);

    const attended = await screen.findByTestId('overview-card-attended');
    expect(attended).toHaveTextContent('Q4 2026 · 0');
    expect(attended).toHaveTextContent('November · 0');
    expect(attended).toHaveTextContent('UTC calendar dates across 0 series rows');

    const last = screen.getByTestId('overview-card-last-attended');
    expect(last).toHaveTextContent('No attendance recorded');
    expect(last).toHaveAccessibleName('Last attended: No attendance recorded');

    const calls = screen.getByTestId('overview-card-shepherd-calls');
    expect(calls).toHaveTextContent('No calls logged');
    expect(calls).toHaveAccessibleName('Shepherd calls: No calls logged');

    const most = screen.getByTestId('overview-card-most-attended');
    expect(most).toHaveTextContent('No attendance recorded');
    expect(most).toHaveAccessibleName('Most attended: No attendance recorded');
  });

  it('reduces the tabs to four and puts View Contacts (contactCount) on the tab row', async () => {
    const user = userEvent.setup();
    renderDetail();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(4);
    for (const name of ['Overview', 'Attendance', 'Subscriptions', 'Shepherding']) {
      expect(screen.getByRole('tab', { name })).toBeVisible();
    }
    expect(screen.queryByRole('tab', { name: 'Ministries' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Relationships' })).not.toBeInTheDocument();

    const contacts = screen.getByRole('button', { name: 'View Contacts (3)' });
    await user.click(contacts);

    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    // The button counted 3 while the detail could only render one value: the
    // label reads `contactCount`, never `contacts.length` (AC-47, R6).
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
    expect(within(dialog).getByText('+233 20 000 0001')).toBeVisible();
  });

  it('shows the identity and membership grids, the verified badge and the shepherd line', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Membership' })).toBeVisible();

    for (const label of [
      'Membership card',
      'Presbyter title',
      'Assembly joined',
      'Came from',
      'Moved out',
      'Moved to',
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByText('MC-1001')).toBeVisible();
    expect(screen.getByText('Elder ELD')).toBeVisible();
    expect(screen.getByText('Accra Central')).toBeVisible();
    // A populated record's absent membership field is an em dash.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);

    const verified = screen.getByTestId('member-verified');
    expect(verified).toHaveAccessibleName(/^Verified /);
    expect(verified).toHaveAccessibleName(/2026/);

    expect(
      screen.getByText(/Efua Boateng \(Female, 44y\) · assigned 2 January 2025/),
    ).toBeVisible();
    expect(screen.queryByText(/presbyter rank/i)).not.toBeInTheDocument();
  });

  it('shows ministries with roles, every subscription row and the fixed relationship rows', async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: /Ministries 2/ })).toBeVisible();
    const ministries = screen.getByRole('list', { name: 'Assigned ministries' });
    expect(ministries).toHaveTextContent('Choir · CHOIR · Member');
    expect(ministries).toHaveTextContent('Ushering · USH · No role recorded');
    expect(screen.getByRole('button', { name: 'Remove Choir' })).toBeVisible();

    expect(screen.getByRole('heading', { level: 2, name: /Subscriptions/ })).toBeVisible();
    expect(screen.getByText('1 active · 1 ended or expired')).toBeVisible();
    expect(screen.getByText('POL-0001 · Life insurance')).toBeVisible();
    expect(screen.getByText('Active · no end date')).toBeVisible();
    expect(screen.getByText('POL-0003 · Credit union')).toBeVisible();
    expect(screen.getByText('Expired · ended 30 September 2025')).toBeVisible();

    expect(screen.getByRole('heading', { level: 2, name: /Relationships 2/ })).toBeVisible();
    expect(screen.getByText('Spouse · M-1003')).toBeVisible();
    expect(screen.getByText('Dependent · M-1004')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'View all' }));
    expect(await screen.findByRole('button', { name: 'Add subscription' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Subscriptions' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('expands the ministry and relationship add rows in place', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('Ministry')).toBeVisible();
    expect(screen.getByTestId('ministry-add')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add relationship' }));
    expect(await screen.findByLabelText(/^Related member/)).toBeVisible();
    expect(screen.getByTestId('relationship-add')).toBeVisible();
    expect(screen.getByText('Removing deletes the link, never the member.')).toBeVisible();
  });

  it('states the empty panels and renders No contacts with no button', async () => {
    renderDetail(EMPTY.memberNo);

    expect(await screen.findByText('No ministries recorded')).toBeVisible();
    expect(screen.getByText('No subscriptions recorded')).toBeVisible();
    expect(screen.getByText('No relationships recorded')).toBeVisible();
    expect(screen.getByText('No presbyter title recorded')).toBeVisible();
    expect(screen.getAllByText('Not recorded')).toHaveLength(4);
    expect(screen.getByText(/No shepherd assigned/)).toBeVisible();

    expect(screen.getByText('No contacts')).toBeVisible();
    expect(screen.queryByRole('button', { name: /View Contacts/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-verified')).not.toBeInTheDocument();
  });
});
