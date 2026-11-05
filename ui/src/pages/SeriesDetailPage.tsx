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
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isUnauthorized } from '../api/errors';
import {
  getSeries,
  getSeriesOccurrences,
  removeSeriesException,
  type SeriesExceptionDto,
  type SeriesExceptionKind,
} from '../api/series';
import { useSession } from '../auth/SessionProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateWindowControl, useDateWindow } from '../components/DateWindowControl';
import { PageFrame } from '../components/PageFrame';
import { ministryLabel } from '../format/events';
import { formatDateLong } from '../format/member';
import { exceptionKindLabel, scheduleLabel, seriesStatusLabel } from '../format/series';
import { AddScheduleVersionDialog } from './AddScheduleVersionDialog';
import { SeriesExceptionDialog } from './SeriesExceptionDialog';
import { useEventStyles } from './events-styles';

type BadgeColor = ComponentProps<typeof Badge>['color'];

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Check the API connection and try again.';
}

function statusColor(archivedAt: string | null): BadgeColor {
  return archivedAt ? 'subtle' : 'success';
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
 * Events → Series detail (FR-6, FR-7, FR-13, FR-42, FR-43). Schedule versions
 * and exceptions are read from the API and appended, never rewritten. Occurrences
 * come from `GET /v1/series/:id/occurrences` for the chosen UTC window; the screen
 * links each date to the filtered events list because the endpoint returns dates,
 * not event ids.
 */
export function SeriesDetailPage() {
  const styles = useEventStyles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = '' } = useParams<{ id: string }>();
  const { baseUrl, session, signOut } = useSession();
  const token = session?.token ?? '';
  const [window, setWindow] = useDateWindow();
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<SeriesExceptionDto | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const seriesQuery = useQuery({
    queryKey: ['series', baseUrl, 'detail', id],
    queryFn: ({ signal }) => getSeries(baseUrl, token, id, signal),
    enabled: Boolean(token) && id.length > 0,
  });

  const occurrencesQuery = useQuery({
    queryKey: ['series', baseUrl, 'occurrences', id, window.from, window.to],
    queryFn: ({ signal }) =>
      getSeriesOccurrences(baseUrl, token, id, {
        from: window.from,
        to: window.to,
        signal,
      }),
    enabled: Boolean(token) && id.length > 0 && window.from <= window.to,
  });

  const removeMutation = useMutation({
    mutationFn: (date: string) => removeSeriesException(baseUrl, token, id, date),
  });

  useEffect(() => {
    if (isUnauthorized(seriesQuery.error) || isUnauthorized(occurrencesQuery.error)) {
      void signOut();
    }
  }, [seriesQuery.error, occurrencesQuery.error, signOut]);

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

  const series = seriesQuery.data;
  const archived = Boolean(series?.archivedAt);
  const versions = [...(series?.schedules ?? [])].sort((left, right) =>
    right.effectiveFrom.localeCompare(left.effectiveFrom),
  );
  const exceptions = series?.exceptions ?? [];
  const occurrences = occurrencesQuery.data?.dates ?? [];
  const exceptionByDate = new Map(exceptions.map((exception) => [exception.date, exception]));

  return (
    <PageFrame
      sectionId="events"
      title={series?.name ?? 'Series'}
      submenu={series?.name ?? 'Series detail'}
      description="Schedule versions, exceptions and the dates the API generates for this series."
      actions={
        <>
          <Button
            icon={<ArrowLeftRegular />}
            appearance="secondary"
            onClick={() => navigate('/events/series')}
          >
            Back to series
          </Button>
          <Button
            icon={<ArrowClockwiseRegular />}
            onClick={() => {
              void seriesQuery.refetch();
              void occurrencesQuery.refetch();
            }}
            disabled={seriesQuery.isFetching || occurrencesQuery.isFetching}
          >
            Refresh
          </Button>
        </>
      }
    >
      <div className={styles.page}>
        {seriesQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>The series could not be loaded</MessageBarTitle>
              {errorMessage(seriesQuery.error)}
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  void seriesQuery.refetch();
                }}
              >
                Retry
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : null}

        {seriesQuery.isPending ? (
          <div className={styles.state}>
            <Spinner label="Loading the series…" />
          </div>
        ) : seriesQuery.isError || !series ? null : (
          <>
            <Card className={styles.meta}>
              <div className={styles.metaRows}>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Ministry</Text>
                  <Text className={styles.metaValue}>{ministryLabel(series.ministry)}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Timezone</Text>
                  <Text className={styles.metaValue}>{series.timezone}</Text>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Status</Text>
                  <div className={styles.metaValue}>
                    <Badge appearance="tint" color={statusColor(series.archivedAt)} size="small">
                      {seriesStatusLabel(series.archivedAt)}
                    </Badge>
                  </div>
                </div>
                <div className={styles.metaRow}>
                  <Text className={styles.metaLabel}>Archived</Text>
                  <Text className={styles.metaValue}>
                    {series.archivedAt ? formatDateLong(series.archivedAt) : 'Not archived'}
                  </Text>
                </div>
              </div>
              {series.description ? (
                <>
                  <Divider />
                  <Text className={styles.metaLabel}>Description</Text>
                  <p className={styles.description}>{series.description}</p>
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

            <section className={styles.panel} aria-label="Schedule versions">
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
                    This series has no schedule version, so the API generates no occurrences.
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
                          <TableCell>{formatDateLong(version.effectiveFrom)}</TableCell>
                          <TableCell>
                            <div className={styles.identity}>
                              <Text>{scheduleLabel(version.rrule)}</Text>
                              <Text size={200} className={styles.muted}>
                                {version.rrule}
                              </Text>
                            </div>
                          </TableCell>
                          <TableCell>
                            {version.endsOn ? formatDateLong(version.endsOn) : 'No end date'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section className={styles.panel} aria-label="Series exceptions">
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
                          <TableCell>{formatDateLong(exception.date)}</TableCell>
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
                            {exception.note ?? (
                              <Text size={200} className={styles.muted}>
                                —
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
                                aria-label={`Remove exception on ${formatDateLong(exception.date)}`}
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

              <div className={styles.meta}>
                <DateWindowControl
                  value={window}
                  onChange={setWindow}
                  label="Series occurrence window"
                  hint="UTC dates · the API resolves the RRULE; the screen never does."
                />
              </div>

              {occurrencesQuery.isError ? (
                <div className={styles.meta}>
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>Occurrences could not be loaded</MessageBarTitle>
                      {errorMessage(occurrencesQuery.error)}
                      <Button
                        size="small"
                        appearance="transparent"
                        onClick={() => {
                          void occurrencesQuery.refetch();
                        }}
                      >
                        Retry
                      </Button>
                    </MessageBarBody>
                  </MessageBar>
                </div>
              ) : occurrencesQuery.isPending ? (
                <div className={styles.state}>
                  <Spinner label="Loading occurrences…" />
                </div>
              ) : occurrences.length === 0 ? (
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
                      {occurrences.map((date) => {
                        const exception = exceptionByDate.get(date);
                        return (
                          <TableRow key={date}>
                            <TableCell>{formatDateLong(date)}</TableCell>
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
                                to={eventsForOccurrence(series.id, date)}
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

      {series && scheduleDialogOpen ? (
        <AddScheduleVersionDialog
          seriesId={series.id}
          onClose={() => setScheduleDialogOpen(false)}
          onSaved={invalidateSeries}
        />
      ) : null}

      {series && exceptionDialogOpen ? (
        <SeriesExceptionDialog
          seriesId={series.id}
          onClose={() => setExceptionDialogOpen(false)}
          onSaved={invalidateSeries}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Remove exception"
        message={
          removing
            ? `Remove the ${exceptionKindLabel(removing.kind).toLowerCase()} exception on ${formatDateLong(
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
