import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import {
  createMember,
  fetchMemberDetail,
  listMinistries,
  subscribeMemberProduct,
  updateMember,
  type MemberDetail,
  type MemberInput,
  type MemberUpdateInput,
  type Ministry,
} from '../api/members';
import { listWelfareProducts, type WelfareProduct } from '../api/welfare';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MemberFormPage } from './MemberFormPage';

/**
 * FR-29a / AC-52 / FR-71: the create form carries a `Contacts` section in the order
 * Identity, Residence, Contacts, Church, then one optional subscription; its three
 * optional contact values ride the same `POST /v1/members` body as `contacts[]`
 * (a blank field contributes no row), the chosen ministry codes ride it as
 * `ministries[]`, and a chosen subscription is a second call after the member exists.
 * The edit form carries none of these. The section order, the labels, the payload
 * shapes, the follow-up call and the partial-failure copy are what a regression
 * would break, so those are the cases here.
 */
vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    createMember: vi.fn(),
    fetchMemberDetail: vi.fn(),
    updateMember: vi.fn(),
    listMinistries: vi.fn(),
    subscribeMemberProduct: vi.fn(),
  };
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
  calls: { attempts: 0, conversations: 0, lastCalledOn: null, lastReachedOn: null },
  isPresbyter: true,
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
const subscribeMemberProductMock = vi.mocked(subscribeMemberProduct);
const listWelfareProductsMock = vi.mocked(listWelfareProducts);

const MINISTRIES: Ministry[] = [
  { code: 'CHOIR', name: 'Choir', description: null, active: true },
  { code: 'USHER', name: 'Ushering', description: null, active: true },
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
});

function renderForm(route: '/members/new' | `/members/${string}`): void {
  renderWithProviders(
    <MemoryRouter initialEntries={[route]}>
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

function sectionTitles(): readonly (string | null)[] {
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
}

/** Fluent marks a required label, so its text carries the marker; match the label's start. */
function field(label: string): HTMLElement {
  return screen.getByLabelText(new RegExp(`^${label}`));
}

describe('MemberFormPage contacts (FR-29a)', () => {
  it('orders the create form Identity, Residence, Contacts, Church, Subscription and labels the three fields', () => {
    renderForm('/members/new');

    expect(sectionTitles()).toEqual([
      'Identity',
      'Residence',
      'Contacts',
      'Church',
      'Subscription',
    ]);
    // The residence section no longer describes a contact field; that helper lives on Contacts.
    expect(screen.queryByText(/normalised by kind/)).not.toBeInTheDocument();

    for (const label of ['Phone', 'Email', 'WhatsApp']) {
      expect(field(label)).toBeVisible();
    }
  });

  it('sends no contacts rows and no ministries key when every optional field is blank', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    // A blank field contributes no row at all: the key is absent, not an empty array.
    expect(body).not.toHaveProperty('contacts');
    expect(body).not.toHaveProperty('ministries');
    expect(body.memberNo).toBe('M-1009');
  });

  it('sends one contacts row per entered value, in the section order, and skips blanks', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');
    await user.type(field('Phone'), '+233 24 555 0109');
    await user.type(field('WhatsApp'), '+233 20 000 0009');
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body.contacts).toEqual([
      { kind: 'phone', value: '+233 24 555 0109' },
      { kind: 'whatsapp', value: '+233 20 000 0009' },
    ]);
  });

  it('renders no contact field on the edit form', async () => {
    renderForm('/members/M-1001');

    // The form view, not the pending shell: the commit control belongs to the loaded form.
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible();

    expect(sectionTitles()).toEqual(['Identity', 'Residence', 'Church']);
    // No contact field of any kind on this path, so nothing may claim a contact value is checked.
    expect(screen.queryByText(/normalised by kind/)).not.toBeInTheDocument();
    for (const label of ['Phone', 'Email', 'WhatsApp']) {
      expect(screen.queryByLabelText(new RegExp(`^${label}`))).not.toBeInTheDocument();
    }
    // Neither does the edit form gain the create-only ministries and subscription controls (FR-71).
    expect(screen.queryByRole('combobox', { name: 'Ministries' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Product' })).not.toBeInTheDocument();
    expect(screen.queryByText('Subscription')).not.toBeInTheDocument();
  });
});

describe('MemberFormPage ministries (FR-71)', () => {
  it('sends the chosen ministry codes in the create payload', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');

    const ministries = await screen.findByRole('combobox', { name: 'Ministries' });
    // The reference list is a query: the control stays disabled until it lands.
    await waitFor(() => expect(ministries).toBeEnabled());
    await user.click(ministries);
    // A multiselect Combobox lists its items as a menu of checkboxes, and stays open.
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'CHOIR · Choir' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'USHER · Ushering' }));

    // The selection is confirmed as chips before the request goes out.
    expect(screen.getByRole('toolbar', { name: 'Chosen ministries' })).toHaveTextContent(
      'CHOIR · Choir',
    );

    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body.ministries).toEqual(['CHOIR', 'USHER']);
  });
});

