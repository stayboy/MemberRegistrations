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
  it('counts only the current UTC quarter and month, across series and standalone rows', () => {
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
      quarterLabel: 'Q4 2026',
      quarterCount: 4,
      monthLabel: 'November',
      monthCount: 3,
      seriesRows: 3,
    });
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
    expect(counts.quarterCount).toBe(1);
    expect(counts.monthCount).toBe(0);
  });

  it('reports zeroes and no rows for a member with no attendance', () => {
    expect(quarterMonthCounts([], NOW)).toMatchObject({
      quarterCount: 0,
      monthCount: 0,
      quarterLabel: 'Q4 2026',
      monthLabel: 'November',
      seriesRows: 0,
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
  it('keeps the Shepherd calls prefix and states no calls', () => {
    const card = shepherdCallsCard(NO_CALLS, formatDate);
    expect(card.value).toBe('No calls logged');
    expect(card.copy).toBe('Shepherd calls: No calls logged');
    expect(card.empty).toBe(true);
  });

  it('keeps the prefix when nobody was reached', () => {
    const card = shepherdCallsCard(
      { attempts: 4, conversations: 0, lastCalledOn: '2026-11-10', lastReachedOn: null },
      formatDate,
    );
    expect(card.value).toBe('4 attempts · no one reached');
    expect(card.copy).toBe('Shepherd calls: 4 attempts · no one reached');
    expect(card.empty).toBe(false);
  });

  it('keeps the prefix and names the last reached date', () => {
    const card = shepherdCallsCard(
      {
        attempts: 6,
        conversations: 4,
        lastCalledOn: '2026-11-14',
        lastReachedOn: '2026-11-14',
      },
      formatDate,
    );
    expect(card.value).toBe('6 · last reached 14 Nov 2026');
    expect(card.copy).toBe('Shepherd calls: 6 · last reached 14 Nov 2026');
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

  it('renders the drawing values and captions', () => {
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
    expect(cards[0]?.lines).toEqual(['Q4 2026 · 3', 'November · 2']);
    expect(cards[0]?.caption).toBe('UTC calendar dates across 1 series rows');
    expect(cards[1]?.lines).toEqual(['Sunday Service', '22 Nov 2026']);
    expect(cards[1]?.caption).toBe('Latest entry; ties by event name');
    expect(cards[2]?.copy).toBe('Shepherd calls: 6 · last reached 14 Nov 2026');
    expect(cards[3]?.lines).toEqual(['Sunday Service · 3 times']);
    expect(cards[3]?.caption).toBe('Grouped by series; standalone by event');
  });

  it('states the empty copies and zero counts', () => {
    const cards = overviewCards({ attendance: [], calls: NO_CALLS }, { formatDate, now: NOW });

    expect(cards[0]?.lines).toEqual(['Q4 2026 · 0', 'November · 0']);
    expect(cards[0]?.caption).toBe('UTC calendar dates across 0 series rows');
    expect(cards[1]?.lines).toEqual(['No attendance recorded']);
    expect(cards[1]?.empty).toBe(true);
    expect(cards[2]?.lines).toEqual(['No calls logged']);
    expect(cards[2]?.empty).toBe(true);
    expect(cards[3]?.lines).toEqual(['No attendance recorded']);
    expect(cards[3]?.empty).toBe(true);
  });
});
