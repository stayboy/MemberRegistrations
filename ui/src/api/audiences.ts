import { ApiError } from './errors';
import { gatewayRequest } from './gateway';

/**
 * Audiences are reference data (`src/schemas/audiences.ts`). The rule travels as
 * structured clauses and the API renders `summary`; a client never composes or
 * evaluates one (FR-42c, AC-60).
 */

export type AudienceOperator = 'allOf' | 'anyOf' | 'noneOf';

export type AudienceClauseInput =
  | { readonly attribute: 'ministry'; readonly ministryCode: string }
  | { readonly attribute: 'presbyter'; readonly value: true }
  | {
      readonly attribute: 'ageBand';
      readonly minYears: number;
      readonly maxYears: number | null;
    }
  | { readonly attribute: 'gender'; readonly value: 'male' | 'female' }
  | {
      readonly attribute: 'membershipStatus';
      readonly value: 'visitor' | 'active';
    };

/** The rule as `PUT`/`POST` write it: one operator over a flat clause list. */
export interface AudienceRuleInput {
  readonly operator: AudienceOperator;
  readonly clauses: readonly AudienceClauseInput[];
}

/** Mirrors `audienceSchema`; `summary` is server-rendered and never composed. */
export interface AudienceItem {
  readonly id: string;
  readonly name: string;
  /** True for a seeded audience; system audiences are read-only. */
  readonly system: boolean;
  readonly systemKey: string | null;
  readonly active: boolean;
  readonly rule: AudienceRuleInput;
  /** Server-rendered by `renderAudienceSummary`. */
  readonly summary: string;
  readonly createdAt: string;
  readonly createdBy: string | null;
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}

/** Mirrors `createAudienceSchema`. */
export interface CreateAudienceInput {
  readonly name: string;
  readonly rule: AudienceRuleInput;
}

export interface ListAudiencesOptions {
  /** The picker asks for the offered set: active rows, plus any the caller keeps. */
  readonly includeArchived?: boolean;
  readonly signal?: AbortSignal;
}

export const AUDIENCES_PATH = '/gateway/v1/audiences';

export function audiencesListPath(includeArchived?: boolean): string {
  return includeArchived ? `${AUDIENCES_PATH}?includeArchived=true` : AUDIENCES_PATH;
}

/** `GET /v1/audiences`: system and custom audiences with their rules and summaries. */
export async function listAudiences(
  baseUrl: string,
  sessionToken: string,
  options: ListAudiencesOptions = {},
): Promise<AudienceItem[]> {
  const result = await gatewayRequest<{ readonly items: readonly AudienceItem[] }>(
    baseUrl,
    audiencesListPath(options.includeArchived),
    { sessionToken, signal: options.signal },
  );
  return [...(result?.items ?? [])];
}

/**
 * `POST /v1/audiences`: creates a custom audience and answers `201` with the
 * created row, whose `summary` the picker then shows. A system audience is never
 * created here; a duplicate name is `409 audience_name_in_use` and an invalid
 * rule is `422 validation_error`.
 */
export async function createAudience(
  baseUrl: string,
  sessionToken: string,
  input: CreateAudienceInput,
): Promise<AudienceItem> {
  const result = await gatewayRequest<AudienceItem>(baseUrl, AUDIENCES_PATH, {
    method: 'POST',
    sessionToken,
    body: input,
  });
  if (!result) throw new ApiError(500, 'The created audience response was empty.');
  return result;
}
