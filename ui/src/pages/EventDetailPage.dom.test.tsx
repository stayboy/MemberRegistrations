import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventParent, type EventParentItem, type EventWindowSummary } from '../api/events';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { EventDetailPage } from './EventDetailPage';

/**
 * Event detail on the parent read (events FR-4/FR-5/FR-6, UI FR-42). The
 * occurrence table is the discriminating surface: the transitional roster
 * figure is labelled Roster and never merged with present, the capture state is
 * the computed line, and the four window tiles come from the single `summary`
 * the endpoint returns rather than from local arithmetic.
 */

const SUMMARY: EventWindowSummary = {
  from: '2026-10-01',
  to: '2026-12-31',
  nextOccurrence: '2026-11-29',
  attendance: {
    memberSessions: { held: 1, expected: 120, present: 86, rate: 0.75 },
    lastHeld: { date: '2026-10-13', expected: 120, present: 86 },
    headcountSessions: { held: 0 },
    cancelled: 0,
    upcoming: 1,
  },
  offerings: {
    attachedCount: 0,
    currency: 'GHS',
    paidMinor: 0,
    pledgedMinor: 0,
    outstandingMinor: 0,
    countedMinor: 0,
    visitors: { count: 0, paidMinor: 0 },
  },
};

const PARENT: EventParentItem = {
  id: 'evt-1',
  eventNo: 'EVT-2026-014',
  name: 'Strategic Conference',
  audienceId: 'aud-everyone',
  audience: {
    id: 'aud-everyone',
    name: 'Everyone',
    system: true,
    summary: 'Everyone in the register',
  },
  ministry: { code: 'LEAD', name: 'Leadership' },
  presbyterOnly: false,
  timezone: 'UTC',
  description: null,
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  startDate: '2026-10-13',
  endDate: '2026-10-15',
  startTime: '17:30',
  endTime: '20:30',
  tracksMembers: true,
  status: 'active',
  recurrence: {
    schedules: [{ effectiveFrom: '2026-10-13', rrule: 'FREQ=DAILY', endsOn: '2026-10-15' }],
    exceptions: [{ date: '2026-10-14', kind: 'cancelled', note: 'Venue flooded' }],
  },
  occurrences: [
    {
      id: 'occ-1',
      date: '2026-10-13',
      startTime: '17:30',
      endTime: '20:30',
      status: 'held',
      capture: { asOf: '2026-10-13T17:30:00.000Z', ended: true },
      note: null,
      present: 86,
      expected: 120,
      importedRows: 86,
      source: 'import',
      legacyEventNo: null,
    },
    {
      id: 'occ-2',
      date: '2026-11-29',
      startTime: '17:30',
      endTime: '20:30',
      status: 'scheduled',
      capture: null,
      note: null,
      present: 0,
      expected: 120,
      importedRows: 0,
      source: 'none',
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

vi.mock('../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/events')>();
  return { ...actual, getEventParent: vi.fn(async () => PARENT) };
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

vi.mock('../api/imports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/imports')>();
  return {
    ...actual,
    // The panel's contract is not what this test asserts; an empty format keeps
    // the dialog mounted without a download or an upload.
    getImportFormats: vi.fn(async () => []),
  };
});

vi.mock('../api/ussd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/ussd')>();
  return {
    ...actual,
    getHeadcounts: vi.fn(async () => ({
      sessionDate: '2026-10-13',
      current: {
        adults: {
          id: 'headcount-1',
          eventId: 'evt-1',
          sessionDate: '2026-10-13',
          asOf: '2026-10-13T17:30:00.000Z',
          mode: 'adults',
          total: 150,
          ended: true,
          recordedBy: 'officer-1',
          recordedAt: '2026-10-13T17:31:00.000Z',
          supersedesId: null,
          supersededBy: null,
          lines: [],
        },
      },
      observations: [],
    })),
  };
});

const getEventParentMock = vi.mocked(getEventParent);

beforeEach(() => {
  getEventParentMock.mockReset();
  getEventParentMock.mockResolvedValue(PARENT);
});

function renderDetail(importDate?: string): void {
  const params = new URLSearchParams({ from: '2026-10-01', to: '2026-12-31' });
  if (importDate) params.set('import', importDate);
  renderWithProviders(
    <MemoryRouter initialEntries={[`/events/evt-1?${params.toString()}`]}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/events/:id" element={<EventDetailPage />} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('EventDetailPage parent read', () => {
  it('labels the transitional expected count Roster and shows the capture state', async () => {
    renderDetail();

    const table = await screen.findByRole('table', { name: 'Event occurrences' });
    expect(within(table).getByText('86 present')).toBeVisible();
    expect(within(table).getAllByText('Roster 120').length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/End of session/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Import').length).toBeGreaterThan(0);
  });

  it('feeds the four window tiles from the parent summary', async () => {
    renderDetail();

    const tiles = await screen.findByRole('region', { name: 'Event summary' });
    expect(within(tiles).getByText('Next occurrence')).toBeVisible();
    expect(within(tiles).getByText('Occurrences')).toBeVisible();
    expect(within(tiles).getByText('in this window')).toBeVisible();
    expect(within(tiles).getByText('75%')).toBeVisible();
    expect(within(tiles).getByText('86 present · Roster 120 on Oct 13, 2026')).toBeVisible();
    expect(within(tiles).getByText('No offerings attached')).toBeVisible();
  });

  it('shows the server-rendered audience summary and the Draft badge on a draft parent', async () => {
    getEventParentMock.mockResolvedValue({ ...PARENT, status: 'draft' });
    renderDetail();

    expect(await screen.findByText('Everyone in the register')).toBeVisible();
    expect(screen.getByText('Draft')).toBeVisible();
  });

  it('opens the import panel for the occurrence the import date names', async () => {
    renderDetail('2026-11-29');

    expect(await screen.findByText('Import attendance')).toBeVisible();
    expect(screen.getByText('Selected occurrence')).toBeVisible();
  });

  it('ignores an import date no occurrence in the window matches', async () => {
    renderDetail('2026-12-01');

    expect(await screen.findByRole('table', { name: 'Event occurrences' })).toBeVisible();
    expect(screen.queryByText('Import attendance')).toBeNull();
  });

  it('renders the headcount surface on the occurrence row', async () => {
    renderDetail();

    const table = await screen.findByRole('table', { name: 'Event occurrences' });
    expect(within(table).getByRole('columnheader', { name: 'Headcount' })).toBeVisible();

    const heldRow = within(table)
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Oct 13, 2026'));
    expect(heldRow).toBeDefined();
    expect(await within(heldRow!).findByText('Adult service')).toBeVisible();
    expect(within(heldRow!).getByText('150')).toBeVisible();
    expect(within(heldRow!).getByRole('button', { name: 'Record headcount' })).toBeVisible();
    expect(within(heldRow!).getByRole('button', { name: 'Import' })).toBeVisible();
  });
});
