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
