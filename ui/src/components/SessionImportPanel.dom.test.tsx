import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { renderWithProviders } from '../test/render';
import { SessionImportPanel } from './SessionImportPanel';

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
    postAttendanceImport: vi.fn(),
  };
});

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

describe('SessionImportPanel', () => {
  it('opens on its fixed session and offers no occurrence picker', async () => {
    renderWithProviders(
      <MemoryRouter>
        <DateTimeProvider>
          <SessionImportPanel open occurrence={occurrence} onClose={vi.fn()} onImported={vi.fn()} />
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
});
