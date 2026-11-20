import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmMember,
  fetchMemberDetail,
  listMinistries,
  requestMemberVerification,
  revokeMemberVerification,
  type MemberDetail,
  type Ministry,
} from '../api/members';
import { ApiError } from '../api/errors';
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
    requestMemberVerification: vi.fn(),
    revokeMemberVerification: vi.fn(),
    confirmMember: vi.fn(),
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
  verifiedContacts: [
    {
      id: 'contact-1001-phone',
      channel: 'phone',
      masked: '+233 *** 01',
      verifiedAt: '2026-11-05T09:00:00.000Z',
    },
  ],
  confirmedAt: null,
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
const requestVerificationMock = vi.mocked(requestMemberVerification);
const revokeVerificationMock = vi.mocked(revokeMemberVerification);
const confirmMemberMock = vi.mocked(confirmMember);

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
    // A refetch after a send must answer the same member, not the fixture's
    // default: the route's number is what the dialog's context names.
    member: memberNo === DETAIL.memberNo ? DETAIL : { ...EMPTY, memberNo },
    etag: '"v3"',
  }));

  listMinistriesMock.mockReset();
  listMinistriesMock.mockResolvedValue(MINISTRIES);

  requestVerificationMock.mockReset();
  revokeVerificationMock.mockReset();
  confirmMemberMock.mockReset();
  confirmMemberMock.mockResolvedValue({ confirmedAt: '2026-11-17T12:05:00.000Z' });
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
    expect(await within(dialog).findAllByRole('listitem')).toHaveLength(1);
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
    expect(verified).toHaveAccessibleName('Verified · Phone · 5 November 2026');
    expect(screen.getByText('Presbyter')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
  });

  it('leaves the header badgeless for a member with no proof or confirmation, with the status badge only', async () => {
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
      'Confirm member',
      'Revoke verification',
      'Archive',
      'Purge',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();

    // MR-2: `Revoke verification` is not destructive, so it stays above the
    // divider, with Archive/Restore and Purge in the group beneath it.
    const dividers = [...document.querySelectorAll<HTMLElement>('.fui-MenuDivider')];
    expect(dividers).toHaveLength(1);
    const revoke = screen.getByRole('menuitem', { name: 'Revoke verification' });
    expect(revoke.compareDocumentPosition(dividers[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(dividers[0]!.nextElementSibling).toBe(screen.getByRole('menuitem', { name: 'Archive' }));
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

describe('MemberDetailPage verification (MR-29, MR-31, MR-34, MR-35)', () => {
  const OWN_PHONE = {
    id: 'contact-1002-phone',
    kind: 'phone' as const,
    value: '+233 20 000 0002',
    displayOrder: 0,
    ownerMemberNo: 'M-1002',
    linked: false,
  };
  const UNVERIFIED: MemberDetail = {
    ...EMPTY,
    memberNo: 'M-1005',
    contactCount: 1,
    contacts: [OWN_PHONE],
  };

  function renderUnverified(member: MemberDetail = UNVERIFIED): void {
    fetchMemberDetailMock.mockResolvedValueOnce({ member, etag: '"v1"' });
    renderDetail(member.memberNo);
  }

  it('names the proof and the date in the badge, and lists the mask in its title', async () => {
    renderDetail();

    const badge = await screen.findByTestId('member-verified');
    expect(badge).toHaveAccessibleName('Verified · Phone · 5 November 2026');
  });

  it.each([
    ['email', 'Email'],
    ['whatsapp', 'WhatsApp'],
    ['phone', 'Phone'],
  ] as const)('names the %s proof in the badge', async (channel, label) => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...DETAIL,
        verifiedContacts: [
          {
            id: `contact-proof-${channel}`,
            channel,
            masked: channel === 'email' ? 'a***@example.test' : '+233 *** 01',
            verifiedAt: '2026-11-05T09:00:00.000Z',
          },
        ],
      },
      etag: '"v3"',
    });
    renderDetail();

    expect(await screen.findByTestId('member-verified')).toHaveAccessibleName(
      `Verified · ${label} · 5 November 2026`,
    );
  });

  it('lists every contact proof in the title, newest first (AC-MR46)', async () => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...DETAIL,
        verifiedContacts: [
          {
            id: 'contact-1001-phone',
            channel: 'phone',
            masked: '+233 *** 01',
            verifiedAt: '2026-11-04T09:00:00.000Z',
          },
          {
            id: 'contact-1001-email',
            channel: 'email',
            masked: 'k***@example.test',
            verifiedAt: '2026-11-05T09:00:00.000Z',
          },
        ],
      },
      etag: '"v4"',
    });
    renderDetail();

    expect(await screen.findByTestId('member-verified')).toHaveAccessibleName(
      'Verified · Email · 5 November 2026',
    );
    const user = userEvent.setup();
    await user.hover(screen.getByTestId('member-verified'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Email k***@example.test · 5 November 2026');
    expect(tooltip).toHaveTextContent('Phone +233 *** 01 · 4 November 2026');
  });

  it('names the most recent proof when the confirmation and a contact proof both exist', async () => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...DETAIL,
        verifiedContacts: [
          {
            id: 'contact-1001-email',
            channel: 'email',
            masked: 'k***@example.test',
            verifiedAt: '2026-11-01T09:00:00.000Z',
          },
        ],
        confirmedAt: '2026-11-06T09:00:00.000Z',
      },
      etag: '"v3"',
    });
    renderDetail();

    expect(await screen.findByTestId('member-verified')).toHaveAccessibleName(
      'Verified · Officer · 6 November 2026',
    );
    // The title lists every proof, so an officer sees the email proof too.
    const user = userEvent.setup();
    await user.hover(screen.getByTestId('member-verified'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Officer confirmed · 6 November 2026');
    expect(tooltip).toHaveTextContent('Email k***@example.test · 1 November 2026');
  });

  it('renders no badge for an imported date with no audit row', async () => {
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: { ...DETAIL, verifiedContacts: [], confirmedAt: null },
      etag: '"v3"',
    });
    renderDetail();

    await screen.findByRole('heading', { level: 1, name: 'Kwame Asante (Male, 41y)' });
    expect(screen.queryByTestId('member-verified')).not.toBeInTheDocument();
  });

  it('offers Verify membership for an unverified member with an own number and sends at once', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockResolvedValueOnce({
      destination: { channel: 'phone', masked: '+233 *** 01' },
      expiresAt: '2026-11-17T12:10:00.000Z',
    });
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Revoke verification' })).not.toBeInTheDocument();
    // MR-2: the verification verb sits above the destructive divider.
    const divider = document.querySelector<HTMLElement>('.fui-MenuDivider');
    expect(divider).not.toBeNull();
    const verifyItem = screen.getByRole('menuitem', { name: 'Verify membership' });
    expect(verifyItem.compareDocumentPosition(divider!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(divider!.nextElementSibling).toBe(screen.getByRole('menuitem', { name: 'Archive' }));
    await user.click(verifyItem);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Verify membership' })).toBeVisible();
    expect(within(dialog).getByTestId('verify-context')).toHaveTextContent(
      'Ama Mensah · M-1005 · not yet verified',
    );
    expect(within(dialog).getByTestId('verify-lead')).toHaveTextContent(
      "A six-digit code was sent to the member's phone and expires at",
    );
    expect(within(dialog).getByTestId('verify-lead')).toHaveTextContent(
      /expires at \d{2}:\d{2}\.$/,
    );
    expect(within(dialog).getByTestId('verify-destination')).toHaveTextContent('Phone');
    expect(within(dialog).getByTestId('verify-destination')).toHaveTextContent('+233 *** 01');
    expect(within(dialog).getByTestId('verify-note')).toHaveTextContent(
      'SMS is completed on the member acceptance page: open the link we sent to +233 *** 01 and enter the six-digit code. The code is never shown here, and the officer never sees it.',
    );
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toBeVisible();
    expect(close).not.toHaveClass(/fui-Button--primary/);
    expect(requestVerificationMock).toHaveBeenCalledWith(
      expect.anything(),
      'dom-lane-session',
      'M-1005',
    );
  });

  it('names the email destination and the shared link when the code went to an email', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockResolvedValueOnce({
      destination: { channel: 'email', masked: 'v***@example.test' },
      expiresAt: '2026-11-17T12:10:00.000Z',
    });
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Verify membership' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('verify-lead')).toHaveTextContent(
      "A six-digit code was sent to the member's email and expires at",
    );
    expect(within(dialog).getByTestId('verify-destination')).toHaveTextContent('Email');
    expect(within(dialog).getByTestId('verify-destination')).toHaveTextContent('v***@example.test');
    expect(within(dialog).getByTestId('verify-note')).toHaveTextContent(
      'Email is completed on the member acceptance page: open the link we sent to v***@example.test and enter the six-digit code. The code is never shown here, and the officer never sees it.',
    );
  });

  it('names WhatsApp in the note when WhatsApp is the resolved channel', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockResolvedValueOnce({
      destination: { channel: 'whatsapp', masked: '+233 *** 42' },
      expiresAt: '2026-11-17T12:10:00.000Z',
    });
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Verify membership' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('verify-destination')).toHaveTextContent('WhatsApp');
    expect(within(dialog).getByTestId('verify-destination')).toHaveTextContent('+233 *** 42');
    expect(within(dialog).getByTestId('verify-note')).toHaveTextContent(
      'WhatsApp is completed on the member acceptance page: open the link we sent to +233 *** 42 and enter the six-digit code. The code is never shown here, and the officer never sees it.',
    );
  });

  it('offers Verify membership to an email-only member (MR-43)', async () => {
    const user = userEvent.setup();
    renderUnverified({
      ...EMPTY,
      memberNo: 'M-1007',
      contactCount: 1,
      contacts: [
        {
          id: 'contact-1007-email',
          kind: 'email',
          value: 'only@example.test',
          displayOrder: 0,
          ownerMemberNo: 'M-1007',
          linked: false,
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Verify membership' })).toBeInTheDocument();
  });

  it('offers Verify membership while another owned contact is unproven (AC-MR46)', async () => {
    const user = userEvent.setup();
    const provenPhone = {
      id: 'contact-1008-phone',
      kind: 'phone' as const,
      value: '+233 20 000 0008',
      displayOrder: 0,
      ownerMemberNo: 'M-1008',
      linked: false,
    };
    const unprovenEmail = {
      id: 'contact-1008-email',
      kind: 'email' as const,
      value: 'mixed@example.test',
      displayOrder: 1,
      ownerMemberNo: 'M-1008',
      linked: false,
    };
    renderUnverified({
      ...EMPTY,
      memberNo: 'M-1008',
      contactCount: 2,
      contacts: [provenPhone, unprovenEmail],
      verifiedContacts: [
        {
          id: provenPhone.id,
          channel: 'phone',
          masked: '+233 *** 08',
          verifiedAt: '2026-11-05T09:00:00.000Z',
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Verify membership' })).toBeInTheDocument();
    // The badge still states the proof that exists.
    expect(await screen.findByTestId('member-verified')).toHaveAccessibleName(
      'Verified · Phone · 5 November 2026',
    );
  });

  it('does not offer Verify membership when every owned contact is proven (AC-MR46)', async () => {
    const user = userEvent.setup();
    const phone = { ...OWN_PHONE, ownerMemberNo: 'M-1009' };
    const email = {
      id: 'contact-1009-email',
      kind: 'email' as const,
      value: 'both@example.test',
      displayOrder: 1,
      ownerMemberNo: 'M-1009',
      linked: false,
    };
    renderUnverified({
      ...EMPTY,
      memberNo: 'M-1009',
      contactCount: 2,
      contacts: [phone, email],
      verifiedContacts: [
        {
          id: phone.id,
          channel: 'phone',
          masked: '+233 *** 02',
          verifiedAt: '2026-11-04T09:00:00.000Z',
        },
        {
          id: email.id,
          channel: 'email',
          masked: 'b***@example.test',
          verifiedAt: '2026-11-05T09:00:00.000Z',
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Verify membership' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Revoke verification' })).toBeInTheDocument();
  });

  it('renders the 409 already_verified refusal when nothing is left to prove', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockRejectedValueOnce(
      new ApiError(409, 'Already verified', { code: 'already_verified' }),
    );
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Verify membership' }));

    expect(
      await screen.findByText(
        'Every contact this member owns is already proven, or an officer confirmed the member.',
      ),
    ).toBeVisible();
  });

  it('offers Confirm member but not Verify for a member with no own number', async () => {
    const user = userEvent.setup();
    renderUnverified({ ...EMPTY, memberNo: 'M-1006' });

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Verify membership' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Revoke verification' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Confirm member' })).toBeInTheDocument();
  });

  it('does not offer Verify or Confirm for an archived member', async () => {
    const user = userEvent.setup();
    renderUnverified({ ...UNVERIFIED, archivedAt: '2026-02-01T00:00:00.000Z' });

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Verify membership' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Confirm member' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeInTheDocument();
  });

  it('renders the 429 refusal when the send is throttled', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Verify membership' }));

    expect(
      await screen.findByText(
        'A code was requested too recently, or five were sent this hour. Try again later.',
      ),
    ).toBeVisible();
  });

  it('renders the 409 refusal when the member has no own number', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockRejectedValueOnce(new ApiError(409, 'No own contact'));
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Verify membership' }));

    expect(
      await screen.findByText('This member has no email, phone or WhatsApp number to verify.'),
    ).toBeVisible();
  });

  it('renders the 503 refusal when no channel is configured', async () => {
    const user = userEvent.setup();
    requestVerificationMock.mockRejectedValueOnce(new ApiError(503, 'No sender'));
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Verify membership' }));

    expect(
      await screen.findByText('No messaging channel is configured, so no code was sent.'),
    ).toBeVisible();
  });

  it('confirms the consequence before revoking a verification', async () => {
    const user = userEvent.setup();
    revokeVerificationMock.mockResolvedValueOnce(undefined);
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Verify membership' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Revoke verification' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Revoke the verification for Kwame Asante (Male, 41y)?');
    expect(dialog).toHaveTextContent(/Every contact proof and the officer confirmation/);
    expect(revokeVerificationMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Revoke verification' }));
    await waitFor(() => {
      expect(revokeVerificationMock).toHaveBeenCalledWith(
        expect.anything(),
        'dom-lane-session',
        'M-1001',
      );
    });
  });

  it('records a reason before confirming a member', async () => {
    const user = userEvent.setup();
    renderUnverified();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Confirm member' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm member' });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText(/records no code and changes no contact/)).toBeVisible();

    await user.type(within(dialog).getByLabelText('Reason'), 'Known to the office for years');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => {
      expect(confirmMemberMock).toHaveBeenCalledWith(
        expect.anything(),
        'dom-lane-session',
        'M-1005',
        'Known to the office for years',
      );
    });
  });

  it('does not offer Confirm member when a confirmation is already active', async () => {
    const user = userEvent.setup();
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: { ...DETAIL, confirmedAt: '2026-11-06T09:00:00.000Z' },
      etag: '"v3"',
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Confirm member' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Revoke verification' })).toBeInTheDocument();
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
