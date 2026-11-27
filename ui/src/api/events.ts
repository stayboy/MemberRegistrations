import { ApiError } from './errors';
import { gatewayRequest, gatewayRequestWithMeta } from './gateway';
import type { Gender } from './members';
import type { SeriesSummaryDto } from './series';

/**
 * Wire types mirror `src/schemas/events.ts` and the event DTOs in
 * `src/repos/events.ts`. The event list is used by the attendance import picker
 * and the events screen, so the base `EventListItem` keeps the picker's subset
 * and `EventItem` adds the fields the list and detail render.
 *
 * The parent read (`view=parent`, FR-4/FR-5/FR-6) is a separate shape: one row
 * per event with its audience, recurrence, window occurrences and summary.
 */

export type EventStatus = 'draft' | 'active' | 'scheduled' | 'held' | 'cancelled' | 'archived';
/** The parent read's stored status; the derived occurrence status is per date. */
export type EventParentStatus = 'draft' | 'active' | 'archived';
export type EventSessionStatus = 'scheduled' | 'held' | 'cancelled';
export type EventVenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventSource = 'series' | 'manual' | 'import';
export type SessionSource = 'import' | 'manual' | 'mixed' | 'none';

/** The subset of a session the attendance import picker needs. */
export interface EventSessionSummary {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly status: EventSessionStatus;
  readonly venueType?: EventVenueType;
  /**
   * The latest capture of either channel, with the session's shared close state
   * (FR-4b). Null when the session has no capture.
   */
  readonly capture: { readonly asOf: string; readonly ended: boolean } | null;
  /** A non-empty reason when the session is cancelled; null on a legacy cancellation (FR-4a). */
  readonly note: string | null;
}

/** Mirrors `EventSessionItem`: one dated session and its attendance summary. */
export interface EventSessionItem extends EventSessionSummary {
  readonly present: number;
  readonly expected: number;
  readonly importedRows: number;
  readonly source: SessionSource;
}

export interface EventOfferingStatsItem {
  readonly attachedEvents: number;
  readonly pledgedMinor: number;
  readonly paidMinor: number;
  readonly pendingMinor: number;
  readonly honorRate: number;
  readonly contributionCount: number;
}

export interface OfferingTermsItem {
  readonly version: number;
  readonly name: string | null;
  readonly purpose: string;
  readonly kind: 'freewill' | 'tithe' | 'building' | 'missions' | 'other';
  readonly currency: string;
  readonly targetMinor: number | null;
  readonly defaultAmountMinor: number | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly availableUntil: string | null;
  readonly scripture: string | null;
  readonly gatewayAccount: string | null;
  readonly gatewayMetadata: Readonly<Record<string, string>> | null;
  /** Audit (NFR-3): who published this version, when, and why. */
  readonly createdAt: string;
  readonly createdBy: string;
  /** Null for version 1; required on every later version. */
  readonly reason: string | null;
}

export interface EventOfferingItem {
  readonly offeringId: string;
  /** Resolved by the API; the UI must not compose the display name. */
  readonly name: string;
  /** The effective expiry: attachment date, else terms date, else event end. */
  readonly availableUntil: string | null;
  readonly expired: boolean;
  readonly terms: OfferingTermsItem;
  readonly exceptions: readonly {
    readonly date: string;
    readonly kind: 'skip' | 'opt_in';
    readonly note: string | null;
  }[];
  readonly stats: EventOfferingStatsItem;
}

/** Mirrors `EventItem`; offerings are resolved in the same request. */
export interface EventItem extends EventListItem {
  readonly seriesId: string | null;
  readonly ministry: { readonly code: string; readonly name: string } | null;
  readonly timezone: string;
  readonly endDate: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly venueType: EventVenueType;
  readonly venueName: string | null;
  readonly description: string | null;
  readonly source: EventSource;
  /** False = headcount-only; per-member attendance does not apply. */
  readonly tracksMembers: boolean;
  /** Presbyter-only events are hidden from non-presbyters and roster the presbyters. */
  readonly presbyterOnly: boolean;
  readonly sessions: readonly EventSessionItem[];
  readonly offerings: readonly EventOfferingItem[];
  readonly stats: EventOfferingStatsItem;
}

/** Mirrors `audienceSummarySchema`; `summary` is rendered by the server. */
export interface EventAudienceItem {
  readonly id: string;
  readonly name: string;
  readonly system: boolean;
  /** Server-rendered by `renderAudienceSummary`; never composed by a client. */
  readonly summary: string;
}

