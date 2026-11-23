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
  ArrowUndoRegular,
  DeleteRegular,
  EditRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import type { EventParentStatus, EventVenueType } from '../api/events';
import {
  getSeriesParent,
  removeSeriesException,
  updateSeries,
  type SeriesExceptionDto,
  type SeriesExceptionKind,
} from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { PageFrame } from '../components/PageFrame';
import { eventStatusLabel, ministryLabel, offeringsLabel, venueLabel } from '../format/events';
import { exceptionKindLabel, exceptionNoteLabel, scheduleLabel } from '../format/series';
import { useDateTimeFormat } from '../shell/DateTimeProvider';
import { AddScheduleVersionDialog } from './AddScheduleVersionDialog';
import { SeriesExceptionDialog } from './SeriesExceptionDialog';
import { SeriesSummaryTiles } from './SeriesSummaryTiles';
import { useEventStyles } from './events-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function statusColor(status: EventParentStatus): BadgeColor {
  if (status === 'active') return 'success';
  if (status === 'archived') return 'subtle';
  return 'informative';
}

function venueColor(venueType: EventVenueType): BadgeColor {
  if (venueType === 'hybrid') return 'brand';
  if (venueType === 'virtual') return 'subtle';
  return 'informative';
}

function exceptionColor(kind: SeriesExceptionKind): BadgeColor {
  return kind === 'cancelled' ? 'danger' : 'informative';
}

/** The events list opens filtered to this series and date (FR-43). */
function eventsForOccurrence(seriesId: string, date: string): string {
  const params = new URLSearchParams({ series: seriesId, from: date, to: date });
  return `/events?${params.toString()}`;
}

/**
 * Events → Series detail (FR-1, FR-6, FR-7, FR-13, FR-42, FR-43). A series is
 * the event parent, so the page reads the same parent body as the event detail
 * through `GET /v1/series/:id?view=parent&from&to`: identity, audience,
 * recurrence, window occurrences and the one `summary` that feeds the tiles.
 * Schedule versions and exceptions stay append-only and are read from that
 * parent's `recurrence`; occurrences come from the parent's window list, so the
 * table and the Occurrences tile cannot disagree.
 */
