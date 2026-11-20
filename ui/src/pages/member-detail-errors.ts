import { ApiError } from '../api/errors';

/** The fallback when the API returns no message of its own. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

/** 404/409/422 carry a domain reason; show it inline, not as a banner. */
export function inlineActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && [404, 409, 422].includes(error.status)) {
    return error.message;
  }
  return fallback;
}

/**
 * The refusals of `POST …/verification/otp` (MR-24, MR-27, MR-35, AC-MR46). Each
 * says what happened and what the officer can do, because the response never
 * carries a code or a destination value.
 */
export function verificationErrorMessage(
  error: unknown,
  fallback = 'The code could not be sent. Check the connection and try again.',
): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      if (error.problem?.code === 'already_verified') {
        return 'Every contact this member owns is already proven, or an officer confirmed the member.';
      }
      return 'This member has no email, phone or WhatsApp number to verify.';
    }
    if (error.status === 429) {
      return 'A code was requested too recently, or five were sent this hour. Try again later.';
    }
    if (error.status === 503) {
      return 'No messaging channel is configured, so no code was sent.';
    }
  }
  return fallback;
}
