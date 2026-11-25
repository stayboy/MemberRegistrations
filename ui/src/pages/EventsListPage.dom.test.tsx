import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EventParentItem, EventWindowSummary } from '../api/events';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { EventsListPage } from './EventsListPage';

/**
 * Events list on the parent read (events FR-1/FR-2/FR-5, UI FR-42). The
 * discriminating cases: a draft parent carries the Draft badge, a null
 * `summary.nextOccurrence` shows the explicit empty state instead of a date the
 * browser computed, the audience cell is the server's `summary` in a tag (never
 * a locally composed rule), and a recurring row is labelled from its latest
 * `recurrence.schedules` version while a standalone row carries its dates only.
 * The signed drawing adds the number-and-venue line, the attendance bar with
 * the text as its value, and the row-count footer; the dead series filter is
 * gone.
 */

const SUMMARY: EventWindowSummary = {
  from: '2026-09-01',
  to: '2026-12-01',
  nextOccurrence: '2026-11-29',
  attendance: {
    memberSessions: { held: 3, expected: 120, present: 98, rate: 0.82 },
    lastHeld: { date: '2026-11-22', expected: 40, present: 34 },
    headcountSessions: { held: 0 },
    cancelled: 0,
    upcoming: 1,
  },
  offerings: {
    attachedCount: 3,
    currency: 'GHS',
    paidMinor: 620000,
    pledgedMinor: 0,
    outstandingMinor: 0,
    countedMinor: 0,
    visitors: { count: 0, paidMinor: 0 },
  },
};

function parent(overrides: Partial<EventParentItem> = {}): EventParentItem {
  return {
    id: 'evt-draft',
    eventNo: 'EVT-2026-014',
    name: 'Strategic Conference',
    audienceIds: ['aud-presbyters'],
    audiences: [
      {
        id: 'aud-presbyters',
        name: 'Presbyters',
        system: true,
        summary: 'All presbyters, active and retired',
      },
    ],
    audienceId: 'aud-presbyters',
    audience: {
      id: 'aud-presbyters',
      name: 'Presbyters',
      system: true,
      summary: 'All presbyters, active and retired',
    },
    period: null,
    ministry: { code: 'LEAD', name: 'Leadership' },
    presbyterOnly: true,
    timezone: 'UTC',
    description: null,
    venueType: 'auditorium',
    venueName: 'Main Auditorium',
    startDate: '2026-10-13',
    endDate: '2026-10-15',
    startTime: '17:30',
    endTime: '20:30',
    tracksMembers: true,
    status: 'draft',
    recurrence: {
      schedules: [{ effectiveFrom: '2026-10-13', rrule: 'FREQ=DAILY', endsOn: null }],
      exceptions: [],
    },
    occurrences: [],
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
    ...overrides,
  };
}

const DRAFT = parent();

const NO_NEXT = parent({
  id: 'evt-active',
  eventNo: 'EVT-2026-002',
  name: 'Sunday Main English Service',
  audience: {
    id: 'aud-everyone',
    name: 'Everyone',
    system: true,
    summary: 'Everyone in the register',
  },
  ministry: null,
  presbyterOnly: false,
  status: 'active',
  recurrence: {
    schedules: [{ effectiveFrom: '2026-08-01', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null }],
    exceptions: [],
  },
  summary: {
    ...SUMMARY,
    nextOccurrence: null,
    attendance: {
      ...SUMMARY.attendance,
      memberSessions: { held: 0, expected: 0, present: 0, rate: null },
      lastHeld: null,
    },
    offerings: { ...SUMMARY.offerings, attachedCount: 0 },
  },
});

/** Two schedule versions: the later `effectiveFrom` is the one the row labels. */
const VERSIONS = parent({
  id: 'evt-versions',
  eventNo: 'EVT-2026-009',
  name: 'Bible Study',
  audience: { id: 'aud-youth', name: 'Youth', system: false, summary: 'All youth members' },
  status: 'active',
  // No name: the venue line falls back to the type's label.
  venueName: null,
  recurrence: {
    schedules: [
      { effectiveFrom: '2026-10-13', rrule: 'FREQ=DAILY', endsOn: '2026-10-15' },
      { effectiveFrom: '2026-11-01', rrule: 'FREQ=MONTHLY;BYMONTHDAY=15', endsOn: null },
    ],
    exceptions: [],
  },
  summary: { ...SUMMARY, nextOccurrence: '2026-11-15' },
});

