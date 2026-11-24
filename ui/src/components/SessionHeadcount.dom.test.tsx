import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTimeProvider } from '../shell/DateTimeProvider';
import { renderWithProviders } from '../test/render';
import type { Headcount, HeadcountPage } from '../api/ussd';
import { SessionHeadcount } from './SessionHeadcount';

const headcount = (mode: string, total: number, lines: Headcount['lines'] = []): Headcount => ({
  id: `hc-${mode}`,
  eventId: 'event-1',
  sessionDate: '2026-11-08',
  asOf: '2026-11-08T11:02:00.000Z',
  mode: mode as Headcount['mode'],
  total,
  ended: false,
  recordedBy: 'AM',
  recordedAt: '2026-11-08T11:02:00.000Z',
  supersedesId: null,
  supersededBy: null,
  lines,
});

const page = (current: HeadcountPage['current']): HeadcountPage => ({
  sessionDate: '2026-11-08',
  current,
  observations: Object.values(current).filter((row): row is Headcount => Boolean(row)),
});

// A stateful mock rather than a `once` queue: a double mount (Strict Mode) or a refetch would otherwise
// consume the queued value and leave the next render with the default, which reads as a flaky test.
let current: HeadcountPage['current'] = {};
let readError: Error | null = null;

const { closeCapture } = vi.hoisted(() => ({
  closeCapture: vi.fn(async () => ({ id: 'batch-1' })),
}));

vi.mock('../api/imports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/imports')>();
  return { ...actual, postAttendanceImport: closeCapture };
});

const importsApi = await import('../api/imports');

vi.mock('../api/ussd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/ussd')>();
  return {
    ...actual,
    getHeadcounts: vi.fn(async () => {
      if (readError) throw readError;
      return page(current);
    }),
    recordHeadcount: vi.fn(async () => headcount('adults', 120)),
  };
});

const api = await import('../api/ussd');

beforeEach(() => {
  current = {};
  readError = null;
});

function renderCell() {
  return renderWithProviders(
    <DateTimeProvider>
      <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" />
    </DateTimeProvider>,
  );
}