/** Mirrors `eventRecurrenceSchema.schedules`. */
export interface EventRecurrenceSchedule {
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn: string | null;
}

/** Mirrors `eventRecurrenceSchema.exceptions`. */
export interface EventRecurrenceException {
  readonly date: string;
  readonly kind: 'cancelled' | 'extra';
  readonly note: string | null;
}

/** Mirrors `eventRecurrenceSchema`; null on a standalone event. */
export interface EventRecurrence {
  readonly schedules: readonly EventRecurrenceSchedule[];
  readonly exceptions: readonly EventRecurrenceException[];
}

/**
 * Mirrors `EVENT_SCHEDULE_LOCK_CODES`: the closed cause set the parent read
 * reports and the write guard calls. A cause with `date: null` is an offering
 * attached to the event itself; every other cause names the occurrence it found.
 */
export type EventScheduleLockCode =
  | 'occurrence_started'
  | 'offering_attached'
  | 'offering_counted'
  | 'attendance_recorded'
  | 'import_suppressed';

/** One cause that closes the edit form's schedule guard (FR-42h). */
export interface EventScheduleLockReason {
  readonly code: EventScheduleLockCode;
  readonly date: string | null;
}

/**
 * Mirrors `EventScheduleGuardState`: the edit guard on the read and behind the
 * write. Both are computed by the same server function, so the form can never
 * offer an edit the write refuses.
 */
export interface EventScheduleGuard {
  readonly locked: boolean;
  readonly reasons: readonly EventScheduleLockReason[];
}

/**
 * The period `day` vocabulary: three-letter, upper case. It is **deliberately
 * not** the rrule's two-letter `MO`-`SU`, so a stored period day can never be
 * read as a fragment of an rrule (owner, 2026-11-25); mirrors `PERIOD_DAYS` in
 * `src/schemas/events.ts`. The labels live in `format/period.ts`.
 */
export type PeriodDay = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

/** Mirrors `eventPeriodSchema`: the catalogue row `GET /v1/events/periods` serves. */
export interface EventPeriodItem {
  readonly id: string;
  readonly name: string;
  /** The declared rule, in the parish's words; the form shows it beside the choice. */
  readonly definition: string;
  /**
   * The wire projection of the resolver's shape, served by the catalogue: a
   * `week` period returns seven dates and may take a `day`; a `date` period
   * (Home Cells) returns one date and refuses it. Required, because the form
   * hides the day control for a `date` period rather than offer one the server
   * would reject.
   */
  readonly dates: 'week' | 'date';
}

/** The period an event was created from (`null` when it was not). */
export interface EventPeriodProvenance {
  readonly id: string;
  /** The name as it was written at save - a snapshot, never a live lookup. */
  readonly name: string;
  /** `YYYY-MM` for a one-off period event; null when the period recurs. */
  readonly cycle: string | null;
  /** `monthly` for a period recurrence; null for a one-off. */
  readonly frequency: 'monthly' | null;
  /** A weekday inside each cycle's period (`MON`-`SUN`); null for a whole week or a single date. */
  readonly day: PeriodDay | null;
}

/**
 * The **single event read's** period: the provenance plus the two facts only the
 * detail draws (owner, 2026-11-27). Both are projected from the same code
 * catalogue `GET /v1/events/periods` serves, so the detail and the catalogue
 * cannot disagree. The list carries the provenance alone.
 */
export interface EventPeriodDetail extends EventPeriodProvenance {
  /**
   * The resolver's shape, projected: `week` resolves to seven dates, `date` to
   * one. Null only for a period id the catalogue no longer holds, which the
   * closed id set makes unreachable today; the line then makes no span claim.
   */
  readonly dates: 'week' | 'date' | null;
  /** The catalogue's prose for the period, read live; empty when it has no row. */
  readonly definition: string;
}

/**
 * The create's period arm, exactly as the contract reads it: `{ id, cycleMonth }`
 * resolves one cycle once, on the server, into that month's dates;
 * `{ id, frequency: 'monthly', day?, effectiveFrom? }` stores a period rule that
 * generates one date per cycle. `day` is the period's own `MON`-`SUN` vocabulary
 * and is refused for a single-date period; `effectiveFrom` anchors the 90-day
 * window and is input-only.
 */
