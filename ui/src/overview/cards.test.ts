import { describe, expect, it } from 'vitest';
import type { AttendanceEntry, MemberAttendanceSeries, MemberCalls } from '../api/members';
import {
  contactsAction,
  lastAttended,
  mostAttended,
  overviewCards,
  quarterMonthCounts,
  shepherdCallsCard,
} from './cards';

const NOW = new Date('2026-11-17T12:00:00.000Z');

function entry(id: string, date: string, eventId: string, eventName: string): AttendanceEntry {
  return { id, date, source: 'import', eventId, eventName };
}

function row(
  seriesId: string | null,
  seriesName: string | null,
  entries: readonly AttendanceEntry[],
): MemberAttendanceSeries {
  return {
    seriesId,
    seriesName,
    ministry: null,
    attended: entries.length,
    expected: entries.length,
    remaining: 0,
    status: 'ongoing',
    entries,
  };
}

const NO_CALLS: MemberCalls = {
  attempts: 0,
  conversations: 0,
  lastCalledOn: null,
  lastReachedOn: null,
};

/** The preference formatter the app passes in; the cards only echo its answer. */
function formatDate(value: string | null | undefined): string {
  return value === '2026-11-22'
    ? '22 Nov 2026'
    : value === '2026-11-14'
      ? '14 Nov 2026'
      : (value ?? '');
}

describe('quarterMonthCounts (FR-29, UTC)', () => {
  it('counts the current UTC year, quarter and month across series and standalone rows', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [
        entry('a1', '2026-10-04', 'event-1', 'Sunday Service'),
        entry('a2', '2026-11-01', 'event-2', 'Sunday Service'),
        entry('a3', '2026-11-08', 'event-3', 'Sunday Service'),
        entry('a4', '2026-09-27', 'event-4', 'Sunday Service'),
      ]),
      row(null, null, [entry('a5', '2026-11-14', 'event-5', 'Harvest')]),
      row('series-2', 'Bible Study', [entry('a6', '2025-11-09', 'event-6', 'Bible Study')]),
    ];

    expect(quarterMonthCounts(attendance, NOW)).toEqual({
      yearLabel: '2026',
      yearCount: 5,
      quarterLabel: 'Q4 2026',
      quarterCount: 4,
      monthLabel: 'November 2026',
      monthCount: 3,
    });
  });

  it('counts one entry in every period it falls in - the periods nest, nothing is de-duplicated', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [entry('a1', '2026-11-22', 'event-1', 'Sunday Service')]),
    ];

    const counts = quarterMonthCounts(attendance, NOW);
    expect(counts.yearCount).toBe(1);
    expect(counts.quarterCount).toBe(1);
    expect(counts.monthCount).toBe(1);
  });

  it('reads a UTC quarter boundary from the month, not the local date', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [
        entry('a1', '2026-09-30', 'event-1', 'Sunday Service'),
        entry('a2', '2026-10-01', 'event-2', 'Sunday Service'),
        entry('a3', '2027-01-03', 'event-3', 'Sunday Service'),
      ]),
    ];

    const counts = quarterMonthCounts(attendance, NOW);
    expect(counts.yearCount).toBe(2);
    expect(counts.quarterCount).toBe(1);
    expect(counts.monthCount).toBe(0);
  });

  it('reports zeroes and the exact period labels for a member with no attendance', () => {
    expect(quarterMonthCounts([], NOW)).toEqual({
      yearLabel: '2026',
      yearCount: 0,
      quarterLabel: 'Q4 2026',
      quarterCount: 0,
      monthLabel: 'November 2026',
      monthCount: 0,
    });
  });
});

