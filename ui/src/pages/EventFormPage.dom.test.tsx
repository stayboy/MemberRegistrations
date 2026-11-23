import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudience, listAudiences, type AudienceItem } from '../api/audiences';
import { ApiError } from '../api/errors';
import {
  createEventParent,
  getEventParent,
  updateEventParent,
  type EventParentItem,
} from '../api/events';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { EventFormPage } from './EventFormPage';

/**
 * FR-42a/FR-42b/FR-42c, AC-56/AC-57: the event form submits the parent payload
 * (one Audience picker, date rows or one recurrence, no retired or derived
 * fields), commits with Save draft or Save and activate — the second a separate
 * `PATCH { status: 'active' }` — and serves edit mode with the event number and
 * Members tracking read-only.
 */

vi.mock('../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/events')>();
  return {
    ...actual,
    createEventParent: vi.fn(),
    updateEventParent: vi.fn(),
    getEventParent: vi.fn(),
  };
});

vi.mock('../api/audiences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/audiences')>();
  return { ...actual, listAudiences: vi.fn(), createAudience: vi.fn() };
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

const EVERYONE: AudienceItem = {
  id: 'aud-everyone',
  name: 'Everyone',
  system: true,
  systemKey: 'everyone',
  active: true,
  rule: { operator: 'allOf', clauses: [{ attribute: 'membershipStatus', value: 'active' }] },
  summary: 'Everyone - all of membership status active',
  createdAt: '2026-11-22T09:00:00.000Z',
  createdBy: 'migration',
  updatedAt: '2026-11-22T09:00:00.000Z',
  updatedBy: 'migration',
};

const CHOIR: AudienceItem = {
  ...EVERYONE,
  id: 'aud-choir',
  name: 'Choir',
  systemKey: 'ministry:CHR',
  rule: { operator: 'allOf', clauses: [{ attribute: 'ministry', ministryCode: 'CHR' }] },
  summary: 'Choir - all of ministry CHR',
};

const CREATED_AUDIENCE: AudienceItem = {
  ...EVERYONE,
  id: 'aud-young-adults',
  name: 'Young Adults',
  system: false,
  systemKey: null,
  rule: { operator: 'allOf', clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 35 }] },
  summary: 'Young Adults - all of age 18-35',
};

const DRAFT: EventParentItem = {
  id: 'created-1',
  eventNo: 'EVT-2026-023',
  name: 'Strategic Conference',
  audienceId: 'aud-everyone',
  audience: {
    id: 'aud-everyone',
    name: 'Everyone',
    system: true,
    summary: 'Everyone - all of membership status active',
  },
  ministry: null,
  presbyterOnly: false,
  timezone: 'UTC',
  description: null,
  venueType: 'auditorium',
  venueName: null,
  startDate: '2026-11-22',
  endDate: '2026-11-22',
  startTime: '09:00',
  endTime: null,
  tracksMembers: true,
  status: 'draft',
  recurrence: null,
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
  summary: {
    from: '2026-11-22',
    to: '2026-11-22',
    nextOccurrence: null,
    attendance: {
      memberSessions: { held: 0, expected: 0, present: 0, rate: null },
      lastHeld: null,
      headcountSessions: { held: 0 },
      cancelled: 0,
      upcoming: 0,
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
  },
};

const RECURRING: EventParentItem = {
  ...DRAFT,
  id: 'event-recurring',
  eventNo: 'EVT-2026-014',
  name: 'Sunday Celebration',
  status: 'active',
  recurrence: {
    schedules: [
      { effectiveFrom: '2025-01-05', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
      { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU', endsOn: null },
    ],
    exceptions: [],
  },
};

const createMock = vi.mocked(createEventParent);
const updateMock = vi.mocked(updateEventParent);
const getParentMock = vi.mocked(getEventParent);
const listAudiencesMock = vi.mocked(listAudiences);
const createAudienceMock = vi.mocked(createAudience);

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue(DRAFT);
  updateMock.mockReset();
  updateMock.mockResolvedValue({ ...DRAFT, status: 'active' });
  getParentMock.mockReset();
  getParentMock.mockResolvedValue(RECURRING);
  listAudiencesMock.mockReset();
  listAudiencesMock.mockResolvedValue([EVERYONE, CHOIR]);
  createAudienceMock.mockReset();
  createAudienceMock.mockResolvedValue(CREATED_AUDIENCE);
});

function renderCreate(): void {
  renderWithProviders(
    <MemoryRouter initialEntries={['/events/new']}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/events/new" element={<EventFormPage />} />
            <Route path="/events/:id" element={<h1>Created event detail</h1>} />
            <Route path="/events/:id/edit" element={<EventFormPage />} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function renderEdit(id = 'event-recurring'): void {
  renderWithProviders(
    <MemoryRouter initialEntries={[`/events/${id}/edit`]}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/events/new" element={<EventFormPage />} />
            <Route path="/events/:id" element={<h1>Created event detail</h1>} />
            <Route path="/events/:id/edit" element={<EventFormPage />} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The picker resolves its default after the audience list arrives. */
async function waitForDefaultAudience(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: 'Audience' })).toHaveTextContent(EVERYONE.summary);
  });
}

