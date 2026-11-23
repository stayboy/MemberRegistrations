import {
  Badge,
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArchiveRegular,
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  CheckmarkCircleRegular,
  DeleteRegular,
  EditRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  archiveEventParent,
  getEventParent,
  removeEventRecurrenceException,
  updateEventParent,
  type EventOccurrenceItem,
  type EventParentStatus,
  type EventRecurrenceException,
  type EventVenueType,
} from '../api/events';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { PageFrame } from '../components/PageFrame';
import type { PageAction } from '../components/PageActions';
import { SessionHeadcount } from '../components/SessionHeadcount';
import { SessionImportPanel } from '../components/SessionImportPanel';
import { TermsDialog } from '../components/TermsDialog';
import { occurrenceFrom, type Occurrence } from '../features/attendance-import/AttendanceWorkspace';
import { captureState, endActionState } from '../format/capture';
import {
  eventStatusLabel,
  ministryLabel,
  offeringsLabel,
  sessionCaptureLine,
  sessionSourceLabel,
  sessionStatusLabel,
  venueLabel,
} from '../format/events';
import { cadenceLabel, fromRrule } from '../format/rrule';
import { exceptionKindLabel, exceptionNoteLabel } from '../format/series';
import { writeFailure, type WriteFailure } from '../format/write-errors';

import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { AddExceptionDialog } from './AddExceptionDialog';
import { AddScheduleVersionDialog } from './AddScheduleVersionDialog';
import { CancelOccurrenceDialog } from './CancelOccurrenceDialog';
import { EventAttendanceDialog } from './EventAttendanceDialog';
import { SeriesSummaryTiles } from './SeriesSummaryTiles';
import { useEventStyles } from './events-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

/** AC-62: a draft cannot cancel a date, and the row says why rather than hiding it. */
export const DRAFT_CANCEL_REASON = 'Activate the event before cancelling a date';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function venueColor(venueType: EventVenueType): BadgeColor {
  if (venueType === 'hybrid') return 'brand';
  if (venueType === 'virtual') return 'subtle';
  return 'informative';
}

