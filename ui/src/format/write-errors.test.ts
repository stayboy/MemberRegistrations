import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { writeFailure } from './write-errors';

/**
 * FR-42g/AC-64: the banner is chosen by the problem+json `code`, not by the
 * message text. Two failures with the same status and different codes must not
 * be told the same thing, and an unknown code keeps the surface's own title.
 */
describe('writeFailure', () => {
  it('titles each event write code by its code, whatever the message says', () => {
    expect(
      writeFailure(new ApiError(409, 'Anything at all', { code: 'event_draft' }), 'Fallback'),
    ).toEqual({ title: 'The event is still a draft', message: 'Anything at all' });
    expect(
      writeFailure(new ApiError(409, 'Anything at all', { code: 'recurrence' }), 'Fallback'),
    ).toEqual({ title: 'This event has no recurrence to change', message: 'Anything at all' });
    expect(
      writeFailure(new ApiError(409, 'Anything at all', { code: 'status' }), 'Fallback'),
    ).toEqual({ title: 'The API refused this status change', message: 'Anything at all' });
  });

  it('keeps the surface title for an uncoded or unrecognised failure', () => {
    expect(
      writeFailure(new ApiError(422, 'The date is invalid'), 'The date was not cancelled'),
    ).toEqual({ title: 'The date was not cancelled', message: 'The date is invalid' });
    expect(
      writeFailure(new ApiError(409, 'Conflict', { code: 'not_a_known_code' }), 'Fallback'),
    ).toEqual({ title: 'Fallback', message: 'Conflict' });
  });

  it('falls back to a connection sentence when the error carries no message', () => {
    expect(writeFailure(new Error('   '), 'Fallback')).toEqual({
      title: 'Fallback',
      message: 'Check the API connection and try again.',
    });
  });
});