describe('SessionHeadcount', () => {
  it('says a session is not counted when no lane has an observation', async () => {
    current = { adults: null, children: null, visitors: null };
    renderCell();
    expect(await screen.findByText('Not counted')).toBeVisible();
  });

  it('shows each lane with its own buckets, never one summed figure', async () => {
    current = {
      adults: headcount('adults', 120, [
        { code: 'adult_male', label: 'Male', count: 58 },
        { code: 'adult_female', label: 'Female', count: 62 },
      ]),
      visitors: headcount('visitors', 22, [
        { code: 'visitor_male', label: 'Male', count: 12 },
        { code: 'visitor_female', label: 'Female', count: 8 },
        { code: 'visitor_child', label: 'Children', count: 2 },
      ]),
      children: null,
    };
    renderCell();
    // HC-22: no read sums lanes, so there is no "142" on the page.
    expect(await screen.findByText('Adult service')).toBeVisible();
    expect(screen.getByText('Male 58 · Female 62')).toBeVisible();
    expect(screen.getByText('Visitors')).toBeVisible();
    expect(screen.getByText('Male 12 · Female 8 · Children 2')).toBeVisible();
    expect(screen.queryByText('142')).toBeNull();
  });

  it('names a legacy mixed observation as retired', async () => {
    current = { mixed: headcount('mixed', 300) };
    renderCell();
    expect(await screen.findByText('Mixed (retired)')).toBeVisible();
  });

  it('offers a retry when the count cannot be read, rather than claiming it is uncounted', async () => {
    readError = new Error('offline');
    renderCell();
    expect(await screen.findByText('The count could not be read.')).toBeVisible();
    expect(screen.queryByText('Not counted')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('opens the capture dialog from the row', async () => {
    current = { adults: null };
    renderCell();
    await userEvent.click(await screen.findByRole('button', { name: 'Record headcount' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1];
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText('Record a headcount', { exact: false })).toBeVisible();
  });

  it('confirms the close from the row and sends nothing until it is confirmed', async () => {
    current = { adults: headcount('adults', 120) };
    vi.mocked(importsApi.postAttendanceImport).mockClear();
    renderWithProviders(
      <DateTimeProvider>
        <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" endAction="enabled" />
      </DateTimeProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'End of session' }));

    // FR-6f/AC-7a: the close is irreversible, so it confirms first and the click sends nothing.
    expect(importsApi.postAttendanceImport).not.toHaveBeenCalled();
    const dialogs = await screen.findAllByRole('dialog');
    const confirm = dialogs[dialogs.length - 1]!;
    expect(within(confirm).getByText('End this session?')).toBeVisible();
    expect(within(confirm).getByText(/Further captures will be refused/)).toBeVisible();

    await userEvent.click(within(confirm).getByRole('button', { name: 'End of session' }));
    // One shared close per event and session: no rows, ended true - the request the page made.
    expect(importsApi.postAttendanceImport).toHaveBeenCalledTimes(1);
    expect(importsApi.postAttendanceImport).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        eventId: 'event-1',
        sessionDate: '2026-11-08',
        rows: [],
        ended: true,
      }),
    );
  });

  it('offers no close for a session that is not live, and a disabled one once closed', async () => {
    current = { adults: headcount('adults', 120) };
    const { unmount } = renderWithProviders(
      <DateTimeProvider>
        <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" endAction="hidden" />
      </DateTimeProvider>,
    );
    // FR-6f: a past or not-started open session reads "this capture will end it" and offers no close.
    await screen.findByText('Adult service');
    expect(screen.queryByRole('button', { name: 'End of session' })).toBeNull();
    unmount();

    renderWithProviders(
      <DateTimeProvider>
        <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" endAction="disabled" />
      </DateTimeProvider>,
    );
    // Once closed the action is shown disabled, not removed.
    expect(await screen.findByRole('button', { name: 'End of session' })).toBeDisabled();
  });

  it('offers the import only when the caller does, and calls it', async () => {
    current = { adults: headcount('adults', 120) };
    const onImport = vi.fn();
    const { unmount } = renderWithProviders(
      <DateTimeProvider>
        <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" onImport={onImport} />
      </DateTimeProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    unmount();

    // A standalone event passes no callback, and the row offers no import (FR-8).
    renderWithProviders(
      <DateTimeProvider>
        <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" />
      </DateTimeProvider>,
    );
    await screen.findByText('Adult service');
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });

  it('corrects a lane by superseding the observation it corrects', async () => {
    const adults = headcount('adults', 120, [{ code: 'adult_male', label: 'Male', count: 58 }]);
    current = { adults };
    renderCell();
    vi.mocked(api.recordHeadcount).mockClear();

    await userEvent.click(await screen.findByRole('button', { name: 'Correct' }));
    const dialogs = await screen.findAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1];
    expect(within(dialog).getByText('Correct the current observation')).toBeVisible();
    expect(within(dialog).getByText(/Keeping asOf/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save correction' }));
    // A correction supersedes the row it corrects; it does not post a fresh asOf.
    const payload = vi.mocked(api.recordHeadcount).mock.calls[0]?.[3] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({ sessionDate: '2026-11-08', supersedesId: adults.id });
    // HC-3: a correction keeps the observation's own asOf, so it posts none.
    expect(payload).not.toHaveProperty('asOf');
  });

  it('offers no correction for a retired mixed observation', async () => {
    current = { mixed: headcount('mixed', 300) };
    renderCell();
    expect(await screen.findByText('Mixed (retired)')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull();
  });

  it('closes both actions once the session is ended or cancelled', async () => {
    current = { adults: headcount('adults', 120) };
    renderWithProviders(
      <DateTimeProvider>
        <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" disabled />
      </DateTimeProvider>,
    );
    const record = await screen.findByRole('button', { name: 'Record headcount' });
    const correct = await screen.findByRole('button', { name: 'Correct' });
    expect(record).toBeDisabled();
    expect(correct).toBeDisabled();
  });
});
