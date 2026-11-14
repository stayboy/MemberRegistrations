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

vi.mock('../api/shepherding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/shepherding')>();
  return { ...actual, listOfficers: vi.fn(() => officers.promise) };
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

describe('ShepherdingOfficersPage action row', () => {
  it('disables Refresh while the roster query is in flight and enables it after', async () => {
    renderWithProviders(
      <MemoryRouter>
        <ThemeProvider>
          <DateTimeProvider>
            <ShepherdingOfficersPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // One utility and no verb: a named icon button, never a menu (FR-9a).
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();

    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    expect(refresh).toBeDisabled();

    officers.resolve([]);

    await waitFor(() => expect(refresh).not.toBeDisabled());
  });
});
