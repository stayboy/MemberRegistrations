import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventParentItem, EventWindowSummary } from '../api/events';
import { getSeriesParent } from '../api/series';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { SeriesDetailPage } from './SeriesDetailPage';

/**
 * Series detail on the parent read (FR-1/FR-6/FR-6e). A series is the event
 * parent, so the page renders the same identity, recurrence and occurrence
 * shape as the event detail; the discriminating surfaces here are the parent
 * fields, the standalone/recurring recurrence block and the occurrence table,
 * with the tiles fed by the parent's one `summary` and the Roster caption both
 * detail pages share.
 */

const SUMMARY: EventWindowSummary = {
  from: '2026-01-01',
  to: '2026-01-31',
  nextOccurrence: '2026-01-04',
  attendance: {
    memberSessions: { held: 3, expected: 12, present: 9, rate: 0.75 },
    lastHeld: { date: '2026-01-18', expected: 4, present: 3 },
    headcountSessions: { held: 0 },
    cancelled: 1,
    upcoming: 0,
  },
  offerings: {
    attachedCount: 2,
    currency: 'GHS',
    paidMinor: 560000,
    pledgedMinor: 3400000,
    outstandingMinor: 3400000,
    countedMinor: 0,
    visitors: { count: 0, paidMinor: 0 },
  },
};

const PARENT: EventParentItem = {
  id: 'series-1',
  eventNo: 'EVT-2026-014',
  name: 'Sunday Service',
  audienceId: 'aud-everyone',
  audience: {
    id: 'aud-everyone',
    name: 'Everyone',
    system: true,
    summary: 'Everyone in the register',
  },
  ministry: { code: 'CHOIR', name: 'Choir' },
  presbyterOnly: false,
  timezone: 'UTC',
  description: 'Weekly worship service.',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  startDate: '2025-01-05',
  endDate: null,
  startTime: '08:00',
  endTime: '11:30',
  tracksMembers: true,
  status: 'active',
  recurrence: {
    schedules: [
      { effectiveFrom: '2025-01-05', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
      { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: '2026-12-27' },
    ],
    exceptions: [
      { date: '2026-01-11', kind: 'cancelled', note: 'Public holiday' },
      { date: '2026-01-20', kind: 'extra', note: 'Christmas Eve service' },
    ],
  },
  occurrences: [
    {
      id: 'occ-1',
      date: '2026-01-04',
      startTime: '08:00',
      endTime: '11:30',
      status: 'held',
      capture: { asOf: '2026-01-04T10:42:00.000Z', ended: true },
      note: null,
      present: 3,
      expected: 4,
      importedRows: 3,
      source: 'import',
      legacyEventNo: null,
    },
    {
      id: 'occ-2',
      date: '2026-01-18',
      startTime: '08:00',
      endTime: '11:30',
      status: 'held',
      capture: { asOf: '2026-01-18T10:42:00.000Z', ended: true },
      note: null,
      present: 3,
      expected: 4,
      importedRows: 3,
      source: 'import',
      legacyEventNo: null,
    },
  ],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
  summary: SUMMARY,
};

vi.mock('../api/series', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/series')>();
  return { ...actual, getSeriesParent: vi.fn(async () => PARENT) };
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

const getSeriesParentMock = vi.mocked(getSeriesParent);

beforeEach(() => {
  getSeriesParentMock.mockReset();
  getSeriesParentMock.mockResolvedValue(PARENT);
});

function renderSeries(): void {
  renderWithProviders(
    <MemoryRouter initialEntries={['/events/series-1?from=2026-01-01&to=2026-01-31']}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/events/:id" element={<SeriesDetailPage />} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('SeriesDetailPage parent read', () => {
  it('renders the parent fields, the recurrence block and the occurrence table', async () => {
    renderSeries();

    expect(await screen.findByRole('heading', { level: 1, name: 'Sunday Service' })).toBeVisible();
    expect(screen.getByText('EVT-2026-014')).toBeVisible();
    expect(screen.getByText('Everyone in the register')).toBeVisible();
    expect(screen.getByText('CHOIR — Choir')).toBeVisible();
    expect(screen.getByText('Weekly worship service.')).toBeVisible();

    const recurrence = screen.getByRole('region', { name: 'Recurrence' });
    expect(within(recurrence).getByText('2 schedule versions · 2 exceptions')).toBeVisible();
    const versions = within(recurrence).getByRole('table', { name: 'Schedule versions' });
    expect(within(versions).getAllByText('Weekly on Sunday')).toHaveLength(2);
    const exceptions = within(recurrence).getByRole('table', { name: 'Series exceptions' });
    expect(within(exceptions).getByText('Public holiday')).toBeVisible();

    const occurrences = screen.getByRole('table', { name: 'Series occurrences' });
    expect(within(occurrences).getByText('Jan 4, 2026')).toBeVisible();
    expect(within(occurrences).getByText('Jan 18, 2026')).toBeVisible();
    expect(within(occurrences).getAllByRole('link', { name: 'View events' })).toHaveLength(2);
  });

  it('feeds the tiles from the parent summary with the Roster caption', async () => {
    renderSeries();

    const summary = await screen.findByRole('region', { name: 'Series summary' });
    expect(within(summary).getByText('Jan 4, 2026')).toBeVisible();
    expect(within(summary).getByText('75%')).toBeVisible();
    expect(within(summary).getByText('3 present · Roster 4 on Jan 18, 2026')).toBeVisible();
    expect(within(summary).getByText('in this window')).toBeVisible();
  });

  it('names a standalone parent and still offers the recurring management controls', async () => {
    getSeriesParentMock.mockResolvedValue({
      ...PARENT,
      recurrence: null,
      occurrences: [PARENT.occurrences[0]!],
    });
    renderSeries();

    const recurrence = await screen.findByRole('region', { name: 'Recurrence' });
    expect(within(recurrence).getByText('Standalone event')).toBeVisible();
    expect(within(recurrence).getByText('No schedule')).toBeVisible();
    expect(within(recurrence).getByRole('button', { name: 'Add version' })).toBeVisible();
    expect(within(recurrence).getByRole('button', { name: 'Add exception' })).toBeVisible();
  });
});
