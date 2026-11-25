import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudience, listAudiences, type AudienceItem } from '../api/audiences';
import { ApiError } from '../api/errors';
import {
  createEventParent,
  getEventParent,
  listEventPeriods,
  previewEvent,
  updateEventParent,
  writeEventSchedule,
  type EventParentItem,
  type EventPeriodItem,
  type EventPreview,
  type EventScheduleWriteResult,
} from '../api/events';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { EventFormPage } from './EventFormPage';

/**
 * FR-42a/FR-42b/FR-42c/FR-42f, AC-8/AC-56/AC-57/AC-60/AC-63/AC-63a: the create
 * form is two columns, carries no event-number control, sends an ordered
 * audience set, authors the four cadences and a named period, and shows the
 * resolved dates only as a server-fetched preview.
 */

vi.mock('../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/events')>();
  return {
    ...actual,
    createEventParent: vi.fn(),
    updateEventParent: vi.fn(),
    getEventParent: vi.fn(),
    listEventPeriods: vi.fn(),
    previewEvent: vi.fn(),
    writeEventSchedule: vi.fn(),
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
  memberCount: 96,
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
  memberCount: 12,
};

const YOUTH: AudienceItem = {
  ...EVERYONE,
  id: 'aud-youth',
  name: 'Youth 13-17',
  systemKey: 'age:13-17',
  rule: { operator: 'allOf', clauses: [{ attribute: 'ageBand', minYears: 13, maxYears: 17 }] },
  summary: 'Youth 13-17 - all of age 13-17',
  memberCount: 22,
};

const CREATED_AUDIENCE: AudienceItem = {
  ...EVERYONE,
  id: 'aud-young-adults',
  name: 'Young Adults',
  system: false,
  systemKey: null,
  rule: { operator: 'allOf', clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 35 }] },
  summary: 'Young Adults - all of age 18-35',
  memberCount: 41,
};

const PERIODS: EventPeriodItem[] = [
  {
    id: 'communion-week',
    name: 'Communion Week',
    definition:
      'The week of the monthly communion service: week 1 of the cycle month, the seven days ending on that month’s first Sunday.',
    dates: 'week',
  },
  {
    id: 'gospel-week',
    name: 'Gospel Week',
    definition: 'The last week of the month before, when ministries hold their meetings.',
    dates: 'week',
  },
  {
    id: 'home-cells',
    name: 'Home Cells',
    definition: 'The Monday of week 1 of the cycle month - the Monday of Communion Week.',
    dates: 'date',
  },
];

const PREVIEW: EventPreview = {
  occurrences: [
    { date: '2026-12-06', expected: 7 },
    { date: '2026-12-13', expected: 7 },
    { date: '2026-12-20', expected: 6 },
  ],
  audienceCounts: [
    { id: 'aud-everyone', count: 96 },
    { id: 'aud-choir', count: 12 },
  ],
};

