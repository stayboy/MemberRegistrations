import { screen, waitFor, within } from '@testing-library/react';
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
  photoUpdatedAt: null,
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
  guardian: null,
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
  guardian: null,
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
  it('renders the four cards with their values, labels and accessible names', async () => {
    renderDetail();

    const attended = await screen.findByTestId('overview-card-attended');
    expect(screen.getByTestId('overview-card-attended-cell-0')).toHaveTextContent('5');
    expect(within(attended).getByText('This year')).toBeVisible();
    expect(screen.getByTestId('overview-card-attended-cell-1')).toHaveTextContent('5');
    expect(within(attended).getByText('This quarter')).toBeVisible();
    expect(screen.getByTestId('overview-card-attended-cell-2')).toHaveTextContent('4');
    expect(within(attended).getByText('This month')).toBeVisible();
    expect(attended).toHaveAccessibleName(
      'Attended: 5 this year (2026) · 5 this quarter (Q4 2026) · 4 this month (November 2026)',
    );
    // The exact periods live in the tooltip; the visible labels stay short.
    const user = userEvent.setup();
    expect(
      screen.queryByRole('tooltip', { name: /Q4 2026/ }),
      'the tooltip rendered before any hover',
    ).not.toBeInTheDocument();
    await user.hover(attended);
    const tooltip = await screen.findByRole('tooltip', {
      name: '2026 · Q4 2026 · November 2026',
    });
    expect(tooltip).toHaveTextContent('2026 · Q4 2026 · November 2026');
    // No card carries a caption of its own.
    expect(attended).not.toHaveTextContent(/series rows|Ties by|all-time|ties by event name/i);

    const last = screen.getByTestId('overview-card-last-attended');
    expect(within(last).getByText('Sunday Service')).toBeVisible();
    expect(within(last).getByText('22 November 2026')).toBeVisible();
    expect(last).toHaveAccessibleName('Last attended: Sunday Service · 22 November 2026');

    const calls = screen.getByTestId('overview-card-shepherd-calls');
    expect(within(calls).getByText('6×')).toBeVisible();
    expect(within(calls).getByText('Number of calls')).toBeVisible();
    expect(within(calls).getByText('14 November 2026')).toBeVisible();
    expect(within(calls).getByText('Last reached')).toBeVisible();
    expect(calls).toHaveAccessibleName('Shepherd calls: 6 times · last reached 14 November 2026');

    const most = screen.getByTestId('overview-card-most-attended');
    expect(within(most).getByText('Sunday Service (4×)')).toBeVisible();
    expect(most).toHaveAccessibleName('Most attended: Sunday Service, 4 times');
  });

  it('states the empty copies, three zeros and the no-calls branch for a member with nothing', async () => {
    renderDetail(EMPTY.memberNo);

    const attended = await screen.findByTestId('overview-card-attended');
    for (const index of [0, 1, 2]) {
      expect(screen.getByTestId(`overview-card-attended-cell-${index}`)).toHaveTextContent('0');
    }
    expect(within(attended).getByText('This year')).toBeVisible();
    expect(within(attended).getByText('This quarter')).toBeVisible();
    expect(within(attended).getByText('This month')).toBeVisible();
    expect(attended).toHaveAccessibleName(
      'Attended: 0 this year (2026) · 0 this quarter (Q4 2026) · 0 this month (November 2026)',
    );

    const last = screen.getByTestId('overview-card-last-attended');
    expect(within(last).getByText('No attendance recorded')).toBeVisible();
    expect(last).toHaveAccessibleName('Last attended: No attendance recorded');

    const calls = screen.getByTestId('overview-card-shepherd-calls');
    expect(within(calls).getByText('0')).toBeVisible();
    expect(within(calls).getByText('—')).toBeVisible();
    expect(within(calls).getByText('Number of calls')).toBeVisible();
    expect(within(calls).getByText('Last reached')).toBeVisible();
    expect(calls).toHaveAccessibleName('Shepherd calls: No calls logged');

    const most = screen.getByTestId('overview-card-most-attended');
    expect(within(most).getByText('No attendance recorded')).toBeVisible();
    expect(most).toHaveAccessibleName('Most attended: No attendance recorded');
  });

  it('reduces the tabs to four and puts View Contacts (contactCount) on the tab row', async () => {
    const user = userEvent.setup();
    renderDetail();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(4);
    for (const name of ['Overview', 'Attendance', 'Welfare & Services', 'Shepherding']) {
      expect(screen.getByRole('tab', { name })).toBeVisible();
    }
    expect(screen.queryByRole('tab', { name: 'Subscriptions' })).not.toBeInTheDocument();
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

  it('moves the avatar and badges into the page header, on either side of the h1', async () => {
    renderDetail();

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Kwame Asante (Male, 41y)',
    });
    const avatar = screen.getByTestId('member-header-avatar');
    const verified = screen.getByTestId('member-verified');

    // The avatar leads the heading; the checked badge, the Presbyter tag and the status
    // badge follow it (FR-29, AC-12).
    expect(avatar.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(heading.compareDocumentPosition(verified) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(verified).toHaveAccessibleName('Verified · 5 November 2026');
    expect(screen.getByText('Presbyter')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
  });

  it('leaves the header badgeless for a member without verifiedAt, with the status badge only', async () => {
    renderDetail(EMPTY.memberNo);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ama Mensah (Female)' }),
    ).toBeVisible();
    expect(screen.getByTestId('member-header-avatar')).toBeVisible();
    expect(screen.queryByTestId('member-verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Presbyter')).not.toBeInTheDocument();
    expect(screen.getByText('Active')).toBeVisible();
  });

  it('shows the four-cell Identity grid, the membership grid and the shepherd line', async () => {
    renderDetail();

    const identityHeading = await screen.findByRole('heading', { level: 2, name: 'Identity' });
    const identity = identityHeading.closest('section');
    expect(identity).not.toBeNull();
    if (!identity) return;

    for (const label of ['Joined', 'Date of birth', 'Place of residence', 'Address line']) {
      expect(within(identity).getByText(label)).toBeVisible();
    }
    // The header now states the member, so the overview keeps no duplicate identity
    // block and no member-number or Presbyter yes/no field.
    expect(within(identity).queryByText('Member number')).not.toBeInTheDocument();
    expect(within(identity).queryByText('Presbyter')).not.toBeInTheDocument();
    expect(screen.queryByText('Kwame Asante')).not.toBeInTheDocument();

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

    expect(
      screen.getByText(/Efua Boateng \(Female, 44y\) · assigned 2 January 2025/),
    ).toBeVisible();
    expect(screen.queryByText(/presbyter rank/i)).not.toBeInTheDocument();
  });

  it('names the fixed surface Welfare & Services in its heading, list and foot copy', async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: /Ministries 2/ })).toBeVisible();
    const ministries = screen.getByRole('list', { name: 'Assigned ministries' });
    expect(ministries).toHaveTextContent('Choir · CHOIR · Member');
    expect(ministries).toHaveTextContent('Ushering · USH · No role recorded');
    expect(screen.getByRole('button', { name: 'Remove Choir' })).toBeVisible();

    expect(screen.getByRole('heading', { level: 2, name: 'Welfare & Services' })).toBeVisible();
    expect(screen.getByText('1 active · 1 ended or expired')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Welfare & Services' })).toHaveTextContent(
      'POL-0001 · Life insurance',
    );
    expect(screen.getByText('POL-0001 · Life insurance')).toBeVisible();
    expect(screen.getByText('Active · no end date')).toBeVisible();
    expect(screen.getByText('POL-0003 · Credit union')).toBeVisible();
    expect(screen.getByText('Expired · ended 30 September 2025')).toBeVisible();
    expect(screen.getByText('Add and end from the Welfare & Services tab.')).toBeVisible();

    expect(screen.getByRole('heading', { level: 2, name: /Relationships 2/ })).toBeVisible();
    expect(screen.getByText('Spouse · M-1003')).toBeVisible();
    expect(screen.getByText('Dependent · M-1004')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'View all' }));
    expect(await screen.findByRole('button', { name: 'Add subscription' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Welfare & Services' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Welfare & Services' })).toBeVisible();
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

