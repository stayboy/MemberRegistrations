import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { ShepherdingOfficersPage } from './ShepherdingOfficersPage';

/**
 * FR-9a keeps each action's **disabling condition**, not the control that used to carry it:
 * the state must stay derivable from the query. `ShepherdingOfficersPage` carries one
 * `Refresh` utility and no verb, so this is the mirroring case — the page renders a bare
 * trailing icon, no `Actions` menu, and the icon is disabled for exactly the window the
 * officers query is in flight and enabled once it settles.
 */
const officers = vi.hoisted(() => {
  let resolve!: (rows: never[]) => void;
  const promise = new Promise<never[]>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
});

/**
 * FR-58: the church totals and coverage come from the report read, not from summing the
 * officers' rows — the rows carry no unassigned or never-called members at all.
 */
const report = vi.hoisted(() => ({
  from: null as string | null,
  to: null as string | null,
  totals: {
    officers: 1,
    activeMembers: 1196,
    assignedMembers: 142,
    unassignedMembers: 1054,
    attempts: 4,
    conversations: 3,
    membersNeverCalled: 1,
    stillInChurch: { yes: 0, no: 0, unknown: 0, neverReported: 0 },
  },
  officers: [],
}));

vi.mock('../api/shepherding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/shepherding')>();
  return {
    ...actual,
    listOfficers: vi.fn(() => officers.promise),
    getReport: vi.fn(async () => report),
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

const render = () =>
  renderWithProviders(
    <MemoryRouter>
      <ThemeProvider>
        <DateTimeProvider>
          <ShepherdingOfficersPage />
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

describe('ShepherdingOfficersPage action row', () => {
  it('disables Refresh while the roster query is in flight and enables it after', async () => {
    render();

    // One utility and no verb: a named icon button, never a menu (FR-9a).
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();

    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    expect(refresh).toBeDisabled();

    officers.resolve([]);

    await waitFor(() => expect(refresh).not.toBeDisabled());
  });
});

describe('ShepherdingOfficersPage church totals (FR-58)', () => {
  it('shows the five totals and the coverage line from the report', async () => {
    render();

    const tiles = await screen.findByLabelText('Church totals');
    expect(tiles).toHaveTextContent('Assigned');
    expect(tiles).toHaveTextContent('142');
    expect(tiles).toHaveTextContent('Unassigned');
    expect(tiles).toHaveTextContent('1054');
    expect(tiles).toHaveTextContent('Attempts');
    expect(tiles).toHaveTextContent('Conversations');
    expect(tiles).toHaveTextContent('Never called');

    // Coverage is the derived share, written in the sentence a reader can check.
    expect(
      await screen.findByText(/1054 active members are not on a shepherding list/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Coverage is 12% \(142 of 1196\)/)).toBeInTheDocument();

    officers.resolve([]);
  });

  it('still states coverage when every member is assigned', async () => {
    report.totals.unassignedMembers = 0;
    report.totals.assignedMembers = 1196;
    render();

    expect(await screen.findByText(/Coverage is 100% \(1196 of 1196\)/)).toBeInTheDocument();
    expect(screen.getByText(/Every active member is on a shepherding list/)).toBeInTheDocument();

    report.totals.unassignedMembers = 1054;
    report.totals.assignedMembers = 142;
    officers.resolve([]);
  });
});
