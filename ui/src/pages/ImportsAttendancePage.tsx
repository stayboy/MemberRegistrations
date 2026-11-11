import {
  Badge,
  Button,
  Card,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import { listEvents, type EventListItem, type EventSessionSummary } from '../api/events';
import {
  downloadImportTemplate,
  getImportFormats,
  postAttendanceImport,
  type AttendanceImportRow,
  type ImportBatch,
  type ImportFormat,
} from '../api/imports';
import { useSession } from '../auth/SessionProvider';
import { ImportPanel } from '../components/ImportPanel';
import { PageFrame } from '../components/PageFrame';
import { captureState, captureStateLabel, endActionState } from '../format/capture';
import { saveBlob } from '../format/download';
import { parseAttendanceFile } from '../format/import-file';
import {
  importableEvents,
  importableSessions,
  initialRange,
  resolveOccurrence,
  type DateRange,
  type OccurrenceRef,
} from '../format/occurrence';
import { recordBatch } from '../app/import-batches';
import { useDateTimeFormat } from '../shell/DateTimeProvider';

const KIND = 'attendance' as const;
const EVENT_LIMIT = 100;

const useStyles = makeStyles({
  picker: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
  },
  sectionTitle: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  fields: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  field: {
    flex: '1 1 200px',
    minWidth: '180px',
    maxWidth: '320px',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  summaryText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  occurrenceName: {
    margin: 0,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    overflowWrap: 'anywhere',
  },
  occurrenceMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  occurrenceCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke1),
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  stateLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  stateDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function eventLabel(event: EventListItem, formatDate: (value: string) => string): string {
  const number = event.eventNo ? `${event.eventNo} · ` : '';
  return `${number}${event.name} (${formatDate(event.startDate)})`;
}

function sessionLabel(
  session: EventSessionSummary,
  formatDate: (value: string) => string,
  formatTime: (value: string) => string,
): string {
  return `${formatDate(session.date)} · ${formatTime(session.startTime)}`;
}

/** The chosen occurrence is a snapshot so it survives a date-window refetch. */
interface Occurrence {
  readonly eventId: string;
  readonly eventNo: string | null;
  readonly eventName: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly timezone: string;
  readonly sessionStatus: EventSessionSummary['status'];
  readonly capture: { readonly asOf: string; readonly ended: boolean } | null;
}

function occurrenceFrom(event: EventListItem, session: EventSessionSummary): Occurrence {
  return {
    eventId: event.id,
    eventNo: event.eventNo,
    eventName: event.name,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    timezone: event.timezone,
    sessionStatus: session.status,
    capture: session.capture ?? null,
  };
}

interface AttendanceWorkspaceProps {
  readonly events: readonly EventListItem[];
  readonly range: DateRange;
  readonly onRangeChange: (range: DateRange) => void;
  readonly format: ImportFormat | undefined;
  readonly formatsPending: boolean;
  readonly formatsError: unknown;
  readonly onRetryFormats: () => void;
  readonly downloadTemplate: () => Promise<void>;
  readonly commitRows: (
    occurrence: OccurrenceRef,
    rows: readonly AttendanceImportRow[],
  ) => Promise<ImportBatch>;
  readonly onCommitted: (batch: ImportBatch) => void;
  /** The end-only capture: one shared close per event and session. */
  readonly endSession: (occurrence: OccurrenceRef) => Promise<ImportBatch>;
}

/**
 * Page-local feature component for the attendance import (ticket 15b, UI spec
 * FR-36a/FR-37/FR-41). The page renders it only after the first event response,
 * so the deep link can be resolved against real events exactly once in the lazy
 * state initialiser. A later refetch of the window updates `events` but never
 * clears the chosen occurrence, so the keyed panel and its parsed file survive.
 *
 * Occurrence first: the operator picks a date window, then an event, then one of
 * the event's sessions from the same `GET /v1/events` response. A deep link
 * carries `?event=<id>&date=<YYYY-MM-DD>` and seeds both. "Change occurrence"
 * clears the selection and removes the parameters.
 */
function AttendanceWorkspace({
  events,
  range,
  onRangeChange,
  format,
  formatsPending,
  formatsError,
  onRetryFormats,
  downloadTemplate,
  commitRows,
  onCommitted,
  endSession,
}: AttendanceWorkspaceProps) {
  const styles = useStyles();
  const { formatDate, formatTime } = useDateTimeFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // Seed once. A later `events` refetch cannot unmount the panel because the
  // occurrence is state, not a value re-derived from the current event list.
  const [occurrence, setOccurrence] = useState<Occurrence | null>(() => {
    const resolved = resolveOccurrence(searchParams, events);
    if (!resolved) return null;
    const event = events.find((candidate) => candidate.id === resolved.eventId);
    const session = event
      ? importableSessions(event).find((candidate) => candidate.date === resolved.sessionDate)
      : undefined;
    return event && session ? occurrenceFrom(event, session) : null;
  });
  const [draftEventId, setDraftEventId] = useState<string | null>(() =>
    new URLSearchParams(searchParams).get('event'),
  );

  const draftEvent = events.find((event) => event.id === draftEventId);
  const sessions = useMemo(() => importableSessions(draftEvent), [draftEvent]);
  const rangeValid = range.from <= range.to;

  function setFrom(value: string): void {
    onRangeChange({ ...range, from: value });
  }

  function setTo(value: string): void {
    onRangeChange({ ...range, to: value });
  }

  function clearOccurrence(): void {
    setOccurrence(null);
    setDraftEventId(null);
    setEndError(null);
    const next = new URLSearchParams(searchParams);
    next.delete('event');
    next.delete('date');
    setSearchParams(next, { replace: true });
  }

  // Prefer the freshly loaded session (a committed capture invalidates the
  // events query); the snapshot covers a refetch that drops the event.
  const freshEvent = events.find((event) => event.id === occurrence?.eventId);
  const freshSession = freshEvent?.sessions.find((session) => session.date === occurrence?.date);
  const captureSession = occurrence
    ? {
        date: occurrence.date,
        startTime: freshSession?.startTime ?? occurrence.startTime,
        endTime: freshSession?.endTime ?? occurrence.endTime,
        timezone: occurrence.timezone,
        status: freshSession?.status ?? occurrence.sessionStatus,
        capture: freshSession ? (freshSession.capture ?? null) : occurrence.capture,
      }
    : null;
  const state = captureSession ? captureState(captureSession, new Date()) : null;
  const endAction = state ? endActionState(state) : 'hidden';

  async function endOfSession(): Promise<void> {
    if (!occurrence) return;
    setEnding(true);
    setEndError(null);
    try {
      const batch = await endSession({
        eventId: occurrence.eventId,
        sessionDate: occurrence.date,
      });
      onCommitted(batch);
    } catch (error) {
      setEndError(errorMessage(error));
    } finally {
      setEnding(false);
    }
  }

  return (
    <>
      {occurrence ? (
        <Card className={styles.occurrenceCard} aria-label="Selected occurrence">
          <div className={styles.summary}>
            <div className={styles.summaryText}>
              <Text size={200} className={styles.muted}>
                Selected occurrence
              </Text>
              <h2 className={styles.occurrenceName}>{occurrence.eventName}</h2>
              <div className={styles.occurrenceMeta}>
                {occurrence.eventNo ? (
                  <Badge appearance="tint" color="informative" size="small">
                    {occurrence.eventNo}
                  </Badge>
                ) : null}
                <Text size={200}>
                  {formatDate(occurrence.date)} · {formatTime(occurrence.startTime)}
                </Text>
                <Badge appearance="tint" color="subtle" size="small">
                  {occurrence.sessionStatus}
                </Badge>
              </div>
              {state ? (
                <div className={styles.stateLabel}>
                  {state.kind === 'live' ? (
                    <span className={styles.stateDot} aria-hidden="true" />
                  ) : null}
                  <Text weight="semibold">{captureStateLabel(state, occurrence.timezone)}</Text>
                </div>
              ) : null}
            </div>
            <div className={styles.actions}>
              {endAction !== 'hidden' ? (
                <Button
                  onClick={() => void endOfSession()}
                  disabled={endAction === 'disabled' || ending}
                >
                  End of session
                </Button>
              ) : null}
              <Button appearance="secondary" onClick={clearOccurrence}>
                Change occurrence
              </Button>
            </div>
          </div>
          {endError ? (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>The session could not be ended</MessageBarTitle>
                {endError}
              </MessageBarBody>
            </MessageBar>
          ) : null}
          <Text size={200} className={styles.muted}>
            The file carries member numbers and an optional datetime, never an event column.
            Changing the occurrence clears any chosen file.
          </Text>
        </Card>
      ) : (
        <Card className={styles.picker}>
          <h2 className={styles.sectionTitle}>Choose the event session</h2>

          <div className={styles.fields} data-testid="occurrence-range">
            <Field label="From" className={styles.field}>
              <Input
                type="date"
                value={range.from}
                aria-label="From date"
                onChange={(_, data) => setFrom(data.value)}
              />
            </Field>
            <Field label="To" className={styles.field}>
              <Input
                type="date"
                value={range.to}
                aria-label="To date"
                onChange={(_, data) => setTo(data.value)}
              />
            </Field>
          </div>

          {!rangeValid ? (
            <MessageBar intent="warning">
              <MessageBarBody>The From date must be on or before the To date.</MessageBarBody>
            </MessageBar>
          ) : (
            <>
              <div className={styles.fields}>
                <Field label="Event" className={styles.field}>
                  <Dropdown
                    data-testid="occurrence-event"
                    aria-label="Event"
                    placeholder={
                      events.length === 0 ? 'No events in this window' : 'Choose an event'
                    }
                    value={draftEvent ? eventLabel(draftEvent, formatDate) : ''}
                    selectedOptions={draftEventId ? [draftEventId] : []}
                    disabled={events.length === 0}
                    onOptionSelect={(_, data) => setDraftEventId(data.optionValue ?? null)}
                  >
                    {events.map((event) => (
                      <Option key={event.id} value={event.id} text={eventLabel(event, formatDate)}>
                        {eventLabel(event, formatDate)}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>

                <Field label="Session" className={styles.field}>
                  <Dropdown
                    data-testid="occurrence-session"
                    aria-label="Session"
                    placeholder={
                      draftEvent
                        ? sessions.length === 0
                          ? 'No importable sessions'
                          : 'Choose a session'
                        : 'Choose an event first'
                    }
                    value=""
                    selectedOptions={[]}
                    disabled={!draftEvent || sessions.length === 0}
                    onOptionSelect={(_, data) => {
                      const chosen = sessions.find(
                        (candidate) => candidate.date === data.optionValue,
                      );
                      if (draftEvent && chosen) setOccurrence(occurrenceFrom(draftEvent, chosen));
                    }}
                  >
                    {sessions.map((session) => (
                      <Option
                        key={session.date}
                        value={session.date}
                        text={sessionLabel(session, formatDate, formatTime)}
                      >
                        {sessionLabel(session, formatDate, formatTime)}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
              </div>

              <Text size={200} className={styles.muted}>
                Cancelled and archived events, and cancelled sessions, cannot be selected. Sessions
                come from the same event list, so no second request is sent.
              </Text>
            </>
          )}
        </Card>
      )}

      {!occurrence ? (
        <MessageBar intent="info">
          <MessageBarBody>
            Choose an event session above to choose a file. Nothing can be uploaded until an
            occurrence is selected.
          </MessageBarBody>
        </MessageBar>
      ) : formatsPending ? (
        <Spinner label="Loading the import contract…" />
      ) : formatsError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The import contract could not be loaded</MessageBarTitle>
            <Text size={200}>{errorMessage(formatsError)}</Text>
            <Button size="small" appearance="transparent" onClick={onRetryFormats}>
              Retry
            </Button>
          </MessageBarBody>
        </MessageBar>
      ) : format ? (
        <ImportPanel
          key={`${occurrence.eventId}:${occurrence.date}`}
          columns={format.columns}
          templateFilename={format.filename}
          rowNoun="rows"
          downloadTemplate={downloadTemplate}
          parseFile={(file) => parseAttendanceFile(file, format.columns, occurrence.date)}
          commitRows={(rows: readonly AttendanceImportRow[]) =>
            commitRows({ eventId: occurrence.eventId, sessionDate: occurrence.date }, rows)
          }
          onCommitted={onCommitted}
        />
      ) : (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The attendance import format is not published</MessageBarTitle>
            The API did not return an <code>attendance</code> format. Retry the request or check the
            API version.
          </MessageBarBody>
        </MessageBar>
      )}

      <Divider />
      <Text size={200} className={styles.muted}>
        An import writes attendance only; it never creates events, sessions or members.
      </Text>
    </>
  );
}

/**
 * The attendance registry import (ticket 15b, UI spec FR-36a/FR-37/FR-41).
 *
 * This shell owns the date window, the event query and the import contract. The
 * workspace mounts only once the first event response exists, so the deep link
 * is resolved exactly once against real data (nit-2).
 */
export function ImportsAttendancePage() {
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const seriesId = searchParams.get('series')?.trim() || undefined;

  const [range, setRange] = useState(() => initialRange(searchParams));
  const rangeValid = range.from <= range.to;

  const eventsQuery = useQuery({
    queryKey: ['events', baseUrl, range.from, range.to, seriesId ?? ''],
    queryFn: ({ signal }) =>
      listEvents(baseUrl, token, {
        from: range.from,
        to: range.to,
        seriesId,
        limit: EVENT_LIMIT,
        signal,
      }),
    enabled: Boolean(token) && rangeValid,
    // Keeps the previous window visible while a new window loads, so a range
    // edit can never unmount the workspace below.
    placeholderData: keepPreviousData,
  });

  const formatsQuery = useQuery({
    queryKey: ['import-formats', baseUrl],
    queryFn: ({ signal }) => getImportFormats(baseUrl, token, signal),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (isUnauthorized(eventsQuery.error) || isUnauthorized(formatsQuery.error)) void signOut();
  }, [eventsQuery.error, formatsQuery.error, signOut]);

  const events = useMemo(() => importableEvents(eventsQuery.data ?? []), [eventsQuery.data]);
  const format = formatsQuery.data?.find((candidate) => candidate.kind === KIND);

  function onCommitted(batch: ImportBatch): void {
    try {
      recordBatch(window.sessionStorage, {
        id: batch.id,
        kind: batch.kind,
        rowCount: batch.rowCount,
        createdAt: batch.createdAt,
      });
    } catch {
      // A locked-down session store must not fail a successful import.
    }

    // The member detail's attendance line and any open members list.
    void queryClient.invalidateQueries({ queryKey: ['member', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['members', baseUrl] });

    // The prefix covers an open session report, the event detail's present/expected column and the
    // list counts.
    void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
    // The series detail's summary tile and the imports batch list (AC-7).
    void queryClient.invalidateQueries({ queryKey: ['series', baseUrl] });
    void queryClient.invalidateQueries({ queryKey: ['imports', baseUrl] });
  }

  return (
    <PageFrame
      sectionId="imports"
      title="Attendance registry"
      submenu="Attendance registry"
      description="Upload attendance for one event session. Choose the session first; the file's optional datetime must fall on it. A bad file changes nothing."
      actions={
        <Button
          onClick={() => {
            void eventsQuery.refetch();
            void formatsQuery.refetch();
          }}
          disabled={eventsQuery.isFetching || formatsQuery.isFetching}
        >
          Refresh
        </Button>
      }
    >
      {eventsQuery.data === undefined ? (
        eventsQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Events could not be loaded</MessageBarTitle>
              <Text size={200}>{errorMessage(eventsQuery.error)}</Text>
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void eventsQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : (
          <Spinner label="Loading events…" />
        )
      ) : (
        <AttendanceWorkspace
          events={events}
          range={range}
          onRangeChange={setRange}
          format={format}
          formatsPending={formatsQuery.isPending}
          formatsError={formatsQuery.error}
          onRetryFormats={() => {
            void formatsQuery.refetch();
          }}
          downloadTemplate={async () => {
            const template = await downloadImportTemplate(baseUrl, token, KIND, format?.filename);
            saveBlob(template.blob, template.filename);
          }}
          commitRows={(occurrence, rows) =>
            postAttendanceImport(baseUrl, token, {
              eventId: occurrence.eventId,
              sessionDate: occurrence.sessionDate,
              rows,
            })
          }
          endSession={(occurrence) =>
            postAttendanceImport(baseUrl, token, {
              eventId: occurrence.eventId,
              sessionDate: occurrence.sessionDate,
              rows: [],
              ended: true,
            })
          }
          onCommitted={onCommitted}
        />
      )}
    </PageFrame>
  );
}
