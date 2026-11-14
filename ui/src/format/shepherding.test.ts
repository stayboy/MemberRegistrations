import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import {
  OUTCOME_LABELS,
  STILL_IN_CHURCH_LABELS,
  createEmptyCallForm,
  currentAssignmentOf,
  daysSinceLastCall,
  isFollowUp,
  isStaleAssignment,
  lastCallBadge,
  outcomeLabel,
  stillInChurchLabel,
  validateCall,
  validateReason,
  type CallFormValues,
} from './shepherding';

describe('shepherding labels', () => {
  it('names every call outcome and still-in-church state', () => {
    expect(OUTCOME_LABELS.reached).toBe('Reached');
    expect(OUTCOME_LABELS.no_answer).toBe('No answer');
    expect(OUTCOME_LABELS.wrong_number).toBe('Wrong number');
    expect(STILL_IN_CHURCH_LABELS.yes).toBe('Still in church');
    expect(STILL_IN_CHURCH_LABELS.no).toBe('No longer in church');
    expect(STILL_IN_CHURCH_LABELS.unknown).toBe('Unknown');

    expect(outcomeLabel('reached')).toBe('Reached');
    expect(outcomeLabel(null)).toBe('—');
    expect(stillInChurchLabel('yes')).toBe('Still in church');
    expect(stillInChurchLabel(null)).toBe('Never reported');
  });
});

describe('isFollowUp', () => {
  it('treats never called as a follow-up', () => {
    expect(isFollowUp({ lastCalledOn: null }, '2026-11-04')).toBe(true);
  });

  it('is false at exactly 30 days and true at 31', () => {
    expect(isFollowUp({ lastCalledOn: '2026-10-05' }, '2026-11-04')).toBe(false);
    expect(isFollowUp({ lastCalledOn: '2026-10-04' }, '2026-11-04')).toBe(true);
  });

  it('counts UTC calendar days, not local elapsed hours', () => {
    expect(isFollowUp({ lastCalledOn: '2026-09-01' }, '2026-10-01')).toBe(false);
    expect(isFollowUp({ lastCalledOn: '2026-08-31' }, '2026-10-01')).toBe(true);
  });

  it('does not flag a call logged today', () => {
    expect(isFollowUp({ lastCalledOn: '2026-11-04' }, '2026-11-04')).toBe(false);
  });
});

describe('daysSinceLastCall and lastCallBadge', () => {
  it('counts whole UTC days and reports none for a never-called row', () => {
    expect(daysSinceLastCall({ lastCalledOn: null }, '2026-11-04')).toBeNull();
    expect(daysSinceLastCall({ lastCalledOn: '2026-10-04' }, '2026-11-04')).toBe(31);
    expect(daysSinceLastCall({ lastCalledOn: '2026-11-04' }, '2026-11-04')).toBe(0);
  });

  it('badges never called and 31 quiet days, but not the 30-day boundary', () => {
    expect(lastCallBadge({ lastCalledOn: null }, '2026-11-04')).toBe('Never called');
    expect(lastCallBadge({ lastCalledOn: '2026-10-04' }, '2026-11-04')).toBe('Quiet 31d');
    expect(lastCallBadge({ lastCalledOn: '2026-10-05' }, '2026-11-04')).toBeNull();
    expect(lastCallBadge({ lastCalledOn: '2026-11-04' }, '2026-11-04')).toBeNull();
  });
});

describe('createEmptyCallForm', () => {
  it('defaults calledOn to today and leaves the choices empty', () => {
    expect(createEmptyCallForm('2026-11-04')).toEqual({
      calledOn: '2026-11-04',
      outcome: '',
      stillInChurch: '',
      feedback: '',
      issue: '',
    });
  });
});

describe('validateCall', () => {
  const valid: CallFormValues = {
    calledOn: '2026-11-04',
    outcome: 'reached',
    stillInChurch: 'yes',
    feedback: 'Doing well.',
    issue: '',
  };

  it('accepts the documented call', () => {
    expect(validateCall(valid, '2026-08-06', '2026-11-04')).toEqual({});
  });

  it('rejects a future calledOn', () => {
    expect(validateCall({ ...valid, calledOn: '2026-11-05' }, '2026-08-06', '2026-11-04')).toEqual({
      calledOn: 'Called on must not be in the future.',
    });
  });

  it('rejects a calledOn before the assignment started', () => {
    expect(validateCall({ ...valid, calledOn: '2026-08-05' }, '2026-08-06', '2026-11-04')).toEqual({
      calledOn: 'Called on must not be before the assignment started.',
    });
  });

  it('requires stillInChurch only when the outcome is reached', () => {
    expect(validateCall({ ...valid, stillInChurch: '' }, '2026-08-06', '2026-11-04')).toEqual({
      stillInChurch: 'Still in church is required when the outcome is reached.',
    });
    expect(
      validateCall(
        { ...valid, outcome: 'no_answer', stillInChurch: '' },
        '2026-08-06',
        '2026-11-04',
      ),
    ).toEqual({});
  });

  it('requires a real date and an outcome', () => {
    expect(
      validateCall({ ...valid, calledOn: '2026-02-30', outcome: '' }, '2026-08-06', '2026-11-04'),
    ).toEqual({
      calledOn: 'Called on must be a real date in YYYY-MM-DD form.',
      outcome: 'Outcome is required.',
    });
  });

  it('caps feedback and issue at 2000 characters', () => {
    const long = 'x'.repeat(2001);
    expect(
      validateCall({ ...valid, feedback: long, issue: long }, '2026-08-06', '2026-11-04'),
    ).toEqual({
      feedback: 'Feedback must be 2000 characters or fewer.',
      issue: 'Issue must be 2000 characters or fewer.',
    });
  });
});

describe('validateReason', () => {
  it('requires 3 to 500 characters after trimming', () => {
    expect(validateReason('')).toBe('Reason is required.');
    expect(validateReason('   ')).toBe('Reason is required.');
    expect(validateReason('ab')).toBe('Reason must be 3–500 characters.');
    expect(validateReason('  abc  ')).toBeNull();
    expect(validateReason('x'.repeat(500))).toBeNull();
    expect(validateReason('x'.repeat(501))).toBe('Reason must be 3–500 characters.');
  });
});

describe('assignment conflict detection', () => {
  it('reads a well-formed currentAssignment extension from a 409', () => {
    const error = new ApiError(409, 'Reassignment required', {
      status: 409,
      currentAssignment: {
        id: 'assign-1',
        officerMemberNo: 'M-1',
        assignedOn: '2026-08-06',
      },
    });

    expect(isStaleAssignment(error)).toBe(true);
    expect(currentAssignmentOf(error)).toEqual({
      id: 'assign-1',
      officerMemberNo: 'M-1',
      assignedOn: '2026-08-06',
    });
  });

  it('ignores other conflicts, malformed extensions and non-API errors', () => {
    expect(isStaleAssignment(new ApiError(409, 'Already assigned'))).toBe(false);
    expect(
      isStaleAssignment(new ApiError(409, 'Bad extension', { currentAssignment: { id: 42 } })),
    ).toBe(false);
    expect(isStaleAssignment(new ApiError(422, 'Invalid'))).toBe(false);
    expect(isStaleAssignment(new Error('network'))).toBe(false);
  });
});