export type CreateEventPeriodInput =
  | { readonly id: string; readonly cycleMonth: string }
  | {
      readonly id: string;
      readonly frequency: 'monthly';
      readonly day?: PeriodDay;
      readonly effectiveFrom?: string;
    };

/** `POST /v1/events/preview`: the create's own shapes, resolved without persisting. */
export interface EventPreviewInput {
  readonly audienceIds?: readonly string[];
  readonly audienceId?: string;
  readonly recurrence?: CreateEventRecurrenceInput;
  readonly period?: CreateEventPeriodInput;
}

export interface EventPreviewOccurrence {
  readonly date: string;
  /** The intersection count at that date, not a sum of the audiences. */
  readonly expected: number;
}

export interface EventPreview {
  readonly occurrences: readonly EventPreviewOccurrence[];
  readonly audienceCounts: readonly { readonly id: string; readonly count: number }[];
}

/**
 * Mirrors `eventOccurrenceSchema`: a dated child of the event. `status` is the
 * API's derived status, `expected` is the transitional roster count and
 * `legacyEventNo` is read-only history.
 */
export interface EventOccurrenceItem {
  readonly id: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly status: EventSessionStatus;
  readonly venueType?: EventVenueType;
  readonly capture: { readonly asOf: string; readonly ended: boolean } | null;
  readonly note: string | null;
  readonly present: number;
  readonly expected: number;
  readonly importedRows: number;
  readonly source: SessionSource;
  readonly legacyEventNo: string | null;
}

/** Mirrors `eventWindowSummarySchema` (the `seriesSummarySchema` shape). */
export type EventWindowSummary = SeriesSummaryDto;

/** Mirrors `eventParentSchema`: one row per event parent. */
export interface EventParentItem {
  readonly id: string;
  readonly eventNo: string;
  readonly name: string;
  /** The ordered audience set; the first is the primary. */
  readonly audienceIds: readonly string[];
  readonly audiences: readonly EventAudienceItem[];
  /** The legacy primary alias, kept for one round beside `audiences[]`. */
  readonly audienceId: string;
  readonly audience: EventAudienceItem;
  /** What the event was created from; null when it was not a period event. */
  readonly period: EventPeriodProvenance | null;
  readonly ministry: { readonly code: string; readonly name: string } | null;
  readonly presbyterOnly: boolean;
  readonly timezone: string;
  readonly description: string | null;
  readonly venueType: EventVenueType;
  readonly venueName: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly tracksMembers: boolean;
  readonly status: EventParentStatus;
  /** The edit guard's wire form; computed by the same function the write guard calls. */
  readonly schedule: EventScheduleGuard;
  readonly recurrence: EventRecurrence | null;
  readonly occurrences: readonly EventOccurrenceItem[];
  readonly offerings: readonly EventOfferingItem[];
  readonly stats: EventOfferingStatsItem;
  readonly summary: EventWindowSummary;
}

/**
 * Mirrors `eventParentDetailSchema`: the **single event read**. The same parent,
 * with the period's catalogue shape and prose; the list carries the provenance
 * alone, so this is the only shape with `period.dates` and `period.definition`.
 */
export interface EventParentDetailItem extends EventParentItem {
  readonly period: EventPeriodDetail | null;
}

export interface EventListItem {
  readonly id: string;
  /** Null for a series-minted instance that has not been numbered yet. */
  readonly eventNo: string | null;
  readonly name: string;
  /** Null for a standalone event; attendance imports require a series-backed event. */
  readonly seriesId: string | null;
  readonly startDate: string;
  /** The event's IANA zone: the session window and capture times use it. */
  readonly timezone: string;
  readonly status: EventStatus;
  readonly sessions: readonly EventSessionSummary[];
}

/**
 * The create body's date row (FR-42b): a UTC date and optional times. A blank
 * time inherits the event's, so the form omits it.
 */
export interface CreateEventOccurrenceInput {
  readonly date: string;
  readonly startTime?: string;
  readonly endTime?: string | null;
}

/** One schedule version, as `POST /v1/events` writes its first recurrence. */
export interface CreateEventScheduleInput {
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn?: string | null;
}

/**
 * Mirrors `eventRecurrenceInputSchema`: a recurring event's first schedule
 * version. `rrule` is the body only — `COUNT`/`UNTIL` are refused, `endsOn` ends
 * it. The API generates the first window from it.
 */