export function SeriesDetailPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = '' } = useParams<{ id: string }>();
  const { baseUrl, session, signOut } = useSession();
  const { formatDate, formatTime, formatRange } = useDateTimeFormat();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<SeriesExceptionDto | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<boolean | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const parentQuery = useQuery({
    queryKey: ['series', baseUrl, 'parent', id, window.from, window.to],
    queryFn: ({ signal }) =>
      getSeriesParent(baseUrl, token, id, {
        from: window.from,
        to: window.to,
        signal,
      }),
    enabled: Boolean(token) && id.length > 0 && window.from <= window.to,
  });

  const removeMutation = useMutation({
    mutationFn: (date: string) => removeSeriesException(baseUrl, token, id, date),
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => updateSeries(baseUrl, token, id, { archived }),
  });

  useEffect(() => {
    if (isUnauthorized(parentQuery.error)) void signOut();
  }, [parentQuery.error, signOut]);

  function invalidateSeries(): void {
    // Detail, list, occurrences and the list's per-row next-occurrence queries
    // all live under this prefix; one invalidation keeps them consistent.
    void queryClient.invalidateQueries({ queryKey: ['series', baseUrl] });
  }

  function confirmRemove(): void {
    if (!removing) return;
    removeMutation.mutate(removing.date, {
      onSuccess: () => {
        setRemoving(null);
        setRemoveError(null);
        invalidateSeries();
      },
      onError: (error: unknown) => {
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setRemoveError(errorMessage(error));
      },
    });
  }

  const parent = parentQuery.data;
  const archived = parent?.status === 'archived';
  const versions = [...(parent?.recurrence?.schedules ?? [])].sort((left, right) =>
    right.effectiveFrom.localeCompare(left.effectiveFrom),
  );
  const exceptions = parent?.recurrence?.exceptions ?? [];
  const occurrences = parent?.occurrences ?? [];
  const exceptionByDate = new Map(exceptions.map((exception) => [exception.date, exception]));

  function confirmArchive(): void {
    if (archiveTarget === null) return;

    setArchiveError(null);
    archiveMutation.mutate(archiveTarget, {
      onSuccess: () => {
        setArchiveTarget(null);
        invalidateSeries();
      },
      onError: (error: unknown) => {
        setArchiveTarget(null);
        if (isUnauthorized(error)) {
          void signOut();
          return;
        }
        setArchiveError(errorMessage(error));
      },
    });
  }

  return (
    <PageFrame
      sectionId="events"
      title={parent?.name ?? 'Series'}
      submenu={parent?.name ?? 'Series detail'}
      description="The event parent, its recurrence and the dates the API generates for this window."
      controls={
        <Button
          icon={<ArrowLeftRegular />}
          appearance="secondary"
          onClick={() => navigate('/events')}
        >
          Back to events
        </Button>
      }
      actions={[
        ...(archived
          ? []
          : [
              {
                id: 'edit',
                kind: 'verb' as const,
                label: 'Edit',
                icon: <EditRegular />,
                onSelect: () => navigate(`/events/series/${encodeURIComponent(id)}/edit`),
              },
            ]),
        archived
          ? {
              id: 'restore',
              kind: 'verb' as const,
              label: 'Restore',
              icon: <ArrowUndoRegular />,
              onSelect: () => {
                setArchiveError(null);
                setArchiveTarget(false);
              },
              destructive: true,
            }
          : {
              id: 'archive',
              kind: 'verb' as const,
              label: 'Archive',
              icon: <ArchiveRegular />,
              onSelect: () => {
                setArchiveError(null);
                setArchiveTarget(true);
              },
              destructive: true,
            },
        {
          id: 'refresh',
          kind: 'utility' as const,
          label: 'Refresh',
          icon: <ArrowClockwiseRegular />,
          onSelect: () => {
            void parentQuery.refetch();
          },
          disabled: parentQuery.isFetching,
        },
      ]}
    >
      <div className={styles.page}>
        {parentQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The series could not be loaded</MessageBarTitle>
              {errorMessage(parentQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void parentQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {archiveError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>
                The series was not {archived ? 'restored' : 'archived'}
              </MessageBarTitle>
              {archiveError}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {parentQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading the series…" />
          </div>
        ) : parentQuery.isError || !parent ? null : (
          <>
            <div className={styles.toolbar}>
              <DateWindowControl
                value={window}
                onChange={setWindow}
                label="Series occurrence window"
                hint="UTC dates · the API resolves the RRULE; the screen never does."
              />
            </div>

            <Card className={styles.meta}>
              <div className={styles.metaRows}>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Event number</Text>
                  <Text className={styles.metaValue}>{parent.eventNo || 'No number yet'}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Audience</Text>
                  <Text className={styles.metaValue}>{parent.audience.summary}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Ministry</Text>
                  <Text className={styles.metaValue}>{ministryLabel(parent.ministry)}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Timezone</Text>
                  <Text className={styles.metaValue}>{parent.timezone}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Venue</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={venueColor(parent.venueType)} size="small">
                      {venueLabel(parent.venueType)}
                    </Badge>
                    {parent.venueName ? (
                      <Text size={200} className={styles.muted}>
                        {parent.venueName}
                      </Text>
                    ) : null}
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Status</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={statusColor(parent.status)} size="small">
                      {eventStatusLabel(parent.status)}
                    </Badge>
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Dates</Text>
                  <Text className={styles.metaValue}>
                    {parent.endDate
                      ? formatRange(parent.startDate, parent.endDate)
                      : `${formatDate(parent.startDate)} · ongoing`}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Times</Text>
                  <Text className={styles.metaValue}>
                    {formatTime(parent.startTime)}
                    {parent.endTime ? `–${formatTime(parent.endTime)}` : ''} · {parent.timezone}
                  </Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Offerings</Text>
                  <Text className={styles.metaValue}>
                    {offeringsLabel(parent.offerings.length)}
                  </Text>
                </div>
              </div>
              {parent.description ? (
                <>
                  <Divider />
                  <Text className={styles.metaLabel}>Description</Text>
                  <p className={styles.description}>{parent.description}</p>
                </>
              ) : null}
            </Card>

            {archived ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>This series is archived</MessageBarTitle>
                  It is read-only. Schedule versions and exceptions cannot be added or removed.
                </MessageBarBody>
              </MessageBar>
            ) : null}

            <SeriesSummaryTiles
              summary={parent.summary}
              occurrenceCount={occurrences.length}
              formatDate={formatDate}
              label="Series summary"
              expectedLabel="Roster"
            />

            <section className={styles.panel} aria-label="Recurrence">
              <div className={styles.sectionHeader}>
                <h2 className={styles.panelTitle}>Recurrence</h2>
                <Text size={200} className={styles.muted}>
                  {parent.recurrence
                    ? `${versions.length} schedule version${versions.length === 1 ? '' : 's'} · ${exceptions.length} exception${exceptions.length === 1 ? '' : 's'}`
                    : 'Standalone event'}
                </Text>
              </div>

              <div className={styles.sectionHeader}>
                <Text className={styles.emptyTitle}>Schedule versions</Text>
                {archived ? null : (
                  <Button
                    icon={<AddRegular />}
                    appearance="secondary"
                    onClick={() => setScheduleDialogOpen(true)}
                  >
                    Add version
                  </Button>
                )}
              </div>
              {versions.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No schedule</Text>
                  <Text size={200} className={styles.muted}>
                    This event has no schedule version, so the API generates no occurrences from
                    one.
                  </Text>
                </div>
              ) : (
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
                      {versions.map((version) => (
                        <TableRow key={version.effectiveFrom}>
                          <TableCell>{formatDate(version.effectiveFrom)}</TableCell>
                          <TableCell>
                            <div className={styles.identity}>
                              <Text>{scheduleLabel(version.rrule)}</Text>
                            </div>
                          </TableCell>
                          <TableCell>
                            {version.endsOn ? formatDate(version.endsOn) : 'No end date'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className={styles.sectionHeader}>
                <Text className={styles.emptyTitle}>Exceptions</Text>
                {archived ? null : (
                  <Button
                    icon={<AddRegular />}
                    appearance="secondary"
                    onClick={() => setExceptionDialogOpen(true)}
                  >
                    Add exception
                  </Button>
                )}
              </div>

              {removeError ? (
                <div className={styles.meta}>
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>The exception was not removed</MessageBarTitle>
                      {removeError}
                    </MessageBarBody>
                  </MessageBar>
                </div>
              ) : null}

              {exceptions.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No exceptions</Text>
                  <Text size={200} className={styles.muted}>
                    The schedule's generated dates stand as they are.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Series exceptions">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Kind</TableHeaderCell>
                        <TableHeaderCell>Note</TableHeaderCell>
                        <TableHeaderCell>Actions</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exceptions.map((exception) => (
                        <TableRow key={exception.date}>
                          <TableCell>{formatDate(exception.date)}</TableCell>
                          <TableCell>
                            <Badge
                              appearance="tint"
                              color={exceptionColor(exception.kind)}
                              size="small"
                            >
                              {exceptionKindLabel(exception.kind)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {exception.note ? (
                              exception.note
                            ) : (
                              <Text
                                size={200}
                                className={
                                  exception.kind === 'cancelled' ? undefined : styles.muted
                                }
                              >
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
                                  setRemoveError(null);
                                  setRemoving(exception);
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
            </section>

            <section className={styles.panel} aria-label="Series occurrences">
              <div className={styles.sectionHeader}>
                <Text className={styles.emptyTitle}>Occurrences</Text>
                <Text size={200} className={styles.muted}>
                  UTC dates · requested from the API
                </Text>
              </div>

              {occurrences.length === 0 ? (
                <div className={styles.empty}>
                  <Text className={styles.emptyTitle}>No occurrences in this window</Text>
                  <Text size={200} className={styles.muted}>
                    The API returned no dates. Widen the window; do not infer dates from the RRULE.
                  </Text>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.table} size="small" aria-label="Series occurrences">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell>Date</TableHeaderCell>
                        <TableHeaderCell>Exception</TableHeaderCell>
                        <TableHeaderCell>Events</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occurrences.map((occurrence) => {
                        const exception = exceptionByDate.get(occurrence.date);
                        return (
                          <TableRow key={occurrence.id}>
                            <TableCell>{formatDate(occurrence.date)}</TableCell>
                            <TableCell>
                              {exception ? (
                                <Badge
                                  appearance="tint"
                                  color={exceptionColor(exception.kind)}
                                  size="small"
                                >
                                  {exceptionKindLabel(exception.kind)}
                                </Badge>
                              ) : (
                                <Text size={200} className={styles.muted}>
                                  —
                                </Text>
                              )}
                            </TableCell>
                            <TableCell>
                              <Link
                                className={styles.link}
                                to={eventsForOccurrence(parent.id, occurrence.date)}
                              >
                                View events
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {parent && scheduleDialogOpen ? (
        <AddScheduleVersionDialog
          seriesId={parent.id}
          onClose={() => setScheduleDialogOpen(false)}
          onSaved={invalidateSeries}
        />
      ) : null}

      {parent && exceptionDialogOpen ? (
        <SeriesExceptionDialog
          seriesId={parent.id}
          onClose={() => setExceptionDialogOpen(false)}
          onSaved={invalidateSeries}
        />
      ) : null}

      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget ? 'Archive this series?' : 'Restore this series?'}
        message={
          archiveTarget
            ? 'The series leaves the active list and becomes read-only. Its schedule versions, exceptions and history are kept, and you can restore it at any time. Nothing is deleted.'
            : 'The series returns to the active list, and schedule versions and exceptions can be added again. Nothing was deleted while it was archived.'
        }
        confirmLabel={archiveTarget ? 'Archive series' : 'Restore series'}
        busy={archiveMutation.isPending}
        onConfirm={confirmArchive}
        onCancel={() => {
          if (!archiveMutation.isPending) setArchiveTarget(null);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Remove exception"
        message={
          removing
            ? `Remove the ${exceptionKindLabel(removing.kind).toLowerCase()} exception on ${formatDate(
                removing.date,
              )}? Removing it changes the occurrence list; the schedule versions are unchanged.`
            : ''
        }
        confirmLabel="Remove exception"
        busy={removeMutation.isPending}
        onConfirm={confirmRemove}
        onCancel={() => {
          if (!removeMutation.isPending) {
            setRemoving(null);
            setRemoveError(null);
          }
        }}
      />
    </PageFrame>
  );
}