/** No recurrence: the row carries its own dates and no schedule label. */
const STANDALONE = parent({
  id: 'evt-standalone',
  eventNo: 'EVT-2026-021',
  name: 'Leaders retreat',
  audience: { id: 'aud-leaders', name: 'Leaders', system: false, summary: 'All leaders' },
  status: 'active',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
  recurrence: null,
  summary: {
    ...SUMMARY,
    nextOccurrence: null,
    offerings: { ...SUMMARY.offerings, attachedCount: 0 },
  },
});

vi.mock('../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/events')>();
  return {
    ...actual,
    listEventParents: vi.fn(async () => [DRAFT, NO_NEXT, VERSIONS, STANDALONE]),
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

function renderList(): void {
  renderWithProviders(
    <MemoryRouter initialEntries={['/events?from=2026-09-01&to=2026-12-01']}>
      <ThemeProvider>
        <DateTimeProvider>
          <EventsListPage />
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('EventsListPage parent read', () => {
  it('shows a Draft badge for a draft parent', async () => {
    renderList();

    expect(await screen.findByText('Strategic Conference')).toBeVisible();
    expect(screen.getByText('Draft')).toBeVisible();
  });

  it('shows the explicit empty state when the server sends no next occurrence', async () => {
    renderList();

    expect(await screen.findByText('Sunday Main English Service')).toBeVisible();
    expect(screen.getByText('None in 90 days')).toBeVisible();
  });

  it('no longer offers the dead series filter', async () => {
    renderList();

    expect(await screen.findByText('Strategic Conference')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Series filter' })).toBeNull();
    expect(screen.queryByText('All series')).toBeNull();
  });

  it('renders the audience name as a tag whose title carries the full summary', async () => {
    renderList();

    const presbyters = await screen.findByTitle('All presbyters, active and retired');
    expect(presbyters).toBeVisible();
    expect(presbyters).toHaveTextContent('Presbyters');

    const everyone = screen.getByTitle('Everyone in the register');
    expect(everyone).toHaveTextContent('Everyone');
  });

  it('writes the event number with its venue, falling back to the venue type', async () => {
    renderList();

    const draft = (await screen.findByText('Strategic Conference')).closest('tr');
    expect(draft).not.toBeNull();
    expect(within(draft!).getByText('EVT-2026-014 · Main Auditorium')).toBeVisible();

    const versions = screen.getByText('Bible Study').closest('tr');
    expect(versions).not.toBeNull();
    expect(within(versions!).getByText('EVT-2026-009 · Auditorium')).toBeVisible();
  });

  it('draws the attendance bar from the summary rate and keeps the text as its value', async () => {
    renderList();

    const recurring = (await screen.findByText('Bible Study')).closest('tr');
    expect(recurring).not.toBeNull();
    expect(within(recurring!).getByText('98/120 · 82%')).toBeVisible();
    const bar = within(recurring!).getByRole('progressbar', { hidden: true });
    expect(bar).toHaveAttribute('aria-valuenow', '0.82');

    // A summary with no rate shows the dash and no bar.
    const noRate = screen.getByText('Sunday Main English Service').closest('tr');
    expect(noRate).not.toBeNull();
    expect(within(noRate!).getByText('—')).toBeVisible();
    expect(within(noRate!).queryByRole('progressbar', { hidden: true })).toBeNull();
  });

  it('counts the loaded rows in the footer', async () => {
    renderList();

    expect(
      await screen.findByText('4 events in this window · 3 recurring · 1 standalone'),
    ).toBeVisible();
  });

  it('labels a recurring row from its latest schedule and gives a standalone row no label', async () => {
    renderList();

    // The label comes from `recurrence.schedules`, not from `summary`: the later
    // `effectiveFrom` wins, so the daily version never names the row.
    const recurring = (await screen.findByText('Bible Study')).closest('tr');
    expect(recurring).not.toBeNull();
    expect(within(recurring!).getByText('Monthly on day 15')).toBeVisible();
    expect(within(recurring!).getByText('Nov 15, 2026')).toBeVisible();
    expect(within(recurring!).queryByText('Daily')).toBeNull();

    // A standalone event keeps its own dates and carries no schedule label.
    const standalone = screen.getByText('Leaders retreat').closest('tr');
    expect(standalone).not.toBeNull();
    expect(within(standalone!).getByText('Oct 10, 2026 – Oct 11, 2026')).toBeVisible();
    expect(within(standalone!).queryByText(/^(Daily|Weekly on|Monthly on)/)).toBeNull();
  });
});