export interface CreateEventRecurrenceInput {
  readonly schedules: readonly CreateEventScheduleInput[];
  readonly exceptions?: readonly {
    readonly date: string;
    readonly kind: 'cancelled' | 'extra';
    readonly note?: string | null;
  }[];
}

/**
 * Mirrors `createEventParentSchema` (FR-42a): the parent as a draft with either
 * manual `occurrences`, one `recurrence`, or a named `period`, never two of them.
 * `eventNo` is absent because the server mints it and refuses a client value by
 * name (AC 8); the retired `ministry`, `presbyterOnly` and the derived range are
 * not part of the payload.
 */
export interface CreateEventParentInput {
  readonly name: string;
  /** The ordered set; the first is the primary. At least one entry. */
  readonly audienceIds?: readonly string[];
  readonly timezone?: string;
  readonly description?: string | null;
  readonly venueType: EventVenueType;
  readonly venueName?: string | null;
  readonly startTime: string;
  readonly endTime?: string | null;
  readonly tracksMembers?: boolean;
  readonly occurrences?: readonly CreateEventOccurrenceInput[];
  readonly recurrence?: CreateEventRecurrenceInput;
  readonly period?: CreateEventPeriodInput;
}

export type CreateEventParentPayload = CreateEventParentInput;

/**
 * Mirrors `updateEventParentSchema`: the same parent fields without the
 * recurrence or period, all optional. `eventNo` is immutable and refused by
 * name; `status` is the activate/archive move. `audienceIds` replaces the set.
 */
export interface UpdateEventParentInput {
  readonly name?: string;
  readonly audienceIds?: readonly string[];
  readonly timezone?: string;
  readonly description?: string | null;
  readonly venueType?: EventVenueType;
  readonly venueName?: string | null;
  readonly startTime?: string;
  readonly endTime?: string | null;
  readonly tracksMembers?: boolean;
  readonly status?: EventParentStatus;
}

/** The detail body plus the `ETag` header; the API sends the event itself. */
export interface EventDetail {
  readonly event: EventItem;
  readonly etag: string | null;
}

/** Mirrors `EventAttendanceRow`; there is no absence record. */
export interface EventAttendanceRow {
  /** The `attendance.id` the row delete accepts, not the member id. */
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly status: 'present';
  readonly source: 'import' | 'manual';
  /** Wall-clock time the register carried, `HH:MM`; null for a date-only row. */
  readonly sessionTime: string | null;
}

/** Mirrors `EventAttendance`. */
export interface EventAttendance {
  readonly eventId: string;
  readonly sessionDate: string;
  readonly present: number;
  readonly expected: number;
  readonly importedRows: number;
  readonly rows: readonly EventAttendanceRow[];
}

interface EventListResponse {
  readonly items: readonly EventItem[];
}

interface EventParentListResponse {
  readonly items: readonly EventParentItem[];
}

export interface ListEventsOptions {
  readonly from: string;
  readonly to: string;
  /** `view=parent` reads one row per event parent (FR-1/FR-5) and retires at the flip. */
  readonly view?: 'parent';
  /** Limits the list to one series; the series occurrence link seeds it (FR-43). */
  readonly seriesId?: string;
  /** The API caps the window at 100; the screens ask for one page of that size. */
  readonly limit?: number;
  /** The stable `(start_date, id)` page offset; omitted on the first page. */
  readonly offset?: number;
  readonly signal?: AbortSignal;
}

export const EVENTS_PATH = '/gateway/v1/events';
export const DEFAULT_EVENT_LIMIT = 100;

/** Builds the events list query in the order the API documents it. */
export function eventsListPath(options: ListEventsOptions): string {
  const params = new URLSearchParams();
  params.set('from', options.from);
  params.set('to', options.to);
  if (options.view) params.set('view', options.view);
  if (options.seriesId) params.set('seriesId', options.seriesId);
  params.set('limit', String(options.limit ?? DEFAULT_EVENT_LIMIT));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  return `${EVENTS_PATH}?${params.toString()}`;
}

/** `GET /v1/events?from&to&limit`: the date-window list, sessions included. */
export async function listEvents(
  baseUrl: string,
  sessionToken: string,
  options: ListEventsOptions,
): Promise<EventItem[]> {
  const result = await gatewayRequest<EventListResponse>(baseUrl, eventsListPath(options), {
    sessionToken,
    signal: options.signal,
  });
  if (!result) throw new ApiError(500, 'The event list response was empty.');
  return [...(result.items ?? [])];
}

