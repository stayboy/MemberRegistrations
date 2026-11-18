import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import {
  addMemberMinistry,
  addMemberRelationship,
  createMember,
  fetchMemberDetail,
  listGuardianCandidates,
  listMinistries,
  listPresbyterTitles,
  removeMemberMinistry,
  removeMemberRelationship,
  searchMembers,
  subscribeMemberProduct,
  updateMember,
  type MemberDetail,
  type MemberGuardian,
  type MemberInput,
  type MemberUpdateInput,
  type Ministry,
  type PresbyterTitleOption,
} from '../api/members';
import { assignMember, listOfficers, type OfficerSummary } from '../api/shepherding';
import { listWelfareProducts, type WelfareProduct } from '../api/welfare';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MemberFormPage } from './MemberFormPage';

/**
 * MR-48 / AC-MR38: the add and edit forms are a step flow — `Person and contact`,
 * `Church and involvement`, a conditional `Relationships`, then `Review`. `Next`
 * validates only its step, `Back` never validates, a step beyond the first invalid
 * one is disabled, the active step's heading takes focus, and `?step=` restores the
 * step. The immediate edit writes (contacts, ministries, relationships) are labelled
 * "Saved as you go" and never mark the form dirty.
 */
vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    createMember: vi.fn(),
    fetchMemberDetail: vi.fn(),
    updateMember: vi.fn(),
    listMinistries: vi.fn(),
    listPresbyterTitles: vi.fn(),
    listGuardianCandidates: vi.fn(),
    searchMembers: vi.fn(),
    subscribeMemberProduct: vi.fn(),
    addMemberRelationship: vi.fn(),
    removeMemberRelationship: vi.fn(),
    addMemberMinistry: vi.fn(),
    removeMemberMinistry: vi.fn(),
  };
});

vi.mock('../api/shepherding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/shepherding')>();
  return { ...actual, listOfficers: vi.fn(), assignMember: vi.fn() };
});

vi.mock('../api/welfare', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/welfare')>();
  return { ...actual, listWelfareProducts: vi.fn() };
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
  title: null,
  membershipCardNo: null,
  verifiedAt: null,
  assemblyJoinedOn: '2019-03-03',
  cameFrom: 'Accra Central',
  movedOutOn: null,
  movedToAssembly: null,
  shepherd: null,
  guardian: null,
  calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
  isPresbyter: true,
  photoUpdatedAt: null,
  archivedAt: null,
  purgedAt: null,
  contactCount: 1,
  ministries: [],
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
  subscriptions: [],
  relationships: [],
  attendance: [],
};

const createMemberMock = vi.mocked(createMember);
const fetchMemberDetailMock = vi.mocked(fetchMemberDetail);
const updateMemberMock = vi.mocked(updateMember);
const listMinistriesMock = vi.mocked(listMinistries);
const listPresbyterTitlesMock = vi.mocked(listPresbyterTitles);
const listGuardianCandidatesMock = vi.mocked(listGuardianCandidates);
const searchMembersMock = vi.mocked(searchMembers);
const subscribeMemberProductMock = vi.mocked(subscribeMemberProduct);
const listWelfareProductsMock = vi.mocked(listWelfareProducts);
const listOfficersMock = vi.mocked(listOfficers);
const assignMemberMock = vi.mocked(assignMember);
const addMemberRelationshipMock = vi.mocked(addMemberRelationship);
const removeMemberRelationshipMock = vi.mocked(removeMemberRelationship);
const addMemberMinistryMock = vi.mocked(addMemberMinistry);
const removeMemberMinistryMock = vi.mocked(removeMemberMinistry);

const MINISTRIES: Ministry[] = [
  { code: 'CHOIR', name: 'Choir', description: null, active: true },
  { code: 'USHER', name: 'Ushering', description: null, active: true },
];

const TITLES: PresbyterTitleOption[] = [
  { code: 'elder', label: 'Elder', genderRestriction: 'male', active: true },
  { code: 'deaconess', label: 'Deaconess', genderRestriction: 'female', active: true },
  { code: 'pastor', label: 'Pastor', genderRestriction: null, active: true },
];

