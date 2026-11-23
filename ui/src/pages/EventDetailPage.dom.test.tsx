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
  removeEventRecurrenceException,
  updateEventParent,
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
  return {
    ...actual,
    getEventParent: vi.fn(async () => PARENT),
    updateEventParent: vi.fn(),
    archiveEventParent: vi.fn(),
    cancelEventOccurrence: vi.fn(),
    addEventScheduleVersion: vi.fn(),
    addEventRecurrenceException: vi.fn(),
    removeEventRecurrenceException: vi.fn(),
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
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
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
    renderDetail();

    const versions = await screen.findByRole('table', { name: 'Schedule versions' });
    expect(within(versions).getByText('FREQ=DAILY')).toBeVisible();
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