describe('EventFormPage create (FR-42a, FR-42b, AC-56)', () => {
  it('renders the sections, the optional event number and the two commit controls', async () => {
    renderCreate();
    await waitForDefaultAudience();

    expect(screen.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'When and where' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Dates' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Tracking' })).toBeVisible();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save and activate' })).toBeVisible();
    // FR-9a: a form's commit/cancel pair is not a page action, so no menu.
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();

    // The event number is optional, with the minting hint, and the retired
    // ministry/presbyter controls are gone.
    expect(screen.getByLabelText(/^Event number/)).toHaveValue('');
    expect(screen.getByText(/the API mints EVT-<year>-<sequence>/)).toBeVisible();
    expect(screen.queryByRole('switch', { name: 'Presbyter only' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Ministry/ })).toBeNull();

    expect(screen.getByLabelText(/^Start time/)).toHaveValue('09:00');
    expect(screen.getByLabelText('Occurrence 1 date')).toHaveValue(today());
    expect(screen.getByRole('switch', { name: 'Members tracking' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Repeats' })).not.toBeChecked();
  });

  it('shows the required-field errors inline and never posts an invalid form', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Name is required.')).toBeVisible();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('Save draft posts the parent body with its date rows and opens the detail', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Event number/), '  EVT-2026-031  ');
    await user.type(screen.getByLabelText(/^Name/), '  Strategic Conference  ');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();

    expect(createMock).toHaveBeenCalledTimes(1);
    const [, token, payload] = createMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(payload).toEqual({
      eventNo: 'EVT-2026-031',
      name: 'Strategic Conference',
      audienceId: 'aud-everyone',
      venueType: 'auditorium',
      startTime: '09:00',
      tracksMembers: true,
      occurrences: [{ date: today() }],
    });
    for (const key of [
      'sessions',
      'startDate',
      'endDate',
      'ministry',
      'presbyterOnly',
      'status',
      'source',
      'timezone',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('Save and activate creates the draft and then PATCHes status alone', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Strategic Conference');
    await user.click(screen.getByRole('button', { name: 'Save and activate' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, , eventId, patch] = updateMock.mock.calls[0] ?? [];
    expect(eventId).toBe('created-1');
    expect(patch).toEqual({ status: 'active' });
  });

  it('leaves the operator on the created draft when activation fails, and re-offers Activate', async () => {
    updateMock.mockRejectedValueOnce(
      new ApiError(409, 'A parent status move the route refuses', { code: 'status' }),
    );
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Strategic Conference');
    await user.click(screen.getByRole('button', { name: 'Save and activate' }));

    // FR-42b/AC-56: the create is not reported as failed; the form stays on the
    // created event and offers Activate again.
    expect(await screen.findByText('Saved as a draft but not activated')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('The event was not saved')).toBeNull();

    updateMock.mockResolvedValueOnce({ ...DRAFT, status: 'active' });
    await user.click(screen.getByRole('button', { name: 'Activate' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();
    expect(updateMock).toHaveBeenLastCalledWith(
      expect.any(String),
      'dom-lane-session',
      'created-1',
      { status: 'active' },
    );
  });

  it('puts a duplicate-number 409 against the Event number field', async () => {
    createMock.mockRejectedValue(new ApiError(409, 'Event number EVT-2026-001 is already in use'));
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Event number/), 'EVT-2026-001');
    await user.type(screen.getByLabelText(/^Name/), 'Duplicate conference');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Event number EVT-2026-001 is already in use')).toBeVisible();
    expect(screen.getByLabelText(/^Event number/)).toHaveValue('EVT-2026-001');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Duplicate conference');
    expect(screen.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  });

  it('Repeats replaces the date rows with the vocabulary and posts the rule', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Fortnight study');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));

    expect(screen.queryByLabelText('Occurrence 1 date')).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Starts on/), {
      target: { value: '2026-01-15' },
    });
    await user.click(screen.getByRole('combobox', { name: 'Repeats' }));
    await user.click(await screen.findByRole('option', { name: 'Fortnightly' }));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });
    const [, , payload] = createMock.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      name: 'Fortnight study',
      recurrence: {
        schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH' }],
      },
    });
    expect(payload).not.toHaveProperty('occurrences');
  });

  it('offers New audience in the picker, selects the created audience and sends its id', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('button', { name: 'New audience' }));
    const dialog = await screen.findByRole('dialog', { name: 'New audience' });
    expect(dialog).toBeVisible();

    // The refetch that follows the create offers the new audience by its
    // server-rendered summary.
    listAudiencesMock.mockResolvedValue([EVERYONE, CHOIR, CREATED_AUDIENCE]);

    await user.type(within(dialog).getByLabelText(/^Name/), 'Young Adults');
    await user.click(within(dialog).getByRole('combobox', { name: 'Clause 1 attribute' }));
    await user.click(await screen.findByRole('option', { name: 'Presbyter' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create audience' }));

    await waitFor(() => {
      expect(createAudienceMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New audience' })).toBeNull();
    });
    // The created audience is selected and shown by its server-rendered summary.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Audience' })).toHaveTextContent(
        CREATED_AUDIENCE.summary,
      );
    });
    await user.type(screen.getByLabelText(/^Name/), 'Young adults meeting');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    const [, , payload] = createMock.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ audienceId: 'aud-young-adults' });
  });
});