const GUARDIANS: MemberGuardian[] = [
  { memberNo: 'G-1001', name: 'Adwoa Mensah', contactMasked: '***01', via: [] },
];

const OFFICERS: OfficerSummary[] = [
  {
    memberNo: 'O-2001',
    name: 'Efua Boateng',
    gender: 'female',
    age: 44,
    photoUpdatedAt: null,
    assignedMembers: 0,
    attempts: 0,
    conversations: 0,
    lastCalledOn: null,
    membersNeverCalled: 0,
  },
];

/** The picker's search results; the officer selection in the assign dialog reads these. */
const PICKER_MEMBERS = [
  {
    memberNo: 'O-2001',
    firstName: 'Efua',
    lastName: 'Boateng',
    otherNames: null,
    gender: 'female' as const,
    age: 44,
    ageMonths: 528,
    placeOfResidence: null,
    joinedOn: null,
    isPresbyter: true,
    photoUpdatedAt: null,
    archivedAt: null,
    contactCount: 1,
    ministries: [],
  },
  {
    memberNo: 'O-2002',
    firstName: 'Kwesi',
    lastName: 'Addo',
    otherNames: null,
    gender: 'male' as const,
    age: 40,
    ageMonths: 480,
    placeOfResidence: null,
    joinedOn: null,
    isPresbyter: true,
    photoUpdatedAt: null,
    archivedAt: null,
    contactCount: 1,
    ministries: [],
  },
];

