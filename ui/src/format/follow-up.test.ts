import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { isFollowUpEligible, officerNoteProblem, officerProblemMessage } from './follow-up';

describe('isFollowUpEligible', () => {
  it('accepts a presbyter who is not archived and not purged', () => {
    expect(isFollowUpEligible({ isPresbyter: true, archivedAt: null, purgedAt: null })).toBe(true);
  });

  it('rejects a presbyter who is archived', () => {
    expect(
      isFollowUpEligible({
        isPresbyter: true,
        archivedAt: '2026-01-05T09:00:00.000Z',
        purgedAt: null,
      }),
    ).toBe(false);
  });

  it('rejects a member who is not a presbyter', () => {
    expect(isFollowUpEligible({ isPresbyter: false, archivedAt: null, purgedAt: null })).toBe(
      false,
    );
  });

  it('rejects a purged presbyter, as the API does', () => {
    expect(
      isFollowUpEligible({
        isPresbyter: true,
        archivedAt: null,
        purgedAt: '2026-02-01T00:00:00Z',
      }),
    ).toBe(false);
  });
});

describe('officerProblemMessage', () => {
  it('claims an officer_required rejection with the API sentence', () => {
    const error = new ApiError(
      422,
      'The member has no active shepherd; supply an active presbyter',
      {
        code: 'officer_required',
      },
    );
    expect(officerProblemMessage(error)).toBe(
      'The member has no active shepherd; supply an active presbyter',
    );
  });

  it('claims a validation_error whose detail names the officer fields', () => {
    const error = new ApiError(422, 'officerReason: Too big', {
      code: 'validation_error',
    });
    expect(officerProblemMessage(error)).toBe('officerReason: Too big');
  });

  // FR-26a's second rejection: `src/repos/pledges.ts:713` throws a `ValidationError` whose sentence
  // never says "officer", only "presbyter". Without this it would fall through to the error bar.
  it('claims the API’s "not an active presbyter" rejection', () => {
    const error = new ApiError(422, 'Member PL-9001 is not an active presbyter', {
      code: 'validation_error',
    });
    expect(officerProblemMessage(error)).toBe('Member PL-9001 is not an active presbyter');
  });

  // A note-length detail is an officer-field issue too: the note lives on `officerReason`.
  it('claims a note-length detail', () => {
    const error = new ApiError(
      422,
      'officerReason: Too big: expected string to have <=500 characters',
      { code: 'validation_error' },
    );
    expect(officerProblemMessage(error)).toBe(
      'officerReason: Too big: expected string to have <=500 characters',
    );
  });

  // Every issue has to belong to the officer field family: the API joins zod issues with '; ', so a
  // mixed detail describes more than this field and the error bar keeps it whole.
  it('claims a joined detail whose every issue is about the officer field', () => {
    const error = new ApiError(422, 'officerReason: Too big; followUpOfficerMemberNo: Required', {
      code: 'validation_error',
    });
    expect(officerProblemMessage(error)).toBe(
      'officerReason: Too big; followUpOfficerMemberNo: Required',
    );
  });

  it('leaves a mixed officer and expectedOn detail in the error bar', () => {
    const error = new ApiError(
      422,
      'officerReason: Too big: expected string to have <=500 characters; expectedOn: Too small: expected string to have >=10 characters',
      { code: 'validation_error' },
    );
    expect(officerProblemMessage(error)).toBeNull();
  });

  it('leaves any other validation_error in the error bar', () => {
    const error = new ApiError(422, 'amountMinor: Too small', { code: 'validation_error' });
    expect(officerProblemMessage(error)).toBeNull();
  });

  it('leaves a non-problem failure in the error bar', () => {
    expect(
      officerProblemMessage(new ApiError(500, 'The recorded pledge response was empty.')),
    ).toBeNull();
    expect(officerProblemMessage(new Error('network'))).toBeNull();
  });
});

describe('officerNoteProblem', () => {
  it('accepts an empty note, a short note and exactly 500 characters', () => {
    expect(officerNoteProblem('')).toBeNull();
    expect(officerNoteProblem('   ')).toBeNull();
    expect(officerNoteProblem('a')).toBeNull();
    expect(officerNoteProblem('  abc  ')).toBeNull();
    expect(officerNoteProblem('a'.repeat(500))).toBeNull();
    // The cap counts the trimmed value, as the API's schema does.
    expect(officerNoteProblem(`  ${'a'.repeat(500)}  `)).toBeNull();
  });

  it('rejects a note longer than 500 characters once trimmed', () => {
    expect(officerNoteProblem('a'.repeat(501))).toBe(
      'The note for the follow-up officer must be 500 characters or fewer.',
    );
  });
});