describe('EventFormPage edit (FR-42b, AC-56, AC-63)', () => {
  it('seeds from the parent with the event number and Members tracking read-only', async () => {
    renderEdit();

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
    expect(screen.getByLabelText(/^Event number/)).toHaveValue('EVT-2026-014');
    expect(screen.getByLabelText(/^Event number/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Sunday Celebration');
    expect(screen.getByRole('switch', { name: 'Members tracking' })).toBeDisabled();
    // The recurrence is read-only here and shows the label that authored it.
    expect(screen.getByText('Fortnightly')).toBeVisible();
    expect(screen.getByText('Every 2 weeks on Sunday')).toBeVisible();
    expect(screen.queryByRole('switch', { name: 'Repeats' })).toBeNull();
    expect(screen.queryByLabelText('Occurrence 1 date')).toBeNull();
  });

  it('renders a schedule outside the vocabulary from the stored string', async () => {
    getParentMock.mockResolvedValue({
      ...RECURRING,
      recurrence: {
        schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=DAILY', endsOn: null }],
        exceptions: [],
      },
    });
    renderEdit();

    expect(await screen.findByText("A schedule outside the form's vocabulary")).toBeVisible();
    expect(screen.getByText('FREQ=DAILY')).toBeVisible();
  });

  it('PATCHes the identity fields without the event number or Members tracking', async () => {
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), 'Sunday Gathering');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, , eventId, payload] = updateMock.mock.calls[0] ?? [];
    expect(eventId).toBe('event-recurring');
    expect(payload).toEqual({
      name: 'Sunday Gathering',
      audienceId: 'aud-everyone',
      venueType: 'auditorium',
      startTime: '09:00',
      endTime: null,
      venueName: null,
      description: null,
    });
    expect(payload).not.toHaveProperty('eventNo');
    expect(payload).not.toHaveProperty('tracksMembers');
    expect(payload).not.toHaveProperty('status');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuses a duplicate date row before sending', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Harvest');
    await user.click(screen.getByRole('button', { name: 'Add date' }));
    fireEvent.change(screen.getByLabelText('Occurrence 2 date'), {
      target: { value: '2026-11-28' },
    });
    await user.click(screen.getByRole('button', { name: 'Add date' }));

    // A third row repeats the second date, which the validator refuses.
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Each date must be unique.')).toBeVisible();
    expect(createMock).not.toHaveBeenCalled();
  });
});
