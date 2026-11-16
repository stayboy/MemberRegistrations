import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMember,
  fetchMemberDetail,
  type MemberDetail,
  type MemberInput,
} from '../api/members';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MemberFormPage } from './MemberFormPage';

/**
 * FR-29a / AC-52: the create form carries a `Contacts` section in the order Identity,
 * Residence, Contacts, Church, and its three optional values ride the same
 * `POST /v1/members` body as `contacts[]` — a blank field contributes no row. The edit
 * form carries no contact fields at all. The section order, the three labels, the payload
 * shape and the edit form's silence are what a regression would break, so those are the
 * cases here.
 */
vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    createMember: vi.fn(),
    fetchMemberDetail: vi.fn(),
    updateMember: vi.fn(),
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

beforeEach(() => {
  createMemberMock.mockReset();
  createMemberMock.mockResolvedValue(DETAIL);
  fetchMemberDetailMock.mockReset();
  fetchMemberDetailMock.mockResolvedValue({ member: DETAIL, etag: '"v3"' });
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
  it('orders the create form Identity, Residence, Contacts, Church and labels the three fields', () => {
    renderForm('/members/new');

    expect(sectionTitles()).toEqual(['Identity', 'Residence', 'Contacts', 'Church']);
    // The residence section no longer describes a contact field; that helper lives on Contacts.
    expect(screen.queryByText(/normalised by kind/)).not.toBeInTheDocument();

    for (const label of ['Phone', 'Email', 'WhatsApp']) {
      expect(field(label)).toBeVisible();
    }
  });

  it('sends no contacts rows when every contact field is blank', async () => {
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
  });
});