/**
 * `GET /v1/events?view=parent&from&to&limit`: one row per event parent with its
 * audience, recurrence, window occurrences and summary (FR-1/FR-5).
 */
export async function listEventParents(
  baseUrl: string,
  sessionToken: string,
  options: ListEventsOptions,
): Promise<EventParentItem[]> {
  const result = await gatewayRequest<EventParentListResponse>(
    baseUrl,
    eventsListPath({ ...options, view: 'parent' }),
    { sessionToken, signal: options.signal },
  );
  if (!result) throw new ApiError(500, 'The event list response was empty.');
  return [...(result.items ?? [])];
}

/**
 * `POST /v1/events`: the parent, a draft, with either its manual occurrences or
 * its first recurrence version. The API answers `201` with the `EventParent`
 * body — not a wrapper — and mints the number when it is omitted (FR-42a).
 */
export async function createEventParent(
  baseUrl: string,
  sessionToken: string,
  input: CreateEventParentPayload,
): Promise<EventParentItem> {
  const result = await gatewayRequest<EventParentItem>(baseUrl, EVENTS_PATH, {
    method: 'POST',
    sessionToken,
    body: input,
  });
  if (!result) throw new ApiError(500, 'The created event response was empty.');
  return result;
}

/**
 * `PATCH /v1/events/:id`: the parent's partial update. The form sends the
 * identity fields; activation is `{ status: 'active' }` alone (FR-42b). The API
 * answers `200` with the parent.
 */
export async function updateEventParent(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: UpdateEventParentInput,
): Promise<EventParentItem> {
  const result = await gatewayRequest<EventParentItem>(baseUrl, eventDetailPath(eventId), {
    method: 'PATCH',
    sessionToken,
    body: input,
  });
  if (!result) throw new ApiError(500, 'The updated event response was empty.');
  return result;
}

/** The detail path; the id is encoded for the path segment. `view=parent` carries the window. */
export interface EventParentDetailQuery {
  readonly view: 'parent';
  readonly from: string;
  readonly to: string;
}

export function eventDetailPath(eventId: string, query?: EventParentDetailQuery): string {
  const path = `${EVENTS_PATH}/${encodeURIComponent(eventId)}`;
  if (!query) return path;
  const params = new URLSearchParams();
  params.set('view', query.view);
  params.set('from', query.from);
  params.set('to', query.to);
  return `${path}?${params.toString()}`;
}