describe('lastAttended (FR-29)', () => {
  it('takes the latest entry across every row, series and standalone', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [entry('a1', '2026-11-01', 'event-1', 'Sunday Service')]),
      row(null, null, [entry('a2', '2026-11-14', 'event-2', 'Harvest')]),
    ];

    expect(lastAttended(attendance)).toEqual({ eventName: 'Harvest', date: '2026-11-14' });
  });

  it('breaks an equal date by eventName ascending', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [entry('a1', '2026-11-22', 'event-1', 'Sunday Service')]),
      row(null, null, [entry('a2', '2026-11-22', 'event-2', 'Harvest')]),
    ];

    expect(lastAttended(attendance)?.eventName).toBe('Harvest');
  });

  it('returns null with no entries', () => {
    expect(lastAttended([])).toBeNull();
  });
});

describe('mostAttended (FR-29)', () => {
  it('groups recurring rows by seriesId and standalone rows by eventId', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [
        entry('a1', '2026-10-04', 'event-1', 'Sunday Service'),
        entry('a2', '2026-10-11', 'event-2', 'Sunday Service'),
      ]),
      row(null, null, [entry('a3', '2026-10-18', 'event-3', 'Harvest')]),
      row(null, null, [entry('a4', '2026-10-25', 'event-3', 'Harvest')]),
    ];

    const most = mostAttended(attendance);
    // Two groups of two; the later latest date decides between them.
    expect(most).toEqual({ label: 'Harvest', count: 2, latestDate: '2026-10-25' });
  });

  it('renders a recurring group by its row seriesName, not an entry name', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [
        entry('a1', '2026-10-04', 'event-1', 'First Service'),
        entry('a2', '2026-10-11', 'event-2', 'Second Service'),
      ]),
    ];

    expect(mostAttended(attendance)?.label).toBe('Sunday Service');
  });

  it('breaks equal counts and dates by label ascending', () => {
    const attendance = [
      row('series-1', 'Sunday Service', [entry('a1', '2026-10-04', 'event-1', 'Sunday Service')]),
      row('series-2', 'Bible Study', [entry('a2', '2026-10-04', 'event-2', 'Bible Study')]),
    ];

    expect(mostAttended(attendance)?.label).toBe('Bible Study');
  });

  it('returns null with no entries', () => {
    expect(mostAttended([])).toBeNull();
  });
});

describe('shepherdCallsCard (FR-29)', () => {
  it('reads a muted zero over Number of calls and a muted dash over Last reached', () => {
    const card = shepherdCallsCard(NO_CALLS, formatDate);
    expect(card.cells).toEqual([
      { value: '0', label: 'Number of calls', muted: true },
      { value: '—', label: 'Last reached', muted: true },
    ]);
    expect(card.copy).toBe('Shepherd calls: No calls logged');
    expect(card.empty).toBe(true);
  });

  it('spells the attempts as times and says when nobody was reached', () => {
    const card = shepherdCallsCard(
      { attempts: 4, conversations: 0, lastCalledOn: '2026-11-10', lastReachedOn: null },
      formatDate,
    );
    expect(card.cells).toEqual([
      { value: '4×', label: 'Number of calls' },
      { value: 'No one reached', label: 'Last reached', muted: true },
    ]);
    expect(card.copy).toBe('Shepherd calls: 4 times · no one reached');
    expect(card.empty).toBe(false);
  });

  it('spells the attempts as times and names the last reached date', () => {
    const card = shepherdCallsCard(
      {
        attempts: 6,
        conversations: 4,
        lastCalledOn: '2026-11-14',
        lastReachedOn: '2026-11-14',
      },
      formatDate,
    );
    expect(card.cells).toEqual([
      { value: '6×', label: 'Number of calls' },
      { value: '14 Nov 2026', label: 'Last reached' },
    ]);
    expect(card.copy).toBe('Shepherd calls: 6 times · last reached 14 Nov 2026');
    expect(card.empty).toBe(false);
  });
});

describe('contactsAction (FR-29, AC-47)', () => {
  it('builds View Contacts (n) from the detail contactCount', () => {
    expect(contactsAction(3)).toEqual({ label: 'View Contacts (3)', show: true });
  });

  it('reads zero as plain No contacts with no button', () => {
    expect(contactsAction(0)).toEqual({ label: 'No contacts', show: false });
  });

  it('clamps a negative or non-finite count to zero', () => {
    expect(contactsAction(-2)).toEqual({ label: 'No contacts', show: false });
    expect(contactsAction(Number.NaN)).toEqual({ label: 'No contacts', show: false });
  });
});