function product(overrides: Partial<WelfareProduct> = {}): WelfareProduct {
  return {
    id: 'product-1',
    code: 'FUNERAL',
    name: 'Funeral cover',
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
    createdBy: 'efua',
    updatedBy: null,
    updatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const PRODUCTS: WelfareProduct[] = [
  product(),
  product({
    id: 'product-2',
    code: 'HEALTH',
    name: 'Health plan',
    paymentMode: 'either',
  }),
];

beforeEach(() => {
  createMemberMock.mockReset();
  createMemberMock.mockResolvedValue(DETAIL);
  fetchMemberDetailMock.mockReset();
  fetchMemberDetailMock.mockResolvedValue({ member: DETAIL, etag: '"v3"' });
  updateMemberMock.mockReset();
  updateMemberMock.mockResolvedValue(DETAIL);
  listMinistriesMock.mockReset();
  listMinistriesMock.mockResolvedValue(MINISTRIES);
  listPresbyterTitlesMock.mockReset();
  listPresbyterTitlesMock.mockResolvedValue(TITLES);
  listGuardianCandidatesMock.mockReset();
  listGuardianCandidatesMock.mockResolvedValue(GUARDIANS);
  searchMembersMock.mockReset();
  searchMembersMock.mockResolvedValue({ items: PICKER_MEMBERS });
  listWelfareProductsMock.mockReset();
  listWelfareProductsMock.mockResolvedValue(PRODUCTS);
  subscribeMemberProductMock.mockReset();
  subscribeMemberProductMock.mockResolvedValue({
    id: 'sub-1',
    status: 'active',
    productCode: 'FUNERAL',
    productName: 'Funeral cover',
    scope: 'individual',
    paidBy: 'member',
    periodStart: '2026-11-17',
    periodEnd: '2027-11-17',
  });
  listOfficersMock.mockReset();
  listOfficersMock.mockResolvedValue(OFFICERS);
  assignMemberMock.mockReset();
  addMemberRelationshipMock.mockReset();
  removeMemberRelationshipMock.mockReset();
  addMemberMinistryMock.mockReset();
  removeMemberMinistryMock.mockReset();
});

function renderForm(route: '/members/new' | `/members/${string}`): void {
  const [path, search] = route.split('?');
  const entry = search ? `${path}?${search}` : path;
  renderWithProviders(
    <MemoryRouter initialEntries={[entry]}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/members/new" element={<MemberFormPage />} />
            <Route path="/members/:memberNo" element={<MemberFormPage />} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** The step rail: a labelled nav whose items are buttons, not peer tabs (MR-48). */
function rail(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Registration steps' });
}

function stepButtons(): HTMLElement[] {
  return within(rail()).getAllByRole('button');
}

/** The accessible names: `Step n: <label>`, so a narrow layout that hides labels stays usable. */
function stepLabels(): string[] {
  return stepButtons().map((button) => button.getAttribute('aria-label') ?? '');
}

function stepButton(label: RegExp): HTMLElement {
  return within(rail()).getByRole('button', { name: label });
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(new RegExp(`^${label}`));
}

/** Fluent's Dropdown is a combobox but not always label-associated, so select it by role. */
function combobox(name: RegExp): HTMLElement {
  return screen.getByRole('combobox', { name });
}

/** The edit route loads the record first; every edit test waits for its form heading. */
async function waitForForm(): Promise<void> {
  await screen.findByRole('heading', { level: 1 });
}

/** MR-48: the active step's label is the page h1, below the stepper. */
function stepHeading(): HTMLElement {
  return screen.getByRole('heading', { level: 1 });
}

async function next(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

async function fillPerson(
  user: ReturnType<typeof userEvent.setup>,
  options: { memberNo?: string; phone?: string } = {},
): Promise<void> {
  if (options.memberNo !== undefined) await user.type(field('Member number'), options.memberNo);
  await user.type(field('First name'), 'Kofi');
  await user.type(field('Other names'), 'Mensah');
  if (options.phone) await user.type(field('Phone'), options.phone);
}

describe('MemberFormPage step flow (MR-48, AC-MR38)', () => {
  it('renders the conditional rail for a create and reaches Review from the second step', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    // With no contact yet, the conditional Relationships step is part of the rail.
    expect(stepLabels()).toEqual([
      'Step 1: Person and contact',
      'Step 2: Church and involvement',
      'Step 3: Relationships',
      'Step 4: Review',
    ]);
    expect(stepButton(/Person and contact/)).toHaveAttribute('aria-current', 'step');
    expect(stepButton(/Person and contact/)).toHaveAttribute('data-state', 'current');
    // MR-48: the step's label is the page h1, under the stepper; the breadcrumb still
    // names the form.
    expect(stepHeading()).toHaveTextContent('Person and contact');
    expect(stepHeading()).toHaveAttribute('id', 'member-form-step-heading');
    // The focus target stays programmatically focusable (its outline is styled away).
    expect(stepHeading()).toHaveAttribute('tabindex', '-1');
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Add member'),
    ).toBeVisible();
    expect(stepHeading()).toHaveFocus();
    // Back is disabled on the first step.
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });

    // A recorded contact takes the Relationships step out of the flow (AC-MR38).
    expect(stepLabels()).toEqual([
      'Step 1: Person and contact',
      'Step 2: Church and involvement',
      'Step 3: Review',
    ]);

    await next(user);

    expect(stepHeading()).toHaveTextContent('Church and involvement');
    expect(stepButton(/Church and involvement/)).toHaveAttribute('aria-current', 'step');
    // The step just left shows its check.
    expect(stepButton(/Person and contact/)).toHaveAttribute('data-state', 'completed');
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    await next(user);

    expect(stepHeading()).toHaveTextContent('Review');
    expect(screen.getByRole('button', { name: 'Create member' })).toBeVisible();
  });

  it('puts Cancel in the step footer, ahead of Back and Next', async () => {
    renderForm('/members/new');

    // The header row holds no Cancel: it is a step action now, as the mock has it.
    const actionRow = screen.getByRole('navigation', { name: 'Breadcrumb' }).parentElement;
    expect(actionRow).not.toBeNull();
    expect(within(actionRow!).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    const footer = screen.getByTestId('member-form-step-nav');
    const cancel = within(footer).getByRole('button', { name: 'Cancel' });
    const back = within(footer).getByRole('button', { name: 'Back' });
    const nextButton = within(footer).getByRole('button', { name: 'Next' });

    expect(cancel).toBeVisible();
    // Cancel · Back · Next, in document order.
    expect(Boolean(cancel.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
    expect(
      Boolean(back.compareDocumentPosition(nextButton) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  it('describes each create step as the mock does', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    expect(
      screen.getByText(
        "The person, where they live and how to reach them. A phone or WhatsApp number is the member's USSD identity and the number a verification code goes to.",
      ),
    ).toBeVisible();

    // No contact yet, so the Relationships step is part of the flow.
    await fillPerson(user, { memberNo: 'M-1009' });
    await next(user);
    expect(
      screen.getByText(
        'The membership facts, the presbyter title and card, the ministries and the shepherd. Ministries travel with the member; the shepherd is assigned straight afterwards.',
      ),
    ).toBeVisible();

    await next(user);
    expect(
      screen.getByText(
        'This member has no contact of their own, so a guardian is required. The guardian is how the register reaches them.',
      ),
    ).toBeVisible();

    const guardian = await screen.findByRole('combobox', { name: /^Guardian/ });
    await user.click(guardian);
    await user.click(await screen.findByRole('option', { name: /G-1001/ }));
    await next(user);
    expect(
      screen.getByText(
        'Check the registration before it is created. Nothing has been written yet.',
      ),
    ).toBeVisible();
  });

  it('describes the edit steps and says what this page saves', async () => {
    const user = userEvent.setup();
    renderForm('/members/M-1001');
    await waitForForm();

    expect(
      screen.getByText(
        'The person, where they live and how to reach them. These fields save with the form; contacts are written to the record as you use them.',
      ),
    ).toBeVisible();

    await user.click(stepButton(/Church and involvement/));
    expect(
      screen.getByText(
        'The membership facts save with the form. Ministries and the shepherd are written to the record as you use them.',
      ),
    ).toBeVisible();

    await user.click(stepButton(/Review/));
    expect(
      screen.getByText(
        'This page saves the fields below. Everything else on the record stays as it is.',
      ),
    ).toBeVisible();
  });

  it('blocks Next on an invalid step and leaves the step in place', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    // No member number and no name yet.
    await next(user);

    expect(stepHeading()).toHaveTextContent('Person and contact');
    expect(screen.getByText('Member number is required.')).toBeVisible();
    // Every step beyond the first invalid one is disabled.
    expect(stepButton(/Church and involvement/)).toBeDisabled();
    expect(stepButton(/Review/)).toBeDisabled();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('blocks a subscription with no payer on its own step, so Review is never reachable', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);

    // HEALTH can be paid by the member or the church, so the payer must be named.
    const product = combobox(/^Product/);
    await waitFor(() => expect(product).toBeEnabled());
    await user.click(product);
    await user.click(await screen.findByRole('option', { name: /HEALTH/ }));

    // The error belongs to Church and involvement: Next stays, and Review is out of reach,
    // so the save cannot fail silently on a step that renders no fields.
    await next(user);
    expect(stepHeading()).toHaveTextContent('Church and involvement');
    expect(screen.getByText('Choose who pays for this product.')).toBeVisible();
    expect(stepButton(/Review/)).toBeDisabled();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('keys the guardian candidates on the committed member number, not each keystroke', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    // Nothing is asked until a member number is committed.
    expect(listGuardianCandidatesMock).not.toHaveBeenCalled();

    await user.type(field('Member number'), 'M-1009');
    expect(listGuardianCandidatesMock).not.toHaveBeenCalled();

    // Blurring the field commits the number, and the query runs once with it.
    await user.tab();
    await waitFor(() => expect(listGuardianCandidatesMock).toHaveBeenCalledTimes(1));
    expect(listGuardianCandidatesMock.mock.calls[0]?.[2]).toBe('M-1009');
  });

  it('keeps a created member when the post-create assignment fails, and links to it', async () => {
    const user = userEvent.setup();
    assignMemberMock.mockRejectedValueOnce(new Error('The shepherd could not be assigned.'));
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);
    const officer = screen.getByRole('combobox', { name: /^Officer/ });
    await waitFor(() => expect(officer).toBeEnabled());
    await user.click(officer);
    await user.click(await screen.findByRole('option', { name: /O-2001/ }));
    await next(user);
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    // AC-MR10: the member exists, the warning names the failure and links to the record.
    expect(
      await screen.findByText('The member was created, but the shepherd was not assigned'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'the member record' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open member record' })).toBeVisible();
    expect(subscribeMemberProductMock).not.toHaveBeenCalled();
  });

  it('opens the assign dialog on edit and resends with the id the 409 returns', async () => {
    const user = userEvent.setup();
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...DETAIL,
        shepherd: {
          memberNo: 'O-2001',
          name: 'Efua Boateng',
          gender: 'female',
          age: 44,
          assignedOn: '2025-01-05',
        },
      },
      etag: '"v3"',
    });
    assignMemberMock
      .mockRejectedValueOnce(
        new ApiError(409, 'Reassignment required', {
          status: 409,
          currentAssignment: {
            id: 'assign-1',
            officerMemberNo: 'O-2001',
            assignedOn: '2025-01-05',
          },
        }),
      )
      .mockResolvedValueOnce({
        id: 'assign-2',
        officerMemberNo: 'O-2002',
        officerName: 'Kwesi Addo',
        officerGender: 'male',
        officerAge: 40,
        memberNo: 'M-1001',
        memberName: 'Kwame Asante',
        memberGender: 'male',
        memberAge: 41,
        assignedOn: '2026-11-18',
        endedOn: null,
        reason: 'Moved to the other district.',
        endedReason: null,
      });
    renderForm('/members/M-1001?step=church');
    await waitForForm();

    await user.click(await screen.findByRole('button', { name: 'Change' }));

    // AC-MR11: the dialog knows the current assignment and states the reason's role.
    const dialog = await screen.findByRole('dialog', { name: 'Reassign member' });
    expect(within(dialog).getByText(/Efua Boateng.*O-2001/)).toBeVisible();

    const officer = within(dialog).getByRole('combobox', { name: 'Officer' });
    await user.click(officer);
    await user.type(officer, 'Kwesi');
    await user.click(await screen.findByRole('option', { name: /O-2002/ }));
    await user.type(within(dialog).getByLabelText('Reason'), 'Moved to the other district.');
    await user.click(within(dialog).getByRole('button', { name: 'Reassign' }));

    // The first POST carries no id (the detail projection does not expose one), so the
    // 409 names the current assignment; the retry carries that id and ends it.
    expect(await within(dialog).findByText('This member already has a shepherd')).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Reassign and end the current assignment' }),
    );

    await waitFor(() => expect(assignMemberMock).toHaveBeenCalledTimes(2));
    expect(assignMemberMock.mock.calls[0]?.[2]).not.toHaveProperty('replaceAssignmentId');
    expect(assignMemberMock.mock.calls[1]?.[2]).toMatchObject({
      memberNo: 'M-1001',
      officerMemberNo: 'O-2002',
      replaceAssignmentId: 'assign-1',
    });
  });

  it('shows the Relationships step when there is no contact and blocks without a guardian', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009' });
    await next(user);
    await next(user);

    expect(stepLabels()).toEqual([
      'Step 1: Person and contact',
      'Step 2: Church and involvement',
      'Step 3: Relationships',
      'Step 4: Review',
    ]);
    expect(stepHeading()).toHaveTextContent('Relationships');

    // The guardian is required, because the member records no own contact.
    await next(user);
    expect(stepHeading()).toHaveTextContent('Relationships');
    expect(
      screen.getByText(/Record a phone, email or WhatsApp number, or choose a guardian/),
    ).toBeVisible();
    expect(stepButton(/Review/)).toBeDisabled();

    const guardian = await screen.findByRole('combobox', { name: /^Guardian/ });
    await user.click(guardian);
    await user.click(await screen.findByRole('option', { name: /G-1001/ }));
    await next(user);

    expect(stepHeading()).toHaveTextContent('Review');
    expect(screen.getByTestId('member-form-review')).toHaveTextContent('Adwoa Mensah');
  });

  it('runs the same atomic create payloads from Review', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await user.click(combobox(/^Gender/));
    await user.click(await screen.findByRole('option', { name: 'Male' }));
    await next(user);

    await user.type(field('Membership card number'), 'MC-1001');
    const title = combobox(/^Presbyter title/);
    await user.click(title);
    await user.click(await screen.findByRole('option', { name: /Elder/ }));
    await user.type(field('Titled on'), '2020-02-03');

    const officer = screen.getByRole('combobox', { name: /^Officer/ });
    await waitFor(() => expect(officer).toBeEnabled());
    await user.click(officer);
    await user.click(await screen.findByRole('option', { name: /O-2001/ }));

    await next(user);
    expect(stepHeading()).toHaveTextContent('Review');
    expect(screen.getByTestId('member-form-review')).toHaveTextContent('MC-1001');

    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body).toMatchObject({
      memberNo: 'M-1009',
      membershipCardNo: 'MC-1001',
      titleCode: 'elder',
      titledOn: '2020-02-03',
      contacts: [{ kind: 'phone', value: '+233 24 555 0109' }],
    });
    // The shepherd is a post-create call, never part of the create body.
    expect(body).not.toHaveProperty('shepherdMemberNo');
    await waitFor(() => expect(assignMemberMock).toHaveBeenCalledTimes(1));
    expect(assignMemberMock.mock.calls[0]?.[2]).toMatchObject({
      memberNo: 'M-1001',
      officerMemberNo: 'O-2001',
    });
  });

  it('Back never validates, so a cleared required field does not trap the operator', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);
    expect(stepHeading()).toHaveTextContent('Church and involvement');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(stepHeading()).toHaveTextContent('Person and contact');

    await user.clear(field('Member number'));
    // Next is blocked, but Back would not have been: the flow only validates forward.
    await next(user);
    expect(screen.getByText('Member number is required.')).toBeVisible();
  });

  it('restores the step from ?step= on reload', async () => {
    renderForm('/members/M-1001?step=review');
    await waitForForm();

    expect(stepHeading()).toHaveTextContent('Review');
    expect(stepButton(/Review/)).toHaveAttribute('aria-current', 'step');
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Edit member'),
    ).toBeVisible();
  });

  it('numbers the bubbles, checks a completed step, and keeps the labels in the DOM', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    const bubbles = () => within(rail()).getAllByTestId('step-bubble');
    expect(bubbles().map((bubble) => bubble.textContent)).toEqual(['1', '2', '3', '4']);
    // The label is present (hidden by CSS below 600 px, never removed).
    expect(
      within(rail())
        .getAllByTestId('step-label')
        .map((label) => label.textContent),
    ).toEqual(['Person and contact', 'Church and involvement', 'Relationships', 'Review']);

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);

    // The completed step swaps its number for a check; the current one keeps its number.
    const completed = stepButton(/Person and contact/);
    expect(completed).toHaveAttribute('data-state', 'completed');
    expect(within(completed).getByTestId('step-bubble').querySelector('svg')).not.toBeNull();
    expect(within(completed).getByTestId('step-bubble').textContent).toBe('');
    expect(
      within(stepButton(/Church and involvement/)).getByTestId('step-bubble').textContent,
    ).toBe('2');
  });

  it('focuses the step heading when the step changes', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);

    expect(stepHeading()).toHaveTextContent('Church and involvement');
    expect(stepHeading()).toHaveFocus();
  });
});

