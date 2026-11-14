import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChurchReport } from '../api/shepherding';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { ShepherdingReportPage } from './ShepherdingReportPage';

/**
 * FR-9a / AC-50 on a real page: a page whose only action-row control is `Refresh` renders
 * that utility as a bare trailing icon and **no** `Actions` menu. The page-level check sits
 * here next to the component test so a call site that keeps a `kind` off its `refresh` entry
 * fails as a page, not only as a component.
 */
const REPORT: ChurchReport = {
  from: '2026-01-01',
  to: '2026-12-31',
  totals: {
    officers: 1,
    activeMembers: 4,
    assignedMembers: 4,
    unassignedMembers: 0,
    attempts: 2,
    conversations: 1,
    membersNeverCalled: 1,
    stillInChurch: { yes: 3, no: 0, unknown: 0, neverReported: 1 },
  },
  officers: [],
};

vi.mock('../api/shepherding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/shepherding')>();
  return { ...actual, getReport: vi.fn(async () => REPORT) };
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

describe('ShepherdingReportPage action row', () => {
  it('renders Refresh alone and no Actions menu', async () => {
    renderWithProviders(
      <MemoryRouter>
        <ThemeProvider>
          <DateTimeProvider>
            <ShepherdingReportPage />
          </DateTimeProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { level: 1, name: 'Church report' });

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
