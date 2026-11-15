import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('../api/ussd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/ussd')>();
  return {
    ...actual,
    getHeadcounts: vi.fn(async () => page({ adults: null, children: null, visitors: null })),
    recordHeadcount: vi.fn(async () => headcount('adults', 120)),
  };
});

const api = await import('../api/ussd');

function renderCell() {
  return renderWithProviders(
    <DateTimeProvider>
      <SessionHeadcount eventId="event-1" sessionDate="2026-11-08" />
    </DateTimeProvider>,
  );
}

describe('SessionHeadcount', () => {
  it('says a session is not counted when no lane has an observation', async () => {
    vi.mocked(api.getHeadcounts).mockResolvedValueOnce(
      page({ adults: null, children: null, visitors: null }),
    );
    renderCell();
    expect(await screen.findByText('Not counted')).toBeVisible();
  });

  it('shows each lane with its own buckets, never one summed figure', async () => {
    vi.mocked(api.getHeadcounts).mockResolvedValueOnce(
      page({
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
      }),
    );
    renderCell();
    // HC-22: no read sums lanes, so there is no "142" on the page.
    expect(await screen.findByText('Adult service')).toBeVisible();
    expect(screen.getByText('Male 58 · Female 62')).toBeVisible();
    expect(screen.getByText('Visitors')).toBeVisible();
    expect(screen.getByText('Male 12 · Female 8 · Children 2')).toBeVisible();
    expect(screen.queryByText('142')).toBeNull();
  });

  it('names a legacy mixed observation as retired', async () => {
    vi.mocked(api.getHeadcounts).mockResolvedValueOnce(page({ mixed: headcount('mixed', 300) }));
    renderCell();
    expect(await screen.findByText('Mixed (retired)')).toBeVisible();
  });

  it('offers a retry when the count cannot be read, rather than claiming it is uncounted', async () => {
    vi.mocked(api.getHeadcounts).mockRejectedValueOnce(new Error('offline'));
    renderCell();
    expect(await screen.findByText('The count could not be read.')).toBeVisible();
    expect(screen.queryByText('Not counted')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('opens the capture dialog from the row', async () => {
    vi.mocked(api.getHeadcounts).mockResolvedValueOnce(page({ adults: null }));
    renderCell();
    await userEvent.click(await screen.findByRole('button', { name: 'Record headcount' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Record a headcount', { exact: false })).toBeVisible();
  });
});
