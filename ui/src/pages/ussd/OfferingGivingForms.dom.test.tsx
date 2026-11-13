import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import type { EventOfferingItem } from '../../api/events';
import {
  getMember,
  getMemberShepherding,
  searchMembers,
  type MemberDetail,
  type MemberListPage,
  type MemberShepherding,
  type MemberSummary,
} from '../../api/members';
import { GATEWAY_URL } from '../../auth/session';
import { createTestQueryClient, renderWithProviders } from '../../test/render';
import { PledgeForm, type PledgeSubmission } from './OfferingGivingForms';

/**
 * FR-26a in the DOM lane: the real member picker, the real session and query providers, a mocked
 * members module. Every case drives the dialog the way an operator does — type a number, click the
 * option — and asserts what they see plus what the form hands the API caller.
 */
vi.mock('../../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/members')>();
  return {
    ...actual,
    searchMembers: vi.fn(),
    getMemberShepherding: vi.fn(),
    getMember: vi.fn(),
  };
});

vi.mock('../../api/gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/gateway')>();
  return {
    ...actual,
    fetchMe: vi.fn(async () => ({
      id: 'officer-1',
      name: 'Efua Boateng',
      email: 'efua@example.test',
      actorId: 'efua',
    })),
  };
});

const OFFERINGS: readonly EventOfferingItem[] = [
  {
    offeringId: 'offering-1',
    name: 'Tithe',
    availableUntil: null,
    expired: false,
    terms: {
      version: 1,
      name: 'Tithe',
      purpose: 'The regular tithe',
      kind: 'tithe',
      currency: 'GHS',
      targetMinor: null,
      defaultAmountMinor: null,
      startsOn: null,
      endsOn: null,
      availableUntil: null,
      scripture: null,
      gatewayAccount: null,
      gatewayMetadata: null,
      createdAt: '2026-01-01T09:00:00.000Z',
      createdBy: 'officer-1',
      reason: null,
    },
    exceptions: [],
    stats: {
      attachedEvents: 1,
      pledgedMinor: 0,
      paidMinor: 0,
      pendingMinor: 0,
      honorRate: 0,
      contributionCount: 0,
    },
  },
];

function summary(memberNo: string, name: string, isPresbyter: boolean): MemberSummary {
  const [firstName, lastName] = name.split(' ');
  return {
    memberNo,
    firstName: firstName ?? name,
    lastName: lastName ?? '',
    otherNames: null,
    gender: memberNo === 'M-1007' ? 'male' : 'female',
    age: memberNo === 'M-1007' ? 41 : null,
    ageMonths: memberNo === 'M-1007' ? 492 : null,
    placeOfResidence: null,
    joinedOn: null,
    isPresbyter,
    archivedAt: null,
    contactCount: 0,
    ministries: [],
  };
}

const MEMBERS: readonly MemberSummary[] = [
  summary('M-1002', 'Ama Mensah', false),
  summary('M-1007', 'Kwesi Boateng', true),
];

function detail(overrides: Partial<MemberDetail>): MemberDetail {
  return {
    id: 'member-1007',
    ...summary('M-1007', 'Kwesi Boateng', true),
    maidenName: null,
    alias: null,
    dob: null,
    addressLine: null,
    purgedAt: null,
    version: 1,
    createdAt: '2024-01-07T09:30:00.000Z',
    updatedAt: '2024-05-02T11:00:00.000Z',
    contacts: [],
    subscriptions: [],
    relationships: [],
    attendance: [],
    ...overrides,
  };
}

function shepherding(shepherd: MemberShepherding['shepherd']): MemberShepherding {
  return {
    memberNo: 'M-1002',
    name: 'Ama Mensah',
    gender: 'female',
    age: null,
    shepherd,
    history: [],
    calls: { attempts: 0, conversations: 0, lastCalledOn: null },
    stillInChurch: null,
    latestFeedback: null,
    latestIssue: null,
    recentCalls: [],
  };
}