describe('overviewCards (FR-29)', () => {
  const populated = [
    row('series-1', 'Sunday Service', [
      entry('a1', '2026-10-04', 'event-1', 'Sunday Service'),
      entry('a2', '2026-11-01', 'event-2', 'Sunday Service'),
      entry('a3', '2026-11-22', 'event-3', 'Sunday Service'),
    ]),
  ];

  it('renders the drawing values with one shape for all four cards', () => {
    const cards = overviewCards(
      {
        attendance: populated,
        calls: {
          attempts: 6,
          conversations: 4,
          lastCalledOn: '2026-11-14',
          lastReachedOn: '2026-11-14',
        },
      },
      { formatDate, now: NOW },
    );

    expect(cards.map((card) => card.key)).toEqual([
      'attended',
      'last-attended',
      'shepherd-calls',
      'most-attended',
    ]);
    expect(cards.map((card) => card.label)).toEqual([
      'Attended',
      'Last attended',
      'Shepherd calls',
      'Most attended',
    ]);

    expect(cards[0]?.cells).toEqual([
      { value: '3', label: 'This year' },
      { value: '3', label: 'This quarter' },
      { value: '2', label: 'This month' },
    ]);
    expect(cards[0]?.copy).toBe(
      'Attended: 3 this year (2026) · 3 this quarter (Q4 2026) · 2 this month (November 2026)',
    );
    expect(cards[0]?.tooltip).toBe('2026 · Q4 2026 · November 2026');

    expect(cards[1]?.cells).toEqual([{ value: 'Sunday Service', label: '22 Nov 2026' }]);
    expect(cards[1]?.copy).toBe('Last attended: Sunday Service · 22 Nov 2026');

    expect(cards[2]?.cells).toEqual([
      { value: '6×', label: 'Number of calls' },
      { value: '14 Nov 2026', label: 'Last reached' },
    ]);
    expect(cards[2]?.copy).toBe('Shepherd calls: 6 times · last reached 14 Nov 2026');

    expect(cards[3]?.cells).toEqual([{ value: 'Sunday Service (3×)', label: '' }]);
    expect(cards[3]?.copy).toBe('Most attended: Sunday Service, 3 times');
  });

  it('states the empty copies, three zeros and the no-calls branch', () => {
    const cards = overviewCards({ attendance: [], calls: NO_CALLS }, { formatDate, now: NOW });

    expect(cards[0]?.cells).toEqual([
      { value: '0', label: 'This year' },
      { value: '0', label: 'This quarter' },
      { value: '0', label: 'This month' },
    ]);
    expect(cards[0]?.copy).toBe(
      'Attended: 0 this year (2026) · 0 this quarter (Q4 2026) · 0 this month (November 2026)',
    );
    expect(cards[1]?.cells).toEqual([{ value: 'No attendance recorded', label: '', muted: true }]);
    expect(cards[1]?.empty).toBe(true);
    expect(cards[2]?.copy).toBe('Shepherd calls: No calls logged');
    expect(cards[2]?.empty).toBe(true);
    expect(cards[3]?.cells).toEqual([{ value: 'No attendance recorded', label: '', muted: true }]);
    expect(cards[3]?.empty).toBe(true);
  });

  it('keeps the subtext slot on every card, so a single-value card is never shorter', () => {
    const populatedCards = overviewCards(
      { attendance: populated, calls: NO_CALLS },
      { formatDate, now: NOW },
    );

    for (const card of populatedCards) {
      // One cell carries one value and one label slot; `Last attended` uses it for the
      // date, `Most attended` leaves it empty rather than dropping it.
      expect(card.cells.length).toBeGreaterThan(0);
      for (const cell of card.cells) {
        expect(typeof cell.label).toBe('string');
      }
    }
  });
});
