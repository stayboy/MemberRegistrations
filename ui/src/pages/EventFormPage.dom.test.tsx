import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createEvent, type EventItem } from '../api/events';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderWithProviders } from '../test/render';
import { EventFormPage } from './EventFormPage';

/**
 * FR-42a/FR-42b, AC-56: the New event form is one page with Identity, When and
 * where, Sessions and Tracking, the commit/cancel pair in the header, inline
 * validation, the sole create 409 on the Event number field, and a create that
 * opens the new event's detail.
 */
vi.mock('../api/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/events')>();
  return { ...actual, createEvent: vi.fn() };
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

const CREATED: EventItem = {
  id: 'created-EVT-2026-031',
  eventNo: 'EVT-2026-031',
  name: 'Strategic Conference',
  seriesId: null,
  ministry: null,
  timezone: 'UTC',
  startDate: '2026-11-22',
  endDate: '2026-11-22',
  startTime: '09:00',
  endTime: null,
  venueType: 'auditorium',
  venueName: null,
  description: null,
  status: 'scheduled',
  source: 'manual',
  tracksMembers: true,
  presbyterOnly: false,
  sessions: [
    {
      date: '2026-11-22',
      startTime: '09:00',
      endTime: null,
      status: 'scheduled',
      note: null,
      present: 0,
      expected: 0,
      importedRows: 0,
      capture: null,
      source: 'none',
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
};

const createEventMock = vi.mocked(createEvent);

beforeEach(() => {
  createEventMock.mockReset();
  createEventMock.mockResolvedValue(CREATED);
});

function renderForm(): void {
  renderWithProviders(
    <MemoryRouter initialEntries={['/events/new']}>
      <ThemeProvider>
        <DateTimeProvider>
          <Routes>
            <Route path="/events/new" element={<EventFormPage />} />
            <Route path="/events/:id" element={<h1>Created event detail</h1>} />
          </Routes>
        </DateTimeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('EventFormPage (FR-42a, FR-42b, AC-56)', () => {
  it('renders every section with the commit/cancel pair and no Actions menu', () => {
    renderForm();

    expect(screen.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'When and where' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Tracking' })).toBeVisible();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create event' })).toBeVisible();
    // FR-9a: a form's commit/cancel pair is not a page action, so no menu.
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();

    // The signed-target defaults: today, one open session, members tracked.
    expect(screen.getByLabelText(/^Start date/)).toHaveValue(today());
    expect(screen.getByLabelText(/^End date/)).toHaveValue(today());
    expect(screen.getByLabelText(/^Start time/)).toHaveValue('09:00');
    expect(screen.getByLabelText('Session 1 date')).toHaveValue(today());
    expect(screen.getByRole('switch', { name: 'Members tracking' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Presbyter only' })).not.toBeChecked();
  });

  it('shows the required-field errors inline and never posts an invalid form', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText('Event number is required.')).toBeVisible();
    expect(screen.getByText('Name is required.')).toBeVisible();
    expect(createEventMock).not.toHaveBeenCalled();
  });

  it('puts a duplicate-number 409 against the Event number field', async () => {
    createEventMock.mockRejectedValue(
      new ApiError(409, 'Event number EVT-2026-001 is already in use'),
    );
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/^Event number/), 'EVT-2026-001');
    await user.type(screen.getByLabelText(/^Name/), 'Duplicate conference');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText('Event number EVT-2026-001 is already in use')).toBeVisible();
    // The entered values survive the conflict.
    expect(screen.getByLabelText(/^Event number/)).toHaveValue('EVT-2026-001');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Duplicate conference');
    expect(screen.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  });

  it('posts the create body and opens the created event detail', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/^Event number/), '  EVT-2026-031  ');
    await user.type(screen.getByLabelText(/^Name/), '  Strategic Conference  ');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Created event detail' }),
    ).toBeVisible();

    expect(createEventMock).toHaveBeenCalledTimes(1);
    const [, token, payload] = createEventMock.mock.calls[0] ?? [];
    expect(token).toBe('dom-lane-session');
    expect(payload).toMatchObject({
      eventNo: 'EVT-2026-031',
      name: 'Strategic Conference',
      startDate: today(),
      endDate: today(),
      startTime: '09:00',
      venueType: 'auditorium',
      tracksMembers: true,
      presbyterOnly: false,
      sessions: [{ date: today() }],
    });
    expect(payload).not.toHaveProperty('timezone');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('source');
  });

  it('moves the lone session when the start date changes and leaves two rows alone', async () => {
    const user = userEvent.setup();
    renderForm();

    const startDate = screen.getByLabelText(/^Start date/);
    const firstSessionDate = screen.getByLabelText('Session 1 date');
    expect(firstSessionDate).toHaveValue(today());

    fireEvent.change(startDate, { target: { value: '2026-12-01' } });
    expect(screen.getByLabelText('Session 1 date')).toHaveValue('2026-12-01');

    await user.click(screen.getByRole('button', { name: 'Add session' }));
    expect(screen.getByLabelText('Session 2 date')).toHaveValue('2026-12-01');

    fireEvent.change(screen.getByLabelText(/^Start date/), {
      target: { value: '2026-12-05' },
    });
    // Two rows still carried the old start date, so neither follows.
    expect(screen.getByLabelText('Session 1 date')).toHaveValue('2026-12-01');
    expect(screen.getByLabelText('Session 2 date')).toHaveValue('2026-12-01');
  });
});