export async function getEvent(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<EventDetail> {
  const result = await gatewayRequestWithMeta<EventItem>(baseUrl, eventDetailPath(eventId), {
    sessionToken,
    signal,
  });
  if (!result.data) throw new ApiError(500, 'The event response was empty.');
  return { event: result.data, etag: result.headers.get('ETag') };
}

/**
 * `GET /v1/events/:id?view=parent&from&to`: the single event read - the parent,
 * its window occurrences and summary, and, for a period event, the period's
 * catalogue shape and prose (FR-4/FR-6a). This is a plain parent body, not the
 * legacy `{ event, etag? }` wrapper.
 */
export async function getEventParent(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  options: { readonly from: string; readonly to: string; readonly signal?: AbortSignal },
): Promise<EventParentDetailItem> {
  const result = await gatewayRequest<EventParentDetailItem>(
    baseUrl,
    eventDetailPath(eventId, { view: 'parent', from: options.from, to: options.to }),
    { sessionToken, signal: options.signal },
  );
  if (!result) throw new ApiError(500, 'The event response was empty.');
  return result;
}

// ---------------------------------------------------------------------------
// The create form's two read-only contracts: the named-period catalogue and the
// resolved-dates preview. Neither persists anything (AC-63a).
// ---------------------------------------------------------------------------

export const EVENT_PERIODS_PATH = `${EVENTS_PATH}/periods`;
export const EVENT_PREVIEW_PATH = `${EVENTS_PATH}/preview`;

/** `GET /v1/events/periods`: the active named periods, registered before `/:id`. */
export async function listEventPeriods(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<EventPeriodItem[]> {
  const result = await gatewayRequest<{ readonly items: readonly EventPeriodItem[] }>(
    baseUrl,
    EVENT_PERIODS_PATH,
    { sessionToken, signal },
  );
  return [...(result?.items ?? [])];
}

/**
 * `POST /v1/events/preview`: the dates a recurrence or a period resolves to
 * inside the create's 90-day window, with the intersection count at each date
 * and each audience's own count. No client ever expands a rule or counts a
 * member (FR-42b, AC-60, AC-63a).
 */
export async function previewEvent(
  baseUrl: string,
  sessionToken: string,
  input: EventPreviewInput,
  signal?: AbortSignal,
): Promise<EventPreview> {
  const result = await gatewayRequest<EventPreview>(baseUrl, EVENT_PREVIEW_PATH, {
    method: 'POST',
    sessionToken,
    body: input,
    signal,
  });
  if (!result) throw new ApiError(500, 'The preview response was empty.');
  return result;
}

// ---------------------------------------------------------------------------
// The detail's write verbs (FR-42e): archive, occurrence cancel and the
// recurrence's append-only versions and exceptions. Each answers with the body
// the merged contract documents, so the caller can read the new state back.
// ---------------------------------------------------------------------------

/** `POST /v1/events/:id/archive`: 200 with the archived parent. */
export function eventArchivePath(eventId: string): string {
  return `${eventDetailPath(eventId)}/archive`;
}

export async function archiveEventParent(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
): Promise<EventParentItem> {
  const result = await gatewayRequest<EventParentItem>(baseUrl, eventArchivePath(eventId), {
    method: 'POST',
    sessionToken,
  });
  if (!result) throw new ApiError(500, 'The archived event response was empty.');
  return result;
}

/**
 * `POST /v1/events/:id/occurrences/:date/cancel`: 200 with the cancelled
 * occurrence. `note` is the required reason (FR-42e/AC-64); a draft parent is
 * refused with `409 event_draft`.
 */
export interface CancelOccurrenceInput {
  readonly note: string;
}

export function eventOccurrenceCancelPath(eventId: string, date: string): string {
  return `${eventDetailPath(eventId)}/occurrences/${encodeURIComponent(date)}/cancel`;
}

export async function cancelEventOccurrence(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  date: string,
  input: CancelOccurrenceInput,
): Promise<EventOccurrenceItem> {
  const result = await gatewayRequest<EventOccurrenceItem>(
    baseUrl,
    eventOccurrenceCancelPath(eventId, date),
    { method: 'POST', sessionToken, body: input },
  );
  if (!result) throw new ApiError(500, 'The cancelled occurrence response was empty.');
  return result;
}

/**
 * `PUT /v1/events/:id/schedule`: the edit form's save, one arm only (FR-42h).
 * `effectiveFrom` is not part of the body - the server derives it from the
 * version in force - and the arm that does not match the event's type is
 * refused `422`. `day` is the period's own `MON`-`SUN` vocabulary.
 */
export interface EventScheduleWriteRecurrenceArm {
  readonly recurrence: {
    readonly rrule: string;
    readonly endsOn?: string | null;
  };
}

export interface EventScheduleWritePeriodArm {
  readonly period: {
    readonly frequency: 'monthly';
    readonly day?: PeriodDay;
  };
}

export type EventScheduleWriteInput = EventScheduleWriteRecurrenceArm | EventScheduleWritePeriodArm;

/** Mirrors `eventSchedulePeriodStateSchema`: the provenance after the write. */
export interface EventSchedulePeriodState {
  readonly id: string;
  readonly name: string;
  readonly frequency: 'monthly';
  readonly day: PeriodDay | null;
}

/**
 * Mirrors `eventScheduleWriteResultSchema`: the rule and provenance **after** the
 * write (never an echo of the request), the regenerated window, and false when
 * the window could not be produced - the rule is still saved.
 */
export interface EventScheduleWriteResult {
  readonly recurrence: EventRecurrence | null;
  readonly period: EventSchedulePeriodState | null;
  readonly occurrences: readonly EventOccurrenceItem[];
  readonly generated: boolean;
}

export function eventSchedulePath(eventId: string): string {
  return `${eventDetailPath(eventId)}/schedule`;
}

export async function writeEventSchedule(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: EventScheduleWriteInput,
): Promise<EventScheduleWriteResult> {
  const result = await gatewayRequest<EventScheduleWriteResult>(
    baseUrl,
    eventSchedulePath(eventId),
    { method: 'PUT', sessionToken, body: input },
  );
  if (!result) throw new ApiError(500, 'The schedule response was empty.');
  return result;
}

/** One appended schedule version; `rrule` is a body, never a `COUNT`/`UNTIL`. */
export interface AddEventScheduleVersionInput {
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn?: string | null;
}

export function eventRecurrenceVersionsPath(eventId: string): string {
  return `${eventDetailPath(eventId)}/recurrence/versions`;
}

/** `POST …/recurrence/versions`: 201 with the recurrence, the version appended. */
export async function addEventScheduleVersion(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: AddEventScheduleVersionInput,
): Promise<EventRecurrence> {
  const result = await gatewayRequest<EventRecurrence>(
    baseUrl,
    eventRecurrenceVersionsPath(eventId),
    {
      method: 'POST',
      sessionToken,
      body: {
        effectiveFrom: input.effectiveFrom,
        rrule: input.rrule,
        endsOn: input.endsOn ?? null,
      },
    },
  );
  if (!result) throw new ApiError(500, 'The schedule version response was empty.');
  return result;
}

/** One exception directive; the UI authors `extra` only (FR-42e). */
export interface AddEventExceptionInput {
  readonly date: string;
  readonly kind: 'cancelled' | 'extra';
  readonly note?: string | null;
}

export function eventRecurrenceExceptionsPath(eventId: string): string {
  return `${eventDetailPath(eventId)}/recurrence/exceptions`;
}

/** The remove path; the date is a UTC calendar date, encoded as one segment. */
export function eventRecurrenceExceptionPath(eventId: string, date: string): string {
  return `${eventRecurrenceExceptionsPath(eventId)}/${encodeURIComponent(date)}`;
}

/** `POST …/recurrence/exceptions`: 201 with the recurrence, the directive appended. */
export async function addEventRecurrenceException(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: AddEventExceptionInput,
): Promise<EventRecurrence> {
  const result = await gatewayRequest<EventRecurrence>(
    baseUrl,
    eventRecurrenceExceptionsPath(eventId),
    {
      method: 'POST',
      sessionToken,
      body: {
        date: input.date,
        kind: input.kind,
        note: input.note ?? null,
      },
    },
  );
  if (!result) throw new ApiError(500, 'The recurrence exception response was empty.');
  return result;
}

/**
 * `DELETE …/recurrence/exceptions/:date`: 200 with the recurrence, every
 * directive for that date removed. An exception is a schedule instruction, not
 * a record with history.
 */
export async function removeEventRecurrenceException(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  date: string,
): Promise<EventRecurrence> {
  const result = await gatewayRequest<EventRecurrence>(
    baseUrl,
    eventRecurrenceExceptionPath(eventId, date),
    { method: 'DELETE', sessionToken },
  );
  if (!result) throw new ApiError(500, 'The recurrence exception response was empty.');
  return result;
}

/** `GET /v1/events/:id/attendance?date=YYYY-MM-DD`. */
export function eventAttendancePath(eventId: string, date: string): string {
  return `${eventDetailPath(eventId)}/attendance?date=${encodeURIComponent(date)}`;
}

/** `DELETE /v1/events/:id/attendance/:attendanceId`; 204 on success. */
export function eventAttendanceRowPath(eventId: string, attendanceId: string): string {
  return `${eventDetailPath(eventId)}/attendance/${encodeURIComponent(attendanceId)}`;
}

export async function deleteEventAttendance(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  attendanceId: string,
): Promise<void> {
  await gatewayRequest(baseUrl, eventAttendanceRowPath(eventId, attendanceId), {
    method: 'DELETE',
    sessionToken,
  });
}

/** Mirrors `EventAttendanceEntry`; a manual clock-in creates one row. */
export interface EventAttendanceEntry {
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly sessionDate: string;
  readonly source: 'import' | 'manual';
}

/** `POST /v1/events/:id/attendance` with a member number and the session date. */
export async function addEventAttendance(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: { readonly memberNo: string; readonly date: string },
): Promise<EventAttendanceEntry> {
  const entry = await gatewayRequest<EventAttendanceEntry>(
    baseUrl,
    `${eventDetailPath(eventId)}/attendance`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!entry) throw new ApiError(500, 'The attendance entry response was empty.');
  return entry;
}

export async function getEventAttendance(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  date: string,
  signal?: AbortSignal,
): Promise<EventAttendance> {
  const result = await gatewayRequest<EventAttendance>(
    baseUrl,
    eventAttendancePath(eventId, date),
    { sessionToken, signal },
  );
  if (!result) throw new ApiError(500, 'The event attendance response was empty.');
  return result;
}