function statusColor(status: EventParentStatus): BadgeColor {
  if (status === 'active') return 'success';
  if (status === 'archived') return 'subtle';
  return 'informative';
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * Events → event detail (events FR-4/FR-5/FR-6, UI FR-42/FR-42e): the parent read
 * with its identity, the server-rendered audience summary, the recurrence's
 * schedule versions and exceptions, the window occurrence table with the derived
 * status and capture state, the window summary tiles and the read-only offerings.
 *
 * The page's write verbs follow the parent's state (AC-62): **Edit** and, on a
 * draft, **Activate** and a disabled **Archive**, or **Archive** on an active
 * parent, sit in the one `Actions` menu with `Refresh` as the bare utility to its
 * left. An occurrence's **Cancel** is a row control; **Add schedule version** and
 * **Add exception** are buttons inside the recurrence panel. An archived parent
 * offers no write verb and no **Restore** - archiving is terminal - and the page
 * says it is read-only.
 *
 * The roster figure is the API's transitional `expected` count, labelled Roster
 * and never merged with present or coloured here. The status and next occurrence
 * are the API's; the screen never classifies an event by comparing dates (FR-3).
 */
export function EventDetailPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatTime, formatRange } = useDateTimeFormat();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();
  const [selected, setSelected] = useState<EventOccurrenceItem | null>(null);
  const [importFor, setImportFor] = useState<Occurrence | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [termsTarget, setTermsTarget] = useState<{
    readonly offeringId: string;
    readonly name: string;
  } | null>(null);
  // FR-42e: the page's own confirm targets and the acting surface's failures.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [actionFailure, setActionFailure] = useState<WriteFailure | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EventOccurrenceItem | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [recurrenceFailure, setRecurrenceFailure] = useState<WriteFailure | null>(null);
  const [removingException, setRemovingException] = useState<EventRecurrenceException | null>(null);

  const eventQuery = useQuery({
    queryKey: ['events', baseUrl, 'detail', id, window.from, window.to],
    queryFn: ({ signal }) =>
      getEventParent(baseUrl, token, id, {
        from: window.from,
        to: window.to,
        signal,
      }),
    enabled: Boolean(token) && id.length > 0 && window.from <= window.to,
  });

  const activateMutation = useMutation({
    mutationFn: () => updateEventParent(baseUrl, token, id, { status: 'active' }),
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveEventParent(baseUrl, token, id),
  });
  const removeExceptionMutation = useMutation({
    mutationFn: (date: string) => removeEventRecurrenceException(baseUrl, token, id, date),
  });

  useEffect(() => {
    if (isUnauthorized(eventQuery.error)) void signOut();
  }, [eventQuery.error, signOut]);

  const event = eventQuery.data;
  const occurrences = event?.occurrences ?? [];
  const schedules = [...(event?.recurrence?.schedules ?? [])].sort((left, right) =>
    right.effectiveFrom.localeCompare(left.effectiveFrom),
  );
  const exceptions = event?.recurrence?.exceptions ?? [];
  const archived = event?.status === 'archived';
  const draft = event?.status === 'draft';
  const actionBusy = activateMutation.isPending || archiveMutation.isPending;

  function invalidateEvent(): void {
    void queryClient.invalidateQueries({ queryKey: ['events', baseUrl] });
  }

  /** FR-42g/AC-64: a refusal is a banner on the surface the operator acted on. */
  function reportFailure(
    error: unknown,
    fallbackTitle: string,
    set: (failure: WriteFailure) => void,
  ): void {
    if (isUnauthorized(error)) {
      void signOut();
      return;
    }
    set(writeFailure(error, fallbackTitle));
  }

  function activate(): void {
    if (actionBusy) return;
    setActionFailure(null);
    activateMutation.mutate(undefined, {
      onSuccess: () => invalidateEvent(),
      onError: (error: unknown) =>
        reportFailure(error, 'The event was not activated', setActionFailure),
    });
  }

  function archive(): void {
    if (archiveMutation.isPending) return;
    setActionFailure(null);
    archiveMutation.mutate(undefined, {
      onSuccess: () => {
        setArchiveOpen(false);
        invalidateEvent();
      },
      onError: (error: unknown) => {
        setArchiveOpen(false);
        reportFailure(error, 'The event was not archived', setActionFailure);
      },
    });
  }

  function removeException(): void {
    if (!removingException || removeExceptionMutation.isPending) return;
    const date = removingException.date;
    setRecurrenceFailure(null);
    removeExceptionMutation.mutate(date, {
      onSuccess: () => {
        setRemovingException(null);
        invalidateEvent();
      },
      onError: (error: unknown) => {
        setRemovingException(null);
        reportFailure(error, 'The exception was not removed', setRecurrenceFailure);
      },
    });
  }

  // FR-42e/AC-62: the verbs follow the parent's state. An archived parent offers
  // none, a draft offers Activate as primary with Archive unavailable, and an
  // active parent offers Archive. `Refresh` is the bare utility and never an item.
  const actions: PageAction[] = [];
  if (event && !archived) {
    actions.push({
      id: 'edit',
      kind: 'verb',
      label: 'Edit',
      icon: <EditRegular />,
      disabled: actionBusy,
      onSelect: () => navigate(`/events/${encodeURIComponent(event.id)}/edit`),
    });
    if (draft) {
      actions.push({
        id: 'activate',
        kind: 'verb',
        label: 'Activate',
        icon: <CheckmarkCircleRegular />,
        primary: true,
        disabled: actionBusy,
        onSelect: activate,
      });
    }
    actions.push({
      id: 'archive',
      kind: 'verb',
      label: 'Archive',
      icon: <ArchiveRegular />,
      destructive: true,
      disabled: draft || actionBusy,
      onSelect: () => {
        setActionFailure(null);
        setArchiveOpen(true);
      },
    });
  }
  actions.push({
    id: 'refresh',
    kind: 'utility',
    label: 'Refresh',
    icon: <ArrowClockwiseRegular />,
    onSelect: () => {
      void eventQuery.refetch();
    },
    disabled: eventQuery.isFetching,
  });

  // FR-8a: a retired route forwards here with `import=<date>`. The date is a
  // calendar date matched to the occurrence the parent read returned for the
  // window; no derived occurrence is invented when nothing matches, so closing
  // the panel and dropping the parameter are the same act.
  const linkedDate = searchParams.get('import');
  const linkedOccurrence = linkedDate
    ? occurrences.find((candidate) => candidate.date === linkedDate)
    : undefined;
  const panelOccurrence: Occurrence | null =
    importFor ?? (event && linkedOccurrence ? occurrenceFrom(event, linkedOccurrence) : null);

  function clearImportParam(): void {
    if (!linkedDate) return;
    const next = new URLSearchParams(searchParams);
    next.delete('import');
    setSearchParams(next, { replace: true });
  }

  return (
    <PageFrame
      sectionId="events"
      title={event?.name ?? 'Event'}
      submenu={event?.name ?? 'Event detail'}
      description="Occurrences, attendance and offerings for one event, as the API derives them for the chosen window."
      controls={
        <Button
          icon={<ArrowLeftRegular />}
          appearance="secondary"
          onClick={() => navigate('/events')}
        >
          Back to events
        </Button>
      }
      actions={actions}
    >
      <div className={styles.page}>
        {eventQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The event could not be loaded</MessageBarTitle>
              {errorMessage(eventQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void eventQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {actionFailure ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>{actionFailure.title}</MessageBarTitle>
              {actionFailure.message}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {eventQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading the event…" />
          </div>
        ) : eventQuery.isError || !event ? null : (
          <>
            <div className={styles.toolbar}>
              <DateWindowControl
                value={window}
                onChange={setWindow}
                label="Event window"
                hint="UTC dates · the API owns today and the 90-day next occurrence."
              />
            </div>

            <Card className={styles.meta}>
              <div className={styles.metaRows}>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Event number</Text>
                  <Text className={styles.metaValue}>{event.eventNo || 'No number yet'}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Audience</Text>
                  <Text className={styles.metaValue}>{event.audience.summary}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Ministry</Text>
                  <Text className={styles.metaValue}>{ministryLabel(event.ministry)}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Timezone</Text>
                  <Text className={styles.metaValue}>{event.timezone}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Venue</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={venueColor(event.venueType)} size="small">
                      {venueLabel(event.venueType)}
                    </Badge>
                    {event.venueName ? (
                      <Text size={200} className={styles.muted}>
                        {event.venueName}
                      </Text>
                    ) : null}
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Status</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={statusColor(event.status)} size="small">
                      {eventStatusLabel(event.status)}
                    </Badge>
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Dates</Text>
                  <Text className={styles.metaValue}>
                    {event.endDate
                      ? formatRange(event.startDate, event.endDate)
                      : `${formatDate(event.startDate)} · ongoing`}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Times</Text>
                  <Text className={styles.metaValue}>
                    {formatTime(event.startTime)}
                    {event.endTime ? `–${formatTime(event.endTime)}` : ''} · {event.timezone}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Offerings</Text>
                  <Text className={styles.metaValue}>{offeringsLabel(event.offerings.length)}</Text>
                </div>
              </div>
              {event.description ? (
                <>
                  <Divider />
                  <Text className={styles.metaLabel}>Description</Text>
                  <p className={styles.description}>{event.description}</p>
                </>
              ) : null}
            </Card>

            {archived ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>This event is archived</MessageBarTitle>
                  It is read-only: occurrences, schedule versions and exceptions cannot be changed.
                  Archiving is terminal by contract, so there is no Restore.
                </MessageBarBody>
              </MessageBar>
            ) : null}

            <SeriesSummaryTiles
              summary={event.summary}
              occurrenceCount={occurrences.length}
              formatDate={formatDate}
              label="Event summary"
              expectedLabel="Roster"
            />

            <section className={styles.panel} aria-label="Recurrence">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Recurrence</h2>
                <Text size={200} className={styles.muted}>
                  {event.recurrence
                    ? `${schedules.length} schedule version${schedules.length === 1 ? '' : 's'} · ${exceptions.length} exception${exceptions.length === 1 ? '' : 's'}`
                    : 'Standalone event'}
                </Text>
              </div>

              {recurrenceFailure ? (
                <div className={styles.panelBanner}>
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>{recurrenceFailure.title}</MessageBarTitle>
                      {recurrenceFailure.message}
                    </MessageBarBody>
                  </MessageBar>
                </div>
              ) : null}

              {!event.recurrence ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No recurrence</Text>
                  <Text size={200} className={styles.muted}>
                    This event is standalone: its dated occurrences stand on their own, with no
                    schedule versions or exceptions.
                  </Text>
                </div>
              ) : (
                <>
                  <div className={styles.sectionHeader}>
                    <Text className={styles.emptyTitle}>Schedule versions</Text>
                    {archived ? null : (
                      <Button
                        icon={<AddRegular />}
                        appearance="secondary"
                        onClick={() => {
                          setRecurrenceFailure(null);
                          setScheduleOpen(true);
                        }}
                      >
                        Add schedule version
                      </Button>
                    )}
                  </div>
                  <div className={styles.tableWrap}>
                    <Table className={styles.table} size="small" aria-label="Schedule versions">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Effective from</TableHeaderCell>
                          <TableHeaderCell>Schedule</TableHeaderCell>
                          <TableHeaderCell>Ends on</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedules.map((version) => {
                          // AC-63: a stored version renders the vocabulary's own
                          // label; anything outside it is read-only from the string.
                          const cadence = fromRrule(version.rrule);
                          return (
                            <TableRow key={version.effectiveFrom}>
                              <TableCell>{formatDate(version.effectiveFrom)}</TableCell>
                              <TableCell>
                                <div className={styles.identity}>
                                  <Text>{cadence ? cadenceLabel(cadence) : version.rrule}</Text>
                                  {cadence ? null : (
                                    <Text size={200} className={styles.muted}>
                                      Outside the recurrence vocabulary · cannot be edited here
                                    </Text>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {version.endsOn ? formatDate(version.endsOn) : 'No end date'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className={styles.sectionHeader}>
                    <Text className={styles.emptyTitle}>Exceptions</Text>
                    {archived ? null : (
                      <Button
                        icon={<AddRegular />}
                        appearance="secondary"
                        onClick={() => {
                          setRecurrenceFailure(null);
                          setExceptionOpen(true);
                        }}
                      >
                        Add exception
                      </Button>
                    )}
                  </div>

                  {exceptions.length === 0 ? (
                    <div className={styles.empty}>
                      <Text size={200} className={styles.muted}>
                        The schedule&apos;s generated dates stand as they are.
                      </Text>
                    </div>
                  ) : (
                    <div className={styles.tableWrap}>
                      <Table className={styles.table} size="small" aria-label="Exceptions">
                        <TableHeader>
                          <TableRow>
                            <TableHeaderCell>Date</TableHeaderCell>
                            <TableHeaderCell>Kind</TableHeaderCell>
                            <TableHeaderCell>Note</TableHeaderCell>
                            <TableHeaderCell aria-label="Action" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exceptions.map((exception) => (
                            <TableRow key={exception.date}>
                              <TableCell>{formatDate(exception.date)}</TableCell>
                              <TableCell>
                                <Badge
                                  appearance="tint"
                                  color={exception.kind === 'cancelled' ? 'danger' : 'informative'}
                                  size="small"
                                >
                                  {exceptionKindLabel(exception.kind)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {exception.note ? (
                                  exception.note
                                ) : (
                                  <Text size={200} className={styles.muted}>
                                    {exceptionNoteLabel(exception.kind, exception.note)}
                                  </Text>
                                )}
                              </TableCell>
                              <TableCell>
                                {archived ? (
                                  <Text size={200} className={styles.muted}>
                                    Read-only
                                  </Text>
                                ) : (
                                  <Button
                                    size="small"
                                    appearance="transparent"
                                    icon={<DeleteRegular />}
                                    aria-label={`Remove exception on ${formatDate(exception.date)}`}
                                    onClick={() => {
                                      setRecurrenceFailure(null);
                                      setRemovingException(exception);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className={styles.panel} aria-label="Event occurrences">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Event occurrences</h2>
                <Text size={200} className={styles.muted}>
                  {occurrences.length} occurrence{occurrences.length === 1 ? '' : 's'} in this
                  window
                </Text>
              </div>
              {occurrences.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No occurrences in this window</Text>
                  <Text size={200} className={styles.muted}>
                    Widen the window; the API generates the dates and the screen never expands the
                    RRULE.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table
                    className={styles.sessionTable}
                    size="small"
                    aria-label="Event occurrences"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Capture</TableHeaderCell>
                        <TableHeaderCell>Headcount</TableHeaderCell>
                        <TableHeaderCell>Present / Roster</TableHeaderCell>
                        <TableHeaderCell>Imported rows</TableHeaderCell>
                        <TableHeaderCell>Source</TableHeaderCell>
                        <TableHeaderCell aria-label="Action" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occurrences.map((occurrence) => {
                        const cancelReasonId = `cancel-reason-${occurrence.id}`;
                        return (
                          <TableRow key={occurrence.id}>
                            <TableCell>{formatDate(occurrence.date)}</TableCell>
                            <TableCell className={styles.statusCell}>
                              <div className={styles.statusStack}>
                                <Badge
                                  appearance="tint"
                                  color={
                                    occurrence.status === 'held'
                                      ? 'success'
                                      : occurrence.status === 'cancelled'
                                        ? 'danger'
                                        : 'informative'
                                  }
                                  size="small"
                                >
                                  {sessionStatusLabel(occurrence.status)}
                                </Badge>
                                {occurrence.status === 'cancelled' ? (
                                  <Text size={200} className={styles.muted}>
                                    {occurrence.note
                                      ? `Reason: ${occurrence.note}`
                                      : 'No reason recorded'}
                                  </Text>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Text size={200} className={styles.muted}>
                                {sessionCaptureLine(
                                  {
                                    date: occurrence.date,
                                    startTime: occurrence.startTime,
                                    endTime: occurrence.endTime,
                                    timezone: event.timezone,
                                    status: occurrence.status,
                                    capture: occurrence.capture,
                                  },
                                  new Date(),
                                )}
                              </Text>
                            </TableCell>
                            <TableCell>
                              <SessionHeadcount
                                eventId={event.id}
                                sessionDate={occurrence.date}
                                disabled={
                                  occurrence.status === 'cancelled' ||
                                  Boolean(occurrence.capture?.ended)
                                }
                                onImport={
                                  event.tracksMembers
                                    ? () => setImportFor(occurrenceFrom(event, occurrence))
                                    : undefined
                                }
                                endAction={
                                  event.tracksMembers
                                    ? endActionState(
                                        captureState(
                                          {
                                            date: occurrence.date,
                                            startTime: occurrence.startTime,
                                            endTime: occurrence.endTime,
                                            timezone: event.timezone,
                                            status: occurrence.status,
                                            capture: occurrence.capture,
                                          },
                                          new Date(),
                                        ),
                                      )
                                    : 'hidden'
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <div className={styles.counts}>
                                <Text size={200}>{occurrence.present} present</Text>
                                <Text size={200}>Roster {occurrence.expected}</Text>
                              </div>
                            </TableCell>
                            <TableCell>{occurrence.importedRows}</TableCell>
                            <TableCell>{sessionSourceLabel(occurrence.source)}</TableCell>
                            <TableCell>
                              <div className={styles.rowActions}>
                                <Button
                                  size="small"
                                  appearance="transparent"
                                  aria-label={`View rows for ${formatDate(occurrence.date)}`}
                                  onClick={() => setSelected(occurrence)}
                                >
                                  View rows
                                </Button>
                                {archived || occurrence.status === 'cancelled' ? null : (
                                  <Button
                                    size="small"
                                    appearance="transparent"
                                    disabled={draft}
                                    aria-label={`Cancel ${formatDate(occurrence.date)}`}
                                    aria-describedby={draft ? cancelReasonId : undefined}
                                    onClick={() => {
                                      setCancelTarget(occurrence);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                )}
                                {draft ? (
                                  <Text id={cancelReasonId} size={200} className={styles.muted}>
                                    {DRAFT_CANCEL_REASON}
                                  </Text>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section className={styles.panel} aria-label="Active offerings">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Active offerings</h2>
                <Text size={200} className={styles.muted}>
                  Every offering attached · current terms
                </Text>
              </div>
              {event.offerings.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No offerings attached</Text>
                  <Text size={200} className={styles.muted}>
                    Attach an offering to this event before recording giving.
                  </Text>
                </div>
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <Table className={styles.table} size="small" aria-label="Active offerings">
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Offering</TableHeaderCell>
                          <TableHeaderCell>Kind</TableHeaderCell>
                          <TableHeaderCell>Currency</TableHeaderCell>
                          <TableHeaderCell>Available until</TableHeaderCell>
                          <TableHeaderCell>Status</TableHeaderCell>
                          <TableHeaderCell>Terms</TableHeaderCell>
                          <TableHeaderCell aria-label="Action" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {event.offerings.map((offering) => (
                          <TableRow key={offering.offeringId}>
                            <TableCell>
                              <Text weight="semibold">{offering.name}</Text>
                            </TableCell>
                            <TableCell>{kindLabel(offering.terms.kind)}</TableCell>
                            <TableCell>{offering.terms.currency}</TableCell>
                            <TableCell>
                              {offering.availableUntil ? formatDate(offering.availableUntil) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                appearance="tint"
                                color={offering.expired ? 'warning' : 'success'}
                                size="small"
                              >
                                {offering.expired ? 'Expired' : 'Active'}
                              </Badge>
                            </TableCell>
                            <TableCell>{`v${offering.terms.version}`}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                appearance="transparent"
                                aria-label={`View terms for ${offering.name}`}
                                onClick={() =>
                                  setTermsTarget({
                                    offeringId: offering.offeringId,
                                    name: offering.name,
                                  })
                                }
                              >
                                View terms
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className={styles.listFooter}>
                    <Text size={200} className={styles.muted}>
                      Read-only summary · the full offering detail is post-MVP.
                    </Text>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>

      <EventAttendanceDialog
        open={selected !== null}
        eventId={event?.id ?? id}
        session={selected}
        onClose={() => setSelected(null)}
      />

      <TermsDialog offering={termsTarget} onClose={() => setTermsTarget(null)} />

      {panelOccurrence ? (
        <SessionImportPanel
          open
          occurrence={panelOccurrence}
          onClose={() => {
            setImportFor(null);
            clearImportParam();
          }}
          onImported={() => {
            setImportFor(null);
            // FR-8/AC-7: a successful batch invalidates the events, series and imports queries, and the
            // member reads whose attendance lines it changed - the same set the retired page invalidated.
            for (const root of ['events', 'series', 'imports', 'member', 'members']) {
              void queryClient.invalidateQueries({ queryKey: [root, baseUrl] });
            }
            clearImportParam();
          }}
        />
      ) : null}

      {cancelTarget ? (
        <CancelOccurrenceDialog
          eventId={event?.id ?? id}
          date={cancelTarget.date}
          dateLabel={formatDate(cancelTarget.date)}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            invalidateEvent();
          }}
        />
      ) : null}

      {event && event.recurrence && scheduleOpen ? (
        <AddScheduleVersionDialog
          eventId={event.id}
          onClose={() => setScheduleOpen(false)}
          onSaved={invalidateEvent}
        />
      ) : null}

      {event && event.recurrence && exceptionOpen ? (
        <AddExceptionDialog
          eventId={event.id}
          onClose={() => setExceptionOpen(false)}
          onSaved={invalidateEvent}
        />
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        title="Archive this event?"
        message="The event leaves the active list and becomes read-only. Its occurrences and history are kept. Nothing is deleted, and archiving is terminal: there is no restore."
        confirmLabel="Archive event"
        busy={archiveMutation.isPending}
        onConfirm={archive}
        onCancel={() => {
          if (!archiveMutation.isPending) setArchiveOpen(false);
        }}
      />

      <ConfirmDialog
        open={removingException !== null}
        title="Remove exception"
        message={
          removingException
            ? `Remove the ${exceptionKindLabel(
                removingException.kind,
              ).toLowerCase()} exception on ${formatDate(
                removingException.date,
              )}? The occurrence list changes; the schedule versions are untouched.`
            : ''
        }
        confirmLabel="Remove exception"
        busy={removeExceptionMutation.isPending}
        onConfirm={removeException}
        onCancel={() => {
          if (!removeExceptionMutation.isPending) setRemovingException(null);
        }}
      />
    </PageFrame>
  );
}