const DRAFT: EventParentItem = {
  id: 'created-1',
  eventNo: 'EVT-2026-023',
  name: 'Strategic Conference',
  audienceIds: ['aud-everyone'],
  audiences: [
    {
      id: 'aud-everyone',
      name: 'Everyone',
      system: true,
      summary: 'Everyone - all of membership status active',
    },
  ],
  audienceId: 'aud-everyone',
  audience: {
    id: 'aud-everyone',
    name: 'Everyone',
    system: true,
    summary: 'Everyone - all of membership status active',
  },
  period: null,
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
  schedule: { locked: false, reasons: [] },
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
  audienceIds: ['aud-choir', 'aud-youth'],
  audiences: [
    { id: 'aud-choir', name: 'Choir', system: true, summary: 'Choir - all of ministry CHR' },
    {
      id: 'aud-youth',
      name: 'Youth 13-17',
      system: true,
      summary: 'Youth 13-17 - all of age 13-17',
    },
  ],
  audienceId: 'aud-choir',
  audience: {
    id: 'aud-choir',
    name: 'Choir',
    system: true,
    summary: 'Choir - all of ministry CHR',
  },
  recurrence: {
    schedules: [
      { effectiveFrom: '2025-01-05', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
      {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU',
        endsOn: null,
      },
    ],
    exceptions: [],
  },
};

/** A monthly period rule: the arm the contract can rewrite (FR-42h). */
const PERIOD_RULE: EventParentItem = {
  ...RECURRING,
  id: 'event-period',
  eventNo: 'EVT-2026-031',
  name: 'Miracle Sunday',
  recurrence: null,
  period: {
    id: 'communion-week',
    name: 'Communion Week',
    cycle: null,
    frequency: 'monthly',
    day: 'SUN',
  },
};

/** One cycle resolved once: no stored rule, so the write offers no arm. */
const PERIOD_ONE_CYCLE: EventParentItem = {
  ...PERIOD_RULE,
  id: 'event-period-once',
  period: {
    id: 'communion-week',
    name: 'Communion Week',
    cycle: '2026-12',
    frequency: null,
    day: null,
  },
};

/**
 * A single-date period rule. The stored `day` is impossible in production (the
 * API refuses one for Home Cells); it is here so the write test proves the
 * **catalogue's** `dates: 'date'` drops the day, not a null seed.
 */
const HOME_CELLS_RULE: EventParentItem = {
  ...PERIOD_RULE,
  id: 'event-home-cells',
  name: 'Home Cells',
  period: {
    id: 'home-cells',
    name: 'Home Cells',
    cycle: null,
    frequency: 'monthly',
    day: 'MON',
  },
};

/** The guard closed by history: the read names the causes (FR-42h). */
const LOCKED: EventParentItem = {
  ...RECURRING,
  schedule: {
    locked: true,
    reasons: [
      { code: 'occurrence_started', date: '2026-12-03' },
      { code: 'offering_attached', date: null },
    ],
  },
};

const createMock = vi.mocked(createEventParent);
const updateMock = vi.mocked(updateEventParent);
const getParentMock = vi.mocked(getEventParent);
const listAudiencesMock = vi.mocked(listAudiences);
const createAudienceMock = vi.mocked(createAudience);
const listPeriodsMock = vi.mocked(listEventPeriods);
const previewMock = vi.mocked(previewEvent);
const scheduleMock = vi.mocked(writeEventSchedule);

const SCHEDULE_RESULT: EventScheduleWriteResult = {
  recurrence: RECURRING.recurrence,
  period: null,
  occurrences: [],
  generated: true,
};

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue(DRAFT);
  updateMock.mockReset();
  updateMock.mockResolvedValue({ ...DRAFT, status: 'active' });
  getParentMock.mockReset();
  getParentMock.mockResolvedValue(RECURRING);
  listAudiencesMock.mockReset();
  listAudiencesMock.mockResolvedValue([EVERYONE, CHOIR, YOUTH]);
  createAudienceMock.mockReset();
  createAudienceMock.mockResolvedValue(CREATED_AUDIENCE);
  listPeriodsMock.mockReset();
  listPeriodsMock.mockResolvedValue(PERIODS);
  previewMock.mockReset();
  previewMock.mockResolvedValue(PREVIEW);
  scheduleMock.mockReset();
  scheduleMock.mockResolvedValue(SCHEDULE_RESULT);
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

/** The picker resolves its default audience after the list arrives. */
async function waitForDefaultAudience(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByText('Primary · 96 members')).toBeVisible();
  });
}

async function setStartDate(value: string): Promise<void> {
  fireEvent.change(screen.getByLabelText(/^Starts on/), { target: { value } });
}

