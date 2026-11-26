import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import {
  addEventRecurrenceException,
  addEventScheduleVersion,
  archiveEventParent,
  cancelEventOccurrence,
  getEventParent,
  listEventPeriods,
  removeEventRecurrenceException,
  updateEventParent,
  type EventOfferingItem,
  type EventParentItem,
  type EventWindowSummary,
} from '../api/events';
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
  audienceIds: ['aud-everyone'],
  audiences: [
    {
      id: 'aud-everyone',
      name: 'Everyone',
      system: true,
      summary: 'Everyone in the register',
    },
  ],
  audienceId: 'aud-everyone',
  audience: {
    id: 'aud-everyone',
    name: 'Everyone',
    system: true,
    summary: 'Everyone in the register',
  },
  period: null,
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
  schedule: { locked: false, reasons: [] },
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

/**
 * One attached offering. The summary prints **names only** (owner, 2026-11-26),
 * so the terms are deliberately uninteresting - no currency, amount or status is
 * allowed to reach the line, and this fixture would show it if one did.
 */
function offering(name: string): EventOfferingItem {
  return {
    offeringId: `offering-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    availableUntil: null,
    expired: false,
    terms: {
      version: 1,
      name,
      purpose: name,
      kind: 'other',
      currency: 'GHS',
      targetMinor: null,
      defaultAmountMinor: null,
      startsOn: null,
      endsOn: null,
      availableUntil: null,
      scripture: null,
      gatewayAccount: null,
      gatewayMetadata: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'officer-1',
      reason: null,
    },
    exceptions: [],
    stats: PARENT.stats,
  };
}

/**
 * The detail's period line needs the catalogue's `dates` for one shape only - a
 * monthly period with no day, which the read cannot tell from a single-date
 * period. Every other test answers with no rows, so an unexpected read shows up.
 */
vi.mock('../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/events')>();
  return {
    ...actual,
    getEventParent: vi.fn(async () => PARENT),
    updateEventParent: vi.fn(),
    archiveEventParent: vi.fn(),
    cancelEventOccurrence: vi.fn(),
    addEventScheduleVersion: vi.fn(),
    addEventRecurrenceException: vi.fn(),
    removeEventRecurrenceException: vi.fn(),
    listEventPeriods: vi.fn(async () => []),
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
const updateEventParentMock = vi.mocked(updateEventParent);
const archiveEventParentMock = vi.mocked(archiveEventParent);
const cancelOccurrenceMock = vi.mocked(cancelEventOccurrence);
const addScheduleVersionMock = vi.mocked(addEventScheduleVersion);
const addExceptionMock = vi.mocked(addEventRecurrenceException);
const removeExceptionMock = vi.mocked(removeEventRecurrenceException);
const listPeriodsMock = vi.mocked(listEventPeriods);

beforeEach(() => {
  getEventParentMock.mockReset();
  getEventParentMock.mockResolvedValue(PARENT);
  updateEventParentMock.mockReset();
  updateEventParentMock.mockResolvedValue({ ...PARENT, status: 'active' });
  archiveEventParentMock.mockReset();
  archiveEventParentMock.mockResolvedValue({ ...PARENT, status: 'archived' });
  cancelOccurrenceMock.mockReset();
  cancelOccurrenceMock.mockResolvedValue({
    ...PARENT.occurrences[1]!,
    status: 'cancelled',
    note: 'Public holiday',
  });
  addScheduleVersionMock.mockReset();
  addScheduleVersionMock.mockResolvedValue(PARENT.recurrence!);
  addExceptionMock.mockReset();
  addExceptionMock.mockResolvedValue(PARENT.recurrence!);
  removeExceptionMock.mockReset();
  removeExceptionMock.mockResolvedValue({ schedules: [], exceptions: [] });
  listPeriodsMock.mockReset();
  listPeriodsMock.mockResolvedValue([]);
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
    // The offerings tile is a count with a caption that implies no money.
    expect(within(tiles).getByText('attached to this event')).toBeVisible();
  });

  it('summarises no offerings as None and draws no offerings grid', async () => {
    renderDetail();

    const identity = await screen.findByTestId('event-identity');
    expect(within(identity).getByText('Offerings')).toBeVisible();
    expect(within(identity).getByTestId('event-offerings')).toHaveTextContent(/^None$/);
    // The grid retired: its table and its View terms control are gone.
    expect(screen.queryByRole('table', { name: 'Active offerings' })).toBeNull();
    expect(screen.queryByText('View terms')).toBeNull();
  });

  it('summarises one offering as its count, then its name as an anchor', async () => {
    getEventParentMock.mockResolvedValue({ ...PARENT, offerings: [offering('Sunday offering')] });
    renderDetail();

    const identity = await screen.findByTestId('event-identity');
    // Count first, then the bracketed name - inline, names only (drawing v16).
    expect(within(identity).getByTestId('event-offerings')).toHaveTextContent(
      /^1 \(Sunday offering\)$/,
    );
    // The name is a Fluent link (an anchor). It has no destination in this build,
    // so it is an `<a>` with no href - inert, and never a button.
    const anchor = within(identity).getByText('Sunday offering');
    expect(anchor.tagName).toBe('A');
    expect(anchor).not.toHaveAttribute('href');
    expect(within(identity).queryByText(/GHS/)).toBeNull();
  });

  it('brackets two offering names, each an anchor, middle-dot separated', async () => {
    getEventParentMock.mockResolvedValue({
      ...PARENT,
      offerings: [offering('Sunday offering'), offering('Building fund')],
    });
    renderDetail();

    const identity = await screen.findByTestId('event-identity');
    expect(within(identity).getByTestId('event-offerings')).toHaveTextContent(
      /^2 \(Sunday offering · Building fund\)$/,
    );
    expect(within(identity).getByText('Sunday offering').closest('a')).not.toBeNull();
    expect(within(identity).getByText('Building fund').closest('a')).not.toBeNull();
    // Names only: no currency, no money, no terms in the summary line.
    expect(within(identity).queryByText(/GHS|paid|terms/)).toBeNull();
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

/**
 * FR-42e/FR-42f/FR-42g, AC-62/AC-63/AC-64: the detail's write verbs per state,
 * the occurrence row's Cancel dialog and the recurrence panel's two dialogs.
 * Requests and rendered surfaces are asserted, not internals.
 */
describe('EventDetailPage write verbs', () => {
  it('offers Edit and Archive in the one Actions menu on an active parent', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Strategic Conference' });

    // Refresh is the bare utility; the verbs are behind the one Actions menu.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Archive' })).toBeEnabled();
    expect(screen.queryByRole('menuitem', { name: 'Restore' })).toBeNull();
  });

  it('makes Activate primary and disables Archive and the row Cancel on a draft', async () => {
    getEventParentMock.mockResolvedValue({ ...PARENT, status: 'draft' });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText('Draft', { exact: true });

    // MR-1: a primary verb renders visibly beside the menu.
    expect(screen.getByRole('button', { name: 'Activate' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Archive' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // AC-62: Cancel stays visible and disabled, with its reason shown.
    const cancel = screen.getByRole('button', { name: 'Cancel Nov 29, 2026' });
    expect(cancel).toBeDisabled();
    expect(
      screen.getAllByText('Activate the event before cancelling a date').length,
    ).toBeGreaterThan(0);
  });

  it('offers no write verb and says the event is read-only when archived', async () => {
    getEventParentMock.mockResolvedValue({ ...PARENT, status: 'archived' });
    renderDetail();

    expect(await screen.findByText('This event is archived')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cancel / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add schedule version' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add exception' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove exception/ })).toBeNull();
  });

  it('cancels an occurrence from its row, refusing a blank reason first', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole('table', { name: 'Event occurrences' });

    await user.click(screen.getByRole('button', { name: 'Cancel Nov 29, 2026' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this date' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel date' }));

    // AC-64: the local check sends nothing, so `reason_required` is never reached.
    expect(
      await within(dialog).findByText('Enter a reason for cancelling this date.'),
    ).toBeVisible();
    expect(cancelOccurrenceMock).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), '  Public holiday  ');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel date' }));

    await waitFor(() => expect(cancelOccurrenceMock).toHaveBeenCalledTimes(1));
    const [, token, eventId, date, input] = cancelOccurrenceMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(eventId).toBe('evt-1');
    expect(date).toBe('2026-11-29');
    expect(input).toEqual({ note: 'Public holiday' });
  });

  it('keeps the cancellation reason and shows a 409 event_draft in the dialog', async () => {
    cancelOccurrenceMock.mockRejectedValueOnce(
      new ApiError(409, 'Activate the event before cancelling a date', { code: 'event_draft' }),
    );
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole('table', { name: 'Event occurrences' });

    await user.click(screen.getByRole('button', { name: 'Cancel Nov 29, 2026' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this date' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Public holiday');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel date' }));

    expect(await within(dialog).findByText('The event is still a draft')).toBeVisible();
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Public holiday');
  });

  it('shows a refused activation as a page banner', async () => {
    getEventParentMock.mockResolvedValue({ ...PARENT, status: 'draft' });
    updateEventParentMock.mockRejectedValueOnce(
      new ApiError(409, 'The status move was refused', { code: 'status' }),
    );
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Activate' }));

    expect(await screen.findByText('The API refused this status change')).toBeVisible();
    expect(updateEventParentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'evt-1',
      {
        status: 'active',
      },
    );
  });

  it('archives from the menu after a confirmation and shows a refusal on the page', async () => {
    archiveEventParentMock.mockRejectedValueOnce(
      new ApiError(409, 'The event is already archived', { code: 'status' }),
    );
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Strategic Conference' });

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive event' }));

    expect(await screen.findByText('The API refused this status change')).toBeVisible();
    expect(archiveEventParentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'evt-1',
    );
  });

  it('appends a schedule version built from the cadence, never a typed RRULE', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Add schedule version' }));

    const dialog = screen.getByRole('dialog', { name: 'Add schedule version' });
    // AC-63: no raw RRULE control exists on the surface.
    expect(within(dialog).queryByRole('textbox', { name: /Recurrence rule/ })).toBeNull();

    fireEvent.change(within(dialog).getByLabelText(/^Effective from/), {
      target: { value: '2026-06-07' },
    });
    await user.click(within(dialog).getByRole('combobox', { name: 'Repeats' }));
    await user.click(await screen.findByRole('option', { name: 'Fortnightly' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add version' }));

    await waitFor(() => expect(addScheduleVersionMock).toHaveBeenCalledTimes(1));
    const [, token, eventId, input] = addScheduleVersionMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(eventId).toBe('evt-1');
    expect(input).toEqual({
      effectiveFrom: '2026-06-07',
      rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU',
      endsOn: null,
    });
  });

  it('keeps the dialog values and shows a 409 recurrence against the schedule dialog', async () => {
    addScheduleVersionMock.mockRejectedValueOnce(
      new ApiError(409, 'This event records its dates by hand', { code: 'recurrence' }),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Add schedule version' }));

    const dialog = screen.getByRole('dialog', { name: 'Add schedule version' });
    fireEvent.change(within(dialog).getByLabelText(/^Effective from/), {
      target: { value: '2026-06-07' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Add version' }));

    expect(await within(dialog).findByText('This event has no recurrence to change')).toBeVisible();
    expect(within(dialog).getByLabelText(/^Effective from/)).toHaveValue('2026-06-07');
  });

  it('shows a 422 on the schedule dialog as a banner and keeps the values', async () => {
    addScheduleVersionMock.mockRejectedValueOnce(
      new ApiError(422, 'endsOn must not be before effectiveFrom'),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Add schedule version' }));

    const dialog = screen.getByRole('dialog', { name: 'Add schedule version' });
    fireEvent.change(within(dialog).getByLabelText(/^Effective from/), {
      target: { value: '2026-06-07' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Add version' }));

    expect(await within(dialog).findByText('The schedule version was not added')).toBeVisible();
    expect(within(dialog).getByText('endsOn must not be before effectiveFrom')).toBeVisible();
    expect(within(dialog).getByLabelText(/^Effective from/)).toHaveValue('2026-06-07');
  });

  it('adds an extra date and offers no cancelled kind', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Add exception' }));

    const dialog = screen.getByRole('dialog', { name: 'Add exception' });
    // FR-42e: a cancelled exception is not authored from the UI.
    expect(within(dialog).queryByRole('combobox', { name: /Kind/ })).toBeNull();

    fireEvent.change(within(dialog).getByLabelText(/^Date/), {
      target: { value: '2026-11-29' },
    });
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Harvest thanksgiving');
    await user.click(within(dialog).getByRole('button', { name: 'Add extra date' }));

    await waitFor(() => expect(addExceptionMock).toHaveBeenCalledTimes(1));
    const [, token, eventId, input] = addExceptionMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(eventId).toBe('evt-1');
    expect(input).toEqual({
      date: '2026-11-29',
      kind: 'extra',
      note: 'Harvest thanksgiving',
    });
  });

  it('renders a stored schedule inside the vocabulary as its own label', async () => {
    getEventParentMock.mockResolvedValue({
      ...PARENT,
      recurrence: {
        schedules: [
          {
            effectiveFrom: '2026-10-13',
            rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
            endsOn: null,
          },
        ],
        exceptions: [],
      },
    });
    renderDetail();

    const versions = await screen.findByRole('table', { name: 'Schedule versions' });
    expect(within(versions).getByText('Fortnightly', { exact: true })).toBeVisible();
  });

  it('renders a schedule outside the vocabulary read-only from the stored string', async () => {
    getEventParentMock.mockResolvedValue({
      ...PARENT,
      recurrence: {
        schedules: [{ effectiveFrom: '2026-10-13', rrule: 'FREQ=YEARLY', endsOn: null }],
        exceptions: [],
      },
    });
    renderDetail();

    const versions = await screen.findByRole('table', { name: 'Schedule versions' });
    expect(within(versions).getByText('FREQ=YEARLY')).toBeVisible();
    expect(within(versions).getByText(/cannot be edited here/)).toBeVisible();
  });

  it('removes one exception directive after a confirmation', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      await screen.findByRole('button', { name: 'Remove exception on Oct 14, 2026' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove exception' }));

    await waitFor(() => expect(removeExceptionMock).toHaveBeenCalledTimes(1));
    const [, token, eventId, date] = removeExceptionMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(eventId).toBe('evt-1');
    expect(date).toBe('2026-10-14');
  });
});

/**
 * The period's provenance line and the stored-rule preview (spec: named periods -
 * "the detail shows one line"; UI FR-42b/FR-42e, AC-63a). The four shapes are the
 * spec's own; the ambiguous one - a monthly period with no day - is settled by the
 * catalogue's `dates`, never by the period's name.
 */
describe('EventDetailPage period block', () => {
  const ONE_OFF: EventParentItem = {
    ...PARENT,
    period: {
      id: 'communion-week',
      name: 'Communion Week',
      cycle: '2026-12',
      frequency: null,
      day: null,
    },
    recurrence: null,
    startDate: '2026-11-29',
    endDate: '2026-12-05',
  };

  const MONTHLY_WITH_DAY: EventParentItem = {
    ...PARENT,
    period: {
      id: 'communion-week',
      name: 'Communion Week',
      cycle: null,
      frequency: 'monthly',
      day: 'SUN',
    },
    recurrence: null,
  };

  const MONTHLY_WHOLE_WEEK: EventParentItem = {
    ...PARENT,
    period: {
      id: 'communion-week',
      name: 'Communion Week',
      cycle: null,
      frequency: 'monthly',
      day: null,
    },
    recurrence: null,
  };

  const MONTHLY_SINGLE_DATE: EventParentItem = {
    ...PARENT,
    period: {
      id: 'home-cells',
      name: 'Home Cells',
      cycle: null,
      frequency: 'monthly',
      day: null,
    },
    recurrence: null,
  };

  const COMMUNION_DEFINITION =
    "The month's first week, Monday to Sunday, closing on the first Sunday - the day the service is held.";

  const HOME_CELLS_DEFINITION =
    'The Monday of week 1 of the cycle month - the Monday of Communion Week.';

  /** The catalogue's Communion Week row, as `GET /v1/events/periods` serves it. */
  const COMMUNION_ROW = {
    id: 'communion-week',
    name: 'Communion Week',
    definition: COMMUNION_DEFINITION,
    dates: 'week' as const,
  };

  /** Opens the period glyph's tooltip and returns it once it is on screen. */
  async function periodTooltip(): Promise<HTMLElement> {
    const user = userEvent.setup();
    await user.hover(screen.getByLabelText('What the named period means'));
    const tooltip = await screen.findByRole('tooltip');
    await waitFor(() => expect(tooltip).toBeVisible());
    return tooltip;
  }

  it('prints the period name only, and its held range in the tooltip, for a one-off', async () => {
    getEventParentMock.mockResolvedValue(ONE_OFF);
    renderDetail();

    // v16: the block prints the name; the grammar is the glyph's tooltip.
    expect(await screen.findByTestId('event-period-provenance')).toHaveTextContent(
      /^Communion Week$/,
    );
    expect(await periodTooltip()).toHaveTextContent('Communion Week · Nov 29, 2026 – Dec 5, 2026');
    // The catalogue is read for the definition even on a one-off; with no row the
    // block prints no definition rather than inventing one.
    await waitFor(() => expect(listPeriodsMock).toHaveBeenCalled());
    expect(screen.queryByTestId('event-period-definition')).toBeNull();
  });

  it('prints the catalogue definition beneath the name, the day in the tooltip', async () => {
    listPeriodsMock.mockResolvedValue([COMMUNION_ROW]);
    getEventParentMock.mockResolvedValue(MONTHLY_WITH_DAY);
    renderDetail();

    const identity = await screen.findByTestId('event-identity');
    expect(within(identity).getByTestId('event-period-provenance')).toHaveTextContent(
      /^Communion Week$/,
    );
    expect(await within(identity).findByTestId('event-period-definition')).toHaveTextContent(
      COMMUNION_DEFINITION,
    );
    expect(await periodTooltip()).toHaveTextContent('Communion Week · Sundays · monthly');
    expect(listPeriodsMock).toHaveBeenCalledTimes(1);
  });

  it('says whole week in the tooltip when a monthly period names no day', async () => {
    listPeriodsMock.mockResolvedValue([COMMUNION_ROW]);
    getEventParentMock.mockResolvedValue(MONTHLY_WHOLE_WEEK);
    renderDetail();

    expect(await screen.findByTestId('event-period-provenance')).toHaveTextContent(
      /^Communion Week$/,
    );
    expect(await periodTooltip()).toHaveTextContent('Communion Week · whole week · monthly');
  });

  it('names only the period and the frequency in the tooltip for a single-date period', async () => {
    listPeriodsMock.mockResolvedValue([
      {
        id: 'home-cells',
        name: 'Home Cells',
        definition: HOME_CELLS_DEFINITION,
        dates: 'date',
      },
    ]);
    getEventParentMock.mockResolvedValue(MONTHLY_SINGLE_DATE);
    renderDetail();

    const identity = await screen.findByTestId('event-identity');
    await waitFor(() =>
      expect(within(identity).getByTestId('event-period-definition')).toHaveTextContent(
        HOME_CELLS_DEFINITION,
      ),
    );
    const tooltip = await periodTooltip();
    expect(tooltip).toHaveTextContent('Home Cells · monthly');
    expect(tooltip).not.toHaveTextContent('whole week');
  });

  it('draws no period block when the event was not created from a period', async () => {
    renderDetail();
    await screen.findByRole('table', { name: 'Event occurrences' });

    expect(screen.queryByTestId('event-period-provenance')).toBeNull();
    expect(screen.queryByLabelText('What the named period means')).toBeNull();
    expect(screen.queryByTestId('event-period-definition')).toBeNull();
  });

  it('keeps the block on a draft', async () => {
    getEventParentMock.mockResolvedValue({ ...MONTHLY_WITH_DAY, status: 'draft' });
    renderDetail();
    expect(await screen.findByTestId('event-period-provenance')).toHaveTextContent(
      /^Communion Week$/,
    );
  });

  it('keeps the block on an archived event', async () => {
    getEventParentMock.mockResolvedValue({ ...MONTHLY_WITH_DAY, status: 'archived' });
    renderDetail();
    expect(await screen.findByText('This event is archived')).toBeVisible();
    expect(screen.getByTestId('event-period-provenance')).toHaveTextContent(/^Communion Week$/);
  });

  it('keeps the explanation off the page, on the glyph, with no recurrence panel', async () => {
    listPeriodsMock.mockResolvedValue([COMMUNION_ROW]);
    getEventParentMock.mockResolvedValue(MONTHLY_WITH_DAY);
    renderDetail();

    const identity = await screen.findByTestId('event-identity');
    // Nothing prints the mechanics: they exist only inside the tooltip.
    expect(screen.queryByText(/rather than an rrule/, { ignore: '[role="tooltip"]' })).toBeNull();
    // A period event has no recurrence panel left to explain away.
    expect(screen.queryByRole('region', { name: 'Recurrence' })).toBeNull();
    // The glyph is a named, focusable tab stop (reachable without a mouse).
    const glyph = within(identity).getByLabelText('What the named period means');
    expect(glyph).toHaveAttribute('tabindex', '0');
    expect(await periodTooltip()).toHaveTextContent(/stored on the event/);
  });

  it('makes no span claim and invents no definition when the catalogue row is missing', async () => {
    listPeriodsMock.mockResolvedValue([]);
    getEventParentMock.mockResolvedValue(MONTHLY_WHOLE_WEEK);
    renderDetail();

    expect(await screen.findByTestId('event-period-provenance')).toHaveTextContent(
      /^Communion Week$/,
    );
    expect(screen.queryByTestId('event-period-definition')).toBeNull();
    const tooltip = await periodTooltip();
    expect(tooltip).toHaveTextContent('Communion Week · monthly');
    expect(tooltip).not.toHaveTextContent('whole week');
  });
});