const ACTIVE_SHEPHERD = {
  assignmentId: 'assignment-1',
  memberNo: 'M-1007',
  name: 'Kwesi Boateng',
  gender: 'male',
  age: 41,
  assignedOn: '2025-06-01',
} as const;

/** The member search answers the same two members for every picker on the form. */
function mockSearch(): void {
  vi.mocked(searchMembers).mockResolvedValue({ items: MEMBERS } satisfies MemberListPage);
}

/** Picks the member, then waits for the follow-up read to answer. */
async function pickMember(
  user: ReturnType<typeof userEvent.setup>,
  memberNo = 'M-1002',
): Promise<void> {
  const combobox = screen.getByRole('combobox', { name: 'Member' });
  await user.click(combobox);
  // A previous pick leaves its label in the field; the search starts from empty.
  await user.clear(combobox);
  await user.type(combobox, memberNo);
  // Fluent renders the option list in a portal at body level.
  await user.click(await screen.findByRole('option', { name: new RegExp(memberNo) }));
}

async function pickOfficer(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Follow-up officer' }));
  await user.type(screen.getByRole('combobox', { name: 'Follow-up officer' }), 'M-1007');
  await user.click(await screen.findByRole('option', { name: /M-1007/ }));
}

function renderForm(
  onSubmit: Mock<(input: PledgeSubmission) => void>,
  client?: QueryClient,
  officerError: string | null = null,
  onOfficerValueChange?: () => void,
): void {
  renderWithProviders(
    <PledgeForm
      offerings={OFFERINGS}
      currency="GHS"
      pending={false}
      notice={null}
      error={null}
      officerError={officerError}
      onSubmit={onSubmit}
      onCancel={() => {}}
      onOfficerValueChange={onOfficerValueChange}
    />,
    client ? { client } : {},
  );
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Record pledge' });
}

/**
 * The instruction-note input, by its accessible name. It is queried by role because the `Field`
 * owns the label element; the note is optional, so there is no asterisk to work around here.
 */
function noteInput(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Note for the follow-up officer' });
}