async function chooseCadence(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: 'Repeats' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

async function choosePeriod(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: 'Named period' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

/** A multiselect keeps its list open; reopen only when it is closed. */
async function addAudience(user: ReturnType<typeof userEvent.setup>, summary: string) {
  if (!screen.queryByRole('option', { name: summary })) {
    await user.click(screen.getByRole('combobox', { name: 'Audience' }));
  }
  await user.click(await screen.findByRole('option', { name: summary }));
}

function lastCreatePayload(): Record<string, unknown> {
  const call = createMock.mock.calls[0];
  return (call?.[2] ?? {}) as unknown as Record<string, unknown>;
}

describe('EventFormPage create - layout and controls (FR-42b, AC-8)', () => {
  it('renders two columns: identity and schedule in main, when and where in the rail', async () => {
    renderCreate();
    await waitForDefaultAudience();

    expect(screen.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();

    const main = screen.getByRole('group', { name: 'Event details' });
    expect(within(main).getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();
    expect(within(main).getByRole('heading', { level: 2, name: 'Dates' })).toBeVisible();
    expect(within(main).getByRole('heading', { level: 2, name: 'Tracking' })).toBeVisible();

    const rail = screen.getByRole('complementary', { name: 'When and where' });
    expect(within(rail).getByLabelText(/^Start time/)).toBeVisible();
    expect(within(rail).getByLabelText(/^End time/)).toBeVisible();
    expect(within(rail).getByLabelText('Venue type')).toBeVisible();
    expect(within(rail).getByLabelText(/^Venue name/)).toBeVisible();

    // The field-to-column mapping (the layout itself is the mock's gate).
    expect(within(rail).queryByLabelText(/^Name/)).toBeNull();
    expect(within(rail).queryByRole('heading', { name: 'Identity' })).toBeNull();
    expect(within(main).queryByLabelText(/^Start time/)).toBeNull();

    // AC 8: the create form has no event-number control at any point.
    expect(screen.queryByLabelText(/^Event number/)).toBeNull();
    expect(screen.queryByText(/EVT-<year>/)).toBeNull();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save and activate' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();

    expect(screen.getByRole('switch', { name: 'Repeats' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Members tracking' })).toBeChecked();
    expect(screen.getByLabelText('Occurrence 1 date')).toHaveValue(today());
  });

  it('shows the required-field errors inline and never posts an invalid form', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Name is required.')).toBeVisible();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('Save draft posts the ordered audience set and its date rows, and never an event number', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), '  Strategic Conference  ');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();

    expect(createMock).toHaveBeenCalledTimes(1);
    const [, token, payload] = createMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(payload).toEqual({
      name: 'Strategic Conference',
      audienceIds: ['aud-everyone'],
      venueType: 'auditorium',
      startTime: '09:00',
      tracksMembers: true,
      occurrences: [{ date: today() }],
    });
    for (const key of [
      'eventNo',
      'audienceId',
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

  it('reports a create 409 as a banner, because there is no number field to bind it to', async () => {
    createMock.mockRejectedValue(new ApiError(409, 'Event number EVT-2026-001 is already in use'));
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Duplicate conference');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('The event was not saved')).toBeVisible();
    expect(screen.getByText('Event number EVT-2026-001 is already in use')).toBeVisible();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Duplicate conference');
    expect(screen.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
    expect(screen.queryByLabelText(/^Event number/)).toBeNull();
  });
});

describe('EventFormPage create - the audience set (FR-42c, AC-60)', () => {
  it('shows each audience’s own count, marks the first primary, and sends the order', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    // The first selected audience is the primary; its count is the server's.
    expect(screen.getByText('Primary · 96 members')).toBeVisible();

    await addAudience(user, CHOIR.summary);
    expect(await screen.findByText('12 members')).toBeVisible();

    await addAudience(user, YOUTH.summary);

    // No union total is shown anywhere.
    expect(screen.queryByText(/130 members/)).toBeNull();
    expect(screen.queryByText(/total/i)).toBeNull();

    await user.type(screen.getByLabelText(/^Name/), 'Choir and youth');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().audienceIds).toEqual(['aud-everyone', 'aud-choir', 'aud-youth']);
  });

  it('offers New audience and adds the created audience to the set', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('button', { name: 'New audience' }));
    const dialog = await screen.findByRole('dialog', { name: 'New audience' });
    expect(dialog).toBeVisible();

    listAudiencesMock.mockResolvedValue([EVERYONE, CHOIR, YOUTH, CREATED_AUDIENCE]);

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
    expect(await screen.findByText(/41 members/)).toBeVisible();

    await user.type(screen.getByLabelText(/^Name/), 'Young adults meeting');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().audienceIds).toEqual(['aud-everyone', 'aud-young-adults']);
  });
});

describe('EventFormPage create - the schedule builder (FR-42f, AC-63)', () => {
  it('authors a daily rule with its interval and no weekday', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Choir morning prayer');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await chooseCadence('Daily');
    await user.clear(screen.getByLabelText('Interval in days'));
    await user.type(screen.getByLabelText('Interval in days'), '3');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().recurrence).toEqual({
      schedules: [{ effectiveFrom: '2027-03-04', rrule: 'FREQ=DAILY;INTERVAL=3' }],
    });
    expect(lastCreatePayload()).not.toHaveProperty('occurrences');
  });

  it('authors a weekly weekday set, emitting WKST=SU when an interval is present', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Choir and youth rehearsal');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    // The start date re-seeds the untouched weekday; Thursday 4 March 2027.
    await setStartDate('2027-03-04');
    expect(screen.getByRole('button', { name: 'Thursday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Monday' }));
    await user.clear(screen.getByLabelText('Interval in weeks'));
    await user.type(screen.getByLabelText('Interval in weeks'), '2');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().recurrence).toEqual({
      schedules: [
        { effectiveFrom: '2027-03-04', rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO,TH' },
      ],
    });
  });

  it('keeps fortnightly as the interval-of-two preset on the start date’s weekday', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Fortnight study');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await chooseCadence('Fortnightly');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().recurrence).toEqual({
      schedules: [
        { effectiveFrom: '2027-03-04', rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TH' },
      ],
    });
  });

  it('authors monthly on the day', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Monthly vigil');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await chooseCadence('Monthly on the day');
    await user.click(screen.getByRole('radio', { name: 'On a day of the month' }));
    await user.clear(screen.getByLabelText('Day of the month'));
    await user.type(screen.getByLabelText('Day of the month'), '28');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().recurrence).toEqual({
      schedules: [{ effectiveFrom: '2027-03-04', rrule: 'FREQ=MONTHLY;BYMONTHDAY=28' }],
    });
  });

  it('authors the monthly positional rule (last Saturday)', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Last Saturday vigil');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await chooseCadence('Monthly on the day');
    await user.click(
      screen.getByRole('radio', { name: 'On the first or last weekday of the month' }),
    );
    await user.click(screen.getByRole('combobox', { name: 'Which one' }));
    await user.click(await screen.findByRole('option', { name: 'Last' }));
    await user.click(screen.getByRole('combobox', { name: 'Weekday' }));
    await user.click(await screen.findByRole('option', { name: 'Saturday' }));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().recurrence).toEqual({
      schedules: [{ effectiveFrom: '2027-03-04', rrule: 'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA' }],
    });
  });
});