describe('MemberDetailPage action row (MR-1..MR-4, AC-MR1..AC-MR3)', () => {
  it('keeps Edit visible and puts the page actions before the destructive group', async () => {
    const user = userEvent.setup();
    renderDetail();

    // Edit is a primary button, never a menu item.
    const edit = await screen.findByRole('button', { name: 'Edit' });
    expect(edit).toBeVisible();
    expect(edit).toHaveClass(/fui-Button/);
    expect(edit.closest('[role="menu"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      'View contacts',
      'Assign shepherd',
      'Add ministry',
      'Add relationship',
      'Add subscription',
      'Archive',
      'Purge',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();

    // The destructive group starts after the divider.
    const dividers = [...document.querySelectorAll<HTMLElement>('.fui-MenuDivider')];
    expect(dividers).toHaveLength(1);
    const archive = screen.getByRole('menuitem', { name: 'Archive' });
    expect(dividers[0]!.nextElementSibling).toBe(archive);
  });

  it('offers Restore instead of Archive for an archived member and always keeps Purge', async () => {
    const user = userEvent.setup();
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: { ...EMPTY, archivedAt: '2026-02-01T00:00:00.000Z' },
      etag: '"v4"',
    });
    renderDetail(EMPTY.memberNo);

    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Purge' })).toBeInTheDocument();
  });

  it('opens the contacts dialog from the menu', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'View contacts' }));

    expect(
      await screen.findByText(/Contact values are shown only after this explicit action/),
    ).toBeVisible();
  });

  it('switches to Overview and focuses the ministry add control', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add ministry' }));

    await waitFor(() => {
      expect(document.getElementById('member-ministries-add')).toHaveFocus();
    });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to Welfare & Services and focuses the subscription add control', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add subscription' }));

    await waitFor(() => {
      expect(document.getElementById('member-subscription-add')).toHaveFocus();
    });
    expect(screen.getByRole('tab', { name: /Welfare & Services/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('MemberDetailPage guardian projection (MR-41, AC-MR26)', () => {
  it('shows the guardian and the resolved contact when the member has no own contact', async () => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...EMPTY,
        guardian: {
          memberNo: 'A-1001',
          name: 'Adwoa Mensah',
          contactMasked: '***01',
          via: [],
        },
      },
      etag: '"v4"',
    });
    renderDetail(EMPTY.memberNo);

    const line = await screen.findByTestId('member-guardian-line');
    expect(line).toHaveTextContent('Via Adwoa Mensah (A-1001) · ***01');
    expect(screen.getByText('No contacts')).toBeVisible();
  });

  it('names the intermediate member when the chain is longer than one link', async () => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...EMPTY,
        guardian: {
          memberNo: 'A-1001',
          name: 'Adwoa Mensah',
          contactMasked: '***01',
          via: ['Kojo Boateng'],
        },
      },
      etag: '"v4"',
    });
    renderDetail(EMPTY.memberNo);

    expect(await screen.findByTestId('member-guardian-line')).toHaveTextContent(
      'Via Adwoa Mensah (A-1001) · ***01 · via Kojo Boateng',
    );
  });

  it('keeps both a contact and a guardian on the record', async () => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...DETAIL,
        guardian: {
          memberNo: 'A-1001',
          name: 'Adwoa Mensah',
          contactMasked: '***01',
          via: [],
        },
      },
      etag: '"v3"',
    });
    renderDetail();

    expect(await screen.findByTestId('member-guardian-line')).toHaveTextContent(
      'Via Adwoa Mensah (A-1001)',
    );
    expect(screen.getByRole('button', { name: /View Contacts/ })).toBeVisible();
  });
});
