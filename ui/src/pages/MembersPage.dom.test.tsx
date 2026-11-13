import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MemberSummary } from '../api/members';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { MembersPage } from './MembersPage';

/**
 * FR-9a: a page's menu order is the page's own array — create-side verbs, then edit-side verbs,
 * then the separator, then destructive verbs, with `Refresh` last. The shared component cannot
 * enforce that for a call site, so one converted page is rendered end to end and its real array
 * is read back through the menu. `MembersPage` is that page: it is the cheapest converted
 * page whose order can regress — the single-verb pages (`ShepherdingOfficersPage`,
 * `ImportsPage`) render one item and cannot discriminate ordering — and a revert to
 * `Refresh` first, the ordering this round replaced, must fail here.
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

describe('MembersPage action menu', () => {
  it('renders its verbs in FR-9a order: create-side, separator, Refresh last', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter initialEntries={['/members']}>
        <ThemeProvider>
          <DateTimeProvider>
            <MembersPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Add member', 'Refresh']);

    // The separator opens the trailing group, so `Refresh` is the group's only member here.
    expect(document.querySelectorAll('.fui-MenuDivider')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('.fui-MenuDivider')?.nextElementSibling).toBe(
      items[1],
    );
  });
});
