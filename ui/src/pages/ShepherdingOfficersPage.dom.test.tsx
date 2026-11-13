import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { ShepherdingOfficersPage } from './ShepherdingOfficersPage';

/**
 * FR-9a keeps each menu item's **disabling condition**, not the button that used to carry
 * it: the state must stay derivable from the query after the button is gone. This is the
 * mirroring case — the officers list is held in flight, and the `Refresh` menuitem must be
 * disabled for exactly that window and enabled once the query settles.
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

describe('ShepherdingOfficersPage action menu', () => {
  it('disables Refresh while the roster query is in flight and enables it after', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter>
        <ThemeProvider>
          <DateTimeProvider>
            <ShepherdingOfficersPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    const refreshItem = await screen.findByRole('menuitem', { name: 'Refresh' });
    expect(refreshItem).toHaveAttribute('aria-disabled', 'true');

    officers.resolve([]);

    await waitFor(() => expect(refreshItem).not.toHaveAttribute('aria-disabled', 'true'));
  });
});
