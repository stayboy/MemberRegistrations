import { describe, expect, it } from 'vitest';
import type { EventSessionItem } from '../api/events';
import {
  EVENT_STATUS_LABELS,
  SESSION_SOURCE_LABELS,
  SESSION_STATUS_LABELS,
  VENUE_LABELS,
  eventStatusLabel,
  formatDateRange,
  formatPresentExpected,
  formatTimeRange,
  ministryLabel,
  offeringsLabel,
  seriesColumnLabel,
  seriesLabel,
  sessionAttendanceLabels,
  sessionSourceLabel,
  sessionStatusLabel,
  venueLabel,
} from './events';

const SESSION: EventSessionItem = {
  date: '2026-10-13',
  startTime: '17:30',
  endTime: '20:30',
  status: 'held',
  present: 86,
  expected: 120,
  importedRows: 86,
  source: 'import',
};

describe('event labels', () => {
  it('names every venue, event status, session status and source', () => {
    expect(VENUE_LABELS).toEqual({
      auditorium: 'Auditorium',
      virtual: 'Virtual',
      hybrid: 'Hybrid',
    });
    expect(EVENT_STATUS_LABELS).toEqual({
      draft: 'Draft',
      scheduled: 'Scheduled',
      held: 'Held',
      cancelled: 'Cancelled',
      archived: 'Archived',
    });
    expect(SESSION_STATUS_LABELS).toEqual({
      scheduled: 'Scheduled',
      held: 'Held',
      cancelled: 'Cancelled',
    });
    expect(SESSION_SOURCE_LABELS).toEqual({
      import: 'Import',
      manual: 'Manual',
      mixed: 'Mixed',
      none: 'None',
    });

    expect(venueLabel('hybrid')).toBe('Hybrid');
    expect(eventStatusLabel('cancelled')).toBe('Cancelled');
    expect(sessionStatusLabel('held')).toBe('Held');
    expect(sessionSourceLabel('mixed')).toBe('Mixed');
  });

  it('uses the event name as the series label, or Standalone when unlinked', () => {
    expect(seriesLabel({ name: 'Sunday Main English Service', seriesId: 'series-1' })).toBe(
      'Sunday Main English Service',
    );
    expect(seriesLabel({ name: 'Strategic Conference', seriesId: null })).toBe('Standalone');
  });

  it('does not repeat the event name in the Series column', () => {
    expect(seriesColumnLabel({ name: 'Sunday Main English Service', seriesId: 'series-1' })).toBe(
      'Series',
    );
    expect(seriesColumnLabel({ name: 'Strategic Conference', seriesId: null })).toBe('Standalone');
  });

  it('renders the ministry as code and name, or a dash', () => {
    expect(ministryLabel({ code: 'CHOIR', name: 'Choir' })).toBe('CHOIR — Choir');
    expect(ministryLabel(null)).toBe('—');
  });
});

describe('event formatting', () => {
  it('renders the API present/expected pair without deriving a total', () => {
    expect(formatPresentExpected(SESSION)).toBe('86/120');
    expect(formatPresentExpected({ present: 0, expected: 0 })).toBe('0/0');
  });

  it('joins per-session attendance pairs in session order', () => {
    expect(
      sessionAttendanceLabels([
        SESSION,
        { ...SESSION, date: '2026-10-14', present: 92, expected: 120 },
      ]),
    ).toBe('86/120 · 92/120');
    expect(sessionAttendanceLabels([])).toBe('');
  });

  it('formats a start/end time range, or a lone start time', () => {
    expect(formatTimeRange('17:30', '20:30')).toBe('17:30–20:30');
    expect(formatTimeRange('17:30', null)).toBe('17:30');
  });

  it('formats one date for a single day and a range otherwise', () => {
    expect(formatDateRange('2026-11-02', '2026-11-02')).toBe('2 November 2026');
    expect(formatDateRange('2026-10-13', '2026-10-15')).toBe('13 October 2026 – 15 October 2026');
  });

  it('labels offering counts', () => {
    expect(offeringsLabel(0)).toBe('0 offerings');
    expect(offeringsLabel(1)).toBe('1 offering');
    expect(offeringsLabel(3)).toBe('3 offerings');
  });
});
