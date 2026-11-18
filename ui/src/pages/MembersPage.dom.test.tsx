import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { fetchMemberPhoto, type MemberSummary } from '../api/members';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MembersPage } from './MembersPage';

/**
 * FR-9a / D12: `Members` carries exactly one verb (`Add member`) and one `Refresh` utility, so
 * the verb renders as a visible button after a bare utility icon and the page renders no
 * `Actions` menu at all. This is the page rendered end to end for that rule: the cheapest
 * converted page that discriminates the single-verb shape from the menu shape — a revert to
 * the menu must fail here.
 */
const MEMBERS: readonly MemberSummary[] = [
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
    ministries: [],
  },
  {
    memberNo: 'M-2002',
    firstName: 'Adwoa',
    lastName: 'Mensah',
    otherNames: null,
    gender: 'female',
    age: 33,
    ageMonths: 396,
    placeOfResidence: 'Accra',
    joinedOn: '2021-06-12',
    isPresbyter: false,
    photoUpdatedAt: '2026-11-18T10:00:00.000Z',
    archivedAt: null,
    contactCount: 1,
    ministries: [],
  },
];

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return {
    ...actual,
    listMembers: vi.fn(async () => ({ items: MEMBERS })),
    fetchMemberPhoto: vi.fn(async () => new Blob(['photo'], { type: 'image/webp' })),
  };
});

vi.mock('../api/series', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/series')>();
  return { ...actual, listSeries: vi.fn(async () => []) };
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

describe('MembersPage single-verb action row', () => {
  it('shows Add member visibly with Refresh immediately before it and no Actions menu', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/members']}>
        <ThemeProvider>
          <DateTimeProvider>
            <MembersPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // The one verb is a visible control, not a one-item menu (FR-9a).
    const addMember = await screen.findByRole('button', { name: 'Add member' });
    expect(addMember).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // The utility is a named icon button before the verb, not a menu item; the verb holds the
    // trailing edge (FR-9a, owner 2026-11-15: refresh before actions, not after).
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toBeVisible();
    expect(refresh.textContent).toBe('');
    expect(refresh.compareDocumentPosition(addMember) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('names the subscriptions column Welfare & Services (FR-29, AC-41)', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/members']}>
        <ThemeProvider>
          <DateTimeProvider>
            <MembersPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('columnheader', { name: 'Welfare & Services' })).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: 'Subscriptions' })).not.toBeInTheDocument();
  });

  it('shows initials without a photo and the fetched blob when one exists (MR-19)', async () => {
    const createObjectURL = vi.fn(() => 'blob:member-photo');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    renderWithProviders(
      <MemoryRouter initialEntries={['/members']}>
        <ThemeProvider>
          <DateTimeProvider>
            <MembersPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const initialsAvatar = await screen.findByTestId('member-avatar-M-1001');
    expect(initialsAvatar).toHaveTextContent('KA');
    expect(initialsAvatar.querySelector('img')).toBeNull();

    const photoAvatar = await screen.findByTestId('member-avatar-M-2002');
    await waitFor(() => expect(photoAvatar.querySelector('img')).not.toBeNull());
    expect(photoAvatar.querySelector('img')?.getAttribute('src')).toBe('blob:member-photo');
    expect(vi.mocked(fetchMemberPhoto).mock.calls[0]?.slice(0, 3)).toEqual([
      expect.any(String),
      expect.any(String),
      'M-2002',
    ]);
  });
});
