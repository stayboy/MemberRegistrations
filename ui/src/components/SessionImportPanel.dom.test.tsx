import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { dateInZone } from '../format/capture';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { renderWithProviders } from '../test/render';
import { SessionImportPanel } from './SessionImportPanel';

/** The end-only batch the API answers for a close; `createdAt` is the capture instant it records. */
const ENDED_BATCH = {
  id: 'batch-1',
  kind: 'attendance' as const,
  actor: 'officer-1',
  rowCount: 0,
  checksum: 'sha256:e2e-attendance',
  createdAt: '2026-01-05T10:00:00.000Z',
};

vi.mock('../api/imports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/imports')>();
  return {
    ...actual,
    getImportFormats: vi.fn(async () => [
      {
        kind: 'attendance',
        filename: 'attendance.xlsx',
        columns: [{ name: 'memberNo', required: true, type: 'text', example: 'M-1001' }],
      },
    ]),
    downloadImportTemplate: vi.fn(),
    postAttendanceImport: vi.fn(async () => ENDED_BATCH),
  };
});

const importsApi = await import('../api/imports');

const occurrence = {
  eventId: 'event-1',
  eventNo: 'EVT-2026-001',
  eventName: 'Sunday Service',
  date: '2026-01-04',
  startTime: '09:00',
  endTime: '11:00',
  timezone: 'UTC',
  sessionStatus: 'held' as const,
  capture: null,
};

/** A session dated today inside a whole-day window, so the state matrix reads it as `live`. */
const liveOccurrence = {
  ...occurrence,
  date: dateInZone(new Date(), 'UTC'),
  startTime: '00:00',
  endTime: '23:59',
};

function renderPanel(target: typeof occurrence) {
  return renderWithProviders(
    <MemoryRouter>
      <DateTimeProvider>
        <SessionImportPanel
          open
          occurrence={target}
          onClose={vi.fn()}
          onImported={vi.fn()}
          onSessionEnded={vi.fn()}
        />
      </DateTimeProvider>
    </MemoryRouter>,
  );
}

describe('SessionImportPanel', () => {
  it('opens on its fixed session and offers no occurrence picker', async () => {
    renderWithProviders(
      <MemoryRouter>
        <DateTimeProvider>
          <SessionImportPanel
            open
            occurrence={occurrence}
            onClose={vi.fn()}
            onImported={vi.fn()}
            onSessionEnded={vi.fn()}
          />
        </DateTimeProvider>
      </MemoryRouter>,
    );

    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1];
    expect(dialog).toBeVisible();
    // The session the row named, and no picker: the panel is for that occurrence only.
    expect(screen.getAllByText('Sunday Service').length).toBeGreaterThan(0);
    // The picker card itself, not one of its controls: the panel never offers a session choice.
    expect(screen.queryByText('Choose the event session')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change occurrence' })).toBeNull();
  });

  it('confirms before it ends the session, and Cancel sends nothing', async () => {
    const post = vi.mocked(importsApi.postAttendanceImport);
    post.mockClear();
    renderPanel(liveOccurrence);

    // Scoped by name: a closed Fluent surface stays in the jsdom tree, so the element order of the two
    // dialogs is not a contract and a screen-wide query would find the confirmation's own button.
    const panel = await screen.findByRole('dialog', { name: 'Import attendance' });
    const endButton = () => within(panel).getByRole('button', { name: 'End of session' });

    expect(endButton()).toBeEnabled();
    await userEvent.click(endButton());

    // FR-6f/AC-7a: the close is irreversible, so the click asks first and sends nothing.
    expect(post).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('dialog', { name: 'End this session?' });
    expect(within(confirm).getByText('End this session?')).toBeVisible();
    expect(within(confirm).getByText(/Further captures will be refused/)).toBeVisible();

    // Cancel leaves the panel untouched: no request, no state change, the action still live.
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('End this session?')).not.toBeVisible();
    expect(endButton()).toBeEnabled();

    await userEvent.click(endButton());
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'End this session?' })).getByRole('button', {
        name: 'End of session',
      }),
    );

    // Confirmed once, with the end-only body: no rows, `ended: true`, the session the panel names.
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      eventId: 'event-1',
      sessionDate: liveOccurrence.date,
      rows: [],
      ended: true,
    });

    // AC-7a: the panel now reads End of session and offers the action disabled, not removed.
    expect(await within(panel).findByText(/End of session · recorded/)).toBeVisible();
    // A closed Fluent surface keeps tabster's `aria-hidden` on the panel in jsdom, which a role query
    // honours; the element and its `disabled` attribute are what the state matrix actually controls.
    expect(
      within(panel).getByText('End of session', { exact: true }).closest('button'),
    ).toBeDisabled();
  });
});
