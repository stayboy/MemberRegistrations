import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { SeriesSummaryDto } from '../api/series';
import { ThemeProvider } from '../theme/ThemeProvider';
import { SeriesSummaryTiles } from './SeriesSummaryTiles';

const FORMAT_DATE = (value: string): string => value;

const SUMMARY: SeriesSummaryDto = {
  from: '2026-08-13',
  to: '2026-11-11',
  nextOccurrence: '2026-11-15',
  attendance: {
    memberSessions: { held: 3, expected: 4, present: 3, rate: 0.75 },
    lastHeld: { date: '2026-11-08', expected: 3, present: 2 },
    headcountSessions: { held: 1 },
    cancelled: 2,
    upcoming: 1,
  },
  offerings: {
    attachedCount: 1,
    currency: 'GHS',
    paidMinor: 5000,
    pledgedMinor: 70000,
    outstandingMinor: 30000,
    countedMinor: 2000,
    visitors: { count: 1, paidMinor: 7000 },
  },
};

function render(node: ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>,
  );
}

function tiles(overrides: Partial<SeriesSummaryDto> = {}, occurrenceCount = 12): string {
  const summary: SeriesSummaryDto = {
    ...SUMMARY,
    ...overrides,
    attendance: { ...SUMMARY.attendance, ...(overrides.attendance ?? {}) },
    offerings: { ...SUMMARY.offerings, ...(overrides.offerings ?? {}) },
  };
  return render(
    <SeriesSummaryTiles
      summary={summary}
      occurrenceCount={occurrenceCount}
      formatDate={FORMAT_DATE}
    />,
  );
}

describe('series summary tiles', () => {
  it('shows the four tiles with the window captions', () => {
    const markup = tiles();

    expect(markup).toContain('Series summary');
    expect(markup).toContain('Next occurrence');
    expect(markup).toContain('2026-11-15');
    expect(markup).toContain('Occurrences');
    expect(markup).toContain('in this window');
    expect(markup).toContain('75%');
    expect(markup).toContain('2 of 3 on 2026-11-08');
    expect(markup).toContain('1 headcount-only');
    expect(markup).toContain('GHS');
    expect(markup).toContain('paid this window');
  });

  it('shows the empty-window zeros and null states', () => {
    const markup = tiles(
      {
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
      0,
    );

    expect(markup).toContain('None in 90 days');
    expect(markup).toContain('No held sessions in this window');
    expect(markup).toContain('No offerings attached');
    expect(markup).not.toContain('NaN');
  });
});