describe('PledgeForm follow-up default in the DOM lane', () => {
  beforeEach(() => {
    vi.mocked(searchMembers).mockReset();
    vi.mocked(getMemberShepherding).mockReset();
    vi.mocked(getMember).mockReset();
  });

  it('names the active shepherd and submits without an officer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit);

    await pickMember(user);

    expect(await screen.findByText(/M-1007 · Kwesi Boateng \(Male, 41y\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/the officer recorded when the field is left empty/),
    ).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(screen.queryByText('No active shepherd.')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ memberNo: 'M-1002', amountMinor: 10_000 });
    // An empty officer sends neither key: the API's schema rejects an orphan `officerReason`.
    expect(payload).not.toHaveProperty('officerMemberNo');
    expect(payload).not.toHaveProperty('officerReason');
  });

  it('reads its own cache entry, not the member detail the member page has cached', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    // `MemberDetailPage` caches what the follow-up read must never pick up for the shepherd:
    // `{ member, etag }` under the member *detail* key is not a `MemberDetail`, so reading it would
    // report "no active shepherd" for a member who has one.
    vi.mocked(getMember).mockReturnValue(new Promise<MemberDetail>(() => {}));
    // `gcTime` is not zero here: the seeded entry has no observer, and the test client's default
    // `gcTime: 0` would collect it before the form ever reads it.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 60_000 } },
    });
    client.setQueryData(['member', GATEWAY_URL, 'M-1007'], { member: detail({}), etag: '"v1"' });
    renderForm(onSubmit, client);

    await pickMember(user);

    await waitFor(() => expect(vi.mocked(getMember)).toHaveBeenCalled());
    // Its own entry is empty, so it is still checking — not "no active shepherd". The sentence
    // appears twice now: the field's hint and the live region that announces the state.
    expect(screen.getAllByText(/Checking the member/)).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toBeDisabled();
    expect(screen.queryByText('No active shepherd.')).not.toBeInTheDocument();
  });

  it('shows that there is no active shepherd, blocks the submit and accepts a picked officer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(null));
    renderForm(onSubmit);

    await pickMember(user);

    expect(await screen.findByText('No active shepherd.')).toBeInTheDocument();
    // Twice on purpose: the warning bar states it visibly and the picker's hint carries it as the
    // field's accessible description (`MessageBar` is `role="group"`, not a live region, so the
    // hint is what a screen-reader user actually reaches).
    expect(
      screen.getAllByText(
        'This member has no active presbyter assigned, so choose who follows up this pledge.',
      ),
    ).toHaveLength(2);
    expect(screen.getByText('Required')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('This member has no active shepherd; pick the follow-up officer.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pick the follow-up officer.')).toBeInTheDocument();

    await pickOfficer(user);
    await user.type(noteInput(), 'Called the member');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      memberNo: 'M-1002',
      officerMemberNo: 'M-1007',
      officerReason: 'Called the member',
    });
  });

  // The pledge's predicate (FR-26a) has three conditions. Only two get a case here — "not a
  // presbyter" and "archived" — so a one-condition predicate cannot pass both. The third, "purged",
  // is proved once in the format unit test (ui/src/format/follow-up.test.ts), not below.
  it('treats a shepherd who is not a presbyter as no active shepherd', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    // The shepherd exists in the summary, is not archived, but is not a presbyter.
    vi.mocked(getMember).mockResolvedValue(detail({ isPresbyter: false }));
    renderForm(onSubmit);

    await pickMember(user);

    expect(await screen.findByText('No active shepherd.')).toBeInTheDocument();
    expect(screen.queryByText(/is this member's active shepherd/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('treats an archived shepherd as no active shepherd', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    // A presbyter, unarchived by the summary, whose detail says he was archived since.
    vi.mocked(getMember).mockResolvedValue(detail({ archivedAt: '2026-01-05T09:00:00.000Z' }));
    renderForm(onSubmit);

    await pickMember(user);

    expect(await screen.findByText('No active shepherd.')).toBeInTheDocument();
    expect(screen.queryByText(/is this member's active shepherd/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the officer field disabled while the shepherd’s own detail is still being read', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    // The summary has answered with a shepherd; his detail has not, so the predicate cannot be
    // evaluated yet. The gap must read as "checking", never as "required".
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    vi.mocked(getMember).mockReturnValue(new Promise<MemberDetail>(() => {}));
    renderForm(onSubmit);

    await pickMember(user);

    await waitFor(() => expect(vi.mocked(getMember)).toHaveBeenCalled());
    expect(screen.getAllByText(/Checking the member/)).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toBeDisabled();
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(screen.queryByText('No active shepherd.')).not.toBeInTheDocument();
    expect(screen.queryByText(/is this member's active shepherd/)).not.toBeInTheDocument();
  });

  it('blocks the submit when the shepherd is gone by the time the pledge is submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    // The pick-time summary names a shepherd; the refetch answers that the assignment has ended.
    vi.mocked(getMemberShepherding)
      .mockResolvedValueOnce(shepherding(ACTIVE_SHEPHERD))
      .mockResolvedValue(shepherding(null));
    vi.mocked(getMember).mockResolvedValue(detail({}));
    const client = createTestQueryClient();
    renderForm(onSubmit, client);

    await pickMember(user);
    expect(await screen.findByText(/is this member's active shepherd/)).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');

    // An assignment change lands while the dialog is open: the read runs again and says "none".
    void client.invalidateQueries({ queryKey: ['member'] });

    expect(await screen.findByText('No active shepherd.')).toBeInTheDocument();
    expect(screen.queryByText(/is this member's active shepherd/)).not.toBeInTheDocument();

    // The submit reads the current default, not the pick-time snapshot, so it is blocked.
    await user.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('This member has no active shepherd; pick the follow-up officer.'),
    ).toBeInTheDocument();
  });

  it('disables the officer field while the shepherd is being read', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockReturnValue(new Promise<MemberShepherding>(() => {}));
    renderForm(onSubmit);

    await pickMember(user);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toBeDisabled(),
    );
    expect(screen.getAllByText(/Checking the member/)).toHaveLength(2);
    expect(submitButton()).toBeDisabled();
  });

  // FR-26a: the officer field's state sentence has to be *associated* with it, not merely adjacent.
  // Fluent's `Field` renders the hint with an id and points the control's `aria-describedby` at it,
  // so a screen-reader user hears why the field is disabled or why an officer is required.
  it('describes the disabled officer field with the check that is still running', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    // The read never answers, so the field is disabled and the hint is the only explanation.
    vi.mocked(getMemberShepherding).mockReturnValue(new Promise<MemberShepherding>(() => {}));
    renderForm(onSubmit);

    await pickMember(user);

    const officer = screen.getByRole('combobox', { name: 'Follow-up officer' });
    await waitFor(() => expect(officer).toBeDisabled());
    expect(officer).toHaveAccessibleDescription(
      "Checking the member's shepherd; the field stays disabled until the shepherd is known.",
    );
  });

  it('describes the officer field with the unavailable default when the read failed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockRejectedValue(new Error('gateway unavailable'));
    renderForm(onSubmit);

    await pickMember(user);

    expect(await screen.findByText(/shepherd could not be checked/)).toBeInTheDocument();
    const officer = screen.getByRole('combobox', { name: 'Follow-up officer' });
    expect(officer).toBeEnabled();
    expect(officer).toHaveAccessibleDescription(
      'The follow-up default is unavailable, so an officer is required.',
    );
  });

  it('requires the officer when the shepherd could not be read', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockRejectedValue(new Error('gateway unavailable'));
    renderForm(onSubmit);

    await pickMember(user);

    expect(await screen.findByText(/shepherd could not be checked/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Choose who follows up; the officer is required until the default is known.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toBeEnabled();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText("The member's shepherd could not be checked; pick the follow-up officer."),
    ).toBeInTheDocument();
  });

  it('does not carry an officer picked for one member over to the next member', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    // M-1002 has no shepherd, so an officer has to be picked by hand; M-1007 has one.
    vi.mocked(getMemberShepherding).mockImplementation(
      async (_baseUrl: string, _token: string, memberNo: string) =>
        shepherding(memberNo === 'M-1007' ? ACTIVE_SHEPHERD : null),
    );
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit);

    await pickMember(user, 'M-1002');
    expect(await screen.findByText('No active shepherd.')).toBeInTheDocument();
    await pickOfficer(user);
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toHaveValue(
      'M-1007 · Kwesi Boateng (M, 41y)',
    );

    // A different member starts clean: the officer chosen for M-1002 is not submitted for M-1007,
    // whose own shepherd default applies instead.
    await pickMember(user, 'M-1007');

    expect(
      await screen.findByText(/M-1007 · Kwesi Boateng \(Male, 41y\) is this member's active/),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toHaveValue('');
    // The officer validation belonged to the member it was shown for.
    expect(screen.queryByText('Pick the follow-up officer.')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ memberNo: 'M-1007', amountMinor: 10_000 });
    expect(payload).not.toHaveProperty('officerMemberNo');
    expect(payload).not.toHaveProperty('officerReason');
  });

  // FR-26a: the absence has to reach the field an operator can actually act on. The `MessageBar` is
  // `role="group"`, so its text is not announced by itself; the picker's hint is, because the field
  // is enabled in this state and `Field` points `aria-describedby` at it.
  it('describes the enabled officer field with the absence sentence when there is no shepherd', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(null));
    renderForm(onSubmit);

    await pickMember(user);

    await screen.findByText('No active shepherd.');
    const officer = screen.getByRole('combobox', { name: 'Follow-up officer' });
    expect(officer).toBeEnabled();
    expect(officer).toHaveAccessibleDescription(
      'This member has no active presbyter assigned, so choose who follows up this pledge.',
    );
  });

  // The loading state disables the field, which Fluent removes from the tab order, so neither its
  // hint nor the warning bar is reached. The running check is announced from a polite live region
  // that is mounted with the form and only changes its text: a region inserted together with its
  // content is commonly not announced at all.
  it('announces the running shepherd check in a live region that is already mounted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockReturnValue(new Promise<MemberShepherding>(() => {}));
    renderForm(onSubmit);

    // Mounted and empty before anything has happened.
    const announcement = screen.getByRole('status');
    expect(announcement.textContent).toBe('');

    await pickMember(user);

    await waitFor(() =>
      expect(announcement).toHaveTextContent(
        "Checking the member's shepherd; the field stays disabled until the shepherd is known.",
      ),
    );
    // The same node, filled — not a second region inserted with its text.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toBe(announcement);
    // The hint stays too; the live region is the announcement, not a replacement.
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toHaveAccessibleDescription(
      "Checking the member's shepherd; the field stays disabled until the shepherd is known.",
    );
  });

  // The note is an instruction to whoever follows up, not a justification for naming an officer:
  // it is visible with no officer picked, optional, and never blocks a submit for being empty.
  it('shows the optional note with no officer picked and submits with neither key', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit);

    await pickMember(user);
    await screen.findByText(/is this member's active shepherd/);

    // No officer is picked, and the note is there anyway.
    expect(screen.getByRole('combobox', { name: 'Follow-up officer' })).toHaveValue('');
    const note = noteInput();
    expect(note).toBeVisible();
    expect(note).toHaveValue('');
    expect(note).not.toBeRequired();
    expect(note).toHaveAccessibleDescription(/Optional — up to 500 characters/);
    expect(note).toHaveAccessibleDescription(/Tells whoever follows up how it should be done/);
    // It is no longer the officer's mandatory justification.
    expect(
      screen.queryByRole('textbox', { name: 'Reason for the follow-up officer' }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0];
    // An empty note and no officer send neither key: an empty `officerReason` would be rejected by
    // the request schema, which trims before it checks the length.
    expect(payload).not.toHaveProperty('officerMemberNo');
    expect(payload).not.toHaveProperty('officerReason');
  });

  // The note stands alone: it can instruct the member's shepherd without naming a different officer.
  it('submits a note without an officer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit);

    await pickMember(user);
    await screen.findByText(/is this member's active shepherd/);

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.type(noteInput(), 'Call on Tuesday evening');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ memberNo: 'M-1002', amountMinor: 10_000 });
    expect(payload).toHaveProperty('officerReason', 'Call on Tuesday evening');
    expect(payload).not.toHaveProperty('officerMemberNo');
  });

  // And the officer stands alone: naming one does not demand a note.
  it('submits a picked officer with no note', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(null));
    renderForm(onSubmit);

    await pickMember(user);
    await screen.findByText('No active shepherd.');
    await pickOfficer(user);

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ memberNo: 'M-1002', officerMemberNo: 'M-1007' });
    expect(payload).not.toHaveProperty('officerReason');
  });

  // The only client-side rule left is the API's maximum, counted after trimming.
  it('blocks a note longer than 500 characters with the field message', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(ACTIVE_SHEPHERD));
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit);

    await pickMember(user);
    await screen.findByText(/is this member's active shepherd/);

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.click(noteInput());
    await user.paste('a'.repeat(501));
    await user.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
    // The blocked message is the note field's own validation message, so it is associated with the
    // control the operator has to shorten.
    expect(
      screen.getByText('The note for the follow-up officer must be 500 characters or fewer.'),
    ).toBeInTheDocument();
    expect(noteInput()).toHaveAccessibleDescription(/must be 500 characters or fewer/);
  });

  it('submits the picked officer with its trimmed note', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockResolvedValue(shepherding(null));
    renderForm(onSubmit);

    await pickMember(user);
    await screen.findByText('No active shepherd.');
    await pickOfficer(user);

    await user.type(screen.getByLabelText('Amount'), '100.00');
    await user.type(noteInput(), '   Visit planned for Sunday   ');
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      memberNo: 'M-1002',
      officerMemberNo: 'M-1007',
      officerReason: 'Visit planned for Sunday',
    });
  });

  it('clears the note when the member changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    mockSearch();
    vi.mocked(getMemberShepherding).mockImplementation(
      async (_baseUrl: string, _token: string, memberNo: string) =>
        shepherding(memberNo === 'M-1007' ? ACTIVE_SHEPHERD : null),
    );
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit);

    await pickMember(user, 'M-1002');
    await screen.findByText('No active shepherd.');
    await pickOfficer(user);
    await user.type(noteInput(), 'Called the member');
    expect(noteInput()).toHaveValue('Called the member');

    // The note instructs the follow-up for the member it was written for, so a member change drops
    // it along with the officer. The field itself stays rendered — it is always visible now.
    await pickMember(user, 'M-1007');
    expect(
      await screen.findByText(/M-1007 · Kwesi Boateng \(Male, 41y\) is this member's active/),
    ).toBeInTheDocument();
    expect(noteInput()).toBeVisible();
    expect(noteInput()).toHaveValue('');

    await pickOfficer(user);
    expect(noteInput()).toHaveValue('');
  });

  // What this proves, and nothing more: the form renders a *page-supplied* officer message on the
  // officer field instead of in the error bar. It does not prove that any particular API rejection
  // reaches this prop — that classifier is `officerProblemMessage`, unit-tested in
  // ui/src/format/follow-up.test.ts — and this test would pass over a classifier that missed one.
  it('renders a page-supplied officer message on the officer field', () => {
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    renderForm(onSubmit, undefined, 'Member M-1007 is not an active presbyter');

    const officer = screen.getByRole('combobox', { name: 'Follow-up officer' });
    expect(officer).toHaveAccessibleDescription('Member M-1007 is not an active presbyter');
    expect(screen.queryByText('The pledge could not be recorded')).not.toBeInTheDocument();
  });

  // The page owns the API's officer message; the form owns the picks. So the form reports the two
  // moments the message stops describing the value on screen — a different member, or a different
  // officer — and the page drops it there. Without this the operator changes the value and still
  // reads the old rejection against it.
  it('reports a member or officer change so the page can drop its stale officer message', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: PledgeSubmission) => void>();
    const onOfficerValueChange = vi.fn();
    mockSearch();
    // M-1002 has no shepherd, so the officer has to be picked by hand; M-1007 has one.
    vi.mocked(getMemberShepherding).mockImplementation(
      async (_baseUrl: string, _token: string, memberNo: string) =>
        shepherding(memberNo === 'M-1007' ? ACTIVE_SHEPHERD : null),
    );
    vi.mocked(getMember).mockResolvedValue(detail({}));
    renderForm(onSubmit, undefined, null, onOfficerValueChange);

    await pickMember(user, 'M-1002');
    // Picking a member is a member change; `pickMember` also clears the field first, which reports
    // the change to no member on the way, so only the fact that it reported is asserted here.
    const afterMember = onOfficerValueChange.mock.calls.length;
    expect(afterMember).toBeGreaterThan(0);

    await pickOfficer(user);
    // Exactly one more: the picked officer changed from nothing to M-1007.
    expect(onOfficerValueChange.mock.calls.length).toBe(afterMember + 1);

    const beforeSecondMember = onOfficerValueChange.mock.calls.length;
    await pickMember(user, 'M-1007');
    expect(onOfficerValueChange.mock.calls.length).toBeGreaterThan(beforeSecondMember);

    // The note is a general instruction for whoever follows up, so typing it is not one of the
    // moments the officer message stops describing the value on screen.
    const afterMemberChange = onOfficerValueChange.mock.calls.length;
    await user.type(noteInput(), 'Call on Tuesday');
    expect(onOfficerValueChange.mock.calls.length).toBe(afterMemberChange);
  });
});
