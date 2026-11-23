export interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly [extension: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;

  constructor(status: number, message: string, problem: ProblemDetails | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

/** Parses application/problem+json without exposing stack traces or SQL. */
export async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails | null = null;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const candidate = body as ProblemDetails;
      problem = candidate;
    }
  } catch {
    problem = null;
  }

  const message =
    problem?.detail?.trim() ||
    problem?.title?.trim() ||
    `The request failed with status ${response.status}.`;

  return new ApiError(response.status, message, problem);
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * The problem+json `code` a surface maps by (FR-42g). The status alone is not
 * enough: several `409`s mean different things, so a surface reads the code and
 * never the message text. Null when the body carried none.
 */
export function problemCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = error.problem?.code;
  return typeof code === 'string' && code.trim() ? code : null;
}