describe('MemberFormPage fields and sections', () => {
  it('keeps the assembly join date off the form but in the create payload as null', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    expect(screen.queryByLabelText(/^Assembly joined/)).not.toBeInTheDocument();

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body).toMatchObject({ assemblyJoinedOn: null, cameFrom: null });
  });

  it('offers only the titles the selected gender allows, and clears one a gender change forbids', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await user.click(combobox(/^Gender/));
    await user.click(await screen.findByRole('option', { name: 'Male' }));
    await next(user);

    const title = combobox(/^Presbyter title/);
    await user.click(title);
    expect(await screen.findByRole('option', { name: /Elder/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Deaconess/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Elder/ }));

    // A gender change the title forbids clears it with an inline note.
    await user.click(stepButton(/Person and contact/));
    await user.click(combobox(/^Gender/));
    await user.click(await screen.findByRole('option', { name: 'Female' }));
    await user.click(stepButton(/Church and involvement/));

    expect(
      screen.getByText(/Elder is restricted to male members, so the title was cleared/),
    ).toBeVisible();
    expect(combobox(/^Presbyter title/)).toHaveTextContent('No title');
  });

  it('renders exactly two name fields, the second labelled Other names (MR-49)', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    expect(field('First name')).toBeVisible();
    expect(field('Other names')).toBeVisible();
    // There is no second other-names input: the one field writes `lastName`.
    expect(screen.queryByLabelText(/^Last name/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Other names/)).toHaveValue('');

    await fillPerson(user, { memberNo: 'M-1009', phone: '+233 24 555 0109' });
    await next(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body).toMatchObject({ firstName: 'Kofi', lastName: 'Mensah' });
    expect(body).not.toHaveProperty('otherNames');
  });

  it('leaves an existing otherNames untouched when the second name field is edited', async () => {
    const user = userEvent.setup();
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: { ...DETAIL, otherNames: 'Adwoa' },
      etag: '"v3"',
    });
    renderForm('/members/M-1001?step=review');
    await waitForForm();

    // The form shows the record's `lastName`, not its `otherNames`.
    await user.click(stepButton(/Person and contact/));
    expect(field('Other names')).toHaveValue('Asante');
    expect(screen.queryByDisplayValue('Adwoa')).not.toBeInTheDocument();

    await user.clear(field('Other names'));
    await user.type(field('Other names'), 'Owusu');
    await user.click(stepButton(/Review/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberMock).toHaveBeenCalledTimes(1));
    const body = updateMemberMock.mock.calls[0]?.[3] as MemberUpdateInput;
    expect(body).toEqual({ lastName: 'Owusu' });
  });

  it('shows the recorded contacts on edit with Manage contacts', async () => {
    renderForm('/members/M-1001');
    await waitForForm();

    expect(await screen.findByRole('button', { name: 'Manage contacts' })).toBeVisible();
    expect(screen.getByText('+233 20 000 0001')).toBeVisible();
    expect(screen.getByText('Saved as you go')).toBeVisible();
  });

  it('renders the left portrait column at the field stack height, not a 512 image (MR-15)', async () => {
    renderForm('/members/M-1001');
    await waitForForm();

    const identity = screen.getByRole('region', { name: 'Identity' });
    const column = within(identity).getByTestId('member-photo-control-column');
    const fields = within(identity).getByTestId('member-identity-fields');

    // Left placement: the portrait column precedes the field stack in DOM order.
    expect(column.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Both are columns of the same identity row, so the square can follow the
    // field stack's height instead of stretching the panel.
    expect(column.parentElement).toBe(fields.parentElement);

    // The portrait is the square sized from the field column's height, and Change
    // is its compact action; neither is the dialog's 512 crop preview.
    const square = within(column).getByTestId('member-photo-control-square');
    expect(within(square).getByTestId('member-photo-control-avatar')).toBeVisible();
    // The label line (`Photo` + `Change`) sits above the square, so the portrait
    // starts at the field inputs' top rather than adding a separate row height.
    const head = within(column).getByText('Photo').parentElement;
    expect(head).not.toBeNull();
    expect(head!.nextElementSibling).toBe(square);
    const change = within(column).getByRole('button', { name: /Change/ });
    expect(change).toBeVisible();
    expect(change).toBeEnabled();

    expect(screen.queryByTestId('member-photo-preview')).not.toBeInTheDocument();
    expect(document.querySelector('img[width="512"], img[height="512"]')).toBeNull();
    expect(within(identity).queryByRole('img', { name: 'Selected profile' })).toBeNull();
  });

  it('refetches the shown contacts after the contacts dialog closes', async () => {
    const user = userEvent.setup();
    fetchMemberDetailMock
      .mockResolvedValueOnce({ member: DETAIL, etag: '"v3"' })
      // The dialog reads the same cache key when it opens.
      .mockResolvedValueOnce({ member: DETAIL, etag: '"v3"' })
      .mockResolvedValueOnce({
        member: {
          ...DETAIL,
          contactCount: 2,
          contacts: [
            ...DETAIL.contacts,
            {
              id: 'contact-1001-email',
              kind: 'email',
              value: 'kwame@example.test',
              displayOrder: 1,
              ownerMemberNo: 'M-1001',
              linked: false,
            },
          ],
        },
        etag: '"v4"',
      });
    renderForm('/members/M-1001');
    await waitForForm();

    expect(screen.getByText('+233 20 000 0001')).toBeVisible();

    await user.click(await screen.findByRole('button', { name: 'Manage contacts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Contacts' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    // AC-MR8: closing the dialog refetches, so the form's list shows the value without a reload.
    await waitFor(() => {
      const recorded = screen.getByRole('list', { name: 'Recorded contacts' });
      expect(within(recorded).getByText('kwame@example.test')).toBeVisible();
    });
    expect(fetchMemberDetailMock).toHaveBeenCalledTimes(3);
  });

  it('adds the new guardian link before removing the old one on edit', async () => {
    const user = userEvent.setup();
    fetchMemberDetailMock.mockResolvedValueOnce({
      member: {
        ...DETAIL,
        contacts: [],
        guardian: {
          memberNo: 'G-1001',
          name: 'Adwoa Mensah',
          contactMasked: '***01',
          via: [],
        },
        relationships: [
          {
            id: 'rel-guardian-1',
            type: 'guardian',
            isDependent: true,
            memberNo: 'G-1001',
            name: 'Adwoa Mensah',
            gender: 'female',
            age: 44,
            archived: false,
          },
        ],
      },
      etag: '"v3"',
    });
    listGuardianCandidatesMock.mockResolvedValue([
      ...GUARDIANS,
      { memberNo: 'G-1002', name: 'Kwesi Addo', contactMasked: '***42', via: [] },
    ]);
    renderForm('/members/M-1001?step=relationships');
    await waitForForm();

    const guardian = await screen.findByRole('combobox', { name: /^Guardian/ });
    await user.click(guardian);
    await user.click(await screen.findByRole('option', { name: /G-1002/ }));

    // AC-MR30: the member never loses its only route, so the new link lands before the old
    // one is removed through the existing relationship endpoint.
    await waitFor(() =>
      expect(removeMemberRelationshipMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'M-1001',
        'rel-guardian-1',
      ),
    );
    expect(addMemberRelationshipMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'M-1001',
      { relatedMemberNo: 'G-1002', type: 'guardian' },
    );
    expect(addMemberRelationshipMock.mock.invocationCallOrder[0]).toBeLessThan(
      removeMemberRelationshipMock.mock.invocationCallOrder[0]!,
    );
  });

  it('labels the edit-time ministries and relationships as saved as you go', async () => {
    renderForm('/members/M-1001?step=church');
    await waitForForm();

    expect(screen.getAllByTestId('saved-as-you-go').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Ministries apply immediately/)).toBeVisible();
  });

  it('saves only the staged fields on edit: an untouched form has nothing to save', async () => {
    const user = userEvent.setup();
    renderForm('/members/M-1001?step=review');
    await waitForForm();

    expect(stepHeading()).toHaveTextContent('Review');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateMemberMock).not.toHaveBeenCalled();
    expect(screen.getByText('No changes to save.')).toBeVisible();
  });

  it('sends only the changed staged field on edit', async () => {
    const user = userEvent.setup();
    renderForm('/members/M-1001');
    await waitForForm();

    await user.click(stepButton(/Church and involvement/));
    await user.clear(field('Came from'));
    await user.type(field('Came from'), 'Tema New Town');
    await user.click(stepButton(/Review/));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberMock).toHaveBeenCalledTimes(1));
    const body = updateMemberMock.mock.calls[0]?.[3] as MemberUpdateInput;
    expect(body).toEqual({ cameFrom: 'Tema New Town' });
  });

  it('adds a ministry on the edit form immediately, not through the save', async () => {
    const user = userEvent.setup();
    renderForm('/members/M-1001?step=church');
    await waitForForm();

    const ministryPicker = combobox(/^Add ministry/);
    await waitFor(() => expect(ministryPicker).toBeEnabled());
    await user.click(ministryPicker);
    await user.click(await screen.findByRole('option', { name: 'CHOIR · Choir' }));
    await user.click(screen.getByRole('button', { name: 'Add ministry' }));

    await waitFor(() => expect(addMemberMinistryMock).toHaveBeenCalledTimes(1));
    expect(addMemberMinistryMock.mock.calls[0]?.slice(2)).toEqual(['M-1001', 'CHOIR']);
    expect(updateMemberMock).not.toHaveBeenCalled();
  });
});
