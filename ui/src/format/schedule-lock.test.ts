import { describe, expect, it } from 'vitest';
import { lockReasonsFromProblem, scheduleLockCauses, scheduleLockSentence } from './schedule-lock';

/**
 * FR-42h/AC-66: the read names closed codes, and the summary and the `409` banner
 * both render them through this one module, so the cause a locked event shows is
 * the cause the API reported.
 */

const formatDate = (value: string | null | undefined): string =>
  value === null || value === undefined ? '' : `Thu ${value}`;

describe('scheduleLockSentence', () => {
  it('names each cause with the date the API carried', () => {
    expect(
      scheduleLockSentence(
        [
          { code: 'occurrence_started', date: '2026-12-03' },
          { code: 'offering_counted', date: '2026-12-10' },
          { code: 'attendance_recorded', date: '2026-12-17' },
          { code: 'import_suppressed', date: '2026-12-24' },
        ],
        formatDate,
      ),
    ).toBe(
      'An occurrence started on Thu 2026-12-03, an offering count was recorded on Thu 2026-12-10, attendance was recorded on Thu 2026-12-17 and an import suppressed a row on Thu 2026-12-24.',
    );
  });

  it('distinguishes an event-level offering from one attached to an occurrence', () => {
    expect(
      scheduleLockCauses(
        [
          { code: 'offering_attached', date: null },
          { code: 'offering_attached', date: '2026-12-03' },
        ],
        formatDate,
      ),
    ).toEqual([
      'an offering is attached to the event',
      'an offering is attached to the occurrence on Thu 2026-12-03',
    ]);
  });

  it('joins two causes with and, and is null when there are none', () => {
    expect(
      scheduleLockSentence(
        [
          { code: 'occurrence_started', date: '2026-12-03' },
          { code: 'offering_attached', date: null },
        ],
        formatDate,
      ),
    ).toBe('An occurrence started on Thu 2026-12-03 and an offering is attached to the event.');
    expect(scheduleLockSentence([], formatDate)).toBeNull();
  });
});

describe('lockReasonsFromProblem', () => {
  it('reads the closed codes the 409 carried and drops anything else', () => {
    expect(
      lockReasonsFromProblem({
        code: 'recurrence_locked',
        reasons: [
          { code: 'offering_counted', date: '2026-12-03' },
          { code: 'not_a_code', date: '2026-12-04' },
          { code: 'occurrence_started' },
          'nonsense',
        ],
      }),
    ).toEqual([
      { code: 'offering_counted', date: '2026-12-03' },
      { code: 'occurrence_started', date: null },
    ]);
  });

  it('is empty when the body carried no reasons', () => {
    expect(lockReasonsFromProblem(null)).toEqual([]);
    expect(lockReasonsFromProblem({ code: 'recurrence_locked' })).toEqual([]);
  });
});