describe('MemberFormPage subscription (FR-29a, AC-52)', () => {
  it('adds the subscription after the member exists, with the payer the product requires', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');

    const productPicker = await screen.findByRole('combobox', { name: 'Product' });
    await waitFor(() => expect(productPicker).toBeEnabled());
    await user.click(productPicker);
    // `HEALTH` is paid by `either`, so the route needs the payer named.
    await user.click(await screen.findByRole('option', { name: 'HEALTH · Health plan' }));

    const paidBy = await screen.findByRole('combobox', { name: /^Paid by/ });
    await user.click(paidBy);
    await user.click(await screen.findByRole('option', { name: 'Church' }));

    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    // The subscription never rides the create body: the contract carries none.
    expect(createMemberMock.mock.calls[0]?.[2]).not.toHaveProperty('subscription');

    await waitFor(() => expect(subscribeMemberProductMock).toHaveBeenCalledTimes(1));
    // AC-52: the follow-up names the member the create just returned.
    expect(subscribeMemberProductMock.mock.calls[0]?.slice(2)).toEqual([
      'M-1001',
      { productCode: 'HEALTH', paidBy: 'church' },
    ]);
  });

  it('keeps the form open on a failed subscription, names it, and offers only the record', async () => {
    const user = userEvent.setup();
    subscribeMemberProductMock.mockRejectedValue(
      new ApiError(422, 'Member M-1001 is not eligible for the FUNERAL product'),
    );
    renderForm('/members/new');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');

    const productPicker = await screen.findByRole('combobox', { name: 'Product' });
    await waitFor(() => expect(productPicker).toBeEnabled());
    await user.click(productPicker);
    await user.click(await screen.findByRole('option', { name: 'FUNERAL · Funeral cover' }));

    await user.click(screen.getByRole('button', { name: 'Create member' }));

    // The member exists, so the primary action is the record itself and no second
    // create is offered: the member number would 409.
    const openRecord = await screen.findByRole('button', { name: 'Open member record' });
    expect(screen.queryByRole('button', { name: 'Create member' })).not.toBeInTheDocument();
    expect(createMemberMock).toHaveBeenCalledTimes(1);

    // The message names the failure and points at the Subscriptions view…
    expect(
      screen.getByText('The member was created, but its subscription was not added'),
    ).toBeVisible();
    expect(screen.getByText(/Member M-1001 is not eligible for the FUNERAL product/)).toBeVisible();
    expect(
      screen.getByText(/can still be added from the member's Subscriptions view/),
    ).toBeVisible();

    // …and never says the registration failed.
    expect(screen.queryByText(/registration failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText('The member was not saved')).not.toBeInTheDocument();

    // Opening the record is the only remaining way out of the form.
    await user.click(openRecord);
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible();
  });
});

describe('MemberFormPage membership (FR-29)', () => {
  it('sends the four membership fields on create, and null for a blank one', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');
    await user.type(field('Assembly joined'), '2018-02-04');
    await user.type(field('Came from'), 'Kumasi Central');
    await user.type(field('Moved out'), '2021-06-30');
    await user.type(field('Moved to'), 'Accra North');
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body).toMatchObject({
      assemblyJoinedOn: '2018-02-04',
      cameFrom: 'Kumasi Central',
      movedOutOn: '2021-06-30',
      movedToAssembly: 'Accra North',
    });
  });

  it('leaves the assembly join date empty and submits nulls for the four fields', async () => {
    const user = userEvent.setup();
    renderForm('/members/new');

    // FR-29: no default; the operator must record it or leave it blank.
    expect(field('Assembly joined')).toHaveValue('');

    await user.type(field('Member number'), 'M-1009');
    await user.type(field('First name'), 'Kofi');
    await user.type(field('Last name'), 'Mensah');
    await user.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const body = createMemberMock.mock.calls[0]?.[2] as MemberInput;
    expect(body).toMatchObject({
      assemblyJoinedOn: null,
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
    });
  });

  it('prefills the membership fields on edit and sends only the changed one', async () => {
    const user = userEvent.setup();
    renderForm('/members/M-1001');

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible();
    expect(field('Assembly joined')).toHaveValue('2019-03-03');
    expect(field('Came from')).toHaveValue('Accra Central');
    expect(field('Moved out')).toHaveValue('');
    expect(field('Moved to')).toHaveValue('');

    await user.clear(field('Came from'));
    await user.type(field('Came from'), 'Tema New Town');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberMock).toHaveBeenCalledTimes(1));
    const body = updateMemberMock.mock.calls[0]?.[3] as MemberUpdateInput;
    expect(body).toEqual({ cameFrom: 'Tema New Town' });
  });
});
