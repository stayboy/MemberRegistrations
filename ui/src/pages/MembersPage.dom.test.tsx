import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MemberSummary } from '../api/members';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MembersPage } from './MembersPage';

/**
 * FR-9a / D12: `Members` carries exactly one verb (`Add member`) and one `Refresh` utility, so
 * the verb renders as a visible button beside a bare trailing icon and the page renders no
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
    archivedAt: null,
    contactCount: 2,
    ministries: [],
  },
];

vi.mock('../api/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/members')>();
  return { ...actual, listMembers: vi.fn(async () => ({ items: MEMBERS })) };
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
  it('shows Add member visibly with Refresh as a trailing utility and no Actions menu', async () => {
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

    // The utility is a named icon button after the verb, not a menu item.
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toBeVisible();
    expect(refresh.textContent).toBe('');
    expect(addMember.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