describe('EventFormPage create - the named period (FR-42f, AC-18)', () => {
  it('resolves one cycle on the server and sends the period instead of an rrule', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Communion Week services');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await choosePeriod('Communion Week');

    // The period replaces the cadence controls.
    expect(screen.queryByRole('combobox', { name: 'Repeats' })).toBeNull();
    // One inline frequency row: a named group of exactly two named options.
    const frequency = screen.getByRole('radiogroup', { name: 'Frequency' });
    expect(within(frequency).getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'One cycle' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Monthly' })).not.toBeChecked();
    // The explanation lives on the info glyph, not under each radio.
    await user.hover(screen.getByLabelText('What the frequency means'));
    const tooltip = await screen.findByRole('tooltip');
    await waitFor(() => expect(tooltip).toBeVisible());
    expect(tooltip).toHaveTextContent(/One cycle resolves the period once, for a single month\./);
    // The period row holds the one period select and the arm's own field beside it.
    expect(screen.getAllByRole('combobox', { name: 'Named period' })).toHaveLength(1);
    // The cycle defaults to the start date's month when it is still ahead.
    expect(screen.getByLabelText(/^Cycle month/)).toHaveValue('2027-03');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    expect(lastCreatePayload().period).toEqual({
      id: 'communion-week',
      cycleMonth: '2027-03',
    });
    expect(lastCreatePayload()).not.toHaveProperty('recurrence');
    expect(lastCreatePayload()).not.toHaveProperty('occurrences');
  });

  it('sends a monthly period recurrence with the day inside the period and its anchor', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Miracle Sunday');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await choosePeriod('Communion Week');
    await user.click(screen.getByRole('radio', { name: 'Monthly' }));
    // Monthly swaps the arm's own field: the cycle month leaves, the day arrives.
    expect(screen.queryByLabelText(/^Cycle month/)).toBeNull();
    // The day's copy rides its own info glyph: no hint line under the select,
    // and the sentence appears when its trigger is hovered.
    expect(screen.queryByText(/Leave blank for the whole period/)).not.toBeVisible();
    await user.hover(screen.getByLabelText('What the day inside the period means'));
    const dayTooltip = await screen.findByRole('tooltip');
    await waitFor(() => expect(dayTooltip).toBeVisible());
    expect(dayTooltip).toHaveTextContent(
      'Leave blank for the whole period; pick a weekday for one date per cycle.',
    );
    await user.click(screen.getByRole('combobox', { name: 'Day inside the period' }));
    await user.click(await screen.findByRole('option', { name: 'Sunday' }));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    // The period day is the API's three-letter vocabulary, never the rrule's `SU`.
    expect(lastCreatePayload().period).toEqual({
      id: 'communion-week',
      frequency: 'monthly',
      day: 'SUN',
      effectiveFrom: '2027-03-04',
    });
  });

  it('hides the day control for a single-date period and submits it with no day', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.type(screen.getByLabelText(/^Name/), 'Home cells meeting');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await setStartDate('2027-03-04');
    await choosePeriod('Home Cells');
    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    // `dates: "date"` means one date, so there is no day control to offer, and
    // the one-line hint takes the field's place in the row.
    expect(screen.queryByLabelText(/^Cycle month/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Day inside the period' })).toBeNull();
    expect(screen.getByText(/resolves to a single date/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('heading', { level: 1, name: 'Created event detail' });

    const period = lastCreatePayload().period;
    expect(period).toEqual({
      id: 'home-cells',
      frequency: 'monthly',
      effectiveFrom: '2027-03-04',
    });
    expect(period).not.toHaveProperty('day');
  });
});

describe('EventFormPage create - the resolved-dates preview (FR-42b, AC-63a)', () => {
  it('fetches once the rule settles, never on each keystroke, and shows no inline table', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();
    expect(previewMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Name/), 'Previewed rehearsal');
    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/3 dates/)).toBeVisible();
    expect(screen.getByText(/7 members on/)).toBeVisible();
    // A preview, not an input: no table lengthens the form.
    expect(screen.queryByRole('table')).toBeNull();

    // Two quick edits coalesce into one fetch once they settle.
    previewMock.mockClear();
    const start = screen.getByLabelText(/^Starts on/);
    fireEvent.change(start, { target: { value: '2027-03-07' } });
    fireEvent.change(start, { target: { value: '2027-03-08' } });
    expect(previewMock).not.toHaveBeenCalled();
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));
  });

  it('re-fetches when the dialog opens and renders the server table', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));
    previewMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Preview dates' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview dates' });

    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));
    const table = await within(dialog).findByRole('table', { name: 'Resolved dates' });
    expect(within(table).getAllByText('7').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole('row')).toHaveLength(4); // header + three dates
  });

  it('reports a failed preview inside the dialog and never disables Save', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('switch', { name: 'Repeats' }));
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));

    previewMock.mockRejectedValueOnce(new ApiError(500, 'The preview is unavailable'));
    await user.click(screen.getByRole('button', { name: 'Preview dates' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview dates' });

    expect(await within(dialog).findByText('The dates could not be resolved')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });

  it('warns when no member matches every audience at these dates', async () => {
    previewMock.mockResolvedValue({
      occurrences: [
        { date: '2026-12-03', expected: 0 },
        { date: '2026-12-10', expected: 0 },
      ],
      audienceCounts: [],
    });
    const user = userEvent.setup();
    renderCreate();
    await waitForDefaultAudience();

    await user.click(screen.getByRole('switch', { name: 'Repeats' }));

    expect(
      await screen.findByText('No member matches every audience at these dates'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  });
});

describe('EventFormPage edit (FR-42b, AC-56, AC-63)', () => {
  it('seeds from the parent with the event number read-only and no Repeats switch', async () => {
    renderEdit();

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
    expect(screen.getByLabelText(/^Event number/)).toHaveValue('EVT-2026-014');
    expect(screen.getByLabelText(/^Event number/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Sunday Celebration');
    expect(screen.getByRole('switch', { name: 'Members tracking' })).toBeDisabled();

    // The authored-rule preview settles and moves the chip count basis, so the
    // audience query re-renders; wait for the settled tree before asserting it.
    expect(await screen.findByText(/3 dates/)).toBeVisible();
    await waitFor(() => {
      // The one-round alias is honoured: the ordered set is read from `audienceIds`.
      expect(screen.getByText('Choir')).toBeVisible();
      expect(screen.getByText('Youth 13-17')).toBeVisible();
      expect(screen.getByText(/^Primary/)).toBeVisible();
    });

    // The cycle line shows the label that authored the stored rule.
    expect(screen.getByText('Every 2 weeks on Sunday.')).toBeVisible();
    expect(screen.queryByRole('switch', { name: 'Repeats' })).toBeNull();
    expect(screen.queryByLabelText('Occurrence 1 date')).toBeNull();
  });

  it('renders a schedule outside the vocabulary from the stored string', async () => {
    getParentMock.mockResolvedValue({
      ...RECURRING,
      recurrence: {
        schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=YEARLY', endsOn: null }],
        exceptions: [],
      },
    });
    renderEdit();

    expect(await screen.findByText("A schedule outside the form's vocabulary")).toBeVisible();
    expect(screen.getAllByText('FREQ=YEARLY').length).toBeGreaterThan(0);
  });

  it('PATCHes the identity fields as a set, without the event number or Members tracking', async () => {
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
      audienceIds: ['aud-choir', 'aud-youth'],
      venueType: 'auditorium',
      startTime: '09:00',
      endTime: null,
      venueName: null,
      description: null,
    });
    expect(payload).not.toHaveProperty('eventNo');
    expect(payload).not.toHaveProperty('audienceId');
    expect(payload).not.toHaveProperty('tracksMembers');
    expect(payload).not.toHaveProperty('status');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('offers the builder while the guard is open and sends exactly one PUT for a changed rule', async () => {
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    const cadence = screen.getByRole('combobox', { name: 'Repeats' });
    expect(cadence).toBeEnabled();
    expect(cadence).toHaveTextContent('Fortnightly');
    // The type is fixed at create: no Repeats switch on the edit surface.
    expect(screen.queryByRole('switch', { name: 'Repeats' })).toBeNull();

    await user.click(cadence);
    await user.click(await screen.findByRole('option', { name: 'Daily' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.any(String),
      'dom-lane-session',
      'event-recurring',
      {
        recurrence: { rrule: 'FREQ=DAILY' },
      },
    );
  });

  it('sends no schedule write when the rule is unchanged', async () => {
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
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('previews the authored rule from the edit route and re-fetches it on open', async () => {
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    // The resolved-dates summary is the create route's own component (FR-42b).
    expect(await screen.findByText(/3 dates/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Preview dates' })).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Repeats' }));
    await user.click(await screen.findByRole('option', { name: 'Daily' }));
    await waitFor(() => expect(previewMock).toHaveBeenCalled());
    previewMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Preview dates' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preview dates' });
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));

    // The preview resolves the **authored** rule, not the stored one.
    expect(previewMock.mock.calls[0]?.[2]).toEqual({
      audienceIds: ['aud-choir', 'aud-youth'],
      recurrence: { schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=DAILY' }] },
    });
    expect(await within(dialog).findByRole('table', { name: 'Resolved dates' })).toBeVisible();
  });

  it('renders a locked rule read-only with its causes and sends no schedule write', async () => {
    getParentMock.mockResolvedValue(LOCKED);
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    expect(screen.getByText('The schedule cannot change')).toBeVisible();
    expect(screen.getAllByText(/An occurrence started on/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/an offering is attached to the event/).length).toBeGreaterThan(0);

    // No schedule control is offered at all (AC-66).
    expect(screen.queryByRole('combobox', { name: 'Repeats' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Named period' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Repeat on' })).toBeNull();
    expect(screen.queryByLabelText(/^Ends on/)).toBeNull();
    // The stored rule is still readable, but there is no preview to open: the
    // officer cannot author a different one.
    expect(screen.getByText(/Every 2 weeks on Sunday · from/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Preview dates' })).toBeNull();
    expect(previewMock).not.toHaveBeenCalled();
    expect(screen.getByText('Every 2 weeks on Sunday')).toBeVisible();

    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), 'Sunday Gathering');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('edits a monthly period rule through the period arm, in the period vocabulary', async () => {
    getParentMock.mockResolvedValue(PERIOD_RULE);
    const user = userEvent.setup();
    renderEdit('event-period');

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    // The frequency is the stored rule's, not a choice on edit: the same inline
    // row, with the value where the radios would be.
    expect(screen.queryByRole('radiogroup', { name: 'Frequency' })).toBeNull();
    expect(screen.getByText('Monthly — one date per cycle, generated')).toBeVisible();
    expect(screen.getByLabelText('What the frequency means')).toBeInTheDocument();
    const day = screen.getByRole('combobox', { name: 'Day inside the period' });
    expect(day).toHaveTextContent('Sunday');

    await user.click(day);
    await user.click(await screen.findByRole('option', { name: 'Monday' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.any(String),
      'dom-lane-session',
      'event-period',
      {
        period: { frequency: 'monthly', day: 'MON' },
      },
    );
  });

  it('derives a single-date period from the catalogue, so the write carries no day', async () => {
    getParentMock.mockResolvedValue(HOME_CELLS_RULE);
    const user = userEvent.setup();
    renderEdit('event-home-cells');

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    // The catalogue says `dates: 'date'`; the edit seed cannot carry that shape
    // itself, so the page seeds it and the day control is absent.
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: 'Day inside the period' })).toBeNull();
    });
    expect(screen.getByText(/resolves to a single date/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.any(String),
      'dom-lane-session',
      'event-home-cells',
      { period: { frequency: 'monthly' } },
    );
  });

  it('keeps a one-cycle period read-only, because the write has no cycle arm', async () => {
    getParentMock.mockResolvedValue(PERIOD_ONE_CYCLE);
    renderEdit('event-period-once');

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    expect(screen.queryByRole('combobox', { name: 'Day inside the period' })).toBeNull();
    expect(screen.getByText(/resolved once and stores no rule/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Preview dates' })).toBeNull();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('renders a 409 recurrence_locked as the banner with its reasons and stays on the form', async () => {
    scheduleMock.mockRejectedValueOnce(
      new ApiError(409, 'The event has history; its schedule cannot be rewritten', {
        code: 'recurrence_locked',
        reasons: [{ code: 'offering_counted', date: '2026-12-03' }],
      }),
    );
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    await user.click(screen.getByRole('combobox', { name: 'Repeats' }));
    await user.click(await screen.findByRole('option', { name: 'Daily' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('The schedule cannot change')).toBeVisible();
    expect(screen.getAllByText(/An offering count was recorded on/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('reports a saved rule whose window could not be generated, without failing twice', async () => {
    scheduleMock.mockResolvedValueOnce({ ...SCHEDULE_RESULT, generated: false });
    const user = userEvent.setup();
    renderEdit();

    await screen.findByRole('heading', { level: 1, name: 'Edit event' });
    await user.click(screen.getByRole('combobox', { name: 'Repeats' }));
    await user.click(await screen.findByRole('option', { name: 'Daily' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('The schedule was saved; its dates were not generated'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Edit event' })).toBeVisible();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
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
